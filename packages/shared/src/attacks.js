/**
 * Attacks and area spells from the map (owner, 2026-10-21: "the player should
 * be able to select an enemy and make an attack. Or cast an AOE spell and
 * appropriate actions taken. The DM should also be able to do this with
 * enemies"). SPEC §6.6 "Attacks from the map".
 *
 * What a token can do (its actions: a character's from their sheet, using the
 * sheet's own rolls in rolls.js; a creature's read from its stat block), how a
 * target defends (AC, saving throws, resistances), what conditions do to the
 * roll, and working an attack out with given dice (`resolveAttack`, pure: the
 * server passes a secure random number, the tests fixed ones). The server
 * applies the result to hit points (routes/attacks.js).
 */
import { formatTerms, parseRoll, rollDice } from './dice.js';
import { abilityModifier as statBlockModifier, pxPerUnit, spellArea, squarePx } from './map.js';
import { attackRolls, gearRolls, spellRolls, splitDamage } from './rolls.js';
import { WEAPONS, attackWeapon, ownsWeapon } from './gear.js';
import { ABILITIES, ABILITY_NAMES, DAMAGE_TYPES, rollDisadvantage } from './sheet.js';
import { activeForm, formStats } from './wild-shape.js';
import { attackRiders } from './attack-riders.js';
import { offhandWeapon, planAttack, planSpell } from './attack-extras.js';

export { attackRiders };

export const ACTION_KINDS = ['attack', 'save', 'auto', 'heal'];

const ABBR = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
const ABILITY_BY_WORD = Object.fromEntries(ABILITIES.flatMap((a) => [[a, a], [ABILITY_NAMES[a].toLowerCase(), a]]));
const TYPE_RE = DAMAGE_TYPES.join('|');

/** "1d8+3 slashing" → [{ dice: "1d8+3", type: "slashing" }]; nothing → []. */
const damageParts = (text) => {
  const { dice, type } = splitDamage(text);
  return dice ? [{ dice, type: damageType(type) }] : [];
};
/** The damage type named in some words ("fire", "Slashing damage", "healing"), or ''. */
function damageType(words) {
  const m = new RegExp(`\\b(${TYPE_RE}|healing)\\b`, 'i').exec(String(words ?? ''));
  return m ? m[1].toLowerCase() : '';
}

/** A spell's description says a successful save halves the damage (most do; many cantrips don't). */
export const halvesOnSave = (text, { cantrip = false } = {}) => {
  const s = String(text ?? '');
  if (/half as much damage|half (?:the )?damage|Success:\s*Half/i.test(s)) return true;
  if (/no damage|takes? no\b/i.test(s)) return false;
  return !cantrip && !s.trim();
};

// ---------- what a character can do (from their sheet) ----------

const RANGED_WEAPON = (props) => props.includes('ammunition');

/**
 * Everything on a character sheet that can be rolled against someone on the
 * map: equipped weapons (as the sheet's Attacks show them, gearRolls), typed
 * attacks (attackRolls; ones naming a weapon the character doesn't carry are
 * left out, as the sheet won't roll them) and spells that attack, call for a
 * save, deal damage or heal (spellRolls), cast at `slots[spell.id]` (default
 * their own level). In a 2014 Wild Shape form: the form's attacks.
 * Each: { id, name, source: weapon | attack | spell | form, kind: attack |
 * save | auto | heal, bonus, dc, save, damage: [{ dice, type }], damage2
 * (versatile, both hands), ranged, finesse, magical, area, half, level,
 * upcast, ability, text }. Weapon attacks are worked out as the sheet's
 * Attacks box does (attack-extras.js planAttack, by the campaign's edition):
 * Archery, Great Weapon Fighting, Martial Arts, the off-hand attack of two
 * weapons, the critical range (crit_on) and dice (damage parts' crit), the
 * d20's own rules (d20: 'ro1' for a halfling, 'ea' for Elven Accuracy) and
 * the weapon's mastery (2024); what the player adds on a hit (Sneak Attack,
 * Divine Smite, Rage, Dueling...) comes as riders (attack-riders.js).
 */
export function sheetActions(sheet, calc, { slots = {}, edition = '2014' } = {}) {
  const out = [];
  const form = activeForm(sheet);
  if (form) {
    for (const [i, a] of form.attacks.entries()) {
      const save = a.save && a.dc != null;
      out.push({
        id: `form:${i}`, name: a.name, source: 'form', kind: save ? 'save' : 'attack', bonus: save ? null : a.bonus ?? 0, dc: save ? a.dc : null, save: save ? a.save : '',
        damage: damageParts(a.damage), damage2: null, ranged: /ranged/i.test(a.notes), finesse: false, magical: false, area: spellArea({ description: a.notes }), half: save ? halvesOnSave(a.notes) : false, level: null, upcast: false, ability: '', text: a.notes,
      });
    }
  }
  const fromPlan = (p, type) => (p.damage || p.flat != null ? [{ dice: p.damage ?? String(p.flat), type: damageType(type), crit: p.crit ?? null }] : []);
  const planned = (p) => ({ bonus: p.bonus, crit_on: p.crit_on, d20: /^1d20([a-z0-9]*)/i.exec(p.hit ?? '')?.[1] ?? '', mastery: p.mastery, notes: p.notes.filter((n) => !p.mastery || n !== p.mastery.line) });
  const gearAction = (g, { offhand = false } = {}) => {
    const props = g.weapon.properties ?? [];
    const a = { name: g.name, kind: 'attack', ability: g.weapon.ability, proficient: g.proficient, magic: g.magic, bonus: '', save: '', dc: '', damage: g.weapon.damage };
    const opts = { edition, weapon: { ...g.weapon, name: g.name }, riders: true, offhand };
    const p = planAttack(sheet, calc, a, opts);
    const two = props.includes('versatile') && !offhand ? planAttack(sheet, calc, a, { ...opts, two: true }) : null;
    const r = gearRolls(g, calc);
    return {
      id: `${offhand ? 'offhand' : 'gear'}:${g.id}`, name: offhand ? `${g.name} (off-hand)` : g.name, source: 'weapon', kind: 'attack', dc: null, save: '',
      damage: fromPlan(p, r.type), damage2: two ? fromPlan(two, r.type) : null,
      ranged: RANGED_WEAPON(props), thrown: props.includes('thrown'), reach: props.includes('reach'), finesse: g.weapon.ability === 'finesse' || props.includes('finesse'), magical: (g.magic ?? 0) > 0, area: null, half: false, level: null, upcast: false,
      ability: g.weapon.ability === 'finesse' ? 'dex' : g.weapon.ability, text: '', offhand, ...planned(p),
    };
  };
  for (const g of sheet.inventory ?? []) {
    if (!g.equipped || !g.weapon) continue;
    out.push(gearAction(g));
  }
  const off = offhandWeapon(sheet, edition);
  if (off) out.push(gearAction(off, { offhand: true }));
  for (const [i, a] of (sheet.attacks ?? []).entries()) {
    if (!a.name.trim()) continue;
    const weapon = attackWeapon(a.name);
    if (weapon && !ownsWeapon(weapon, sheet.inventory)) continue;
    const r = attackRolls(a, calc);
    const props = weapon ? WEAPONS[weapon.toLowerCase()].properties : [];
    const flat = r.damage ?? (r.flat != null ? String(r.flat) : null);
    const p = r.kind === 'attack' ? planAttack(sheet, calc, a, { edition, riders: true }) : null;
    out.push({
      id: `attack:${i}`, name: a.name.trim(), source: 'attack', kind: r.kind, bonus: r.bonus, dc: r.dc, save: r.save,
      damage: p ? fromPlan(p, r.type) : flat ? [{ dice: flat, type: damageType(r.type) }] : [], damage2: null,
      ...(p && planned(p)),
      ranged: RANGED_WEAPON(props) || /\bbow\b|crossbow|sling|ranged/i.test(a.name), finesse: a.ability === 'finesse' || props.includes('finesse'), magical: (a.magic ?? 0) > 0 || a.ability === 'spell',
      area: spellArea({ description: `${a.name} ${a.notes}` }), half: r.kind === 'save' ? !/no damage/i.test(a.notes) : false, level: null, upcast: false,
      ability: a.ability === 'finesse' ? 'dex' : a.ability === 'spell' ? calc.values.spell_ability ?? '' : a.ability, text: a.notes,
    });
  }
  for (const sp of sheet.spells ?? []) {
    if (!sp.attack && !sp.damage.trim()) continue;
    const level = sp.level >= 1 ? Math.max(sp.level, Math.min(9, Number(slots[sp.id]) || sp.level)) : sp.level;
    const r = spellRolls(sp, calc, level);
    const heal = /heal/i.test(sp.damage);
    const kind = sp.attack === 'attack' ? 'attack' : sp.attack === 'save' ? 'save' : heal ? 'heal' : 'auto';
    out.push({
      id: `spell:${sp.id}`, name: sp.name, source: 'spell', kind, bonus: r.kind === 'attack' ? r.bonus : null, dc: r.kind === 'save' ? r.dc : null, save: r.save || '',
      damage: r.damage ? [{ dice: r.damage, type: heal ? 'healing' : damageType(r.type) }] : [], damage2: null,
      ranged: /ranged spell attack/i.test(sp.description), finesse: false, magical: true, area: spellArea(sp),
      half: kind === 'save' ? halvesOnSave(sp.description, { cantrip: sp.level === 0 }) : false,
      level: sp.level, slot: level, upcast: sp.level >= 1 && !!sp.higher_damage.trim(), prepared: sp.prepared, ability: calc.values.spell_ability ?? '', text: '',
      d20: kind === 'attack' ? /^1d20([a-z0-9]*)/i.exec(planSpell(sheet, calc, sp, { edition, slot: level }).hit ?? '')?.[1] ?? '' : '',
    });
  }
  return out.slice(0, 120);
}

// Spell slots (left, spend, give back, cast with): spell-slots.js, shared with the sheet page.
export { castLevels, castWithSlot, refundSlot, slotsLeft, spendSlot } from './spell-slots.js';

// ---------- what a creature can do (from its stat block) ----------

const clean = (s) => String(s ?? '').replace(/[−–]/g, '-').replace(/ /g, ' ');
const nameOf = (line) => line.replace(/^[\s>*_#|-]+/, '').match(/^([^.:*_|]{1,60}?)[*_]*\s*[.:]/)?.[1].trim() ?? null;

/** Damage with its types after "Hit:" or in a save's effect: "7 (1d8 + 3) piercing damage plus 3 (1d6) fire damage". */
function damageIn(text) {
  const parts = [];
  const s = clean(text);
  const re = new RegExp(String.raw`(?:(\d{1,3})\s*\(\s*(\d{1,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?)\s*\)|\b(\d{1,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?)|\b(\d{1,3}))\s+(${TYPE_RE})\s+damage`, 'gi');
  for (const m of s.matchAll(re)) {
    const dice = (m[2] ?? m[3] ?? m[4]).replace(/\s+/g, '');
    parts.push({ dice, type: m[5].toLowerCase() });
    if (parts.length >= 4) break;
  }
  return parts;
}

/**
 * A creature's actions, read from its stat block: attacks ("Bite. Melee
 * Weapon Attack: +4 to hit… Hit: 7 (1d8 + 3) piercing damage", 2024's "Melee
 * Attack Roll: +4… Hit: 5 (1d6 + 2) Slashing damage") and actions with a save
 * ("…must make a DC 13 Dexterity saving throw, taking 21 (6d6) fire damage on
 * a failed save, or half as much damage on a successful one", 2024's
 * "Dexterity Saving Throw: DC 13… Failure: 10 (3d6) Fire damage. Success:
 * Half damage."), with their areas. Same shape as sheetActions.
 */
export function creatureActions(text) {
  const out = [];
  for (const raw of clean(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const hit = line.match(/(?:attack(?: roll)?)[*_]*\s*:[*_\s]*([+-]\s*\d{1,2})|([+-]\s*\d{1,2})\s+to hit/i);
    const save = line.match(/DC\s*(\d{1,2})\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving throw/i)
      ?? line.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving throw[*_]*\s*:[*_\s]*DC\s*(\d{1,2})/i);
    if (!hit && !save) continue;
    const name = nameOf(line);
    if (!name || /^(saving throws?|skills|senses)$/i.test(name)) continue;
    const id = `stat:${out.length}`;
    if (hit) {
      const after = line.slice(Math.max(0, line.search(/hit\s*:/i)));
      out.push({
        id, name, source: 'stat', kind: 'attack', bonus: Number((hit[1] ?? hit[2]).replace(/\s+/g, '')), dc: null, save: '',
        damage: damageIn(after), damage2: null, ranged: /ranged (?:weapon |spell )?attack/i.test(line) && !/melee or ranged/i.test(line), finesse: false, magical: /spell attack|magical/i.test(line),
        area: null, half: false, level: null, upcast: false, ability: '', text: line.slice(0, 600),
      });
    } else {
      const [dc, ability] = /^\d/.test(save[1]) ? [save[1], save[2]] : [save[2], save[1]];
      const fail = line.search(/failed save|Failure\s*:|taking/i);
      out.push({
        id, name, source: 'stat', kind: 'save', bonus: null, dc: Number(dc), save: ABILITY_BY_WORD[ability.toLowerCase()],
        damage: damageIn(fail >= 0 ? line.slice(fail) : line), damage2: null, ranged: false, finesse: false, magical: true,
        area: spellArea({ description: line }), half: halvesOnSave(line), level: null, upcast: false, ability: '', text: line.slice(0, 600),
      });
    }
    if (out.length >= 16) break;
  }
  return out;
}

// ---------- how a target defends ----------

/** Damage types in one line of a stat block, with whether they only count against nonmagical attacks. */
function typesIn(line) {
  const out = [];
  for (const seg of line.split(';')) {
    const nonmagical = /non-?magical/i.test(seg);
    for (const m of seg.matchAll(new RegExp(`\\b(${TYPE_RE})\\b`, 'gi'))) out.push({ type: m[1].toLowerCase(), nonmagical });
  }
  return out;
}

/**
 * How a creature defends, from its stat block: { ac, saves: { dex: +5 … }
 * (its listed saving throws, else the ability modifier), resist, immune,
 * vulnerable: [{ type, nonmagical }] }.
 */
export function creatureDefenses(stats) {
  const text = clean(stats?.text);
  const acText = text.match(/\b(?:Armor Class|AC)\b[*_:\s]*(\d{1,2})/i);
  const ac = stats?.ac ?? (acText ? Number(acText[1]) : null);
  const saves = {};
  const listed = text.match(/Saving Throws?[*_:\s]+([^\n]+)/i)?.[1] ?? '';
  for (const a of ABILITIES) {
    const m = listed.match(new RegExp(`\\b${ABBR[a]}\\w*\\s*([+-]\\s*\\d{1,2})`, 'i'));
    saves[a] = m ? Number(m[1].replace(/\s+/g, '')) : statBlockModifier(text, a.toUpperCase()) ?? 0;
  }
  const lineOf = (words) => text.split('\n').filter((l) => new RegExp(`^[\\s>*_|-]*(?:Damage\\s+)?${words}\\b`, 'i').test(l)).map((l) => l.replace(new RegExp(`^.*?${words}`, 'i'), '')).join(';');
  return { ac, saves, resist: typesIn(lineOf('Resistances?')), immune: typesIn(lineOf('Immunit(?:y|ies)')), vulnerable: typesIn(lineOf('Vulnerabilit(?:y|ies)')) };
}

/**
 * How a character defends, from their sheet: AC and saves (a Wild Shape
 * form's while in one), and resistances written in their features ("You have
 * resistance to fire damage").
 */
export function sheetDefenses(sheet, calc, edition = '2014') {
  const form = activeForm(sheet);
  const stats = form ? formStats(sheet, form, calc, edition) : null;
  const saves = {};
  for (const a of ABILITIES) saves[a] = stats ? stats.saves[a] : Number(calc.values[`save.${a}`]) || 0;
  const text = [sheet.features, sheet.additional_features].join('\n');
  const resist = [];
  for (const m of text.matchAll(/resistan(?:ce|t) to ([a-z ,]+?) damage/gi)) for (const t of typesIn(m[1])) resist.push(t);
  return { ac: stats ? stats.ac : Number(calc.values.ac) || null, saves, resist, immune: [], vulnerable: [], disadvantage: (ability) => rollDisadvantage(calc, { ability }) };
}

/** Damage after resistance, immunity and vulnerability: { amount, note: 'immune' | 'resistant' | 'vulnerable' | '' }. */
export function afterDefenses(amount, type, defenses, { magical = false } = {}) {
  const has = (list) => (list ?? []).some((d) => d.type === type && !(d.nonmagical && magical));
  if (!type || type === 'healing') return { amount, note: '' };
  if (has(defenses?.immune)) return { amount: 0, note: 'immune' };
  let n = amount;
  let note = '';
  if (has(defenses?.resist)) { n = Math.floor(n / 2); note = 'resistant'; }
  if (has(defenses?.vulnerable)) { n *= 2; note = note ? '' : 'vulnerable'; }
  return { amount: n, note };
}

// ---------- the map: distance and conditions ----------

/**
 * How far apart two tokens are, edge to edge, in the map's unit, as 5e counts
 * reach: tokens side by side (or diagonally) are 5 ft apart.
 */
export function tokenGap(map, a, b) {
  const g = squarePx(map);
  const unit = g / pxPerUnit(map); // one square in the map's unit
  const half = (t) => (Math.max(1, t.size) * g) / 2;
  const dx = Math.max(0, Math.abs(a.x - b.x) - half(a) - half(b));
  const dy = Math.max(0, Math.abs(a.y - b.y) - half(a) - half(b));
  const squares = map.grid ? Math.max(Math.round(dx / g), Math.round(dy / g)) : Math.hypot(dx, dy) / g;
  return Math.round((squares + 1) * unit * 10) / 10;
}

const CANT_SEE = ['blinded'];
/**
 * What the attacker's and target's conditions do to an attack roll (PHB
 * conditions, both editions): { mode: normal | advantage | disadvantage,
 * reasons: ["Goblin is prone"], autoCrit } with `chosen` (the player's own
 * advantage or disadvantage) added in. gap: how far apart, in feet.
 */
export function attackSituation({ attacker, target, ranged = false, gap = 5, chosen = 'normal' }) {
  const adv = [];
  const dis = [];
  const A = new Set(attacker?.conditions ?? []);
  const T = new Set(target?.conditions ?? []);
  if (chosen === 'advantage') adv.push('chosen');
  if (chosen === 'disadvantage') dis.push('chosen');
  for (const c of CANT_SEE) if (A.has(c)) dis.push(`${attacker.name} is ${c}`);
  for (const c of ['poisoned', 'frightened', 'prone', 'restrained']) if (A.has(c)) dis.push(`${attacker.name} is ${c}`);
  if (A.has('invisible')) adv.push(`${attacker.name} is invisible`);
  if (T.has('invisible')) dis.push(`${target.name} is invisible`);
  for (const c of ['blinded', 'paralyzed', 'petrified', 'restrained', 'stunned', 'unconscious']) if (T.has(c)) adv.push(`${target.name} is ${c}`);
  if (T.has('prone')) (gap <= 5 ? adv : dis).push(`${target.name} is prone`);
  if (ranged && gap <= 5) dis.push('a ranged attack within 5 ft');
  const mode = adv.length && !dis.length ? 'advantage' : dis.length && !adv.length ? 'disadvantage' : 'normal';
  const autoCrit = gap <= 5 && (T.has('paralyzed') || T.has('unconscious'));
  return { mode, reasons: [...adv, ...dis].filter((r) => r !== 'chosen'), autoCrit };
}

/** What conditions do to a saving throw: { autoFail, mode, reasons }. */
export function saveSituation(target, ability, { sheetWhy = '' } = {}) {
  const T = new Set(target?.conditions ?? []);
  const out = { autoFail: false, mode: 'normal', reasons: [] };
  if ((ability === 'str' || ability === 'dex') && ['paralyzed', 'petrified', 'stunned', 'unconscious'].some((c) => T.has(c))) {
    out.autoFail = true;
    out.reasons.push(`${target.name} fails Strength and Dexterity saves`);
  } else if (ability === 'dex' && T.has('restrained')) {
    out.mode = 'disadvantage';
    out.reasons.push(`${target.name} is restrained`);
  }
  if (sheetWhy && !out.autoFail) {
    out.mode = 'disadvantage';
    out.reasons.push(sheetWhy);
  }
  return out;
}

// ---------- working an attack out ----------

/** The same roll with twice the dice (a critical hit): "1d8+3" → "2d8+3". */
export function critNotation(notation) {
  if (!/d/i.test(notation)) return notation;
  const { terms } = parseRoll(notation);
  return formatTerms(terms.map((t) => (t.value !== undefined ? t : { ...t, count: t.count * 2 })));
}

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** Roll some dice (a plain number is just that). { notation, total, result } (result: rollDice's, for showing the dice). */
function rollSome(notation, random, mode = 'normal') {
  if (!/d/i.test(notation)) return { notation, total: Number(notation) || 0, result: null };
  const result = rollDice(parseRoll(notation), { mode, random });
  return { notation, total: result.total, result };
}

/**
 * A weapon's mastery (2024 Weapon Mastery, the action's mastery from
 * planAttack) on one target: Graze's damage on a miss; Topple's
 * Constitution save, rolled here (condition: 'prone' on a failure, which the
 * server puts on the token); the others as a note for the table.
 */
function masteryOnTarget(action, entry, t, { hit, ownType, land, rolls, random }) {
  const m = action.mastery;
  if (hit === false && m.property === 'graze' && m.graze > 0) {
    entry.rolled = [{ notation: String(m.graze), type: ownType, total: m.graze }];
    const { amount, notes } = land(entry.rolled, t);
    entry.amount = amount;
    entry.notes.push(`Graze: ${m.graze} damage on a miss`, ...notes);
    entry.mastery = 'graze';
    return;
  }
  if (hit !== true) return;
  entry.mastery = m.property;
  if (m.property === 'topple') {
    const bonus = t.saves?.con ?? 0;
    const save = rollDice(parseRoll(`1d20${bonus ? signed(bonus) : ''}`), { mode: 'normal', random });
    rolls.push({ label: `${t.name}: Constitution save (Topple)`, result: save });
    const fell = save.total < m.dc;
    entry.topple = { total: save.total, dc: m.dc, success: !fell };
    entry.notes.push(fell ? `Topple: Constitution save ${save.total} against DC ${m.dc}, falls prone` : `Topple: Constitution save ${save.total} against DC ${m.dc}, stays standing`);
    if (fell) entry.condition = 'prone';
    return;
  }
  const NOTE = {
    vex: 'Vex: advantage on the attacker\'s next attack against it before the end of their next turn',
    sap: 'Sap: disadvantage on its next attack before the attacker\'s next turn',
    slow: 'Slow: its speed is 10 feet lower until the start of the attacker\'s next turn',
    push: 'Push: it can be pushed 10 feet straight away (Large or smaller)',
    cleave: 'Cleave: once a turn, attack a second creature within 5 feet of it (no modifier to the damage)',
    nick: 'Nick: the extra Light-weapon attack can be part of the Attack action',
    graze: '',
  };
  if (NOTE[m.property]) entry.notes.push(NOTE[m.property]);
}

/**
 * Work an attack out. action: from sheetActions / creatureActions. targets:
 * [{ id, name, ac, saves, resist, immune, vulnerable, conditions, gap,
 * sheetSave?(ability) → why it has disadvantage }]. mode: the attacker's
 * chosen advantage or disadvantage. riders: extra damage on a hit
 * ([{ id, name, dice, type }]). twoHands: a versatile weapon's bigger die.
 * random(sides) → 1..sides.
 * Returns { kind, targets: [{ id, name, ac, attack?, save?, hit, crit,
 * rolled: [{ notation, type, total }], amount, notes }], damage (rolled once
 * for everyone, for saves and spells that just hit), rolls: [{ label, result }]
 * (to show the dice), reasons }.
 */
export function resolveAttack({ action, attacker = null, targets, mode = 'normal', riders = [], twoHands = false, random }) {
  const rolls = [];
  const damageList = twoHands && action.damage2 ? action.damage2 : action.damage;
  // A rider with no type of its own (Sneak Attack, Rage) deals the weapon's.
  const ownType = damageList[0]?.type ?? '';
  const rollDamage = (crit, label, extra = []) => [...damageList, ...extra.map((x) => ({ ...x, type: x.type || ownType }))].map((p) => {
    const r = rollSome(crit ? p.crit ?? critNotation(p.dice) : p.dice, random);
    if (r.result) rolls.push({ label: `${label}${p.type ? ` (${p.type})` : ''}`, result: r.result });
    return { notation: r.notation, type: p.type, total: r.total };
  });
  const land = (rolled, t, { halve = false } = {}) => {
    const notes = [];
    let amount = 0;
    for (const p of rolled) {
      const base = halve ? Math.floor(p.total / 2) : p.total;
      const d = afterDefenses(base, p.type, t, { magical: action.magical });
      if (d.note) notes.push(`${d.note} to ${p.type}`);
      amount += d.amount;
    }
    return { amount: Math.max(0, amount), notes };
  };
  const out = { kind: action.kind, targets: [], damage: null, rolls };

  if (action.kind === 'attack') {
    for (const t of targets) {
      const sit = attackSituation({ attacker, target: t, ranged: action.ranged, gap: t.gap ?? 5, chosen: mode });
      // Riders that change the roll to hit (Great Weapon Master's −5); the d20's own rules (a halfling's Luck, Elven Accuracy).
      const bonus = (action.bonus ?? 0) + riders.reduce((n, x) => n + (x.hit || 0), 0);
      const d20 = rollDice(parseRoll(`1d20${action.d20 ?? ''}${bonus ? signed(bonus) : ''}`), { mode: sit.mode, random });
      rolls.push({ label: `${action.name} vs ${t.name}: to hit`, result: d20 });
      const natural = d20.natural;
      const critOn = action.crit_on ?? 20;
      const hit = natural >= critOn ? true : natural === 1 ? false : t.ac == null ? null : d20.total >= t.ac;
      const crit = natural >= critOn || (hit === true && sit.autoCrit);
      const entry = {
        id: t.id, name: t.name, ac: t.ac ?? null,
        attack: { d20: d20.terms.find((x) => x.sides === 20).dice.map((d) => d.value), natural, bonus, total: d20.total, mode: d20.mode },
        hit, crit, rolled: [], amount: 0, notes: [...sit.reasons],
      };
      if (hit !== false && damageList.length) {
        entry.rolled = rollDamage(crit, `${action.name}: damage${crit ? ' (critical)' : ''}`, hit === true ? riders : []);
        Object.assign(entry, (({ amount, notes }) => ({ amount, notes: [...entry.notes, ...notes] }))(land(entry.rolled, t)));
      }
      if (hit === null) entry.notes.push('its AC is unknown: the DM decides');
      if (action.mastery) masteryOnTarget(action, entry, t, { hit, ownType, land, rolls, random });
      out.targets.push(entry);
    }
    return out;
  }

  // Saves, spells that just hit (Magic Missile) and healing: the dice are rolled once for everyone.
  const rolled = damageList.length ? rollDamage(false, `${action.name}: ${action.kind === 'heal' ? 'healing' : 'damage'}`) : [];
  out.damage = rolled;
  for (const t of targets) {
    const entry = { id: t.id, name: t.name, ac: null, hit: null, crit: false, rolled, amount: 0, notes: [] };
    if (action.kind === 'heal') {
      entry.amount = rolled.reduce((n, p) => n + p.total, 0);
      entry.heal = true;
    } else if (action.kind === 'auto') {
      Object.assign(entry, land(rolled, t));
    } else {
      const sit = saveSituation(t, action.save, { sheetWhy: t.sheetSave?.(action.save) ?? '' });
      const bonus = t.saves?.[action.save] ?? 0;
      const d20 = rollDice(parseRoll(`1d20${bonus ? signed(bonus) : ''}`), { mode: sit.mode, random });
      rolls.push({ label: `${t.name}: ${ABILITY_NAMES[action.save] ?? ''} save`, result: d20 });
      const success = !sit.autoFail && d20.total >= action.dc;
      entry.save = { ability: action.save, d20: d20.terms.find((x) => x.sides === 20).dice.map((d) => d.value), bonus, total: d20.total, dc: action.dc, success, auto_fail: sit.autoFail, mode: d20.mode };
      entry.notes.push(...sit.reasons);
      if (!success) Object.assign(entry, (({ amount, notes }) => ({ amount, notes: [...entry.notes, ...notes] }))(land(rolled, t)));
      else if (action.half) Object.assign(entry, (({ amount, notes }) => ({ amount, notes: [...entry.notes, 'half on a save', ...notes] }))(land(rolled, t, { halve: true })));
    }
    out.targets.push(entry);
  }
  return out;
}

/**
 * A concentrating creature that took damage makes a Constitution save, DC 10
 * or half the damage (whichever is higher).
 */
export const concentrationDc = (damage) => Math.max(10, Math.floor(damage / 2));

// ---------- what each viewer sees of the log ----------

/**
 * A map's attack log as one viewer may see it. The DM: all of it. A player:
 * only attacks where they can see the attacker or a target (their own tokens
 * always count); the attacker is "someone you can't see" when they can't;
 * only the targets they can see; an enemy's AC only when the DM shows it
 * (show_ac) and its hit points never; the dice behind damage only for their
 * own attacks.
 */
export function attackLogFor(log, { dm, visible, own, showAc }) {
  if (dm) return log;
  const out = [];
  for (const e of log ?? []) {
    const seesAttacker = visible.has(e.attacker.id) || own.has(e.attacker.id);
    const targets = e.targets.filter((t) => visible.has(t.id) || own.has(t.id));
    if (!seesAttacker && !targets.length) continue;
    const mine = own.has(e.attacker.id);
    out.push({
      ...e,
      attacker: seesAttacker ? e.attacker : { id: null, name: 'Someone you can’t see', kind: '' },
      action: { ...e.action, ...(!mine && { dice: '' }) },
      targets: targets.map((t) => ({
        ...t,
        ac: own.has(t.id) || (showAc && t.kind !== 'pc') || t.kind === 'pc' ? t.ac : null,
        before: own.has(t.id) ? t.before : null,
        change: own.has(t.id) ? t.change : null,
        after: own.has(t.id) || t.kind === 'pc' || t.kind === 'companion' ? t.after : null,
        rolled: mine || own.has(t.id) ? t.rolled : t.rolled.map(({ type, total }) => ({ notation: '', type, total })),
      })),
      hidden_targets: undefined,
    });
  }
  return out;
}

export { ABBR as ABILITY_ABBR };
