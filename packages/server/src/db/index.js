import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));

// v5 only added the character_sheets table, v7 the maps table, v8 map_pins, v9 character_pictures and v10 map_explored (all created by schema.sql), so they need no migration.
// v11 added handouts, rolls and archivist_marks (created by schema.sql), and edited_at/deleted_at to player_notes.
// v12 added creatures and v13 rests (both created by schema.sql).
const SCHEMA_VERSION = 13;

/**
 * @param {string} file  path to the SQLite file, or ':memory:'
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrateBeforeSchema(db);
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  return db;
}

/**
 * Upgrade databases made by older versions. Only derived and operational
 * tables are ever dropped; source data is kept (and is in the archive anyway).
 */
function migrateBeforeSchema(db) {
  const version = db.pragma('user_version', { simple: true });
  const has = (table) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (version >= SCHEMA_VERSION || !has('campaigns')) return;
  if (version < 2) migrateV1(db, has);
  if (version < 3) migrateV2(db);
  if (version < 4) migrateV3(db);
  if (version < 6) migrateV5(db, has);
  if (version < 11) migrateV10(db, has);
}

/** v10 -> v11: players can edit and delete their notes; sessions remember when they were processed. */
function migrateV10(db, has) {
  const add = (table, column, definition) => {
    if (!has(table)) return;
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  add('player_notes', 'edited_at', 'TEXT');
  add('player_notes', 'deleted_at', 'TEXT');
  add('sessions', 'processed_at', 'TEXT');
}

/** v5 -> v6: players can pin and delete their conversations. */
function migrateV5(db, has) {
  if (!has('conversations')) return;
  const cols = db.prepare('PRAGMA table_info(conversations)').all().map((c) => c.name);
  if (!cols.includes('pinned')) db.exec('ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('deleted_at')) db.exec('ALTER TABLE conversations ADD COLUMN deleted_at TEXT');
}

/** v3 -> v4: the admin can make someone change their password at their next login. */
function migrateV3(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('must_change_password')) db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
}

function migrateV1(db, has) {
  // v1 -> v2: fixed notes/entity pipeline replaced by the AI-managed knowledge base.
  db.exec(`
    DROP TRIGGER IF EXISTS docs_ai; DROP TRIGGER IF EXISTS docs_ad; DROP TRIGGER IF EXISTS docs_au;
    DROP TABLE IF EXISTS docs_fts; DROP TABLE IF EXISTS docs;
    DROP TABLE IF EXISTS entity_facts; DROP TABLE IF EXISTS entities;
    DROP TABLE IF EXISTS session_notes; DROP TABLE IF EXISTS arc_summaries; DROP TABLE IF EXISTS campaign_summaries;
    DROP TABLE IF EXISTS edits; DROP TABLE IF EXISTS jobs;
  `);
  const addColumn = (table, column, definition) => {
    if (!has(table)) return;
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn('speakers', 'user_id', 'INTEGER');
  addColumn('llm_usage', 'provider', "TEXT NOT NULL DEFAULT 'api'");
  addColumn('llm_usage', 'duration_ms', 'INTEGER');
  addColumn('qa_log', 'duration_ms', 'INTEGER');
  addColumn('qa_log', 'first_text_ms', 'INTEGER');
  if (has('sessions')) db.exec("UPDATE sessions SET status = 'archived', pipeline_version = NULL, played_on = COALESCE(played_on, date(created_at))");
}

/**
 * v2 -> v3: per-user tokens replaced by name + password logins. Rebuilds the
 * users table (same ids). Existing accounts have no password until the admin
 * sets one with `npm run admin -- set-password`.
 */
function migrateV2(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('token_hash')) return;
  const dupes = db.prepare('SELECT name FROM users GROUP BY name COLLATE NOCASE HAVING COUNT(*) > 1').all();
  if (dupes.length) {
    throw new Error(`Can't upgrade the database: account names must be unique, but these are used twice: ${dupes.map((d) => d.name).join(', ')}. Rename one in the users table first.`);
  }
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      CREATE TABLE users_v3 (
        id             INTEGER PRIMARY KEY,
        name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash  TEXT,
        is_admin       INTEGER NOT NULL DEFAULT 0,
        revoked_at     TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_v3 (id, name, is_admin, revoked_at, created_at) SELECT id, name, is_admin, revoked_at, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_v3 RENAME TO users;
    `);
  })();
  db.pragma('foreign_keys = ON');
}

/** Delete all derived data for one campaign. */
export function wipeDerived(db, campaignId) {
  db.transaction(() => {
    for (const table of ['docs', 'kb_records', 'kb_journal', 'dm_questions', 'archivist_marks']) {
      db.prepare(`DELETE FROM ${table} WHERE campaign_id = ?`).run(campaignId);
    }
    db.prepare('DELETE FROM attendance WHERE session_id IN (SELECT id FROM sessions WHERE campaign_id = ?)').run(campaignId);
    db.prepare(
      "UPDATE sessions SET status = 'archived', error = NULL, pipeline_version = NULL, processed_at = NULL WHERE campaign_id = ?",
    ).run(campaignId);
  })();
}

export const json = {
  parse: (s, fallback = null) => {
    if (s == null) return fallback;
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  },
  str: (v) => JSON.stringify(v ?? null),
};
