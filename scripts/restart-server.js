// Restart the server in the background: stop the node process listening on its port,
// start a new one detached from this shell, and wait until it answers. The new server
// keeps running after the terminal (or Claude Code session) that ran this goes away.
// Its output goes to data/server.log; the previous run's is kept as server-previous.log.
//
//   npm run restart            stop (if running), then start
//   npm run restart -- stop    stop only
//
// Windows can't ask another process to shut down cleanly, so there the old server is
// ended at once, as if its terminal window were closed.
import { spawn, execFileSync } from 'node:child_process';
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

async function start() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (fs.existsSync(logFile)) fs.renameSync(logFile, path.join(config.dataDir, 'server-previous.log'));
  const log = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [entry], { cwd: repoRoot, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  let exitCode = null;
  child.on('exit', (code) => { exitCode = code ?? 'signal'; });
  child.unref();

  for (let i = 0; i < 100 && exitCode === null; i++) {
    if (await answers()) {
      console.log(`Server running (pid ${child.pid}) at ${url}`);
      console.log(`Log: ${path.relative(repoRoot, logFile)}`);
      return;
    }
    await sleep(300);
  }
  const tail = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-20).join('\n');
  throw new Error(`The server ${exitCode === null ? "didn't answer within 30 seconds" : `exited (${exitCode})`}. End of ${logFile}:\n${tail}`);
}

try {
  await stop();
  if (process.argv[2] !== 'stop') await start();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
