/**
 * Level up (owner, 2026-10-28: "We want a 'level up' feature… Triggered by the DM, or the player,
 * depending on what the DM choose"). The campaign's setting `level_up` (settings.js) says who starts it:
 * 'player' (players level up when they're ready) or 'dm' (a player can only once the DM has given them a
 * level; sheet.levels_granted counts the ones not taken yet). The DM can give levels either way.
 *
 * Levelling up takes one level in a class the character has, or in a new one (multiclassing), and on the
 * way: hit points (the fixed average, or the server rolls the hit die), a subclass at the level the class
 * picks one, and an Ability Score Improvement or a feat at the levels that give one. Nothing is locked:
 * multiclass prerequisites only warn, and everything stays editable on the sheet (the DM has the last word).
 *
 * Plain JS like sheet.js: the server applies a level up (levelUp) and the page shows the choices and a
 * preview of what changes (levelUpChoices, levelUpChanges).
 */
import { ABILITIES, ABILITY_NAMES, CLASSES, classKey, computeSheet, levelClass, normalizeSheet } from './sheet.js';
import { traitRows } from './class-traits.js';
import { featureRows } from './class-features.js';
import { subclassNames } from './subclass-features.js';

/** Ability scores of 13 needed to multiclass into or out of a class (PHB; "any" of them for the fighter). */
export const MULTICLASS = {
  artificer: { all: ['int'] }, barbarian: { all: ['str'] }, bard: { all: ['cha'] }, cleric: { all: ['wis'] }, druid: { all: ['wis'] },
  fighter: { any: ['str', 'dex'] }, monk: { all: ['dex', 'wis'] }, paladin: { all: ['str', 'cha'] }, ranger: { all: ['dex', 'wis'] },
  rogue: { all: ['dex'] }, sorcerer: { all: ['cha'] }, warlock: { all: ['cha'] }, wizard: { all: ['int'] },
};

/** What multiclassing with a class needs, in words ("Strength and Charisma of 13 or more"), or '' if the sheet has it. */
export function multiclassNeeds(sheet, key) {
  const need = MULTICLASS[key];
  if (!need) return '';
  const score = (a) => Number(sheet.abilities?.[a] ?? 10);
  const ok = need.all ? need.all.every((a) => score(a) >= 13) : need.any.some((a) => score(a) >= 13);
  return ok ? '' : `${(need.all ?? need.any).map((a) => ABILITY_NAMES[a]).join(need.all ? ' and ' : ' or ')} of 13 or more`;
}

/** Class levels with an Ability Score Improvement (or a feat instead): the same in both editions. 19 is 2024's Epic Boon. */
export function asiLevels(key) {
  const levels = [4, 8, 12, 16, 19];
  if (key === 'fighter') levels.push(6, 14);
  if (key === 'rogue') levels.push(10);
  return levels.sort((a, b) => a - b);
}

/** The class level a subclass is picked at: 2014 clerics, sorcerers and warlocks at 1st, druids and wizards at 2nd; the rest, and everyone in 2024, at 3rd. */
export function subclassLevel(key, edition = '2014') {
  if (edition === '2024') return 3;
  return { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 }[key] ?? 3;
}

const average = (die) => die / 2 + 1;

/**
 * What a level up can be for this sheet: { total (character level now), can (false past 20 or with no class),
 * why, classes: [{ index, name, key, level, next, die, average, subclass, needsSubclass, subclasses, asi }],
 * others: [{ key, name, die, average, needs (multiclass prerequisite, '' if met), asi: false, needsSubclass }] }.
 */
export function levelUpChoices(sheet, { edition = '2014' } = {}) {
  const ed = edition === '2024' ? '2024' : '2014';
  const named = (sheet.classes ?? []).map((c, index) => ({ ...c, index })).filter((c) => c.name?.trim());
  const total = named.reduce((n, c) => n + (c.level || 1), 0);
  const why = !named.length ? 'Fill in your class on the sheet first.' : total >= 20 ? 'Level 20 is as high as characters go.' : '';
  const option = (c) => {
    const key = classKey(c.name);
    const die = key ? CLASSES[key].hitDie : 8;
    const next = (c.level || 1) + 1;
    return {
      index: c.index, name: c.name.trim(), key, level: c.level || 1, next, die, average: average(die), subclass: c.subclass ?? '',
      needsSubclass: !!key && !String(c.subclass ?? '').trim() && next >= subclassLevel(key, ed),
      subclasses: key ? subclassNames(key, ed) : [],
      asi: !!key && asiLevels(key).includes(next),
    };
  };
  const has = [...new Set(named.map((c) => classKey(c.name)).filter(Boolean))];
  // Multiclassing needs the scores of the new class and of every class the character has (a warning only).
  const needsOf = (key) => [key, ...has].map((k) => multiclassNeeds(sheet, k) && `${CLASSES[k].name} needs ${multiclassNeeds(sheet, k)}`).filter(Boolean).join('; ');
  const others = Object.entries(CLASSES).filter(([key]) => !has.includes(key)).map(([key, c]) => ({
    key, name: c.name, die: c.hitDie, average: average(c.hitDie), needs: needsOf(key),
    needsSubclass: subclassLevel(key, ed) === 1, subclasses: subclassNames(key, ed), asi: false,
  }));
  return { total, can: !why, why, classes: named.map(option), others };
}

export class LevelUpError extends Error {}

/**
 * Take a level: choice = { class: index of a class on the sheet, or new_class: a class name (multiclassing),
 * subclass?, hp: the hit die rolled (null: the fixed average), asi?: { ability: 1 | 2 } adding up to 2 at
 * most, feat?: a feat's name (written into Features & traits) }. Hit points go up by what the maximum goes
 * up by (a typed maximum too), and the level is logged in sheet.level_log. Returns { sheet, gained (hit
 * points), entry }. Throws LevelUpError when the choice can't be taken.
 */
export function levelUp(input, choice = {}, { edition = '2014', at = new Date().toISOString() } = {}) {
  const sheet = normalizeSheet(structuredClone(input));
  const { can, why, classes } = levelUpChoices(sheet, { edition });
  if (!can) throw new LevelUpError(why);
  const opts = { edition };
  const before = computeSheet(sheet, opts);
  let c;
  if (choice.new_class != null) {
    const name = String(choice.new_class).trim().slice(0, 60);
    if (!name) throw new LevelUpError('Pick the class to take a level in.');
    if (classes.some((x) => levelClass(x.name) === levelClass(name))) throw new LevelUpError(`You already have ${name}: pick it from your classes.`);
    if ((sheet.classes ?? []).filter((x) => x.name.trim()).length >= 12) throw new LevelUpError('That’s as many classes as a sheet holds.');
    sheet.classes.push({ name: classKey(name) ? CLASSES[classKey(name)].name : name, subclass: '', level: 1 });
    c = sheet.classes.at(-1);
  } else {
    c = sheet.classes[choice.class];
    if (!c?.name?.trim()) throw new LevelUpError('Pick the class to take a level in.');
    c.level = (c.level || 1) + 1;
  }
  const key = classKey(c.name);
  const die = key ? CLASSES[key].hitDie : 8;
  const subclass = String(choice.subclass ?? '').trim().slice(0, 80);
  if (subclass) c.subclass = subclass;
  // Ability Score Improvement: two points, on one ability or two (the sheet stops scores at 30; past 20 is the DM's call).
  const asi = {};
  let points = 0;
  for (const a of ABILITIES) {
    const n = Math.trunc(Number(choice.asi?.[a]) || 0);
    if (n < 0 || n > 2) throw new LevelUpError('An Ability Score Improvement adds 1 or 2 to a score.');
    if (n) { asi[a] = n; points += n; sheet.abilities[a] = Math.min(30, sheet.abilities[a] + n); }
  }
  if (points > 2) throw new LevelUpError('An Ability Score Improvement adds 2 points in all: +2 to one score, or +1 to two.');
  const feat = String(choice.feat ?? '').trim().slice(0, 100);
  if (feat) sheet.features = `${sheet.features.trimEnd()}${sheet.features.trim() ? '\n' : ''}Feat: ${feat}`.slice(0, 40_000);
  const hp = choice.hp == null ? null : Math.trunc(Number(choice.hp));
  if (hp != null && !(hp >= 1 && hp <= die)) throw new LevelUpError(`A d${die} rolls 1 to ${die}.`);
  const entry = { class: levelClass(c.name), level: c.level, die, hp, asi, feat, at };
  sheet.level_log = [...sheet.level_log, entry].slice(-40);
  const after = computeSheet(sheet, opts);
  const gained = (after.auto.hp_max ?? 0) - (before.auto.hp_max ?? 0);
  if (sheet.overrides.hp_max != null) sheet.overrides.hp_max += gained;
  if (sheet.hp.current != null) sheet.hp.current += Math.max(0, gained);
  return { sheet: normalizeSheet(sheet), gained, entry };
}

/**
 * What changed from one sheet to the other, in words, for the page's preview and its note afterwards:
 * ["Level 5 → 6", "Hit points 38 → 45", "Proficiency bonus +3 → +4", "Spell slots: 3rd level 2 → 3",
 * "New: Extra Attack: …", "Rage: 3 → 4"].
 */
export function levelUpChanges(beforeSheet, afterSheet, { edition = '2014' } = {}) {
  const opts = { edition };
  const b = computeSheet(beforeSheet, opts);
  const a = computeSheet(afterSheet, opts);
  const out = [];
  const step = (label, x, y, fmt = String) => { if (x !== y && y != null) out.push(`${label} ${x == null ? '—' : fmt(x)} → ${fmt(y)}`); };
  step('Level', b.level, a.level);
  step('Hit points', b.values.hp_max, a.values.hp_max);
  step('Hit dice', b.values.hit_dice, a.values.hit_dice);
  step('Proficiency bonus', b.values.proficiency_bonus, a.values.proficiency_bonus, (n) => `+${n}`);
  for (const ab of ABILITIES) step(ABILITY_NAMES[ab], beforeSheet.abilities[ab], afterSheet.abilities[ab]);
  const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  for (let n = 1; n <= 9; n++) step(`Spell slots, ${ord[n]} level:`, b.values[`slots.${n}`] || 0, a.values[`slots.${n}`] || 0);
  step('Pact Magic slots', b.values.pact_slots || 0, a.values.pact_slots || 0);
  step('Pact Magic slot level', b.values.pact_level || 0, a.values.pact_level || 0);
  const before = new Map(featureRows(beforeSheet, { ...opts, values: b.values }).map((r) => [r.id, r]));
  for (const r of featureRows(afterSheet, { ...opts, values: a.values })) {
    const was = before.get(r.id);
    if (!was) out.push(`New: ${r.name}${r.max != null ? ` (${r.max})` : ''}${r.note ? `. ${r.note}` : ''}`);
    else if (was.max !== r.max && r.max != null) out.push(`${r.name}: ${was.max ?? '—'} → ${r.max}`);
    else if (was.note !== r.note && r.note && r.kind === 'info') out.push(`${r.name}: ${r.note}`);
  }
  const had = new Set(traitRows(beforeSheet, { ...opts, values: b.values }).map((t) => t.key));
  for (const t of traitRows(afterSheet, { ...opts, values: a.values })) if (!had.has(t.key) && !t.race) out.push(`New: ${t.name}${t.text ? `. ${t.text}` : ''}`);
  return out;
}
