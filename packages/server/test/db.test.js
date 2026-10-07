/**
 * Opening the database: a new one gets the current schema; older ones (the
 * owner's live install is on v4) are upgraded on start-up, keeping source data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb, wipeDerived, json } from '../src/db/index.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-db-')), 'nested', 'db.sqlite');
const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);

/** A database as an older version left it: today's schema, with the given changes made to it. */
function olderDb(file, version, change) {
  const db = openDb(file);
  db.pragma('foreign_keys = OFF');
  change(db);
  db.pragma(`user_version = ${version}`);
  db.close();
}

test('a new database: folders made, current schema, version 9', () => {
  const file = tmp();
  const db = openDb(file);
  try {
    assert.ok(fs.existsSync(file));
    assert.equal(db.pragma('user_version', { simple: true }), 9);
    for (const t of ['campaigns', 'users', 'sessions', 'kb_records', 'character_sheets', 'maps', 'map_pins', 'character_pictures', 'conversations']) assert.ok(tables(db).includes(t), t);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  } finally {
    db.close();
  }
  // Opening it again changes nothing.
  const again = openDb(file);
  assert.equal(again.pragma('user_version', { simple: true }), 9);
  again.close();
  const mem = openDb(':memory:');
  assert.equal(mem.pragma('user_version', { simple: true }), 9);
  mem.close();
});

test('v4 (the live install) and v5 → v9: conversations can be pinned and deleted; maps and picture tables added', () => {
  const file = tmp();
  olderDb(file, 4, (db) => {
    db.exec('ALTER TABLE conversations DROP COLUMN pinned; ALTER TABLE conversations DROP COLUMN deleted_at; DROP TABLE maps; DROP TABLE map_pins; DROP TABLE character_sheets; DROP TABLE character_pictures');
    db.prepare("INSERT INTO campaigns (name, slug) VALUES ('Old', 'old')").run();
    db.prepare("INSERT INTO users (name, password_hash) VALUES ('Sam', 'scrypt$x$y')").run();
    db.prepare('INSERT INTO conversations (campaign_id, user_id, title) VALUES (1, 1, ?)').run('Where is the mill?');
  });
  const db = openDb(file);
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 9);
    assert.ok(columns(db, 'conversations').includes('pinned'));
    assert.ok(columns(db, 'conversations').includes('deleted_at'));
    assert.deepEqual(db.prepare('SELECT title, pinned, deleted_at FROM conversations').get(), { title: 'Where is the mill?', pinned: 0, deleted_at: null });
    assert.ok(tables(db).includes('maps') && tables(db).includes('map_pins') && tables(db).includes('character_sheets') && tables(db).includes('character_pictures'));
    assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash, 'scrypt$x$y');
  } finally {
    db.close();
  }
});

test('v3 → v9: the admin can require a password change (off for everyone at first)', () => {
  const file = tmp();
  olderDb(file, 3, (db) => {
    db.exec('ALTER TABLE users DROP COLUMN must_change_password');
    db.prepare("INSERT INTO campaigns (name, slug) VALUES ('Old', 'old')").run();
    db.prepare("INSERT INTO users (name, password_hash) VALUES ('Sam', 'h')").run();
  });
  const db = openDb(file);
  try {
    assert.deepEqual(db.prepare('SELECT name, must_change_password FROM users').get(), { name: 'Sam', must_change_password: 0 });
  } finally {
    db.close();
  }
});

/** The v2 users table: a login token per user instead of a password. */
const V2_USERS = `
  DROP TABLE users;
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT, is_admin INTEGER NOT NULL DEFAULT 0, revoked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`;

test('v2 → v9: token logins become password logins; accounts keep their ids and have no password yet', () => {
  const file = tmp();
  olderDb(file, 2, (db) => {
    db.exec(V2_USERS);
    db.prepare("INSERT INTO campaigns (name, slug) VALUES ('Old', 'old')").run();
    db.prepare("INSERT INTO users (id, name, token_hash, is_admin) VALUES (5, 'Kenny', 'abc', 1), (9, 'Sam', 'def', 0)").run();
  });
  const db = openDb(file);
  try {
    const users = db.prepare('SELECT id, name, password_hash, is_admin, must_change_password FROM users ORDER BY id').all();
    assert.deepEqual(users, [
      { id: 5, name: 'Kenny', password_hash: null, is_admin: 1, must_change_password: 0 },
      { id: 9, name: 'Sam', password_hash: null, is_admin: 0, must_change_password: 0 },
    ]);
    assert.ok(!columns(db, 'users').includes('token_hash'));
    // Names are now unique ignoring case.
    assert.throws(() => db.prepare("INSERT INTO users (name) VALUES ('SAM')").run(), /UNIQUE/);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  } finally {
    db.close();
  }
});

test('v2 → v3 refuses to run when two accounts share a name (ignoring case), and says which', () => {
  const file = tmp();
  olderDb(file, 2, (db) => {
    db.exec(V2_USERS);
    db.prepare("INSERT INTO campaigns (name, slug) VALUES ('Old', 'old')").run();
    db.prepare("INSERT INTO users (name) VALUES ('Sam'), ('sam'), ('Alex')").run();
  });
  assert.throws(() => openDb(file), /must be unique.*Sam/);
});

test('v1 → v9: the old notes and entities are dropped, sessions wait to be processed again, source data stays', () => {
  const file = tmp();
  olderDb(file, 1, (db) => {
    db.exec(V2_USERS);
    db.exec(`
      CREATE TABLE entities (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE entity_facts (id INTEGER PRIMARY KEY);
      CREATE TABLE session_notes (id INTEGER PRIMARY KEY);
      CREATE TABLE edits (id INTEGER PRIMARY KEY);
      ALTER TABLE speakers DROP COLUMN user_id;
      ALTER TABLE qa_log DROP COLUMN first_text_ms;
    `);
    db.prepare("INSERT INTO campaigns (name, slug) VALUES ('Old', 'old')").run();
    db.prepare("INSERT INTO entities (name) VALUES ('Brother Hal')").run();
    db.prepare("INSERT INTO sessions (campaign_id, number, status, pipeline_version, played_on, checksum) VALUES (1, 1, 'ready', 3, '2026-01-02', 'c')").run();
  });
  const db = openDb(file);
  try {
    for (const gone of ['entities', 'entity_facts', 'session_notes', 'edits']) assert.ok(!tables(db).includes(gone), gone);
    assert.ok(columns(db, 'speakers').includes('user_id'));
    assert.ok(columns(db, 'qa_log').includes('first_text_ms'));
    assert.ok(columns(db, 'llm_usage').includes('provider'));
    assert.deepEqual(db.prepare('SELECT status, pipeline_version, played_on FROM sessions').get(), { status: 'archived', pipeline_version: null, played_on: '2026-01-02' });
    assert.equal(db.prepare('SELECT name FROM campaigns').get().name, 'Old');
    assert.ok(tables(db).includes('docs'), 'recreated by the schema');
  } finally {
    db.close();
  }
});

test('an old file with no campaigns table is just given the schema', () => {
  const file = tmp();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new Database(file);
  raw.exec('CREATE TABLE scratch (x)');
  raw.pragma('user_version = 1');
  raw.close();
  const db = openDb(file);
  assert.ok(tables(db).includes('campaigns') && tables(db).includes('scratch'));
  db.close();
});

test('wipeDerived clears one campaign\'s derived data only; json helpers', () => {
  const db = openDb(':memory:');
  try {
    for (const slug of ['a', 'b']) db.prepare('INSERT INTO campaigns (name, slug) VALUES (?, ?)').run(slug, slug);
    db.prepare("INSERT INTO users (name) VALUES ('Sam')").run();
    for (const cid of [1, 2]) {
      db.prepare("INSERT INTO sessions (campaign_id, number, status, pipeline_version, error, played_on, checksum) VALUES (?, 1, 'failed', 3, 'boom', '2026-01-01', 'c')").run(cid);
      db.prepare("INSERT INTO kb_records (campaign_id, kind, title) VALUES (?, 'npc', 'Hal')").run(cid);
      db.prepare('INSERT INTO attendance (session_id, user_id) VALUES (?, 1)').run(cid);
    }
    wipeDerived(db, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kb_records WHERE campaign_id = 1').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kb_records WHERE campaign_id = 2').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attendance').get().n, 1);
    assert.deepEqual(db.prepare('SELECT status, error, pipeline_version FROM sessions WHERE campaign_id = 1').get(), { status: 'archived', error: null, pipeline_version: null });
    assert.equal(db.prepare('SELECT status FROM sessions WHERE campaign_id = 2').get().status, 'failed');
  } finally {
    db.close();
  }
  assert.deepEqual(json.parse('{"a":1}'), { a: 1 });
  assert.equal(json.parse('{bad', 'fallback'), 'fallback');
  assert.equal(json.parse(null, 7), 7);
  assert.equal(json.str(undefined), 'null');
});
