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
  attackRiders, attackSituation, castLevels, concentrationDc, creatureActions, creatureDefenses, refundSlot, resolveAttack,
  rollToEnd, sheetActions, sheetDefenses, slotsLeft, spendSlot, tokenGap,
} from '@dndapp/shared/attacks.js';
import { ABILITY_NAMES } from '@dndapp/shared/sheet.js';
import { endConcentration, endMapSpell } from '@dndapp/shared/spell-effects.js';
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
  // What a spell does besides damage: the conditions it gives, how long it lasts, difficult terrain, how many it targets.
  conditions: x.conditions ?? [], lasting: x.lasting ?? null, difficult: !!x.difficult, targets_max: x.targets_max ?? null, self: !!x.self, duration: x.duration ?? '',
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
    let ended = [];
    if (!kept) {
      const t = m.tokens.find((x) => x.id === token.id);
      if (t) t.conditions = t.conditions.filter((c) => c !== 'concentrating');
      // Its spell ends: the area goes, whoever it held is free.
      ended = endConcentration(m, token.id).map((x) => x.name);
    }
    return { dc, rolled: d20 + bonus, kept, ...(ended.length && { ended }) };
  };

  const ATTACK = z.object({
    attacker: z.string().max(20),
    action: z.string().max(80),
    target: z.string().max(20).optional(),
    targets: z.array(z.string().max(20)).min(1).max(12).optional(),
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
   * Work out an action and put it on the map: spend the slot (and what riders use), roll, change hit points,
   * put conditions on, keep the card in the attack log and, for a lasting spell, put it in play (`spells`:
   * its area, who's under it, the caster's concentration). `again`: a spell in play rolled again for whoever
   * is in its area now (no slot; new ones join it). Returns { map, attack, rolls }.
   */
  const perform = ({ a, map, dm, body, attacker, pre, action, targets, template, edition, again = null }) => {
    // A spell of 1st level or higher uses a slot (unless the player says not: a scroll, an item, a free cast).
    let sheetAfterSlot = null;
    let used = null;
    // No level picked: the lowest slot left that can cast it (a warlock's 1st-level spell takes their pact slot).
    const slotLevel = action.source === 'spell' && action.level >= 1 ? Math.max(action.level, body.slot ?? (pre.sheet ? castLevels(pre.sheet.sheet, pre.sheet.calc, action.level).first : action.level)) : null;
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
    // A spell that lasts (not instantaneous) stays in play: its area, who's under it, the caster's concentration.
    const lasting = action.source === 'spell' && action.lasting && action.lasting.rounds !== 0 ? action.lasting : null;
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
          ...(lasting && { lasting: { concentration: lasting.concentration, rounds: lasting.rounds, duration: action.duration ?? '' } }),
          ...(again && { again: true }),
        },
        template: template?.id ?? null,
        targets: [],
      };
      const under = [];
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
        // A spell's conditions (Entangle's restrained on a failed save, Invisibility's invisible): on straight away too.
        if (token && res.conditions?.length) {
          t.conditions_added = res.conditions.filter((c) => !token.conditions.includes(c));
          token.conditions = [...token.conditions, ...t.conditions_added];
        }
        // Under a lasting spell: a failed save, a hit, or a spell with no roll.
        if (token && (res.effect || res.save?.success === false || res.hit === true || res.heal)) under.push({ id: token.id, conditions: res.conditions ?? [] });
        delete t.condition;
        if (t.note) t.notes = [...t.notes, t.note];
        delete t.note;
        entry.targets.push(t);
      }
      if (again) {
        // Rolled again for who's in its area now: anyone newly under it joins the spell.
        const sp = m.spells.find((x) => x.id === again.id);
        if (sp) for (const u of under) if (!sp.affected.some((x) => x.id === u.id)) sp.affected.push(u);
        entry.spell = again.id;
      } else if (lasting && (template || under.length)) {
        // Concentrating on a new spell ends the one before.
        if (lasting.concentration) {
          const ended = endConcentration(m, attacker.id);
          if (ended.length) entry.ended = ended.map((x) => x.name);
          const caster = m.tokens.find((t) => t.id === attacker.id);
          if (caster && !caster.conditions.includes('concentrating')) caster.conditions = [...caster.conditions, 'concentrating'];
        }
        const spellId = newTokenId();
        const fight = m.combat && lasting.rounds ? m.combat : null;
        m.spells.push({
          id: spellId, name: action.name, caster: attacker.id, caster_name: attacker.name, user_id: a.userId, action: action.id, slot: slotLevel,
          concentration: lasting.concentration, rounds: lasting.rounds,
          ends: fight ? { round: fight.round + lasting.rounds, turn: fight.entries.some((e) => e.id === attacker.id) ? attacker.id : fight.turn } : null,
          template: template?.id ?? null, save: action.save || '', dc: action.dc ?? null, check: action.check ?? '',
          affected: under, attack: id, at: entry.at,
        });
        const area = template && m.templates.find((t) => t.id === template.id);
        if (area) Object.assign(area, { spell: spellId, ...(action.difficult && { difficult: true }) });
        entry.spell = spellId;
      }
      m.attacks = [...(m.attacks ?? []), entry];
    }, { by: a.userId, reason: `${action.source === 'spell' ? 'spell' : 'attack'}: ${attacker.name}, ${action.name}${again ? ' (again)' : ''}` });
    saveSheets(a.cid, later);
    const fresh = later.length ? maps.get(a.cid, map.id) : saved;
    const out = maps.view(fresh, a);
    return { map: out, attack: out.attacks.find((e) => e.id === id) ?? null, rolls: result.rolls };
  };

  /**
   * Attack (or cast) from the map: { attacker, action, target? | targets? | template?, mode?, slot?, use_slot?,
   * riders?, two_hands? }. A player attacks with their own tokens, at tokens they can see (a spell: as many as
   * it says, Bless's three), or with their own template (an area spell: everyone in it, seen or not, is caught;
   * the caster isn't, for a cone or line from them). A spell with no roll (Bless, Mage Armor) can be cast at
   * nobody. Returns { map, attack (the card, as this viewer sees it), rolls: [{ label, result }] (the dice, to
   * show them) }.
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
    // A spell cast higher: its damage (and how many it can target) at that slot.
    const action = body.slot && picked.source === 'spell' ? actionsOf(a.cid, attacker, { [picked.id.slice(6)]: body.slot }, edition).list.find((x) => x.id === body.action) : picked;

    let targets;
    let template = null;
    const ids = [...new Set(body.targets ?? (body.target ? [body.target] : []))];
    if (body.template) {
      template = map.templates.find((t) => t.id === body.template);
      if (!template || (!dm && template.user_id !== a.userId)) throw new NotFoundError('No such template');
      targets = tokensInTemplate(map, template, map.tokens).filter((t) => !(t.id === attacker.id && ['cone', 'line'].includes(template.shape)));
    } else if (ids.length) {
      if (ids.length > 1 && action.kind === 'attack') throw new BadRequestError(`${action.name} attacks one target at a time.`);
      if (!dm && action.targets_max && ids.length > action.targets_max) throw new BadRequestError(`${action.name} can target ${action.targets_max === 1 ? 'one creature' : `up to ${action.targets_max} creatures`}${body.slot ? ' with that slot' : ''}.`);
      targets = ids.map((tid) => {
        const seen = (dm ? map.tokens : view.tokens).find((t) => t.id === tid);
        if (!seen) throw new NotFoundError('No such target');
        // The whole token (a player's copy has no stat block, which its AC and saves come from).
        return map.tokens.find((t) => t.id === seen.id);
      });
    } else if (action.kind === 'effect') {
      targets = [];
    } else {
      throw new BadRequestError(action.area ? `Place ${action.name}'s area on the map first.` : 'Pick who to attack.');
    }
    return perform({ a, map, dm, body, attacker, pre, action, targets, template, edition });
  });

  /**
   * A spell in play: { do: end | again | break, target? }. end: it ends (its area goes, the conditions it
   * gave come off, the caster stops concentrating); the DM, or whoever controls the caster. again: rolled
   * again for whoever is in its area now (a creature that walks into Entangle; Spirit Guardians' damage on a
   * new turn), without a slot; the same people. break: one creature under it tries to shake it off (the save
   * again, or Entangle's Strength check): the DM, or whoever controls that creature; on a success its
   * conditions from the spell come off (and a spell with no area and nobody left under it ends).
   * Returns { map, attack?, rolls, ended? }.
   */
  app.post('/campaigns/:cid/maps/:mid/spells/:sid', async (request) => {
    const a = access(request);
    mustBeOn(a.cid);
    const { map, view } = viewableMap(request);
    const dm = a.role === 'dm';
    const body = z.object({ do: z.enum(['end', 'again', 'break']), target: z.string().max(20).optional() }).parse(request.body ?? {});
    const sp = (dm ? map.spells : view.spells).find((x) => x.id === request.params.sid) && map.spells.find((x) => x.id === request.params.sid);
    if (!sp) throw new NotFoundError('No such spell in play');
    const caster = map.tokens.find((t) => t.id === sp.caster);
    const runsCaster = dm || sp.user_id === a.userId || (caster && ownToken(caster, a.userId));
    if (body.do === 'end') {
      if (!runsCaster) throw new AuthError('Only whoever cast it (or the DM) can end it.', 403);
      const saved = maps.change(a.cid, map.id, (m) => { endMapSpell(m, sp.id); }, { by: a.userId, reason: `spell ended: ${sp.name}` });
      return { map: maps.view(saved, a), rolls: [], ended: sp.name };
    }
    if (body.do === 'again') {
      if (!runsCaster) throw new AuthError('Only whoever cast it (or the DM) can do that.', 403);
      if (!caster) throw new BadRequestError(`Whoever cast ${sp.name} isn't on this map any more.`);
      const template = map.templates.find((t) => t.id === sp.template);
      if (!template) throw new BadRequestError(`${sp.name} has no area on the map to roll for.`);
      const edition = await editions.of(a.cid);
      const pre = actionsOf(a.cid, caster, sp.slot ? { [sp.action.slice(6)]: sp.slot } : {}, edition);
      const action = pre.list.find((x) => x.id === sp.action);
      if (!action) throw new BadRequestError(`${sp.name} isn't on ${caster.name}'s sheet any more.`);
      // A spell that holds people (Entangle) isn't rolled again for whoever it already holds; one that hurts is.
      const holds = (action.conditions ?? []).length > 0 && !action.damage.length;
      const targets = tokensInTemplate(map, template, map.tokens)
        .filter((t) => !(t.id === caster.id && ['cone', 'line'].includes(template.shape)))
        .filter((t) => !holds || !sp.affected.some((x) => x.id === t.id));
      const noRiders = { mode: 'normal', use_slot: false, riders: [], rider_options: {}, two_hands: false, slot: sp.slot ?? undefined };
      return perform({ a, map, dm, body: noRiders, attacker: caster, pre, action, targets, template, edition, again: sp });
    }
    // break
    const under = sp.affected.find((x) => x.id === body.target);
    const token = under && (dm ? map.tokens : view.tokens).find((t) => t.id === under.id);
    if (!token) throw new NotFoundError(`Nobody like that is under ${sp.name}.`);
    if (!dm && !ownToken(token, a.userId)) throw new AuthError('Only the DM, or whoever controls them, rolls for that.', 403);
    if (sp.dc == null || !(sp.check || sp.save)) throw new BadRequestError(`${sp.name} has no save to roll again: end it instead.`);
    const full = map.tokens.find((t) => t.id === token.id);
    const roll = rollToEnd({ target: { name: full.name, conditions: full.conditions, ...defensesOf(a.cid, full, await editions.of(a.cid)) }, ability: sp.save, check: sp.check, dc: sp.dc, random });
    const id = newTokenId();
    let ended = null;
    const saved = maps.change(a.cid, map.id, (m) => {
      const s = m.spells.find((x) => x.id === sp.id);
      if (roll.success && s) {
        const gone = s.affected.find((x) => x.id === full.id);
        s.affected = s.affected.filter((x) => x.id !== full.id);
        const t = m.tokens.find((x) => x.id === full.id);
        const still = new Set(m.spells.flatMap((x) => x.affected.filter((y) => y.id === full.id).flatMap((y) => y.conditions)));
        if (t && gone) t.conditions = t.conditions.filter((c) => !gone.conditions.includes(c) || still.has(c));
        if (!s.affected.length && !s.template) ended = endMapSpell(m, s.id)?.name ?? null;
      }
      m.attacks = [...(m.attacks ?? []), {
        id, at: new Date().toISOString(), by: a.userId, status: 'done',
        attacker: { id: full.id, name: full.name, kind: full.kind },
        action: { name: `${sp.name}: ${roll.kind === 'check' ? 'breaking free' : 'saving again'}`, kind: 'break', dc: sp.dc, save: roll.ability, slot: null, used: null, dice: '', riders: [] },
        template: null,
        spell: sp.id,
        targets: [{
          id: full.id, name: full.name, kind: full.kind, ac: null, hit: null, crit: false, rolled: [], amount: 0, status: 'none', change: null, before: null, after: null, concentration: null,
          save: { ability: roll.ability, d20: roll.d20, bonus: roll.bonus, total: roll.total, dc: sp.dc, success: roll.success, auto_fail: roll.auto_fail, check: roll.kind === 'check' },
          notes: [roll.success ? `free of ${sp.name}` : `still under ${sp.name}`, ...(ended ? [`${sp.name} ends`] : [])],
        }],
      }];
    }, { by: a.userId, reason: `${full.name} rolls against ${sp.name}` });
    const out = maps.view(saved, a);
    return { map: out, attack: out.attacks.find((e) => e.id === id) ?? null, rolls: [{ label: `${full.name}: ${ABILITY_NAMES[roll.ability]} ${roll.kind}`, result: roll.result }], ended };
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
    if (entry.action.kind === 'break' && body.do === 'undo') throw new BadRequestError('A roll to break free can’t be undone: change the token’s conditions instead.');
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
        // A spell put in play by it ends (its area, the caster's concentration); then the conditions it put on come off.
        if (e.spell && !e.action.again) endMapSpell(m, e.spell);
        for (const t of e.targets) {
          if (!t.conditions_added?.length) continue;
          const token = m.tokens.find((x) => x.id === t.id);
          const still = new Set(m.spells.flatMap((x) => x.affected.filter((y) => y.id === t.id).flatMap((y) => y.conditions)));
          if (token) token.conditions = token.conditions.filter((c) => !t.conditions_added.includes(c) || still.has(c));
          // Rolled again: whoever joined the spell then leaves it.
          if (e.action.again) for (const sp of m.spells.filter((x) => x.id === e.spell)) sp.affected = sp.affected.filter((y) => y.id !== t.id || !t.conditions_added.length);
          delete t.conditions_added;
          if (t.status === 'none') t.status = 'undone';
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
