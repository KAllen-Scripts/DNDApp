/**
 * The host-machine commands (npm run admin / npm run rebuild), run as real
 * processes against a temporary data folder, never the real one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db/index.js';

const src = fileURLToPath(new URL('../src/cli/', import.meta.url));

function runner() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-cli-'));
  const run = (script, ...args) => {
    const r = spawnSync(process.execPath, [path.join(src, script), ...args], {
      env: { ...process.env, DATA_DIR: dataDir, LLM_PROVIDER: 'claude-code', EMBEDDINGS: 'none' },
      encoding: 'utf8',
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  return { dataDir, run, db: () => openDb(path.join(dataDir, 'dndapp.sqlite')) };
}

test('admin init: creates the admin login once; set-password finds accounts by name or id; list shows them', () => {
  const { run, db } = runner();
  let r = run('admin.js', 'init', 'Kenny');
  assert.equal(r.code, 1);
  assert.match(r.out, /Commands:/);

  r = run('admin.js', 'init', 'Kenny', 'first-password');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Created the admin login "Kenny"/);
  r = run('admin.js', 'init', 'Other', 'pw');
  assert.equal(r.code, 1);
  assert.match(r.err, /already an admin/);

  const d = db();
  const before = d.prepare('SELECT id, password_hash, is_admin FROM users').get();
  d.close();
  assert.equal(before.is_admin, 1);

  r = run('admin.js', 'set-password', 'kenny', 'second-password');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Password set for "Kenny"/);
  r = run('admin.js', 'set-password', String(before.id), 'third-password');
  assert.equal(r.code, 0, r.err);
  const d2 = db();
  assert.notEqual(d2.prepare('SELECT password_hash FROM users').get().password_hash, before.password_hash);
  d2.close();

  r = run('admin.js', 'set-password', 'Nobody', 'pw');
  assert.equal(r.code, 1);
  assert.match(r.err, /No account "Nobody"/);
  r = run('admin.js', 'set-password', 'Kenny');
  assert.equal(r.code, 1);
  assert.match(r.out, /Commands:/);

  r = run('admin.js', 'list');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Kenny/);
  assert.match(r.out, /set/);

  r = run('admin.js', 'wat');
  assert.equal(r.code, 1);
  assert.match(r.out, /Commands:/);
});

test('rebuild: needs a campaign; without --yes it only says what it would do', () => {
  const { run, db } = runner();
  let r = run('rebuild.js');
  assert.equal(r.code, 1);
  assert.match(r.err, /Usage: npm run rebuild/);

  r = run('rebuild.js', '--campaign', 'nowhere');
  assert.equal(r.code, 1);
  assert.match(r.err, /No campaign "nowhere"/);

  const d = db();
  d.prepare("INSERT INTO campaigns (name, slug) VALUES ('The Mill', 'mill')").run();
  d.prepare("INSERT INTO kb_records (campaign_id, kind, title) VALUES (1, 'npc', 'Hal')").run();
  d.close();
  for (const which of ['mill', '1']) {
    r = run('rebuild.js', '--campaign', which);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Rebuild "The Mill": 0 sessions .* and 0 corrections/);
    assert.match(r.out, /Run again with --yes/);
  }
  const d2 = db();
  assert.equal(d2.prepare('SELECT COUNT(*) AS n FROM kb_records').get().n, 1, 'a dry run deletes nothing');
  d2.close();
});
