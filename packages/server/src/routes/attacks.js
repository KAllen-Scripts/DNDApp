/**
 * Attacks and area spells from the map (owner, 2026-10-21; SPEC §6.6 "Attacks from the map"). A player picks
 * one of their tokens' actions (the character sheet's attacks and spells, or a companion's stat block) and a
 * target they can see, or places the spell's template; the DM does the same for any token. The server rolls
 * to hit against AC, the saves, the damage (doubled dice on a critical hit), applies resistances and the hit
 * points, keeps a card in the map's attack log (`attacks`, filtered per viewer by maps.view), and lets the
 * DM apply waiting damage or undo an attack.
 */
import { z } from 'zod';
import { ROLL_MODES } from '@dndapp/shared/dice.js';
import { PLAYER_KINDS, ownToken, tokensInTemplate } from '@dndapp/shared/map.js';
import { computeSheet } from '@dndapp/shared/sheet.js';
import { spendForAttack } from '@dndapp/shared/attack-extras.js';
import { activeForm, formHasHp, setFormHp } from '@dndapp/shared/wild-shape.js';
import {
  attackRiders, attackSituation, concentrationDc, creatureActions, creatureDefenses, refundSlot, resolveAttack,
  sheetActions, sheetDefenses, slotsLeft, spendSlot, tokenGap,
} from '@dndapp/shared/attacks.js';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { newTokenId } from '../maps/store.js';

/** Which side a token is on, for "an ally within 5 ft" (Sneak Attack): the party, the enemies, or nobody's. */
const side = (t) => (PLAYER_KINDS.includes(t.kind) ? 'party' : t.kind === 'enemy' ? 'enemy' : null);
const OUT_OF_IT = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'];

/** What an action is, for the page's picker and the card: no stat block text, nothing the viewer shouldn't have. */
const actionView = (x) => ({
  id: x.id, name: x.name, source: x.source, kind: x.kind, bonus: x.bonus, dc: x.dc, save: x.save,
  damage: x.damage.map((p) => `${p.dice}${p.type ? ` ${p.type}` : ''}`).join(' + '),
  damage2: x.damage2 ? x.damage2.map((p) => `${p.dice}${p.type ? ` ${p.type}` : ''}`).join(' + ') : null,
  area: x.area, half: x.half, ranged: !!x.ranged, level: x.level, slot: x.slot ?? null, upcast: !!x.upcast, prepared: !!x.prepared,
});

export function registerAttacks(app, r) {
  const { access, editions, maps, sheets, store, viewableMap } = r;
  const random = r.random;

  const attackSettings = (cid) => store.getSettings(cid).attacks;
  const mustBeOn = (cid) => {
    if (!attackSettings(cid).on) throw new BadRequestError('Attacks from the map are switched off in Campaign settings.');
  };

  /** A player character's saved sheet, worked out; null without one. */
  const sheetOf = (cid, token, edition = null) => {
    if (token.kind !== 'pc' || token.user_id == null) return null;
    const { sheet, version } = sheets.get(cid, token.user_id);
    const settings = store.getSettings(cid);
    return version ? { sheet, calc: computeSheet(sheet, { ...settings, edition: edition ?? settings.edition }), version } : null;
  };

  /** The token's actions: a character's from their sheet, anyone else's from its stat block. */
  const actionsOf = (cid, token, slots = {}, edition = '2014') => {
    if (token.kind === 'pc') {
      const s = sheetOf(cid, token, edition);
      if (!s) throw new BadRequestError(`${token.name} has no saved character sheet to attack from.`);
      return { list: sheetActions(s.sheet, s.calc, { slots, edition }), sheet: s };
    }
    return { list: creatureActions(token.stats?.text), sheet: null };
  };

  /** The token picked to act with: one this viewer controls (the DM: any). */
  const actorOf = (request, a, map, view, id) => {
    const dm = a.role === 'dm';
    const token = (dm ? map.tokens : view.tokens).find((t) => t.id === id);
    if (!token) throw new NotFoundError('No such token');
    if (!dm && !ownToken(token, a.userId)) throw new AuthError('You can only attack with your own character or companions.', 403);
    return token;
  };

  /** How a target defends: AC, saves, resistances (and the sheet's reasons for disadvantage on a save). */
  const defensesOf = (cid, token, edition) => {
    const s = sheetOf(cid, token);
    if (s) {
      const d = sheetDefenses(s.sheet, s.calc, edition);
      return { ...d, sheetSave: d.disadvantage };
    }
    return creatureDefenses(token.stats);
  };

  /** Someone on the same side within 5 ft of the target (not the attacker, not knocked out). */
  const allyNear = (map, attacker, target) =>
    map.tokens.some((t) => t.id !== attacker.id && t.id !== target.id && side(t) && side(t) === side(attacker) && !t.conditions.some((c) => OUT_OF_IT.includes(c)) && tokenGap(map, t, target) <= 5);

  /**
   * What a token can do, for the attack picker: GET ?target=<token> adds, per
   * action, what the conditions do to it ({ mode, reasons }) and how far away
   * the target is. { attacker, target, gap, actions, riders: { action id:
   * [{ id, name, note, dice, checked, options?, picked? }] }, slots }. options: Divine Smite's slots
   * ([{ value, label, dice }]), the player's pick sent back as rider_options.
   */
  app.get('/campaigns/:cid/maps/:mid/tokens/:tid/actions', async (request) => {
    const a = access(request);
    mustBeOn(a.cid);
    const { map, view } = viewableMap(request);
    const token = actorOf(request, a, map, view, request.params.tid);
    const edition = await editions.of(a.cid);
    const { list, sheet } = actionsOf(a.cid, token, {}, edition);
    const tid = typeof request.query?.target === 'string' ? request.query.target : '';
    const seen = tid ? (a.role === 'dm' ? map.tokens : view.tokens).find((t) => t.id === tid) : null;
    const target = seen ? map.tokens.find((t) => t.id === seen.id) : null;
    const gap = target ? tokenGap(map, token, target) : null;
    const riders = {};
    const actions = list.map((x) => {
      const sit = target && x.kind === 'attack' ? attackSituation({ attacker: token, target, ranged: x.ranged, gap }) : null;
      if (sheet) {
        const near = target ? allyNear(map, token, target) : false;
        const rs = attackRiders(sheet.sheet, sheet.calc.values, x, { edition });
        if (rs.length) riders[x.id] = rs.map((rd) => ({ id: rd.id, name: rd.name, note: rd.note, dice: rd.dice, ...(rd.hit && { hit: rd.hit }), checked: rd.suggest(sit?.mode ?? 'normal', near), ...(rd.options && { options: rd.options, picked: rd.picked }) }));
      }
      return { ...actionView(x), ...(sit && { situation: { mode: sit.mode, reasons: sit.reasons } }) };
    });
    return {
      attacker: { id: token.id, name: token.name },
      target: target && { id: target.id, name: target.name },
      gap,
      unit: map.scale?.unit ?? 'ft',
      actions,
      riders,
      slots: sheet ? slotsLeft(sheet.sheet, sheet.calc) : null,
    };
  });

  /**
   * Change hit points for an attack, now. A character with a saved sheet: the sheet (temporary hit points
   * first; a 2014 Wild Shape form's own hit points while in one), saved afterwards (`later`). Anyone else: the
   * token's hit points (to 0 at the lowest; up to the maximum when healed). Returns { change, before, after, note }:
   * change is what to take back on Undo.
   */
  const applyHp = (cid, m, token, amount, { heal = false, later, reason, by }) => {
    const s = sheetOf(cid, token);
    if (s) {
      // The attacker's own sheet may already be changing in this attack (a spell slot): build on that.
      const sheet = structuredClone(later.findLast((l) => l.user_id === token.user_id)?.sheet ?? s.sheet);
      const max = s.calc.values.hp_max == null ? null : Number(s.calc.values.hp_max) || null;
      if (formHasHp(sheet)) {
        const form = activeForm(sheet);
        const now = sheet.wild_shape.active.hp;
        const res = setFormHp(sheet, heal ? Math.min(form.hp_max, now + amount) : now - amount, max);
        later.push({ user_id: token.user_id, sheet: res.sheet, reason: `${reason}${res.reverted ? `: ${form.name} (Wild Shape) dropped to 0 and changed back${res.carried ? `, ${res.carried} damage carried over` : ''}` : ''}`, by });
        return { change: null, before: { current: now }, after: { current: res.reverted ? res.sheet.hp.current : res.sheet.wild_shape.active.hp }, note: res.reverted ? `dropped out of ${form.name}` : `${form.name} (Wild Shape)` };
      }
      const current = sheet.hp.current ?? max ?? 0;
      const temp = sheet.hp.temp ?? 0;
      let next = current;
      let nextTemp = temp;
      if (heal) next = Math.min(max ?? Infinity, Math.max(0, current) + amount);
      else {
        const fromTemp = Math.min(temp, amount);
        nextTemp = temp - fromTemp;
        next = Math.max(0, current - (amount - fromTemp));
      }
      sheet.hp = { ...sheet.hp, current: next, temp: nextTemp };
      later.push({ user_id: token.user_id, sheet, reason, by });
      return { change: { hp: next - current, temp: nextTemp - temp, sheet: true }, before: { current, temp, max }, after: { current: next, temp: nextTemp, max }, note: !heal && next === 0 && current > 0 ? 'down' : '' };
    }
    const t = m.tokens.find((x) => x.id === token.id);
    if (!t?.hp || (t.hp.current == null && t.hp.max == null)) return { change: null, before: null, after: null, note: 'no hit points on its token' };
    const current = t.hp.current ?? t.hp.max;
    const next = heal ? Math.min(t.hp.max ?? Infinity, Math.max(0, current) + amount) : Math.max(0, current - amount);
    t.hp = { ...t.hp, current: next };
    return { change: { hp: next - current }, before: { current, max: t.hp.max }, after: { current: next, max: t.hp.max }, note: !heal && next === 0 && current > 0 ? 'down' : '' };
  };

  /** Take an attack's hit points back (Undo): what it took off goes back on (or what it healed comes off). */
  const undoHp = (cid, m, target, later, by) => {
    const c = target.change;
    if (!c) return false;
    const token = m.tokens.find((x) => x.id === target.id);
    if (c.sheet) {
      if (!token || token.user_id == null) return false;
      const got = sheets.get(cid, token.user_id);
      if (!got.version) return false;
      const sheet = later.findLast((l) => l.user_id === token.user_id)?.sheet ?? got.sheet;
      const max = computeSheet(sheet, store.getSettings(cid)).values.hp_max;
      const current = sheet.hp.current ?? max ?? 0;
      later.push({ user_id: token.user_id, sheet: { ...sheet, hp: { ...sheet.hp, current: Math.min(max ?? Infinity, current - c.hp), temp: Math.max(0, (sheet.hp.temp ?? 0) - (c.temp ?? 0)) } }, reason: 'an attack on the map was undone (by the DM)', by });
      return true;
    }
    if (!token?.hp) return false;
    token.hp = { ...token.hp, current: Math.min(token.hp.max ?? Infinity, (token.hp.current ?? token.hp.max ?? 0) - c.hp) };
    return true;
  };

  /** Save the sheets an attack changed: each once, with every reason. */
  const saveSheets = (cid, later) => {
    for (const uid of new Set(later.map((l) => l.user_id))) {
      const mine = later.filter((l) => l.user_id === uid);
      sheets.save(cid, uid, mine.at(-1).sheet, { by: mine[0].by, reason: mine.map((l) => l.reason).join('; ') });
    }
  };

  /** A creature that's concentrating and took damage rolls its Constitution save (characters are told the DC). */
  const concentration = (m, token, defenses, damage, isPc) => {
    if (damage <= 0 || !token.conditions.includes('concentrating')) return null;
    const dc = concentrationDc(damage);
    if (isPc) return { dc, rolled: null };
    const bonus = defenses.saves?.con ?? 0;
    const d20 = random(20);
    const kept = d20 + bonus >= dc;
    if (!kept) {
      const t = m.tokens.find((x) => x.id === token.id);
      if (t) t.conditions = t.conditions.filter((c) => c !== 'concentrating');
    }
    return { dc, rolled: d20 + bonus, kept };
  };

  const ATTACK = z.object({
    attacker: z.string().max(20),
    action: z.string().max(80),
    target: z.string().max(20).optional(),
    template: z.string().max(20).optional(),
    mode: z.enum(ROLL_MODES).default('normal'),
    slot: z.number().int().min(1).max(9).optional(),
    use_slot: z.boolean().default(true),
    riders: z.array(z.string().max(40)).max(10).default([]),
    // A rider's choice: { divine_smite: 3 } (the slot level, or 'free' for 2024 Paladin's Smite).
    rider_options: z.record(z.string().max(40), z.union([z.number().int().min(1).max(9), z.literal('free')])).default({}),
    two_hands: z.boolean().default(false),
  });

  /**
   * Attack (or cast) from the map: { attacker, action, target? | template?, mode?, slot?, use_slot?,
   * riders?, two_hands? }. A player attacks with their own tokens, at a token they can see, or with their
   * own template (an area spell: everyone in it, seen or not, is caught; the caster isn't, for a cone or
   * line from them). Returns { map, attack (the card, as this viewer sees it), rolls: [{ label, result }]
   * (the dice, to show them) }.
   */
  app.post('/campaigns/:cid/maps/:mid/attack', async (request) => {
    const a = access(request);
    mustBeOn(a.cid);
    const { map, view } = viewableMap(request);
    const dm = a.role === 'dm';
    const body = ATTACK.parse(request.body ?? {});
    const attacker = actorOf(request, a, map, view, body.attacker);
    const edition = await editions.of(a.cid);
    const pre = actionsOf(a.cid, attacker, {}, edition);
    const picked = pre.list.find((x) => x.id === body.action);
    if (!picked) throw new NotFoundError(`${attacker.name} has no such attack.`);
    // A spell cast higher: its damage at that slot.
    const action = body.slot && picked.source === 'spell' ? actionsOf(a.cid, attacker, { [picked.id.slice(6)]: body.slot }, edition).list.find((x) => x.id === body.action) : picked;

    let targets;
    let template = null;
    if (body.template) {
      template = map.templates.find((t) => t.id === body.template);
      if (!template || (!dm && template.user_id !== a.userId)) throw new NotFoundError('No such template');
      targets = tokensInTemplate(map, template, map.tokens).filter((t) => !(t.id === attacker.id && ['cone', 'line'].includes(template.shape)));
    } else if (body.target) {
      const target = (dm ? map.tokens : view.tokens).find((t) => t.id === body.target);
      if (!target) throw new NotFoundError('No such target');
      // The whole token (a player's copy has no stat block, which its AC and saves come from).
      targets = [map.tokens.find((t) => t.id === target.id)];
    } else {
      throw new BadRequestError(action.area ? `Place ${action.name}'s area on the map first.` : 'Pick who to attack.');
    }

    // A spell of 1st level or higher uses a slot (unless the player says not: a scroll, an item, a free cast).
    let sheetAfterSlot = null;
    let used = null;
    const slotLevel = action.source === 'spell' && action.level >= 1 ? Math.max(action.level, body.slot ?? action.level) : null;
    if (slotLevel && body.use_slot && pre.sheet) {
      const spent = spendSlot(pre.sheet.sheet, pre.sheet.calc, slotLevel);
      if (!spent) throw new BadRequestError(`${attacker.name} has no ${ordinal(slotLevel)}-level spell slots left. Untick "Use a spell slot" to cast it anyway.`);
      sheetAfterSlot = spent.sheet;
      used = spent.used;
    }

    const defenses = new Map(targets.map((t) => [t.id, defensesOf(a.cid, t, edition)]));
    const riders = pre.sheet ? attackRiders(pre.sheet.sheet, pre.sheet.calc.values, action, { edition, picks: body.rider_options }).filter((rd) => body.riders.includes(rd.id)) : [];
    // What the riders use up (Divine Smite's slot, a superiority die...): refused now if there's none left, spent below on a hit.
    const spends = riders.filter((rd) => rd.spend).map((rd) => ({ ...rd.spend, name: rd.name }));
    let sheetAfterSpends = null;
    if (spends.length && pre.sheet) {
      try {
        sheetAfterSpends = spendForAttack(sheetAfterSlot ?? pre.sheet.sheet, spends, { edition, values: pre.sheet.calc.values });
      } catch (err) {
        throw new BadRequestError(`${err.message} Untick ${spends.map((x) => x.name).join(' and ')} to attack without it.`);
      }
    }
    const result = resolveAttack({
      action,
      attacker,
      targets: targets.map((t) => ({ id: t.id, name: t.name, conditions: t.conditions, gap: tokenGap(map, attacker, t), ...defenses.get(t.id) })),
      mode: body.mode,
      riders,
      twoHands: body.two_hands,
      random,
    });

    const waits = !dm && attackSettings(a.cid).damage === 'dm';
    const later = [];
    if (sheetAfterSlot) later.push({ user_id: attacker.user_id, sheet: sheetAfterSlot, reason: `cast ${action.name} on the map (${ordinal(slotLevel)}-level ${used === 'pact' ? 'Pact Magic ' : ''}slot)`, by: a.userId });
    if (sheetAfterSpends && result.targets.some((t) => t.hit === true)) later.push({ user_id: attacker.user_id, sheet: sheetAfterSpends, reason: `${spends.map((x) => x.name).join(' and ')} with ${action.name} on the map`, by: a.userId });
    const id = newTokenId();
    const saved = maps.change(a.cid, map.id, (m) => {
      const entry = {
        id,
        at: new Date().toISOString(),
        by: a.userId,
        status: 'done',
        attacker: { id: attacker.id, name: attacker.name, kind: attacker.kind },
        action: {
          name: action.name, kind: action.kind, dc: action.dc, save: action.save, half: action.half, slot: slotLevel, used,
          dice: action.damage.map((p) => p.dice).join(' + '), riders: riders.map((rd) => rd.name), two_hands: body.two_hands && !!action.damage2,
        },
        template: template?.id ?? null,
        targets: [],
      };
      for (const res of result.targets) {
        const token = m.tokens.find((t) => t.id === res.id);
        const t = { ...res, kind: token?.kind ?? '', status: 'none', change: null, before: null, after: null, concentration: null };
        if (token && res.amount > 0) {
          if (waits) {
            t.status = 'pending';
            entry.status = 'pending';
          } else {
            const reason = res.heal ? `healed ${res.amount} by ${attacker.name}'s ${action.name} on the map` : `took ${res.amount} damage from ${attacker.name}'s ${action.name} on the map`;
            Object.assign(t, applyHp(a.cid, m, token, res.amount, { heal: !!res.heal, later, reason, by: a.userId }), { status: 'applied' });
            if (!res.heal) t.concentration = concentration(m, token, defenses.get(token.id), res.amount, !!sheetOf(a.cid, token));
          }
        }
        // Topple (Weapon Mastery): the condition goes on the token straight away (Undo takes it off).
        if (token && res.condition && !token.conditions.includes(res.condition)) {
          token.conditions = [...token.conditions, res.condition];
          t.condition_added = res.condition;
        }
        delete t.condition;
        if (t.note) t.notes = [...t.notes, t.note];
        delete t.note;
        entry.targets.push(t);
      }
      m.attacks = [...(m.attacks ?? []), entry];
    }, { by: a.userId, reason: `attack: ${attacker.name}, ${action.name}` });
    saveSheets(a.cid, later);
    const fresh = later.length ? maps.get(a.cid, map.id) : saved;
    const out = maps.view(fresh, a);
    return { map: out, attack: out.attacks.find((e) => e.id === id) ?? null, rolls: result.rolls };
  });

  /**
   * The DM settles an attack: { do: apply | half | skip | undo, target? }. apply, half and skip are for
   * damage waiting for the DM (one target, or all of them); undo puts the hit points back (and the spell slot).
   */
  app.post('/campaigns/:cid/maps/:mid/attacks/:aid', async (request) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const body = z.object({ do: z.enum(['apply', 'half', 'skip', 'undo']), target: z.string().max(20).optional() }).parse(request.body ?? {});
    const entry = (map.attacks ?? []).find((e) => e.id === request.params.aid);
    if (!entry) throw new NotFoundError('No such attack');
    if (entry.status === 'undone') throw new BadRequestError('That attack was already undone.');
    const later = [];
    const saved = maps.change(a.cid, map.id, (m) => {
      const e = m.attacks.find((x) => x.id === entry.id);
      const which = e.targets.filter((t) => !body.target || t.id === body.target);
      if (body.do === 'undo') {
        for (const t of e.targets) {
          if (t.status === 'applied' && undoHp(a.cid, m, t, later, a.userId)) t.status = 'undone';
          else if (t.status === 'pending') t.status = 'skipped';
          if (t.condition_added) {
            const token = m.tokens.find((x) => x.id === t.id);
            if (token) token.conditions = token.conditions.filter((c) => c !== t.condition_added);
            delete t.condition_added;
            if (t.status === 'none') t.status = 'undone';
          }
        }
        if (e.action.used && e.action.slot) {
          const attacker = m.tokens.find((t) => t.id === e.attacker.id);
          const s = attacker && sheetOf(a.cid, attacker);
          if (s) later.push({ user_id: attacker.user_id, sheet: refundSlot(later.findLast((l) => l.user_id === attacker.user_id)?.sheet ?? s.sheet, e.action.slot, e.action.used), reason: `${e.action.name} on the map was undone: the spell slot is back (by the DM)`, by: a.userId });
        }
        e.status = 'undone';
        return;
      }
      for (const t of which) {
        if (t.status !== 'pending') continue;
        const token = m.tokens.find((x) => x.id === t.id);
        if (body.do === 'skip' || !token) {
          t.status = 'skipped';
          continue;
        }
        const amount = body.do === 'half' ? Math.floor(t.amount / 2) : t.amount;
        const reason = t.heal ? `healed ${amount} by ${e.attacker.name}'s ${e.action.name} on the map` : `took ${amount} damage from ${e.attacker.name}'s ${e.action.name} on the map`;
        const res = applyHp(a.cid, m, token, amount, { heal: !!t.heal, later, reason, by: a.userId });
        Object.assign(t, { change: res.change, before: res.before, after: res.after, status: 'applied', amount });
        if (res.note) t.notes = [...(t.notes ?? []), res.note];
        if (!t.heal) t.concentration = concentration(m, token, defensesOf(a.cid, token, '2014'), amount, !!sheetOf(a.cid, token));
      }
      if (!e.targets.some((t) => t.status === 'pending')) e.status = 'done';
    }, { by: a.userId, reason: `attack ${body.do}` });
    saveSheets(a.cid, later);
    const fresh = later.length ? maps.get(a.cid, map.id) : saved;
    const out = maps.view(fresh, a);
    return { map: out, attack: out.attacks.find((x) => x.id === entry.id) ?? null };
  });
}

const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
