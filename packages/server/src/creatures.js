/**
 * The DM's creatures: enemies and NPCs saved once (name, hostile or
 * friendly, size, colour, hit points, darkvision, speed, a picture, a stat
 * block and the DM's own notes) and placed on any map as tokens, as many
 * at a time as needed. Only the DM ever sees them; a token placed from one
 * is an ordinary token from then on.
 *
 * Source data, archive first: the picture is kept exactly as uploaded under
 * creatures/<id>/, and creatures/<id>/changes.jsonl gets the whole creature
 * on each change, so restore takes the last line. Removing one marks it
 * removed; the archive keeps it. The archivist doesn't read them: they're
 * the DM's preparation, and what the players meet reaches it through the
 * map events instead.
 */
import crypto from 'node:crypto';
import { TOKEN_SIZES, TOKEN_COLORS } from '@dndapp/shared/map.js';
import { NotFoundError, BadRequestError } from './store.js';
import { inspectPicture } from './characters/pictures.js';

export const CREATURE_KINDS = ['enemy', 'npc'];
export const MAX_CREATURES = 500;
export const MAX_CREATURE_NOTES = 4000;

export const isCreatureId = (id) => /^[a-f0-9]{10}$/.test(String(id));

const num = (v, { min = 0, max = 10_000 } = {}) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.min(max, Math.max(min, Number(v))));
const str = (v, max) => String(v ?? '').slice(0, max);

/** A stat block as tokens keep it, or null. */
function normalizeStats(s) {
  if (!s || typeof s.text !== 'string' || !s.text.trim()) return null;
  const out = { text: s.text.slice(0, 8000) };
  if (s.name) out.name = str(s.name, 100);
  if (s.ac != null && Number.isInteger(Number(s.ac))) out.ac = Number(s.ac);
  for (const [k, max] of [['hp_formula', 40], ['speed', 120], ['challenge', 40]]) if (s[k]) out[k] = str(s[k], max);
  if (s.source) out.source = str(s.source, 10);
  return out;
}

/** A creature read from the database or the archive, with anything unknown dropped. */
export function normalizeCreature(c = {}) {
  const color = /^#[0-9a-fA-F]{6}$/.test(c.color ?? '') ? c.color : null;
  const kind = CREATURE_KINDS.includes(c.kind) ? c.kind : 'enemy';
  const hp = num(c.hp_max, { min: 1, max: 100_000 });
  return {
    id: String(c.id),
    name: str(c.name, 80).trim() || 'Creature',
    kind,
    size: TOKEN_SIZES.includes(Number(c.size)) ? Number(c.size) : 1,
    color: color ?? TOKEN_COLORS[kind],
    hp_max: hp == null ? null : Math.round(hp),
    darkvision: num(c.darkvision) ?? 0,
    speed: num(c.speed),
    stats: normalizeStats(c.stats),
    art: c.art && typeof c.art.file === 'string' ? { file: c.art.file, type: String(c.art.type) } : null,
    record: c.record && Number.isInteger(Number(c.record.id)) ? { id: Number(c.record.id), title: str(c.record.title, 200) } : null,
    notes: str(c.notes, MAX_CREATURE_NOTES),
    // Found online by the AI: the page it came from (and the picture's address).
    source: c.source && /^https?:\/\//.test(c.source.url ?? '') ? { url: str(c.source.url, 1000), title: str(c.source.title, 200), official: !!c.source.official, picture: c.source.picture ? str(c.source.picture, 1000) : null } : null,
    // Being looked up online: { query, status: 'pending' | 'failed', error? }; null once found.
    finding: c.finding && ['pending', 'failed'].includes(c.finding.status) ? { query: str(c.finding.query, 200), status: c.finding.status, error: c.finding.error ? str(c.finding.error, 500) : null } : null,
    created_by: c.created_by ?? null,
    created_at: String(c.created_at ?? ''),
    updated_at: String(c.updated_at ?? c.created_at ?? ''),
    removed: !!c.removed,
  };
}

/** Names for `count` tokens of one creature: "Goblin" alone, "Goblin 1".."Goblin 4" for a group, carrying on from any already on the map. */
export function tokenNames(name, count, existing = []) {
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: (\\d+))?$`, 'i');
  const taken = existing.map((n) => re.exec(n)).filter(Boolean).map((m) => Number(m[1] ?? 1));
  if (count <= 1 && !taken.length) return [name];
  let next = taken.length ? Math.max(...taken) + 1 : 1;
  return Array.from({ length: count }, () => `${name} ${next++}`.slice(0, 80));
}

export function createCreatures({ db, archive, store }) {
  const rows = (cid) => db.prepare('SELECT data FROM creatures WHERE campaign_id = ? ORDER BY created_at, id').all(cid).map((r) => normalizeCreature(JSON.parse(r.data)));

  function write(cid, c) {
    archive.appendCreature(store.getCampaign(cid).slug, c.id, c);
    db.prepare(
      `INSERT INTO creatures (id, campaign_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(c.id, cid, JSON.stringify(c), c.created_at, c.updated_at);
    return c;
  }

  const creatures = {
    get(cid, id) {
      if (!isCreatureId(id)) throw new NotFoundError('No such creature');
      const r = db.prepare('SELECT data FROM creatures WHERE id = ? AND campaign_id = ?').get(id, cid);
      const c = r && normalizeCreature(JSON.parse(r.data));
      if (!c || c.removed) throw new NotFoundError('No such creature');
      return c;
    },

    /** The DM's creatures, by name. */
    list: (cid) => rows(cid).filter((c) => !c.removed).sort((a, b) => a.name.localeCompare(b.name)),

    /** What the page gets: the picture as a key, never its file name. */
    view: ({ art, created_by: _by, removed: _removed, ...c }) => ({ ...c, picture: art ? art.file.replace(/\.[^.]*$/, '') : null }),

    create(cid, fields, { by }) {
      if (rows(cid).filter((c) => !c.removed).length >= MAX_CREATURES) throw new BadRequestError(`You can keep at most ${MAX_CREATURES} creatures.`);
      const now = new Date().toISOString();
      return write(cid, normalizeCreature({ ...fields, id: crypto.randomBytes(5).toString('hex'), created_by: by, created_at: now, updated_at: now }));
    },

    update(cid, id, fields) {
      const c = creatures.get(cid, id);
      return write(cid, normalizeCreature({ ...c, ...fields, id: c.id, created_at: c.created_at, updated_at: new Date().toISOString() }));
    },

    /** Take a creature out of the library (tokens already placed stay; the archive keeps it). */
    remove(cid, id) {
      const c = creatures.get(cid, id);
      return write(cid, { ...c, removed: true, updated_at: new Date().toISOString() });
    },

    /** Keep a picture exactly as uploaded; returns the creature's `art`. */
    async savePicture(cid, id, buf) {
      const meta = await inspectPicture(buf);
      const file = `creature-${crypto.randomBytes(5).toString('hex')}.${meta.ext}`;
      archive.saveCreatureImage(store.getCampaign(cid).slug, id, file, buf);
      return { file, type: meta.type };
    },

    /** Lookups cut short by a restart can't finish; say so, so the DM can search again. */
    failInterrupted() {
      for (const r of db.prepare("SELECT campaign_id, data FROM creatures WHERE json_extract(data, '$.finding.status') = 'pending'").all()) {
        const c = normalizeCreature(JSON.parse(r.data));
        write(r.campaign_id, { ...c, finding: { ...c.finding, status: 'failed', error: 'The server restarted while the AI was searching. Search again.' }, updated_at: new Date().toISOString() });
      }
    },

    picturePath: (cid, c) => archive.creatureImagePath(store.getCampaign(cid).slug, c.id, c.art.file),
  };
  return creatures;
}
