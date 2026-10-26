/**
 * Using an item from the sheet's inventory (shared/item-actions.js): the
 * server checks it can be used (attuned, equipped, charges left), spends the
 * charges (or the item, for a bead or a gem), rolls and does it:
 *   - summon: rolls the item's table (Bag of Tricks' d8) and how many, finds
 *     the creature's stat block (the item's own, else the SRD, the books or
 *     the AI, like Wild Shape forms), adds it to the sheet's companions and
 *     puts it on the map next to the character if they're on one;
 *   - spell: rolls its damage (with extra charges: Fireball +1d6 each), with
 *     the item's save DC in the label;
 *   - attack: rolls to hit (the page offers the damage after);
 *   - heal: rolls what it heals and adds the hit points;
 *   - other: spends the charge and says what it does.
 * A wand that crumbles rolls a d20 when its last charge goes: on a 1 it's gone.
 */
import { z } from 'zod';
import { actionProblem, damageWithExtra, knownItem } from '@dndapp/shared/item-actions.js';
import { MAX_SHEET_COMPANIONS, normalizeCompanion } from '@dndapp/shared/companions.js';
import { computeSheet } from '@dndapp/shared/sheet.js';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { mapOfCharacter, placeCompanion } from './companions.js';

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const diceOf = (s) => /^\s*(\d{1,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?|\d{1,3})\b/i.exec(String(s ?? ''))?.[1].replace(/\s+/g, '') ?? '';

export function registerItemActions(app, r) {
  const { access, editions, forms, maps, rolls, sheets } = r;

  function player(request) {
    const a = access(request);
    if (a.membership?.role !== 'player') throw new AuthError('Only players use items from a character sheet', 403);
    return a;
  }

  /** A creature's stat block for a summon: the item's own, else looked up; a bare one (name only) if nobody knows it. */
  async function formFor(cid, userId, name, own) {
    if (own) return { form: own, ai: false };
    try {
      const form = await forms.lookup(name.replace(/\s*\(level \d\)$/i, ''), { campaignId: cid, userId, beforeAi: r.sheetAiAllowed?.(userId) });
      if (form) return { form, ai: form.source === 'ai' };
    } catch (err) {
      if (err.statusCode && err.statusCode < 500 && err.statusCode !== 429) throw err;
    }
    return { form: { name, hp_max: 1, ac: 10, source: 'manual', source_note: 'No stat block found: fill it in' }, ai: false, missing: true };
  }

  /**
   * Use one of an inventory line's actions: { id (the line), action (its id),
   * extra? (extra charges or beads, for Fireball), visibility? }. Answers like
   * POST /roll for the main roll (the table, the damage, the healing, the
   * attack) when there is one, plus { sheet, version, used: { item, action },
   * rolls: [every roll, in order], summoned: [names], placed: { map_id,
   * map_name } | null, crumbled, healed, damage (an attack's, for the page to
   * offer), message }.
   */
  app.post('/campaigns/:cid/sheet/gear/use', async (request) => {
    const a = player(request);
    const body = z.object({
      id: z.string().min(1).max(64),
      action: z.string().min(1).max(64),
      extra: z.number().int().min(0).max(20).default(0),
      visibility: z.enum(['party', 'dm', 'self']).default('party'),
    }).parse(request.body ?? {});
    const edition = await editions.of(a.cid);
    const current = sheets.get(a.cid, a.userId);
    const line = current.version ? current.sheet.inventory.find((g) => g.id === body.id) : null;
    if (!line) throw new NotFoundError("That item isn't in your inventory any more (save the sheet first if you just added it).");
    let act = line.actions.find((x) => x.id === body.action);
    if (!act) throw new NotFoundError(`${line.name} can't do that.`);
    // The rules the app knows: worked out again for the campaign's edition (Bag of Tricks' 2024 summons go at dawn).
    if (act.rule) act = knownItem(line.name, edition)?.actions.find((x) => x.id === act.id) ?? act;
    const problem = actionProblem(line, act);
    if (problem) throw new BadRequestError(problem);
    const extra = act.extra || act.max_extra ? Math.min(body.extra, act.max_extra) : 0;
    const cost = act.cost + (act.cost ? extra : 0);
    const left = line.charges ? line.charges.max - line.charges.used : null;
    if (cost && left != null && left < cost) throw new BadRequestError(`${line.name} has ${left} charge${left === 1 ? '' : 's'} left: not enough for ${cost}.`);

    const sheet = structuredClone(current.sheet);
    const item = sheet.inventory.find((g) => g.id === line.id);
    if (cost) item.charges.used += cost;
    const all = [];
    const roll = (notation, label) => {
      const res = rolls.roll(a.cid, a.userId, { notation, label, visibility: body.visibility });
      all.push(res);
      return res;
    };
    const out = { summoned: [], placed: null, crumbled: false, healed: null, damage: null, message: '' };
    let main = null;
    let summons = [];

    if (act.kind === 'summon') {
      let creature = act.creature;
      let count = act.count;
      let size = '';
      if (act.table.length && act.roll) {
        main = roll(act.roll, `${line.name}: ${act.name}`);
        const row = act.table.find((t) => main.total >= t.min && main.total <= t.max) ?? act.table.at(-1);
        ({ creature, count, size } = row);
      }
      if (!creature) throw new BadRequestError(`${line.name}'s ${act.name} doesn't say what it summons: set it under Details.`);
      let n = Number(count) || 1;
      if (/d/i.test(count)) {
        const howMany = roll(count, `${line.name}: how many ${creature}`);
        main ??= howMany;
        n = howMany.total;
      }
      const room = MAX_SHEET_COMPANIONS - sheet.companions.length;
      if (room <= 0) throw new BadRequestError(`You already have ${MAX_SHEET_COMPANIONS} companions on your sheet: dismiss some first.`);
      const made = Math.min(n, room);
      const { form, ai, missing } = await formFor(a.cid, a.userId, creature, act.form);
      const shown = act.illusion ? { ...form, size: form.size || size, hp_max: 1, attacks: [], source_note: 'An illusion: it does no harm' } : form;
      for (let i = 0; i < made; i++) {
        const c = normalizeCompanion({
          name: `${act.illusion ? 'Illusion: ' : ''}${creature}${made > 1 ? ` ${i + 1}` : ''}`,
          kind: 'summon', form: shown, from: { kind: 'item', name: line.name, item_id: line.id },
          until: act.until, expires: act.expires, vanishes: true, notes: act.text,
        });
        sheet.companions.push(c);
        summons.push(c);
      }
      out.summoned = summons.map((c) => c.name);
      out.message = `${line.name}: ${made > 1 ? `${made} × ${creature}` : creature}${n > made ? ` (${n} rolled; room for ${made} on your sheet)` : ''}${missing ? ". No stat block was found: fill it in on the sheet" : ai ? " (its stat block is from the AI's memory: check it)" : ''}.`;
    } else if (act.kind === 'spell' || (act.kind === 'other' && act.damage)) {
      const damage = damageWithExtra(act, extra);
      const save = act.dc ? ` (DC ${act.dc}${act.save ? ` ${ABILITY_NAMES[act.save]}` : ''} save)` : '';
      const notation = diceOf(damage);
      if (notation) main = roll(notation, `${line.name}: ${act.spell || act.name}${save}, damage`);
      out.message = `${line.name}: ${act.spell || act.name}${act.level ? ` (level ${act.level + (act.extra ? 0 : extra)})` : ''}${save}${damage ? `: ${main ? main.total : damage} ${damage.replace(/^[\dd+\-\s]+/i, '')}`.trimEnd() : ''}.`;
    } else if (act.kind === 'attack') {
      main = roll(`1d20${act.bonus != null ? `${act.bonus < 0 ? '' : '+'}${act.bonus}` : ''}`, `${line.name}: ${act.name}, to hit`);
      out.damage = act.damage || null;
      out.message = `${line.name}: ${act.name}.`;
    } else if (act.kind === 'heal' && act.heal) {
      main = /d/i.test(act.heal) ? roll(act.heal, `${line.name}: ${act.name}, healing`) : { total: Number(act.heal) || 0 };
      const max = computeSheet(sheet).values.hp_max ?? Infinity;
      const before = sheet.hp.current ?? (Number.isFinite(max) ? max : 0);
      sheet.hp.current = Math.min(max, Math.max(0, before) + main.total);
      out.healed = sheet.hp.current - before;
      out.message = `${line.name}: regained ${out.healed} hit point${out.healed === 1 ? '' : 's'}.`;
      if (!all.length) main = null;
    } else {
      out.message = `${line.name}: ${act.name}${act.dc ? ` (DC ${act.dc}${act.save ? ` ${ABILITY_NAMES[act.save]}` : ''} save)` : ''}.`;
    }

    // Used up: a bead, a gem, a card.
    if (act.consumes) {
      item.qty -= 1;
      if (item.qty <= 0) sheet.inventory = sheet.inventory.filter((g) => g.id !== item.id);
    }
    // The wand's last charge: a d20, and on a 1 it crumbles to ash.
    if (act.crumble && item.charges && item.charges.used >= item.charges.max) {
      const d20 = roll('1d20', `${line.name}: last charge`);
      main ??= d20;
      if (d20.total === 1) {
        sheet.inventory = sheet.inventory.filter((g) => g.id !== item.id);
        out.crumbled = true;
        out.message += ` The last charge: rolled a 1, and ${line.name} crumbles into ashes.`;
      }
    }
    const saved = sheets.save(a.cid, a.userId, sheet, { by: a.userId, reason: `used ${line.name}: ${act.name}${cost ? ` (${cost} charge${cost === 1 ? '' : 's'})` : ''}${out.summoned.length ? `, summoned ${out.summoned.join(', ')}` : ''}${out.crumbled ? ', and it crumbled' : ''}` });

    // On the map next to the character, if they're on one.
    const map = summons.length ? mapOfCharacter(maps, a.cid, a.userId) : null;
    if (map && maps.view(map, { role: 'player', userId: a.userId })) {
      try {
        for (const c of summons) placeCompanion(r, a.cid, a.userId, c, maps.get(a.cid, map.id), { by: a.userId });
        out.placed = { map_id: map.id, map_name: map.name };
      } catch (err) {
        if (!(err instanceof BadRequestError)) throw err;
        out.message += ` ${err.message}`;
      }
    }
    const latest = sheets.get(a.cid, a.userId);
    return { ...(main ?? {}), ...out, rolls: all.map((x) => ({ notation: x.notation, total: x.total, label: x.roll?.label ?? '' })), used: { item: line.name, action: act.name }, sheet: latest.sheet, version: latest.version ?? saved.version };
  });
}
