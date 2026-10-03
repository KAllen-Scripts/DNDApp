import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));

const SCHEMA_VERSION = 2;

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

/** Delete all derived data for one campaign. */
export function wipeDerived(db, campaignId) {
  db.transaction(() => {
    for (const table of ['docs', 'kb_records', 'kb_journal', 'dm_questions']) {
      db.prepare(`DELETE FROM ${table} WHERE campaign_id = ?`).run(campaignId);
    }
    db.prepare('DELETE FROM attendance WHERE session_id IN (SELECT id FROM sessions WHERE campaign_id = ?)').run(campaignId);
    db.prepare(
      "UPDATE sessions SET status = 'archived', error = NULL, pipeline_version = NULL WHERE campaign_id = ?",
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
