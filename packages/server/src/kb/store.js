/**
 * The knowledge base: records the archivist creates and organises however it
 * sees fit. No human is expected to read it; it exists for the AI.
 *
 * Every write is journalled with a reason, re-indexed for search, and
 * carries a `known_by` list (NULL = every member) so players only ever see
 * what their character should know.
 */
import { estimateTokens } from '../config.js';
import { json } from '../db/index.js';
import { canSee } from '../search.js';

export const GUIDE_KIND = '_guide';

export class KBError extends Error {}

/** Parse a DB row into a record object. */
const toRecord = (r) =>
  r && {
    ...r,
    data: json.parse(r.data, {}),
    tags: json.parse(r.tags, []),
    known_by: json.parse(r.known_by, null),
    sources: json.parse(r.sources, []),
    pinned: !!r.pinned,
  };

/** Compact text form of a record, as the models see it. */
export function renderRecord(r) {
  const meta = [
    `kind: ${r.kind}`,
    r.status && `status: ${r.status}`,
    r.tags.length && `tags: ${r.tags.join(', ')}`,
    `known_by: ${r.known_by == null ? 'everyone' : r.known_by.join(', ')}`,
    r.pinned && 'pinned',
    r.first_session != null && `sessions: ${r.first_session}-${r.last_session}`,
  ]
    .filter(Boolean)
    .join(' | ');
  const data = Object.keys(r.data).length ? `\ndata: ${JSON.stringify(r.data)}` : '';
  const sources = r.sources.length ? `\nsources: ${r.sources.join(' ')}` : '';
  return `#${r.id} ${r.title}\n${meta}${data}\n${r.body}${sources}`.trim();
}

export function createKB({ db, search, config }) {
  const get = (cid, id) => toRecord(db.prepare('SELECT * FROM kb_records WHERE id = ? AND campaign_id = ?').get(id, cid));

  async function index(cid, r) {
    if (r.kind === GUIDE_KIND) return;
    await search.replaceDocs(cid, { kind: 'kb', ref_id: r.id }, [
      { title: `${r.kind}: ${r.title}`, text: renderRecord(r), visible_to: r.known_by },
    ]);
  }

  function journal(cid, run, op, recordId, before, after, reason) {
    db.prepare(
      'INSERT INTO kb_journal (campaign_id, run, op, record_id, before, after, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(cid, run, op, recordId ?? null, before ? json.str(before) : null, after ? json.str(after) : null, reason ?? null);
  }

  function pinnedTokens(cid, excludeId) {
    return db
      .prepare("SELECT title, body, data FROM kb_records WHERE campaign_id = ? AND pinned = 1 AND id != ? AND kind != ?")
      .all(cid, excludeId ?? -1, GUIDE_KIND)
      .reduce((n, r) => n + estimateTokens(r.title + r.body + r.data), 0);
  }

  function checkRecord(cid, r, excludeId) {
    if (!r.kind?.trim() || !r.title?.trim()) throw new KBError('kind and title are required.');
    if (r.kind === GUIDE_KIND) throw new KBError(`"${GUIDE_KIND}" is reserved; use update_guide.`);
    const size = estimateTokens(r.title + r.body + json.str(r.data));
    if (size > config.kb.maxRecordTokens) {
      throw new KBError(`Record is ~${size} tokens; the limit is ${config.kb.maxRecordTokens}. Split it into several records.`);
    }
    if (r.pinned) {
      const total = pinnedTokens(cid, excludeId) + size;
      if (total > config.kb.pinnedTokens) {
        throw new KBError(
          `Pinned records would total ~${total} tokens; the budget is ${config.kb.pinnedTokens}. Unpin or shorten something first.`,
        );
      }
    }
    if (r.known_by != null && !Array.isArray(r.known_by)) throw new KBError('known_by must be null or a list of user ids.');
  }

  const kb = {
    get,

    /** Records by id, skipping ones the viewer may not see. */
    getMany(cid, ids, viewer = null) {
      return ids.map((id) => get(cid, id)).filter((r) => r && r.kind !== GUIDE_KIND && canSee(viewer, r.known_by));
    },

    /** Compact listing: id, kind, status, title. */
    list(cid, { kind, status, viewer = null } = {}) {
      return db
        .prepare(
          `SELECT * FROM kb_records WHERE campaign_id = @cid AND kind != '${GUIDE_KIND}'
           AND (@kind IS NULL OR kind = @kind) AND (@status IS NULL OR status = @status)
           ORDER BY kind, updated_at DESC`,
        )
        .all({ cid, kind: kind ?? null, status: status ?? null })
        .map(toRecord)
        .filter((r) => canSee(viewer, r.known_by));
    },

    kinds(cid) {
      return db
        .prepare(`SELECT kind, COUNT(*) AS n FROM kb_records WHERE campaign_id = ? AND kind != '${GUIDE_KIND}' GROUP BY kind ORDER BY kind`)
        .all(cid);
    },

    pinned(cid, viewer = null) {
      return db
        .prepare(`SELECT * FROM kb_records WHERE campaign_id = ? AND pinned = 1 AND kind != '${GUIDE_KIND}' ORDER BY kind, id`)
        .all(cid)
        .map(toRecord)
        .filter((r) => canSee(viewer, r.known_by));
    },

    guide(cid) {
      return db.prepare('SELECT body FROM kb_records WHERE campaign_id = ? AND kind = ?').get(cid, GUIDE_KIND)?.body ?? '';
    },

    async setGuide(cid, run, text, reason) {
      const existing = db.prepare('SELECT * FROM kb_records WHERE campaign_id = ? AND kind = ?').get(cid, GUIDE_KIND);
      if (existing) {
        db.prepare("UPDATE kb_records SET body = ?, updated_at = datetime('now') WHERE id = ?").run(text, existing.id);
      } else {
        db.prepare('INSERT INTO kb_records (campaign_id, kind, title, body) VALUES (?, ?, ?, ?)').run(cid, GUIDE_KIND, 'Guide', text);
      }
      journal(cid, run, 'guide', existing?.id, existing ? { body: existing.body } : null, { body: text }, reason);
    },

    /** @param {{ kind, title, body?, data?, status?, tags?, known_by?, pinned?, sources? }} fields */
    async create(cid, run, fields, { session, reason } = {}) {
      const r = {
        kind: fields.kind,
        title: fields.title,
        body: fields.body ?? '',
        data: fields.data ?? {},
        status: fields.status ?? '',
        tags: fields.tags ?? [],
        known_by: fields.known_by ?? null,
        pinned: !!fields.pinned,
        sources: fields.sources ?? [],
      };
      checkRecord(cid, r);
      const id = Number(
        db
          .prepare(
            `INSERT INTO kb_records (campaign_id, kind, title, body, data, status, tags, known_by, pinned, sources, first_session, last_session)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(cid, r.kind, r.title, r.body, json.str(r.data), r.status, json.str(r.tags), r.known_by == null ? null : json.str(r.known_by), r.pinned ? 1 : 0, json.str(r.sources), session ?? null, session ?? null)
          .lastInsertRowid,
      );
      const created = get(cid, id);
      journal(cid, run, 'create', id, null, created, reason);
      await index(cid, created);
      return created;
    },

    /** Only the given fields change; `undefined` leaves a field as it is. */
    async update(cid, run, id, fields, { session, reason } = {}) {
      const before = get(cid, id);
      if (!before || before.kind === GUIDE_KIND) throw new KBError(`No record #${id}.`);
      const after = { ...before };
      for (const k of ['kind', 'title', 'body', 'data', 'status', 'tags', 'known_by', 'pinned', 'sources']) {
        if (fields[k] !== undefined) after[k] = fields[k];
      }
      checkRecord(cid, after, id);
      db.prepare(
        `UPDATE kb_records SET kind = @kind, title = @title, body = @body, data = @data, status = @status, tags = @tags,
           known_by = @known_by, pinned = @pinned, sources = @sources,
           first_session = COALESCE(first_session, @s),
           last_session = CASE WHEN @s IS NULL THEN last_session ELSE MAX(COALESCE(last_session, 0), @s) END,
           updated_at = datetime('now') WHERE id = @id`,
      ).run({
        kind: after.kind,
        title: after.title,
        body: after.body,
        data: json.str(after.data),
        status: after.status,
        tags: json.str(after.tags),
        known_by: after.known_by == null ? null : json.str(after.known_by),
        pinned: after.pinned ? 1 : 0,
        sources: json.str(after.sources),
        s: session ?? null,
        id,
      });
      const updated = get(cid, id);
      journal(cid, run, 'update', id, before, updated, reason);
      await index(cid, updated);
      return updated;
    },

    async remove(cid, run, id, { reason } = {}) {
      const before = get(cid, id);
      if (!before || before.kind === GUIDE_KIND) throw new KBError(`No record #${id}.`);
      db.prepare('DELETE FROM kb_records WHERE id = ?').run(id);
      search.removeDocs(cid, { kind: 'kb', ref_id: id });
      journal(cid, run, 'delete', id, before, null, reason);
    },

    journalFor(cid, run) {
      return db
        .prepare('SELECT op, record_id, before, after, reason, created_at FROM kb_journal WHERE campaign_id = ? AND run = ? ORDER BY id')
        .all(cid, run)
        .map((j) => ({ ...j, before: json.parse(j.before), after: json.parse(j.after) }));
    },

    /** Full dump, for archive snapshots and the DM's debug view. */
    dump(cid) {
      return {
        guide: kb.guide(cid),
        records: db.prepare(`SELECT * FROM kb_records WHERE campaign_id = ? AND kind != '${GUIDE_KIND}' ORDER BY id`).all(cid).map(toRecord),
      };
    },
  };
  return kb;
}
