/**
 * Hybrid search over the `docs` index: SQLite full-text search (good for rare
 * names) + vector similarity (good for paraphrased questions), merged with
 * reciprocal rank fusion.
 *
 * Every doc has a `visible_to` list (NULL = every member). Searches made for
 * a player only ever see docs that player may know about.
 *
 * Vectors are searched by brute force in memory. At ~100 docs per session,
 * even 500 sessions is ~50k docs, which takes a few milliseconds per window.
 *
 * The embedding model reads only the first ~256 words it is given, so a long
 * doc (a big record, a transcript chunk) is embedded in overlapping windows
 * of words, each with the doc's title, and scores by its best window. Every
 * word of it can be found by meaning, not just its opening.
 */
import { toBlob, fromBlob, dot } from './embeddings.js';
import { json } from './db/index.js';

const RRF_K = 60;
const CANDIDATES = 40;
export const WINDOW_WORDS = 150;
const WINDOW_STEP = 120;
// Docs embedded before windows (only their opening) carry the plain model name and are embedded again (reembedStale).
const tagFor = (embedder) => `${embedder.model}#w${WINDOW_WORDS}`;

/** A doc's text as the windows to embed: all of it, a window at a time, each led by the title. */
export function embedWindows(title, text) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i === 0 || i + (WINDOW_WORDS - WINDOW_STEP) < words.length; i += WINDOW_STEP) {
    out.push(`${title}\n${words.slice(i, i + WINDOW_WORDS).join(' ')}`);
  }
  return out;
}

/** The best similarity between a query vector and any of a doc's windows (stored end to end). */
function bestDot(q, vecs) {
  let best = -Infinity;
  for (let o = 0; o + q.length <= vecs.length; o += q.length) best = Math.max(best, dot(q, vecs.subarray(o, o + q.length)));
  return best;
}

/** Turn free text into a safe FTS5 query: any of the words. */
export function ftsQuery(text) {
  const words = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])]
    .map((w) => w.replace(/'/g, ''))
    .filter((w) => w.length > 1);
  return words.map((w) => `"${w}"`).join(' OR ');
}

/**
 * Who is searching. `null` (or a DM) sees everything; a player sees docs
 * visible to everyone or listing their user id.
 * @typedef {{ userId: number, seesAll?: boolean } | null} Viewer
 */
export const canSee = (viewer, visibleTo) => !viewer || viewer.seesAll || visibleTo == null || visibleTo.includes(viewer.userId);

export function createSearch({ db, embedder }) {
  /** campaignId -> [{ id, kind, session_num, visible_to, vec }] */
  const vectorCache = new Map();

  const insertDoc = db.prepare(
    `INSERT INTO docs (campaign_id, kind, ref_id, session_num, start_sec, end_sec, title, text, visible_to, embedding, embed_model)
     VALUES (@campaign_id, @kind, @ref_id, @session_num, @start_sec, @end_sec, @title, @text, @visible_to, @embedding, @embed_model)`,
  );

  /** One vector blob per doc: its windows' vectors end to end. */
  async function embedDocs(docs) {
    const windows = docs.map((d) => embedWindows(d.title, d.text));
    const vectors = await embedder.embed(windows.flat());
    let at = 0;
    return windows.map((w) => {
      const vs = vectors.slice(at, (at += w.length));
      const all = new Float32Array(vs.reduce((n, v) => n + v.length, 0));
      let o = 0;
      for (const v of vs) {
        all.set(v, o);
        o += v.length;
      }
      return all;
    });
  }

  function loadVectors(campaignId) {
    if (!vectorCache.has(campaignId)) {
      const rows = db
        .prepare('SELECT id, kind, session_num, visible_to, embedding FROM docs WHERE campaign_id = ? AND embed_model = ?')
        .all(campaignId, tagFor(embedder));
      vectorCache.set(
        campaignId,
        rows.map((r) => ({ ...r, visible_to: json.parse(r.visible_to, null), vec: fromBlob(r.embedding) })),
      );
    }
    return vectorCache.get(campaignId);
  }

  const matches = (doc, { kinds, fromSession, toSession, viewer }) =>
    (!kinds || kinds.includes(doc.kind)) &&
    (fromSession == null || doc.session_num == null || doc.session_num >= fromSession) &&
    (toSession == null || doc.session_num == null || doc.session_num <= toSession) &&
    canSee(viewer, doc.visible_to);

  function deleteScope(campaignId, scope) {
    if (scope.session_num != null) {
      db.prepare('DELETE FROM docs WHERE campaign_id = ? AND kind = ? AND session_num = ?').run(campaignId, scope.kind, scope.session_num);
    } else if (scope.ref_id != null) {
      db.prepare('DELETE FROM docs WHERE campaign_id = ? AND kind = ? AND ref_id = ?').run(campaignId, scope.kind, String(scope.ref_id));
    }
  }

  return {
    /**
     * Replace all docs of one kind for one session or one ref (kb record / note).
     * @param {{ kind: string, session_num?: number, ref_id?: string|number }} scope
     * @param {Array<{ title: string, text: string, visible_to?: number[]|null, session_num?: number, start_sec?: number, end_sec?: number }>} docs
     */
    async replaceDocs(campaignId, scope, docs) {
      const vectors = embedder && docs.length ? await embedDocs(docs) : [];
      db.transaction(() => {
        deleteScope(campaignId, scope);
        docs.forEach((d, i) =>
          insertDoc.run({
            campaign_id: campaignId,
            kind: scope.kind,
            ref_id: scope.ref_id != null ? String(scope.ref_id) : null,
            session_num: d.session_num ?? scope.session_num ?? null,
            start_sec: d.start_sec ?? null,
            end_sec: d.end_sec ?? null,
            title: d.title,
            text: d.text,
            visible_to: d.visible_to == null ? null : json.str(d.visible_to),
            embedding: vectors[i] ? toBlob(vectors[i]) : null,
            embed_model: vectors[i] ? tagFor(embedder) : null,
          }),
        );
      })();
      vectorCache.delete(campaignId);
    },

    removeDocs(campaignId, scope) {
      deleteScope(campaignId, scope);
      vectorCache.delete(campaignId);
    },

    /**
     * Embed again every doc embedded the old way (only its opening) or not at
     * all, a batch at a time. Run on start-up; returns how many it did.
     */
    async reembedStale({ batch = 32 } = {}) {
      if (!embedder) return 0;
      const tag = tagFor(embedder);
      const next = db.prepare('SELECT id, campaign_id, title, text FROM docs WHERE embed_model IS NULL OR embed_model != ? ORDER BY id LIMIT ?');
      const save = db.prepare('UPDATE docs SET embedding = ?, embed_model = ? WHERE id = ? AND text = ?');
      let done = 0;
      const skip = new Set();
      for (;;) {
        const rows = next.all(tag, batch + skip.size).filter((r) => !skip.has(r.id)).slice(0, batch);
        if (!rows.length) break;
        const vectors = await embedDocs(rows);
        db.transaction(() => {
          rows.forEach((r, i) => {
            // A doc replaced meanwhile (different text) was embedded by replaceDocs already.
            if (!save.run(toBlob(vectors[i]), tag, r.id, r.text).changes) skip.add(r.id);
          });
        })();
        for (const c of new Set(rows.map((r) => r.campaign_id))) vectorCache.delete(c);
        done += rows.length;
      }
      return done;
    },

    /** Forget cached vectors (after bulk deletes such as a rebuild). */
    invalidate(campaignId) {
      vectorCache.delete(campaignId);
    },

    /**
     * @param {string} query
     * @param {{ kinds?: string[], fromSession?: number, toSession?: number, limit?: number, viewer?: Viewer }} [opts]
     */
    async search(campaignId, query, opts = {}) {
      const limit = opts.limit ?? 8;
      const scores = new Map();
      const add = (ids) => ids.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));

      const fts = ftsQuery(query);
      if (fts) {
        const rows = db
          .prepare(
            `SELECT d.id, d.kind, d.session_num, d.visible_to FROM docs_fts f JOIN docs d ON d.id = f.rowid
             WHERE docs_fts MATCH ? AND d.campaign_id = ? ORDER BY bm25(docs_fts) LIMIT ?`,
          )
          .all(fts, campaignId, CANDIDATES * 4)
          .map((r) => ({ ...r, visible_to: json.parse(r.visible_to, null) }));
        add(rows.filter((r) => matches(r, opts)).slice(0, CANDIDATES).map((r) => r.id));
      }

      if (embedder) {
        const [q] = await embedder.embed([query]);
        const ranked = loadVectors(campaignId)
          .filter((d) => matches(d, opts))
          .map((d) => ({ id: d.id, s: bestDot(q, d.vec) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, CANDIDATES);
        add(ranked.map((r) => r.id));
      }

      const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
      if (!top.length) return [];
      const byId = new Map(
        db
          .prepare(
            `SELECT id, kind, ref_id, session_num, start_sec, end_sec, title, text FROM docs
             WHERE id IN (${top.map(() => '?').join(',')})`,
          )
          .all(...top.map(([id]) => id))
          .map((d) => [d.id, d]),
      );
      return top.map(([id, score]) => ({ ...byId.get(id), score }));
    },
  };
}
