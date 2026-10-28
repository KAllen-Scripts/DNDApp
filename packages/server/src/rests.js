/**
 * Rests and hit dice (D&D 5e). The rules are in shared/sheet.js; this applies
 * them to players' sheets, which only the server changes here.
 *
 *   - A player spends a hit die from their sheet: the server rolls it (through
 *     the roll log, so it's shared like any roll) and adds the hit points.
 *   - A player uses a class feature that heals (Second Wind): the server rolls
 *     it the same way and adds the hit points.
 *   - A player drinks a healing potion from their inventory: the server rolls
 *     what it heals the same way, adds the hit points and takes one away.
 *   - A player casts a spell from their sheet: a spell slot is spent (the
 *     page rolls its dice as before).
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
import { featureRow, healFeature, healWithSlot, restText, setRolled } from '@dndapp/shared/class-features.js';
import { drinkPotion } from '@dndapp/shared/gear.js';
import { castWithSlot } from '@dndapp/shared/spell-slots.js';
import { BadRequestError } from './store.js';
import { createEditions } from './editions.js';

export const REST_KINDS = ['short', 'long'];

const ordinal = (n) => ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][n] ?? `${n}th`;

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

    /**
     * Use a class feature the server rolls for: one that heals (Second Wind;
     * Wholeness of Body, a set number with no roll), one that heals by spending
     * a spell slot of level `slot` (Combat Wild Shape: 1d8 a level, to the Wild
     * Shape form's hit points), or one that keeps dice for later (Portent's
     * d20s). Rolls are shared like any roll.
     * @returns what POST /roll returns (when something was rolled), plus { healed, sheet, version, updated_at }
     */
    async useFeature(cid, userId, id, { visibility = 'party', slot = null } = {}) {
      const current = sheets.get(cid, userId);
      const ed = await edition(cid);
      const { values } = computeSheet(current.sheet, { ...store?.getSettings?.(cid), edition: ed });
      const row = featureRow(current.sheet, id, { edition: ed, values });
      if (row?.action === 'portent') {
        const rolled = rolls.roll(cid, userId, { notation: `${row.dice}d20`, label: row.name, visibility });
        const numbers = rolled.terms.flatMap((t) => t.dice ?? []).map((d) => d.value);
        const saved = sheets.save(cid, userId, setRolled(current.sheet, id, numbers), { reason: `rolled ${row.name}: ${numbers.join(', ')}` });
        return { ...rolled, rolled_numbers: numbers, healed: 0, ...saved };
      }
      if (row?.action === 'slot_heal') {
        const level = Number(slot);
        if (!(level >= 1 && level <= 9)) throw new BadRequestError('Pick the level of the spell slot to spend.');
        if ((current.sheet.spellcasting?.slots_used?.[level] ?? 0) >= (values[`slots.${level}`] ?? 0)) throw new BadRequestError(`You have no level ${level} spell slots left. A long rest gives them back.`);
        const rolled = rolls.roll(cid, userId, { notation: `${level}d${row.dieSize ?? 8}`, label: `${row.name} (level ${level} slot)`, visibility });
        const { sheet, healed } = healWithSlot(current.sheet, id, level, rolled.total, { edition: ed, values });
        const saved = sheets.save(cid, userId, sheet, { reason: `used ${row.name} with a level ${level} slot (rolled ${rolled.total}, regained ${healed} hit points)` });
        return { ...rolled, healed, ...saved };
      }
      if (!row?.heal) throw new BadRequestError("That isn't one of your class features that heals.");
      if (row.left === 0) throw new BadRequestError(`You have no ${row.name} left. ${restText(row.recharge)}`);
      // A set number of hit points (2014 Wholeness of Body) isn't rolled.
      const rolled = /d/i.test(row.heal) ? rolls.roll(cid, userId, { notation: row.heal, label: row.name, visibility }) : { total: Number(row.heal) || 0 };
      const { sheet, healed } = healFeature(current.sheet, id, rolled.total, { edition: ed, values });
      const saved = sheets.save(cid, userId, sheet, { reason: `used ${row.name} (${rolled.roll ? `rolled ${rolled.total}, ` : ''}regained ${healed} hit points)` });
      return { ...rolled, healed, ...saved };
    },

    /**
     * Drink a potion from the inventory (line id `id`): roll what it heals
     * (shared like any roll), add the hit points and take one away.
     * @returns what spendHitDie returns
     */
    drink(cid, userId, id, { visibility = 'party' } = {}) {
      const current = sheets.get(cid, userId);
      const line = current.sheet.inventory.find((g) => g.id === id);
      if (!line) throw new BadRequestError("That item isn't in your inventory any more.");
      if (!line.heal) throw new BadRequestError(`${line.name} doesn't heal. Set what it heals in its details.`);
      const { values } = computeSheet(current.sheet);
      const rolled = /d/i.test(line.heal) ? rolls.roll(cid, userId, { notation: line.heal, label: `${line.name}: healing`, visibility }) : { total: Number(line.heal) || 0 };
      const { sheet, healed } = drinkPotion(current.sheet, id, rolled.total, values.hp_max ?? null);
      const saved = sheets.save(cid, userId, sheet, { reason: `drank ${line.name} (${rolled.roll ? `rolled ${rolled.total}, ` : ''}regained ${healed} hit points)` });
      return { ...rolled, healed, ...saved };
    },

    /**
     * Cast a spell of 1st level or higher from the sheet (`id`: its id on the
     * sheet) with a slot of level `slot` (its own level if not given): the
     * slot is spent (an ordinary one of that level, else a Pact Magic one).
     * @returns { level, used: 'slot' | 'pact', sheet, version, updated_at }
     */
    async castSpell(cid, userId, id, { slot = null } = {}) {
      const current = sheets.get(cid, userId);
      const spell = (current.sheet.spells ?? []).find((s) => s.id === id);
      if (!spell) throw new BadRequestError("That spell isn't on your sheet any more.");
      const calc = computeSheet(current.sheet, { ...store?.getSettings?.(cid), edition: await edition(cid) });
      let cast;
      try {
        cast = castWithSlot(current.sheet, calc, spell, slot);
      } catch (err) {
        throw new BadRequestError(err.message);
      }
      const saved = sheets.save(cid, userId, cast.sheet, { reason: `cast ${spell.name} (${ordinal(cast.level)}-level ${cast.used === 'pact' ? 'Pact Magic ' : ''}slot)` });
      return { level: cast.level, used: cast.used, ...saved };
    },

    /** A player's own short rest. */
    async shortRest(cid, userId) {
      const current = sheets.get(cid, userId);
      return sheets.save(cid, userId, shortRest(current.sheet, { edition: await edition(cid) }), { reason: 'short rest' });
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
          sheets.save(cid, uid, shortRest(current.sheet, { edition: ed }), { by, reason: 'short rest (called by the DM)' });
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
