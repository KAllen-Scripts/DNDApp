/**
 * Rests and hit dice (D&D 5e). The rules are in shared/sheet.js; this applies
 * them to players' sheets, which only the server changes here.
 *
 *   - A player spends a hit die from their sheet: the server rolls it (through
 *     the roll log, so it's shared like any roll) and adds the hit points.
 *   - A player takes a short rest on their own sheet (Pact Magic slots back).
 *   - The DM calls a short or long rest for the party (everyone, or chosen
 *     players). Each sheet is changed and saved with the reason, and the rest
 *     goes out live to the players in it.
 *
 * Rests the DM calls are source data, archive first: one line each in
 * rests.jsonl. They're the campaign's clock for things that happen "every N
 * long rests" (a merchant restocking): `events` emits 'rest' with each one,
 * and count() says how many long rests there have been since a point.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { computeSheet, hitDice, longRest, shortRest, spendHitDie, formatBonus } from '@dndapp/shared/sheet.js';
import { BadRequestError } from './store.js';
import { createEditions } from './editions.js';

export const REST_KINDS = ['short', 'long'];

/** A rest read from the database or the archive, with anything unknown dropped. */
export function normalizeRest(r = {}) {
  const ids = (list) => (Array.isArray(list) ? [...new Set(list.map(Number).filter(Number.isInteger))] : []);
  return {
    id: String(r.id),
    kind: r.kind === 'short' ? 'short' : 'long',
    at: String(r.at ?? ''),
    by: r.by ?? null,
    edition: r.edition === '2024' ? '2024' : '2014',
    // The players it was for, and which of those got nothing from it (a long rest at 0 hit points, 2014 rules).
    user_ids: ids(r.user_ids),
    skipped: ids(r.skipped),
  };
}

/** Whether someone hears about a rest: the DM always, a player when it was for them. */
export const canHearRest = (rest, { role, userId }) => role === 'dm' || rest.user_ids.includes(userId);

export function createRests({ db, archive, store, sheets, rolls, books = null, config, editions = createEditions({ store, books, config }) }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);

  /** 2014 or 2024: the campaign's setting (editions.js). */
  const edition = (cid) => editions.of(cid);

  const players = (cid) =>
    db.prepare("SELECT u.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.campaign_id = ? AND m.role = 'player' AND u.revoked_at IS NULL ORDER BY u.id").all(cid).map((r) => r.id);

  const rests = {
    events,
    edition,

    /** What the page gets. */
    /**
     * What the page gets. Who got nothing from a long rest says they were at 0
     * hit points (from a private sheet): only the DM and that player are told.
     */
    view: ({ campaign_id: _cid, ...rest }, { role, userId }) => (role === 'dm' ? rest : { ...rest, skipped: rest.skipped.filter((id) => id === userId) }),

    /** Rests the DM called, newest first. */
    list(cid, { limit = 20 } = {}) {
      return db.prepare('SELECT data FROM rests WHERE campaign_id = ? ORDER BY at DESC, rowid DESC LIMIT ?').all(cid, limit).map((r) => normalizeRest(JSON.parse(r.data)));
    },

    /** How many rests of a kind the DM has called after `since` (an ISO time; all of them if not given). */
    count(cid, { kind = 'long', since = '' } = {}) {
      return db.prepare('SELECT COUNT(*) AS n FROM rests WHERE campaign_id = ? AND kind = ? AND at > ?').get(cid, kind, since).n;
    },

    /**
     * Spend one of a player's hit dice: roll it plus their Constitution
     * modifier (shared like any roll) and add the hit points.
     * @returns what POST /roll returns, plus { healed, sheet, version, updated_at }
     */
    spendHitDie(cid, userId, die, { visibility = 'party' } = {}) {
      const current = sheets.get(cid, userId);
      const { values } = computeSheet(current.sheet);
      const row = hitDice(current.sheet, values).find((d) => d.die === die);
      if (!row) throw new BadRequestError(`Your hit dice have no d${die}. Check the Hit dice box on your sheet.`);
      if (!row.left) throw new BadRequestError(`You have no d${die} hit dice left. A long rest gives some back.`);
      const con = values['mod.con'] ?? 0;
      const rolled = rolls.roll(cid, userId, { notation: `1d${die}${con ? formatBonus(con) : ''}`, label: `Hit die (d${die})`, visibility });
      const { sheet, healed } = spendHitDie(current.sheet, die, rolled.total);
      const saved = sheets.save(cid, userId, sheet, { reason: `spent a d${die} hit die (rolled ${rolled.total}, regained ${healed} hit points)` });
      return { ...rolled, healed, ...saved };
    },

    /** A player's own short rest. */
    shortRest(cid, userId) {
      const current = sheets.get(cid, userId);
      return sheets.save(cid, userId, shortRest(current.sheet), { reason: 'short rest' });
    },

    /**
     * The DM calls a rest: kind short | long, to 'everyone' (every player in
     * the campaign) or a list of player ids. Each player's sheet is changed
     * and saved; players with no sheet yet are still in the rest.
     * @returns the rest, as normalizeRest gives it
     */
    async call(cid, { kind, to = 'everyone', by }) {
      const all = players(cid);
      const user_ids = to === 'everyone' ? all : [...new Set(to)];
      for (const id of user_ids) if (!all.includes(id)) throw new BadRequestError(`User ${id} isn't a player in this campaign.`);
      if (!user_ids.length) throw new BadRequestError('There are no players to rest.');
      const ed = await edition(cid);
      const skipped = [];
      for (const uid of user_ids) {
        const current = sheets.get(cid, uid);
        if (!current.version) continue;
        if (kind === 'short') {
          sheets.save(cid, uid, shortRest(current.sheet), { by, reason: 'short rest (called by the DM)' });
          continue;
        }
        const res = longRest(current.sheet, { edition: ed });
        if (!res.rested) skipped.push(uid);
        else sheets.save(cid, uid, res.sheet, { by, reason: `long rest (called by the DM, ${ed} rules)` });
      }
      const rest = normalizeRest({ id: crypto.randomBytes(5).toString('hex'), kind, at: new Date().toISOString(), by, edition: ed, user_ids, skipped });
      archive.appendRest(store.getCampaign(cid).slug, rest);
      db.prepare('INSERT INTO rests (id, campaign_id, kind, at, data) VALUES (?, ?, ?, ?, ?)').run(rest.id, cid, rest.kind, rest.at, JSON.stringify(rest));
      events.emit('rest', { ...rest, campaign_id: cid });
      return rest;
    },
  };
  return rests;
}
