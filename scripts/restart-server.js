// Start, stop or restart the server in the background, so it keeps running after the
// terminal (or Claude Code session, or the Claude app itself) that ran this goes away.
// Starting runs `npm install` first. Its output goes to data/server.log; the previous
// run's is kept as server-previous.log.
//
//   npm run restart            stop (if running), npm install, start
//   npm run server:start       npm install, start (does nothing if it's already running)
//   npm run server:stop        stop only
//
// On Windows the Claude app ends everything it started when it closes or updates, even
// a "detached" process (2026-10-28: an app update took the live site down). So there the
// server is created by Windows itself (WMI's Win32_Process.Create), with no link to
// whatever ran this script. Windows also can't ask another process to shut down cleanly,
// so the old server is ended at once, as if its terminal window were closed.
import { spawn, execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { config } from '../packages/server/src/config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(repoRoot, 'packages/server/src/index.js');
const logFile = path.join(config.dataDir, 'server.log');
const url = `http://127.0.0.1:${config.port}/`;
const isWindows = process.platform === 'win32';

function listenerPid() {
  if (isWindows) {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const [proto, local, , state, pid] = line.trim().split(/\s+/);
      if (proto === 'TCP' && state === 'LISTENING' && local.endsWith(`:${config.port}`)) return Number(pid);
    }
    return null;
  }
  try {
    return Number(execFileSync('lsof', ['-t', `-iTCP:${config.port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split('\n')[0]) || null;
  } catch {
    return null; // lsof exits 1 when nothing matches
  }
}

function processName(pid) {
  if (isWindows) {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
    return out.split(',')[0].replace(/"/g, '').trim();
  }
  return execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }).trim();
}

const answers = () => fetch(url, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);

async function stop() {
  const pid = listenerPid();
  if (!pid) return console.log(`Nothing is listening on port ${config.port}.`);
  const name = processName(pid);
  if (!/^node(\.exe)?$/i.test(path.basename(name))) {
    throw new Error(`Port ${config.port} is held by ${name} (pid ${pid}), not node. Left alone.`);
  }
  console.log(`Stopping the server (pid ${pid})...`);
  if (isWindows) execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 50 && listenerPid(); i++) await sleep(200);
  if (listenerPid()) throw new Error(`Port ${config.port} is still in use after stopping pid ${pid}.`);
}

function install() {
  console.log('Running npm install...');
  // npm is a .cmd on Windows, which only runs through a shell.
  execSync('npm install --no-audit --no-fund', { cwd: repoRoot, stdio: 'inherit' });
}

// Windows: have WMI create the server, so it isn't in the Claude app's (or any terminal's)
// process tree or job. It gets this script's environment, so DATA_SET and the like carry over.
function launchWindows() {
  const command = `cmd.exe /d /s /c ""${process.execPath}" "${entry}" >> "${logFile}" 2>&1"`;
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    '$vars = [string[]](Get-ChildItem env: | Where-Object Name -notlike "DNDAPP_LAUNCH_*" | ForEach-Object { "$($_.Name)=$($_.Value)" })',
    '$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0; EnvironmentVariables = $vars }',
    '$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:DNDAPP_LAUNCH_CMD; CurrentDirectory = $env:DNDAPP_LAUNCH_DIR; ProcessStartupInformation = $startup }',
    'if ($r.ReturnValue -ne 0) { throw "Win32_Process.Create failed ($($r.ReturnValue))" }',
  ].join('; ');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    env: { ...process.env, DNDAPP_LAUNCH_CMD: command, DNDAPP_LAUNCH_DIR: repoRoot },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return { exited: () => null };
}

function launchDetached() {
  const log = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [entry], { cwd: repoRoot, detached: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  let exitCode = null;
  child.on('exit', (code) => { exitCode = code ?? 'signal'; });
  child.unref();
  return { exited: () => exitCode };
}

async function start() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (fs.existsSync(logFile)) fs.renameSync(logFile, path.join(config.dataDir, 'server-previous.log'));
  const server = isWindows ? launchWindows() : launchDetached();

  for (let i = 0; i < 100 && server.exited() === null; i++) {
    if (await answers()) {
      console.log(`Server running (pid ${listenerPid()}) at ${url}`);
      console.log(`Log: ${path.relative(repoRoot, logFile)}`);
      return;
    }
    await sleep(300);
  }
  const exitCode = server.exited();
  const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-20).join('\n') : '(no log)';
  throw new Error(`The server ${exitCode === null ? "didn't answer within 30 seconds" : `exited (${exitCode})`}. End of ${logFile}:\n${tail}`);
}

// The last word wins, so the older `npm run restart -- stop` still only stops.
const action = process.argv.slice(2).at(-1) || 'restart';
try {
  if (action === 'stop') await stop();
  else if (action === 'start') {
    if (listenerPid()) console.log(`The server is already running on port ${config.port}. Use npm run restart to restart it.`);
    else { install(); await start(); }
  } else if (action === 'restart') {
    await stop();
    install();
    await start();
  } else throw new Error(`Unknown action "${action}": use start, stop or restart.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
