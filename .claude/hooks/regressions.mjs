// Claude Code PreToolUse hook: before a `git commit` that touches packages/,
// run the regression tests and stop the commit if one fails (docs/regressions.md).
import { execSync, spawnSync } from 'node:child_process';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const command = JSON.parse(input || '{}').tool_input?.command ?? '';
if (!/\bgit\b[^;&|]*\bcommit\b/.test(command)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const changed = execSync('git status --porcelain -- packages', { cwd: root, encoding: 'utf8' }).trim();
if (!changed) process.exit(0);

const run = spawnSync('npm', ['run', 'test:regressions'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
if (run.status === 0) process.exit(0);

const failed = `${run.stdout}\n${run.stderr}`.split('\n').filter((l) => /^\s*not ok|^# fail|Error/.test(l)).slice(0, 40).join('\n');
process.stderr.write(`Regression tests failed, so the commit was stopped. A change broke something that was fixed before (see docs/regressions.md). Fix the code, not the test.\n${failed}\n`);
process.exit(2);
