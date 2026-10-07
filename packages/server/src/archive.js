/**
 * The archive: the permanent source of truth, stored as plain files.
 *
 *   <root>/_server/accounts.json       users (with password hashes) - so accounts and
 *                                       note ownership survive losing the database
 *   <root>/<campaign-slug>/
 *     campaign.json
 *     members.json                     memberships (user id, role, character)
 *     speakers.json                    current speaker map  (+ history/speakers-<ts>.json)
 *     glossary.json                    current glossary     (+ history/glossary-<ts>.json)
 *     corrections.jsonl                DM corrections, append-only
 *     player-notes/<YYYY-MM-DD>.jsonl  private player notes, append-only
 *     character-sheets/<user id>.jsonl each save's changes to a player's sheet, append-only
 *     character-sheets/uploads/        sheets players uploaded, as uploaded
 *     maps/<map id>/image.<ext>        a map the DM imported, as uploaded
 *     maps/<map id>/changes.jsonl      each change to that map, append-only
 *     maps/<map id>/source.pdf         the PDF, when the map is a page of one
 *     maps/<map id>/pins/<user id>.jsonl  someone's private pins on it (the whole list each time)
 *     sessions/0001/
 *       transcript.txt                 byte-for-byte as uploaded, read-only
 *       meta.json                      number, title, played_on, sha256
 *     outputs/v<pipeline>/<timestamp>-<run>/  knowledge-base snapshot + journal per run
 *     deleted.json                     only if the admin deleted the campaign: it is then
 *                                       skipped by restore, but every file is kept
 *
 * The app never modifies or deletes archived content (the "current"
 * speakers/glossary/members/accounts files are replaced, with history kept
 * for speakers and glossary). Back this folder up; the database can be
 * rebuilt from it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PIPELINE_VERSION } from './config.js';

export class ArchiveConflictError extends Error {}

const pad = (n) => String(n).padStart(4, '0');
const mapDir = (id) => {
  if (!/^[a-f0-9]{10}$/.test(String(id))) throw new Error(`Bad map id: ${id}`);
  return String(id);
};
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function createArchive(root) {
  const campaignDir = (slug) => path.join(root, slug);
  const sessionDir = (slug, n) => path.join(root, slug, 'sessions', pad(n));

  const writeJson = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  };
  const readJson = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      throw err;
    }
  };
  const appendLine = (file, obj) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(obj) + '\n');
  };
  const readLines = (file) =>
    fs.existsSync(file)
      ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];

  /** Replace a "current" file, keeping the previous version in history/. */
  const replaceWithHistory = (slug, name, data) => {
    const file = path.join(campaignDir(slug), `${name}.json`);
    if (fs.existsSync(file)) {
      const hist = path.join(campaignDir(slug), 'history', `${name}-${stamp()}.json`);
      fs.mkdirSync(path.dirname(hist), { recursive: true });
      fs.copyFileSync(file, hist);
    }
    writeJson(file, data);
  };

  return {
    root,

    saveAccounts: (users) => writeJson(path.join(root, '_server', 'accounts.json'), users),
    readAccounts: () => readJson(path.join(root, '_server', 'accounts.json'), []),

    saveCampaign(campaign) {
      const file = path.join(campaignDir(campaign.slug), 'campaign.json');
      if (!fs.existsSync(file)) writeJson(file, campaign);
    },

    /** True if a campaign folder already uses this slug (including deleted campaigns). */
    hasCampaign: (slug) => fs.existsSync(campaignDir(slug)),

    /** Mark a campaign deleted. Adds deleted.json; nothing in the folder is changed or removed. */
    markDeleted(slug, info) {
      const file = path.join(campaignDir(slug), 'deleted.json');
      if (!fs.existsSync(file)) writeJson(file, info);
    },

    saveMembers: (slug, members) => writeJson(path.join(campaignDir(slug), 'members.json'), members),

    /**
     * Store a transcript permanently. Uploading identical bytes again is a
     * no-op; different bytes for an existing session number is refused.
     * @returns {{ checksum: string, alreadyArchived: boolean }}
     */
    saveTranscript(slug, meta, transcriptBuf) {
      const dir = sessionDir(slug, meta.number);
      const file = path.join(dir, 'transcript.txt');
      const checksum = sha256(transcriptBuf);
      if (fs.existsSync(file)) {
        const existing = sha256(fs.readFileSync(file));
        if (existing !== checksum) {
          throw new ArchiveConflictError(
            `Session ${meta.number} already has a different transcript archived. Archived transcripts are never replaced.`,
          );
        }
        return { checksum, alreadyArchived: true };
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, transcriptBuf, { flag: 'wx' });
      fs.chmodSync(file, 0o444);
      writeJson(path.join(dir, 'meta.json'), {
        number: meta.number,
        title: meta.title ?? null,
        played_on: meta.played_on,
        sha256: checksum,
        uploaded_at: new Date().toISOString(),
      });
      return { checksum, alreadyArchived: false };
    },

    readTranscript(slug, number) {
      return fs.readFileSync(path.join(sessionDir(slug, number), 'transcript.txt'), 'utf8');
    },

    saveSpeakers: (slug, speakers) => replaceWithHistory(slug, 'speakers', speakers),
    saveGlossary: (slug, glossary) => replaceWithHistory(slug, 'glossary', glossary),

    appendCorrection: (slug, correction) => appendLine(path.join(campaignDir(slug), 'corrections.jsonl'), correction),

    appendPlayerNote: (slug, note) =>
      appendLine(path.join(campaignDir(slug), 'player-notes', `${note.session_date}.jsonl`), note),

    appendSheetChanges: (slug, userId, entry) =>
      appendLine(path.join(campaignDir(slug), 'character-sheets', `${Number(userId)}.jsonl`), entry),

    /** Keep an uploaded sheet file exactly as uploaded. @returns {string} its file name */
    saveSheetUpload(slug, userId, filename, buf) {
      const safe = String(filename || 'sheet').replace(/[^\w.-]+/g, '_').slice(-80);
      const name = `${Number(userId)}-${stamp()}-${safe}`;
      const file = path.join(campaignDir(slug), 'character-sheets', 'uploads', name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf, { flag: 'wx' });
      return name;
    },

    /** Keep an imported map's image exactly as uploaded (never replaced). */
    saveMapImage(slug, mapId, file, buf) {
      const dest = path.join(campaignDir(slug), 'maps', mapDir(mapId), file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf, { flag: 'wx' });
    },

    mapImagePath: (slug, mapId, file) => path.join(campaignDir(slug), 'maps', mapDir(mapId), path.basename(file)),

    appendMapChanges: (slug, mapId, entry) => appendLine(path.join(campaignDir(slug), 'maps', mapDir(mapId), 'changes.jsonl'), entry),

    appendMapPins: (slug, mapId, userId, entry) => appendLine(path.join(campaignDir(slug), 'maps', mapDir(mapId), 'pins', `${Number(userId)}.jsonl`), entry),

    /** Knowledge-base snapshot and journal after an archivist run. */
    saveRunOutput(slug, runLabel, files) {
      const dir = path.join(campaignDir(slug), 'outputs', `v${PIPELINE_VERSION}`, `${stamp()}-${runLabel.replace(/\W+/g, '-')}`);
      for (const [name, data] of Object.entries(files)) writeJson(path.join(dir, `${name}.json`), data);
    },

    /** Everything needed to restore the database's source tables. */
    *readAll() {
      if (!fs.existsSync(root)) return;
      for (const slug of fs.readdirSync(root)) {
        if (slug.startsWith('_')) continue;
        const campaign = readJson(path.join(campaignDir(slug), 'campaign.json'), null);
        if (!campaign || fs.existsSync(path.join(campaignDir(slug), 'deleted.json'))) continue;
        const sessionsDir = path.join(campaignDir(slug), 'sessions');
        const sessions = fs.existsSync(sessionsDir)
          ? fs
              .readdirSync(sessionsDir)
              .map((d) => readJson(path.join(sessionsDir, d, 'meta.json'), null))
              .filter(Boolean)
          : [];
        const notesDir = path.join(campaignDir(slug), 'player-notes');
        const playerNotes = fs.existsSync(notesDir)
          ? fs.readdirSync(notesDir).flatMap((f) => readLines(path.join(notesDir, f)))
          : [];
        const sheetsDir = path.join(campaignDir(slug), 'character-sheets');
        const sheets = fs.existsSync(sheetsDir)
          ? fs
              .readdirSync(sheetsDir)
              .filter((f) => /^\d+\.jsonl$/.test(f))
              .map((f) => ({ user_id: Number(f.split('.')[0]), entries: readLines(path.join(sheetsDir, f)) }))
          : [];
        const mapsDir = path.join(campaignDir(slug), 'maps');
        const maps = fs.existsSync(mapsDir)
          ? fs
              .readdirSync(mapsDir)
              .filter((d) => /^[a-f0-9]{10}$/.test(d))
              .map((id) => {
                const pinsDir = path.join(mapsDir, id, 'pins');
                const pins = fs.existsSync(pinsDir)
                  ? fs
                      .readdirSync(pinsDir)
                      .filter((f) => /^\d+\.jsonl$/.test(f))
                      .map((f) => ({ user_id: Number(f.split('.')[0]), entries: readLines(path.join(pinsDir, f)) }))
                  : [];
                return { id, entries: readLines(path.join(mapsDir, id, 'changes.jsonl')), pins };
              })
          : [];
        yield {
          campaign,
          sessions,
          members: readJson(path.join(campaignDir(slug), 'members.json'), []),
          speakers: readJson(path.join(campaignDir(slug), 'speakers.json'), []),
          glossary: readJson(path.join(campaignDir(slug), 'glossary.json'), []),
          corrections: readLines(path.join(campaignDir(slug), 'corrections.jsonl')),
          playerNotes,
          sheets,
          maps,
        };
      }
    },
  };
}
