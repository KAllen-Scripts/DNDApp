/**
 * Regenerate all derived data from the archive: wipes the knowledge base and
 * search index, then replays every session and DM correction in order.
 *
 *   npm run rebuild -- --campaign <id|slug>         show what it would do
 *   npm run rebuild -- --campaign <id|slug> --yes   wipe and rebuild
 *
 * Stop the server first: both would otherwise write to the database at once.
 */
import { parseArgs } from 'node:util';
import { formatTranscript } from '@dndapp/shared';
import { createContext } from '../context.js';
import { estimateTokens } from '../config.js';
import { preparedTranscript } from '../pipeline/prepare.js';

const { values } = parseArgs({
  options: {
    campaign: { type: 'string' },
    yes: { type: 'boolean', default: false },
  },
});
if (!values.campaign) {
  console.error('Usage: npm run rebuild -- --campaign <id|slug> [--yes]');
  process.exit(1);
}

const ctx = await createContext({ embedder: values.yes ? undefined : null });
const { db, store, jobs, config } = ctx;

const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? OR slug = ?').get(Number(values.campaign) || -1, values.campaign);
if (!campaign) {
  console.error(`No campaign "${values.campaign}".`);
  process.exit(1);
}
const sessions = db.prepare('SELECT number FROM sessions WHERE campaign_id = ? ORDER BY number').all(campaign.id);
const corrections = store.getCorrections(campaign.id);
const transcriptTokens = sessions.reduce(
  (n, s) => n + estimateTokens(formatTranscript(preparedTranscript(store, campaign.id, s.number))),
  0,
);

console.log(
  `Rebuild "${campaign.name}": ${sessions.length} sessions (~${Math.round(transcriptTokens / 1000)}k transcript tokens) ` +
    `and ${corrections.length} corrections, each run by the archivist on ${config.llm.tasks.archivist.model} ` +
    `(effort ${config.llm.tasks.archivist.effort}) via ${config.llm.provider}.`,
);
console.log('This DELETES the knowledge base, search index and archivist questions, then regenerates them. The archive is untouched.');
if (config.llm.provider === 'claude-code') console.log('It runs on your Claude subscription and counts toward your Claude Code usage limits.');

if (!values.yes) {
  console.log('\nRun again with --yes to start.');
  process.exit(0);
}

const job = jobs.enqueueRebuild(campaign.id);
jobs.events.on('update', (j) => {
  if (j.id === job.id) process.stdout.write(`\r[${Math.round(j.progress * 100)}%] ${(j.message ?? '').padEnd(70).slice(0, 70)}`);
});
await jobs.idle();
const done = jobs.get(job.id);
console.log(`\n${done.status === 'done' ? 'Rebuild finished.' : `Rebuild failed: ${done.error}`}`);
db.close();
process.exit(done.status === 'done' ? 0 : 1);
