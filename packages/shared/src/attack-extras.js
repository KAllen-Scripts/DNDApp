/**
 * What class features add to an attack or a spell rolled from the sheet:
 * Weapon Mastery (2024 rules), Sneak Attack, Divine Smite, Rage, fighting
 * styles, Hunter's Mark, Hex, Martial Arts, Brutal Critical, Improved
 * Critical, Superiority Dice, Agonizing Blast, Potent Spellcasting and the
 * rest (the full list: docs/notes/class-features-audit.md).
 *
 * This is the one place attacks are worked out: the sheet's Attacks box and
 * anything else that rolls a character's attack (the map) call planAttack()
 * and planSpell() and roll what they give back. A plan says what to roll to
 * hit, the damage (with the picked extras' dice and numbers merged in), the
 * damage on a critical hit and from what natural roll it's one, notes to show
 * with the result (a mastery's effect with its numbers, "once per turn"), and
 * what rolling the damage spends (a spell slot for a smite, a superiority
 * die...). Extras the player chooses per attack (Sneak Attack, Divine Smite)
 * are `picks`; ones that always apply (Rage while raging, Dueling) are in by
 * themselves.
 *
 * What the player chose for the character lives in sheet.combat (normalizeCombat):
 * the weapons they have mastery with, their fighting styles and other
 * choices, and what's going on right now (raging, Hunter's Mark, Hex).
 *
 * Plain JS like sheet.js: the server and the page use it (/shared/attack-extras.js).
 * Rules from the 2014 and 2024 Player's Handbooks (the campaign's edition
 * decides), Xanathar's for the Hexblade.
 */
import { WEAPONS, armorClass, attackWeapon, magicName } from './gear.js';
import { abilityModifier, addToRoll, attackRolls, biggerDie, splitDamage, spellRolls } from './rolls.js';
import { classLevels, featureRow } from './class-features.js';
import { subclassOf } from './subclass-features.js';
import { racesOf } from './race-features.js';
import { formatTerms, parseRoll } from './dice.js';
import { d20Rule, featsOf } from './feats.js';

const step = (table, level) => table.reduce((v, [from, n]) => (level >= from ? n : v), table[0][1]);
const plus = (n) => (n < 0 ? `−${-n}` : `+${n}`);

// ---------- Weapon Mastery (2024) ----------

/** The mastery properties (PHB 2024, chapter 6), in short. */
export const MASTERY_PROPERTIES = {
  cleave: { name: 'Cleave', text: 'Hit a creature with a melee attack: once a turn, attack a second creature within 5 feet of it and within your reach; on a hit it takes the weapon\'s damage without your ability modifier (unless that\'s negative).' },
  graze: { name: 'Graze', text: 'Miss a creature: it still takes damage equal to the ability modifier you attacked with, of the weapon\'s type.' },
  nick: { name: 'Nick', text: 'The Light property\'s extra attack can be part of the Attack action instead of a Bonus Action (once a turn).' },
  push: { name: 'Push', text: 'Hit a creature: push it up to 10 feet straight away from you, if it\'s Large or smaller.' },
  sap: { name: 'Sap', text: 'Hit a creature: it has Disadvantage on its next attack roll before the start of your next turn.' },
  slow: { name: 'Slow', text: 'Hit a creature and deal damage: its Speed drops by 10 feet until the start of your next turn (never more than 10 feet).' },
  topple: { name: 'Topple', text: 'Hit a creature: it makes a Constitution saving throw or falls Prone.' },
  vex: { name: 'Vex', text: 'Hit a creature and deal damage: you have Advantage on your next attack roll against it before the end of your next turn.' },
};

/** Each weapon's mastery property (PHB 2024 weapons table), by the weapon's name in lower case. */
export const WEAPON_MASTERY = {
  club: 'slow', dagger: 'nick', greatclub: 'push', handaxe: 'vex', javelin: 'slow', 'light hammer': 'nick', mace: 'sap', quarterstaff: 'topple', sickle: 'nick', spear: 'sap',
  dart: 'vex', 'light crossbow': 'slow', shortbow: 'vex', sling: 'slow',
  battleaxe: 'topple', flail: 'sap', glaive: 'graze', greataxe: 'cleave', greatsword: 'graze', halberd: 'cleave', lance: 'topple', longsword: 'sap', maul: 'topple',
  morningstar: 'sap', pike: 'push', rapier: 'vex', scimitar: 'nick', shortsword: 'vex', trident: 'topple', warhammer: 'push', 'war pick': 'sap', whip: 'slow',
  blowgun: 'vex', 'hand crossbow': 'vex', 'heavy crossbow': 'push', longbow: 'slow', musket: 'slow', pistol: 'vex',
};

/** How many kinds of weapon each class has mastery with, by class level (PHB 2024 class tables). */
const MASTERY_COUNT = {
  barbarian: [[1, 2], [4, 3], [10, 4]],
  fighter: [[1, 3], [4, 4], [10, 5], [16, 6]],
  paladin: [[1, 2]],
  ranger: [[1, 2]],
  rogue: [[1, 2]],
};
export const MASTERY_CLASSES = Object.keys(MASTERY_COUNT);
export const MAX_MASTERIES = 8;

/** How many weapons this character can have mastery with: 0 under the 2014 rules or without a class that has it. */
export function masteryLimit(sheet, edition = '2014') {
  if (edition !== '2024') return 0;
  const { levels } = classLevels(sheet);
  return Math.max(0, ...MASTERY_CLASSES.filter((k) => levels[k]).map((k) => step(MASTERY_COUNT[k], levels[k])));
}

/** The weapon's key for mastery ("+1 Longsword" → "longsword"), or null for one without a mastery. */
export function masteryKey(name) {
  const base = magicName(name).base;
  if (WEAPON_MASTERY[base]) return base;
  const found = attackWeapon(name);
  if (found && WEAPON_MASTERY[found.toLowerCase()]) return found.toLowerCase();
  return /\bmusket\b/i.test(name) ? 'musket' : /\bpistol\b/i.test(name) ? 'pistol' : null;
}

/** A weapon's name as the tables print it ("light crossbow" → "Light crossbow"). */
export const weaponName = (key) => WEAPONS[key]?.name ?? key.charAt(0).toUpperCase() + key.slice(1);

/**
 * The weapons this character's classes can pick for mastery: Fighters,
 * Paladins and Rangers any simple or martial weapon; Barbarians simple and
 * martial melee weapons; Rogues those with Finesse or Light (simple, or
 * martial ones they're proficient with). [{ key, name, property }]
 */
export function masteryChoices(sheet, edition = '2024') {
  const { levels } = classLevels(sheet);
  if (!masteryLimit(sheet, edition)) return [];
  const ok = (key) => {
    const w = WEAPONS[key];
    const props = w?.properties ?? (key === 'pistol' || key === 'musket' ? ['ammunition'] : []);
    const ranged = props.includes('ammunition') || w?.ability === 'dex';
    if (levels.fighter || levels.paladin || levels.ranger) return true;
    if (levels.barbarian && !ranged) return true;
    if (levels.rogue && (props.includes('finesse') || props.includes('light'))) return true;
    return false;
  };
  return Object.keys(WEAPON_MASTERY).filter(ok).map((key) => ({ key, name: weaponName(key), property: WEAPON_MASTERY[key] }));
}

// ---------- the player's choices ----------

/**
 * Choices the sheet can't guess: fighting styles, the warlock invocations
 * that change damage, the 2024 cleric's Blessed Strikes and druid's Elemental
 * Fury, the Hunter's prey. group: style | invocation | blessed | fury | prey.
 * when(k): whether this character can have it (k: context()).
 */
export const CHOICES = [
  // Fighting styles (fighter 1, paladin 2, ranger 2; 2024: fighting style feats).
  { id: 'archery', group: 'style', name: 'Archery', text: '+2 to attack rolls with ranged weapons.' },
  { id: 'defense', group: 'style', name: 'Defense', text: '+1 AC while wearing armour.' },
  { id: 'dueling', group: 'style', name: 'Dueling', text: '+2 damage with a melee weapon in one hand and no other weapon.' },
  { id: 'great_weapon', group: 'style', name: 'Great Weapon Fighting', text: 'Two-handed (or versatile with both hands) melee weapons: 2014, reroll damage dice of 1 or 2 once; 2024, a 1 or 2 on a damage die counts as 3.' },
  { id: 'two_weapon', group: 'style', name: 'Two-Weapon Fighting', text: 'Add your ability modifier to the damage of the extra attack with your other light weapon.' },
  { id: 'protection', group: 'style', name: 'Protection', text: 'A reaction with a shield: impose Disadvantage on an attack against a creature within 5 feet of you.' },
  { id: 'thrown_weapon', group: 'style', name: 'Thrown Weapon Fighting', text: 'Draw a thrown weapon as part of the attack; +2 damage when you throw it.' },
  { id: 'unarmed_fighting', group: 'style', name: 'Unarmed Fighting', text: 'Unarmed strikes deal 1d6 + Strength (1d8 with no weapons or shield); 1d4 to a creature you grapple at the start of your turn.' },
  { id: 'blind_fighting', group: 'style', name: 'Blind Fighting', text: 'Blindsight 10 feet.' },
  { id: 'interception', group: 'style', name: 'Interception', text: 'A reaction: reduce damage to a creature within 5 feet by 1d10 + your Proficiency Bonus.' },
  // Warlock invocations that change damage (the rest are typed in Features & traits).
  { id: 'agonizing_blast', group: 'invocation', name: 'Agonizing Blast', text: 'Add your Charisma modifier to Eldritch Blast\'s damage (each beam).' },
  { id: 'eldritch_smite', group: 'invocation', name: 'Eldritch Smite', text: 'Hit with your pact weapon: spend a Pact Magic slot for 1d8 force damage, plus 1d8 per slot level, and knock a Huge or smaller creature Prone.' },
  { id: 'lifedrinker', group: 'invocation', name: 'Lifedrinker', text: 'Your pact weapon deals more damage: 2014, your Charisma modifier in necrotic damage; 2024, 1d6 necrotic, psychic or radiant once a turn.' },
  // 2024 cleric, 7th level: Blessed Strikes; 2024 druid, 7th level: Elemental Fury.
  { id: 'blessed_divine_strike', group: 'blessed', name: 'Divine Strike', text: 'Once a turn, a weapon hit deals 1d8 necrotic or radiant damage more (2d8 from 14th level).' },
  { id: 'blessed_potent', group: 'blessed', name: 'Potent Spellcasting', text: 'Add your Wisdom modifier to the damage of your cleric cantrips.' },
  { id: 'primal_strike', group: 'fury', name: 'Primal Strike', text: 'Once a turn, a weapon or unarmed hit (or a Wild Shape form\'s attack) deals 1d8 cold, fire, lightning or thunder damage more (2d8 from 15th level).' },
  { id: 'fury_potent', group: 'fury', name: 'Potent Spellcasting', text: 'Add your Wisdom modifier to the damage of your druid cantrips.' },
  // Hunter ranger, 3rd level.
  { id: 'colossus_slayer', group: 'prey', name: 'Colossus Slayer', text: 'Once a turn, a weapon hit on a creature below its hit point maximum deals 1d8 more.' },
  { id: 'horde_breaker', group: 'prey', name: 'Horde Breaker', text: 'Once a turn, one more attack with the same weapon against another creature within 5 feet of the first.' },
];
export const CHOICE_BY_ID = Object.fromEntries(CHOICES.map((c) => [c.id, c]));
export const CHOICE_GROUPS = {
  style: 'Fighting style',
  invocation: 'Eldritch invocations (damage)',
  blessed: 'Blessed Strikes',
  fury: 'Elemental Fury',
  prey: "Hunter's Prey",
};

/** Things going on right now that change attacks or the sheet: raging, Bladesong (AC and speed), a creature marked with Hunter's Mark, one hexed. */
export const ACTIVE = {
  rage: 'Raging',
  bladesong: 'Bladesong',
  hunters_mark: "Hunter's Mark",
  hex: 'Hex',
};

/** sheet.combat cleaned up: { masteries: [weapon keys], choices: [ids], on: { rage: true } }. */
export function normalizeCombat(c = {}) {
  const list = (v, ok, max) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? '').toLowerCase().trim()).filter(ok))].slice(0, max);
  const on = {};
  for (const [k, v] of Object.entries(c?.on ?? {})) if (k in ACTIVE && v === true) on[k] = true;
  return {
    masteries: list(c?.masteries, (k) => k in WEAPON_MASTERY, MAX_MASTERIES),
    choices: list(c?.choices, (k) => k in CHOICE_BY_ID, 20),
    on,
  };
}

/**
 * Which choice groups this character has, with how many of each the rules
 * give (a guide: nothing stops more), for the sheet to offer:
 * [{ group, name, count, options: [choice] }].
 */
export function choiceGroups(sheet, edition = '2014') {
  const k = context(sheet, null, edition);
  const L = k.levels;
  const out = [];
  const styles = (L.fighter ? 1 : 0) + (L.paladin >= 2 ? 1 : 0) + (L.ranger >= 2 ? 1 : 0)
    + (k.sub.fighter === 'champion' && L.fighter >= (k.ed === '2024' ? 7 : 10) ? 1 : 0) + (k.sub.bard === 'swords' && L.bard >= 3 ? 1 : 0);
  if (styles) out.push({ group: 'style', count: styles });
  if (L.warlock >= 2) out.push({ group: 'invocation', count: null });
  if (k.ed === '2024' && L.cleric >= 7) out.push({ group: 'blessed', count: 1 });
  if (k.ed === '2024' && L.druid >= 7) out.push({ group: 'fury', count: 1 });
  if (k.sub.ranger === 'hunter' && L.ranger >= 3) out.push({ group: 'prey', count: 1 });
  return out.map((g) => ({ ...g, name: CHOICE_GROUPS[g.group], options: CHOICES.filter((c) => c.group === g.group) }));
}

// ---------- working out an attack ----------

/** What a character's features need: levels, subclasses, choices and what's on. */
function context(sheet, calc, edition) {
  const { levels, subclasses } = classLevels(sheet);
  const sub = {};
  for (const [cls, typed] of Object.entries(subclasses)) sub[cls] = subclassOf(cls, typed)?.key ?? null;
  const combat = normalizeCombat(sheet?.combat);
  const values = calc?.values ?? {};
  const feats = new Set(featsOf(sheet, { edition }).map((f) => f.id));
  return {
    ed: edition === '2024' ? '2024' : '2014',
    feat: (id) => feats.has(id),
    levels: new Proxy(levels, { get: (t, p) => t[p] ?? 0 }),
    sub,
    combat,
    has: (id) => combat.choices.includes(id),
    on: (id) => !!combat.on[id],
    values,
    pb: values.proficiency_bonus ?? 2,
    mod: (a) => values[`mod.${a}`] ?? 0,
    races: racesOf(sheet?.race),
    armor: armorClass(sheet?.inventory, 0),
    sheet,
  };
}

const MONK_DIE = (k) => (k.ed === '2024' ? step([[1, 6], [5, 8], [11, 10], [17, 12]], k.levels.monk) : step([[1, 4], [5, 6], [11, 8], [17, 10]], k.levels.monk));
const RAGE_DAMAGE = (level) => step([[1, 2], [9, 3], [16, 4]], level);

/** The PHB's ranged weapons (darts and nets are thrown ranged weapons, not melee ones). */
const RANGED = new Set(['light crossbow', 'dart', 'shortbow', 'sling', 'blowgun', 'hand crossbow', 'heavy crossbow', 'longbow', 'net', 'musket', 'pistol']);

/** What kind of attack this is, from the attack and the weapon it uses (a gear line's, or a PHB weapon named in a typed attack). */
function attackInfo(a, weapon, two) {
  const name = String(a.name ?? '');
  const unarmed = /\bunarmed\b/i.test(name) && !weapon;
  const w = weapon ?? (unarmed ? null : WEAPONS[attackWeapon(name)?.toLowerCase()] ?? null);
  const props = w?.properties ?? [];
  const spell = a.ability === 'spell';
  const key = w ? masteryKey(weapon?.name ?? name) ?? masteryKey(w.name ?? '') : null;
  const ranged = !!w && (RANGED.has(key) || props.includes('ammunition') || (w.ability === 'dex' && !props.includes('finesse')));
  return {
    name,
    key,
    weapon: w,
    unarmed,
    spell,
    weaponAttack: (!!w || unarmed) && !spell,
    ranged: ranged && !spell,
    melee: (unarmed || (!!w && !ranged)) && !spell,
    finesse: props.includes('finesse'),
    light: props.includes('light'),
    heavy: props.includes('heavy'),
    thrown: props.includes('thrown'),
    twoHanded: props.includes('two-handed') || (two && props.includes('versatile')),
    versatile: props.includes('versatile'),
    two,
  };
}

/** Whether a gear weapon (or a weapon by name) is a monk weapon: 2014 shortswords and simple melee weapons without Two-Handed or Heavy; 2024 simple melee and martial melee with Light. */
function monkWeapon(info, k) {
  const w = info.weapon;
  if (!w || info.ranged) return false;
  const props = w.properties ?? [];
  if (k.ed === '2024') return w.category === 'simple' || props.includes('light');
  return info.key === 'shortsword' || (w.category === 'simple' && !props.includes('two-handed') && !props.includes('heavy'));
}

/** Every dice term in some notation with a rule (min 3, reroll 2...): "2d6+3" → "2d6min3+3". */
function withDiceRule(notation, rule) {
  if (!notation || !rule) return notation;
  try {
    const { terms } = parseRoll(notation);
    return formatTerms(terms.map((t) => (t.value !== undefined ? t : { ...t, ...rule })));
  } catch {
    return notation;
  }
}

/** Double every die (a critical hit), plus more dice: "1d8+3" → "2d8+3". */
function doubled(notation, more = null) {
  if (!notation) return null;
  try {
    const { terms } = parseRoll(notation);
    const out = formatTerms(terms.map((t) => (t.value !== undefined ? t : { ...t, count: t.count * 2 })));
    return more ? addToRoll(out, 0, more) : out;
  } catch {
    return null;
  }
}

/** The first die of a weapon's damage, for Brutal Critical and Savage Attacks: "2d6 slashing" → "1d6". */
const weaponDie = (damage) => {
  const m = /\d*d(\d+)/i.exec(String(damage ?? ''));
  return m ? `1d${m[1]}` : null;
};
const times = (n, die) => (die && n > 0 ? `${n}${die.replace(/^1/, '')}` : null);

/** The spell slots this character has left, lowest first: [1, 2, 3]. */
function slotsLeft(sheet, values) {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => (values[`slots.${n}`] ?? 0) > (sheet?.spellcasting?.slots_used?.[n] ?? 0));
}

const knowsSpell = (sheet, re) => (sheet?.spells ?? []).some((s) => re.test(s.name));
const left = (sheet, id, edition, values) => featureRow(sheet, id, { edition, values })?.left ?? 0;

/**
 * The extras a weapon attack can have, for this character now: [{ id, name,
 * detail (what it adds, for the button), dice, flat, type, once (once a
 * turn), auto (always in: shown, not picked), on (picked by default),
 * spend, options (Divine Smite's slots), note }].
 */
function weaponExtras(k, info, base, res) {
  const { levels: L, sub, ed, sheet, values } = k;
  const out = [];
  const add = (x) => out.push({ dice: null, flat: 0, type: '', once: false, auto: false, on: false, spend: null, options: null, note: '', ...x });
  const ability = res.ability;
  const str = ability === 'str';
  if (!info.weaponAttack) return out;

  // Barbarian: Rage, and what raging adds.
  if (L.barbarian && k.on('rage') && str && (ed === '2024' || info.melee)) {
    add({ id: 'rage', name: 'Rage', auto: true, flat: RAGE_DAMAGE(L.barbarian), detail: plus(RAGE_DAMAGE(L.barbarian)) });
  }
  if (sub.barbarian === 'zealot' && L.barbarian >= 3 && k.on('rage')) {
    add({ id: 'divine_fury', name: 'Divine Fury', dice: '1d6', flat: Math.floor(L.barbarian / 2), type: 'radiant or necrotic', once: true, on: true, detail: `1d6${plus(Math.floor(L.barbarian / 2))}`, note: 'The first creature you hit on each of your turns while raging.' });
  }
  if (ed === '2024' && sub.barbarian === 'berserker' && L.barbarian >= 3 && k.on('rage') && str) {
    add({ id: 'frenzy', name: 'Frenzy', dice: `${RAGE_DAMAGE(L.barbarian)}d6`, once: true, detail: `${RAGE_DAMAGE(L.barbarian)}d6`, note: 'With Reckless Attack while raging: the first creature you hit on your turn.' });
  }
  if (ed === '2024' && L.barbarian >= 9 && str) {
    const d = L.barbarian >= 17 ? '2d10' : '1d10';
    add({ id: 'brutal_strike', name: 'Brutal Strike', dice: d, once: true, detail: d, note: `Instead of Reckless Attack's advantage on this attack: on a hit, ${d} more and ${L.barbarian >= 13 ? 'one or two effects (Forceful Blow, Hamstring Blow, Staggering Blow, Sundering Blow)' : 'Forceful Blow (push 15 feet) or Hamstring Blow (−15 feet of speed)'}.` });
  }

  // Rogue: Sneak Attack (finesse or ranged weapon, not unarmed).
  if (L.rogue && !info.unarmed && (info.finesse || info.ranged)) {
    const d = `${Math.ceil(L.rogue / 2)}d6`;
    add({ id: 'sneak_attack', name: 'Sneak Attack', dice: d, once: true, detail: d, note: `Once a turn, with Advantage on the attack or an ally within 5 feet of the target (and you without Disadvantage).${ed === '2024' && L.rogue >= 5 ? ' Cunning Strike: give up dice for an effect (Poison 1d6, Trip 1d6, Withdraw 1d6).' : ''}` });
  }

  // Paladin: Divine Smite (a slot, or the 2024 free one), Improved Divine Smite / Radiant Strikes.
  if (L.paladin >= 2 && (info.melee && (!info.unarmed || ed === '2024'))) {
    const slots = slotsLeft(sheet, values);
    const free = ed === '2024' && left(sheet, 'paladins_smite', ed, values) > 0;
    const dice = (slot) => `${ed === '2014' ? Math.min(5, 1 + slot) : 1 + slot}d8`;
    const options = [...(free ? [{ value: 'free', label: "Paladin's Smite (free, 1st level)", dice: '2d8' }] : []), ...slots.map((n) => ({ value: n, label: `${ordinal(n)}-level slot`, dice: dice(n) }))];
    if (options.length) {
      add({ id: 'divine_smite', name: 'Divine Smite', type: 'radiant', once: ed === '2024', options, detail: options[0].dice, note: `On a hit, spend a spell slot: 2d8 radiant, +1d8 for each slot level above 1st${ed === '2014' ? ' (5d8 at most)' : ''}, +1d8 against a fiend or undead.${ed === '2024' ? ' It\'s a Bonus Action spell, so once a turn.' : ''}` });
      add({ id: 'smite_fiend', name: 'vs fiend or undead', dice: '1d8', type: 'radiant', detail: '1d8', needs: 'divine_smite' });
    }
  }
  if (L.paladin >= 11 && info.melee && (!info.unarmed || ed === '2024')) {
    add({ id: 'radiant_strikes', name: ed === '2024' ? 'Radiant Strikes' : 'Improved Divine Smite', auto: true, dice: '1d8', type: 'radiant', detail: '1d8 radiant' });
  }

  // Spells and states: Hunter's Mark, Hex (any attack; Hunter's Mark: weapon attacks under the 2014 rules).
  if (k.on('hunters_mark') || L.ranger || knowsSpell(sheet, /hunter'?s mark/i)) {
    const d = ed === '2024' && L.ranger >= 20 ? '1d10' : '1d6';
    add({ id: 'hunters_mark', name: "Hunter's Mark", dice: d, type: ed === '2024' ? 'force' : '', on: k.on('hunters_mark'), detail: d, note: 'Against the creature you marked.' });
  }
  if (k.on('hex') || L.warlock || knowsSpell(sheet, /^hex$/i)) {
    add({ id: 'hex', name: 'Hex', dice: '1d6', type: 'necrotic', on: k.on('hex'), detail: '1d6 necrotic', note: 'Against the creature you hexed.' });
  }

  // Ranger subclasses.
  if (sub.ranger === 'hunter' && L.ranger >= 3 && !k.has('horde_breaker')) {
    add({ id: 'colossus_slayer', name: 'Colossus Slayer', dice: '1d8', once: true, detail: '1d8', note: 'Once a turn, against a creature below its hit point maximum.' });
  }
  if (ed === '2024' && sub.ranger === 'gloom_stalker' && L.ranger >= 3 && left(sheet, 'dread_ambusher', ed, values) > 0) {
    const d = L.ranger >= 11 ? '2d8' : '2d6';
    add({ id: 'dreadful_strike', name: 'Dreadful Strike', dice: d, type: 'psychic', once: true, spend: { feature: 'dread_ambusher' }, detail: `${d} psychic`, note: 'Once a turn; spends a use.' });
  }
  if (ed === '2014' && sub.ranger === 'gloom_stalker' && L.ranger >= 3) {
    add({ id: 'dread_ambusher', name: 'Dread Ambusher', dice: '1d8', detail: '1d8', note: 'The extra attack on your first turn of a fight.' });
  }
  if (sub.ranger === 'monster_slayer' && L.ranger >= 3) {
    add({ id: 'slayers_prey', name: "Slayer's Prey", dice: '1d6', once: true, detail: '1d6', note: 'Your first hit each turn on the creature you marked.' });
  }
  if (sub.ranger === 'horizon_walker' && L.ranger >= 3) {
    const d = L.ranger >= 11 ? '2d8' : '1d8';
    add({ id: 'planar_warrior', name: 'Planar Warrior', dice: d, type: 'force', once: true, detail: `${d} force`, note: 'A bonus action first; the whole hit becomes force damage.' });
  }
  if (sub.ranger === 'fey_wanderer' && L.ranger >= 3) {
    const d = L.ranger >= 11 ? '1d6' : '1d4';
    add({ id: 'dreadful_strikes', name: 'Dreadful Strikes', dice: d, type: 'psychic', once: true, on: true, detail: `${d} psychic`, note: 'Once a turn (once per creature each turn).' });
  }

  // Fighter subclasses: Battle Master's superiority dice, Psi Warrior's Psionic Strike.
  if (sub.fighter === 'battle_master' && L.fighter >= 3 && left(sheet, 'superiority_dice', ed, values) > 0) {
    const d = `1d${step([[3, 8], [10, 10], [18, 12]], L.fighter)}`;
    add({ id: 'superiority', name: 'Superiority die', dice: d, spend: { feature: 'superiority_dice' }, detail: d, note: 'A damage manoeuvre (Trip, Pushing, Menacing, Disarming, Precision is to hit...): spends a superiority die.' });
  }
  const psiRow = ed === '2024' ? 'psionic_energy' : 'psionic_energy_2014';
  if (sub.fighter === 'psi_warrior' && L.fighter >= 3 && left(sheet, psiRow, ed, values) > 0) {
    const d = `1d${step([[3, 6], [5, 8], [11, 10], [17, 12]], L.fighter)}`;
    add({ id: 'psionic_strike', name: 'Psionic Strike', dice: d, flat: k.mod('int'), type: 'force', once: true, spend: { feature: psiRow }, detail: `${d}${plus(k.mod('int'))} force`, note: 'Once a turn, a target within 30 feet; spends a Psionic Energy die.' });
  }
  // Rune Knight: Giant's Might (while it's on, once a turn).
  if (sub.fighter === 'rune_knight' && L.fighter >= 3) {
    const d = `1d${step([[3, 6], [10, 8], [18, 10]], L.fighter)}`;
    add({ id: 'giants_might', name: "Giant's Might", dice: d, once: true, detail: d, note: 'While Giant\'s Might is on, once a turn.' });
  }

  // Cleric: Divine Strike (2014 domains at 8th; 2024 Blessed Strikes at 7th). Druid 2024: Primal Strike.
  const strikeType = { life: 'radiant', nature: 'cold, fire or lightning', tempest: 'thunder', trickery: 'poison', war: 'the weapon\'s type', forge: 'fire', order: 'psychic', twilight: 'radiant', death: 'necrotic' }[sub.cleric];
  if ((ed === '2014' && strikeType && L.cleric >= 8) || (ed === '2024' && k.has('blessed_divine_strike') && L.cleric >= 7)) {
    const d = L.cleric >= 14 ? '2d8' : '1d8';
    add({ id: 'divine_strike', name: 'Divine Strike', dice: d, type: ed === '2024' ? 'necrotic or radiant' : strikeType, once: true, detail: d, note: 'Once a turn.' });
  }
  if (ed === '2024' && k.has('primal_strike') && L.druid >= 7) {
    const d = L.druid >= 15 ? '2d8' : '1d8';
    add({ id: 'primal_strike', name: 'Primal Strike', dice: d, type: 'cold, fire, lightning or thunder', once: true, detail: d, note: 'Once a turn.' });
  }

  // Warlock: Eldritch Smite and Lifedrinker (pact weapon), the Hexblade's Curse.
  if (k.has('eldritch_smite') && L.warlock >= 5 && (values.pact_slots ?? 0) > (sheet?.spellcasting?.pact_used ?? 0)) {
    const d = `${1 + (values.pact_level ?? 1)}d8`;
    add({ id: 'eldritch_smite', name: 'Eldritch Smite', dice: d, type: 'force', once: true, spend: { pact: 1 }, detail: `${d} force`, note: 'With your pact weapon, once a turn: spends a Pact Magic slot; a Huge or smaller target falls Prone.' });
  }
  if (k.has('lifedrinker') && L.warlock >= (ed === '2024' ? 9 : 12)) {
    if (ed === '2024') add({ id: 'lifedrinker', name: 'Lifedrinker', dice: '1d6', type: 'necrotic, psychic or radiant', once: true, on: true, detail: '1d6', note: 'With your pact weapon, once a turn.' });
    else add({ id: 'lifedrinker', name: 'Lifedrinker', flat: Math.max(1, k.mod('cha')), type: 'necrotic', on: true, detail: `+${Math.max(1, k.mod('cha'))} necrotic`, note: 'With your pact weapon.' });
  }
  if (sub.warlock === 'hexblade') {
    add({ id: 'hexblades_curse', name: "Hexblade's Curse", flat: k.pb, detail: `+${k.pb}`, note: 'Against your cursed target: also a critical hit on 19–20.' });
  }

  // Fighting styles that are numbers: Dueling (always), Thrown Weapon Fighting (when you throw it).
  if (k.has('dueling') && info.melee && !info.unarmed && !info.twoHanded) {
    add({ id: 'dueling', name: 'Dueling', auto: true, flat: 2, detail: '+2', note: 'With no weapon in your other hand.' });
  }
  if (k.has('thrown_weapon') && info.thrown) {
    add({ id: 'thrown_weapon', name: 'Thrown', flat: 2, detail: '+2', note: 'When you throw it.' });
  }

  // Feats (feats.js): Great Weapon Master and Sharpshooter's −5/+10 (2014), 2024 Great Weapon Master's + proficiency bonus.
  const proficient = base?.proficient !== false;
  if (k.feat('feat_great_weapon_master') && info.heavy && !info.ranged && proficient && ed === '2014') {
    add({ id: 'great_weapon_master', name: 'Great Weapon Master', hit: -5, flat: 10, detail: '−5 to hit, +10', note: 'Before you roll: −5 to hit for +10 damage.' });
  }
  if (k.feat('feat_great_weapon_master') && info.heavy && ed === '2024') {
    add({ id: 'great_weapon_master', name: 'Great Weapon Master', flat: k.pb, on: true, detail: plus(k.pb), note: 'With the Attack action on your turn.' });
  }
  if (k.feat('feat_sharpshooter') && info.ranged && proficient && ed === '2014') {
    add({ id: 'sharpshooter', name: 'Sharpshooter', hit: -5, flat: 10, detail: '−5 to hit, +10', note: 'Before you roll: −5 to hit for +10 damage.' });
  }
  return out;
}

/**
 * The d20 for this character's attack: halfling Luck rerolls a 1 ('ro1'),
 * Elven Accuracy rolls three with advantage on Dexterity, Intelligence,
 * Wisdom or Charisma attacks ('ea'). "1d20ro1ea+7".
 */
function hitNotation(sheet, k, bonus, ability) {
  const rule = `${d20Rule(sheet)}${k.feat('feat_elven_accuracy') && ['dex', 'int', 'wis', 'cha'].includes(ability) ? 'ea' : ''}`;
  return `1d20${rule}${bonus ? `${bonus > 0 ? '+' : ''}${bonus}` : ''}`;
}

/**
 * An attack worked out with this character's features, ready to roll.
 *
 * @param {object} sheet
 * @param {object} calc computeSheet(sheet)
 * @param {object} a the attack: a typed attack (normalizeAttack) or one made
 *   from an inventory line (as rolls.js gearRolls makes it)
 * @param {object} opts
 * @param {string} opts.edition the campaign's rules
 * @param {object} [opts.weapon] the inventory line's weapon ({ name, damage, ability, category, properties }) when it's from the inventory
 * @param {boolean} [opts.two] a versatile weapon used with both hands
 * @param {object} [opts.picks] extras picked for this attack: { sneak_attack: true, divine_smite: 2 (a slot level, or 'free') ... }
 * @param {boolean} [opts.riders] leave every extra out of the rolls (the map adds them as riders, attack-riders.js)
 * @param {boolean} [opts.offhand] the off-hand attack of two-weapon fighting: no ability modifier on the damage
 *   unless it's negative or with the Two-Weapon Fighting style
 * @returns {{ kind, hit, bonus, autoBonus, dc, save, damage, flat, crit, crit_on, type, parts, extras, mastery, notes, spends, ability }}
 *   damage: notation to roll on a hit (null: flat is the damage, a number);
 *   crit: notation on a critical hit, which is a natural crit_on or higher;
 *   extras: what can be added (see weaponExtras), with `on` for what's in;
 *   mastery: the weapon's mastery property when the character has it, with its numbers;
 *   notes: lines to show with the result; spends: what rolling the damage uses up.
 */
export function planAttack(sheet, calc, a, { edition = '2014', weapon = null, two = false, picks = {}, riders = false, offhand = false } = {}) {
  const k = context(sheet, calc, edition);
  const info = attackInfo(a, weapon, two);
  const att = { ...a };
  if (two && info.versatile) att.damage = biggerDie(att.damage);

  // Martial Arts: a monk's unarmed strikes and monk weapons use the better of Str and Dex and at least the martial arts die.
  const notes = [];
  if (k.levels.monk && !k.armor && (info.unarmed || monkWeapon(info, k)) && att.kind !== 'save') {
    if (['str', 'dex', 'finesse'].includes(att.ability)) att.ability = 'finesse';
    const { dice, type } = splitDamage(att.damage);
    const die = MONK_DIE(k);
    const now = /^1d(\d+)$/.exec(dice ?? '')?.[1];
    if (!dice || /^\d+$/.test(dice) || (now && Number(now) < die)) att.damage = `1d${die} ${type || 'bludgeoning'}`;
  }
  // Dazzling Footwork (2024 College of Dance): unarmed strikes with Dexterity and the Bardic Inspiration die, with no armour or shield.
  if (info.unarmed && k.ed === '2024' && k.sub.bard === 'dance' && k.levels.bard >= 3 && !k.armor && att.kind !== 'save') {
    if (['str', 'dex', 'finesse'].includes(att.ability)) att.ability = 'finesse';
    const die = step([[1, 6], [5, 8], [10, 10], [15, 12]], k.levels.bard);
    const now = /^1d(\d+)$/.exec(splitDamage(att.damage).dice ?? '')?.[1];
    if (!now || Number(now) < die) att.damage = `1d${die} ${splitDamage(att.damage).type || 'bludgeoning'}`;
  }
  // Unarmed Fighting: 1d6, or 1d8 with no weapons or shield.
  if (info.unarmed && k.has('unarmed_fighting') && att.kind !== 'save') {
    const bare = !(sheet.inventory ?? []).some((g) => g.equipped && (g.weapon || g.armor?.type === 'shield'));
    const die = bare ? 8 : 6;
    const now = /^1d(\d+)$/.exec(splitDamage(att.damage).dice ?? '')?.[1];
    if (!now || Number(now) < die) att.damage = `1d${die} ${splitDamage(att.damage).type || 'bludgeoning'}`;
  }

  const r = attackRolls(att, calc);
  // The off-hand attack: no positive modifier on its damage, unless with the Two-Weapon Fighting style.
  const offMod = offhand && !k.has('two_weapon') ? Math.max(0, abilityModifier(att.ability, calc.values)) : 0;
  if (offMod && r.damage) r.damage = addToRoll(r.damage, -offMod);
  else if (offMod && r.flat != null) r.flat -= offMod;
  const ability = att.ability === 'finesse' ? ((calc.values['mod.str'] ?? 0) >= (calc.values['mod.dex'] ?? 0) ? 'str' : 'dex') : att.ability === 'spell' ? calc.values.spell_ability : att.ability;
  const mod = abilityModifier(att.ability, calc.values);
  const base = { kind: r.kind, hit: r.hit, bonus: r.bonus, autoBonus: r.autoBonus, dc: r.dc, autoDc: r.autoDc, save: r.save, type: r.type, ability };
  if (r.kind === 'save') return { ...base, damage: r.damage, flat: r.flat, crit: null, crit_on: 20, parts: [], extras: [], mastery: null, notes: [], spends: [] };

  // To hit: Archery.
  let bonus = r.bonus;
  const typedBonus = String(a.bonus ?? '').trim() !== '' && Number.isFinite(parseInt(String(a.bonus).replace(/^\s*\+/, ''), 10));
  if (k.has('archery') && info.ranged && !typedBonus) {
    bonus += 2;
    notes.push('Archery: +2 to hit is included.');
  }

  const extras = weaponExtras(k, info, att, { ability });
  for (const x of extras) {
    if (x.auto) x.on = true;
    else if (x.id in picks) x.on = !!picks[x.id];
    if (x.needs) x.on = x.on && !!extras.find((y) => y.id === x.needs)?.on;
  }
  const smite = extras.find((x) => x.id === 'divine_smite' && x.on);
  if (smite) {
    const choice = smite.options.find((o) => String(o.value) === String(picks.divine_smite)) ?? smite.options[0];
    smite.dice = choice.dice;
    smite.detail = choice.dice;
    smite.spend = choice.value === 'free' ? { feature: 'paladins_smite' } : { slot: choice.value };
    smite.picked = choice.value;
  }
  const chosen = riders ? [] : extras.filter((x) => x.on);
  // Extras that change the roll to hit (Great Weapon Master and Sharpshooter's −5).
  bonus += chosen.reduce((n, x) => n + (x.hit || 0), 0);
  if (offhand) notes.push(k.ed === '2024' && info.key && WEAPON_MASTERY[info.key] === 'nick' && normalizeCombat(sheet?.combat).masteries.includes(info.key)
    ? 'Off-hand attack: with Nick, part of the Attack action (not your bonus action).'
    : `Off-hand attack: a bonus action${offMod ? ', without your modifier on the damage' : ''}.`);

  // Damage: the weapon's, then each extra's dice and numbers.
  const flat = chosen.reduce((n, x) => n + (x.flat || 0), 0);
  const moreDice = chosen.filter((x) => x.dice).map((x) => x.dice).join('+') || null;
  const start = r.damage ?? (r.flat != null ? String(r.flat) : null);
  let damage = null;
  let flatTotal = null;
  if (start != null) {
    damage = moreDice || /d/i.test(start) ? addToRoll(start, flat, moreDice) : null;
    if (!damage) flatTotal = Number(start) + flat;
  } else if (moreDice) damage = addToRoll(moreDice, flat);

  // Great Weapon Fighting: two-handed melee damage dice.
  const gwf = k.has('great_weapon') && info.melee && !info.unarmed && info.twoHanded ? (k.ed === '2024' ? { min: 3 } : { reroll: 2 }) : null;
  damage = withDiceRule(damage, gwf);
  if (gwf) notes.push(k.ed === '2024' ? 'Great Weapon Fighting: damage dice of 1 or 2 count as 3.' : 'Great Weapon Fighting: damage dice of 1 or 2 are rolled again once.');

  // Critical hits: every die doubled, plus Brutal Critical (2014) and Savage Attacks (2014 half-orcs) on melee hits.
  const die = weaponDie(att.damage);
  const brutal = k.ed === '2014' && k.levels.barbarian >= 9 && info.melee ? step([[9, 1], [13, 2], [17, 3]], k.levels.barbarian) : 0;
  const savage = k.ed === '2014' && k.races.includes('half_orc') && info.melee ? 1 : 0;
  const critMore = times(brutal + savage, die);
  const crit = withDiceRule(doubled(damage, critMore), gwf);
  let critOn = 20;
  if (k.sub.fighter === 'champion' && k.levels.fighter >= 3 && info.weaponAttack) critOn = k.levels.fighter >= 15 ? 18 : 19;
  if (chosen.some((x) => x.id === 'hexblades_curse')) critOn = Math.min(critOn, 19);
  if (critOn < 20) notes.push(`A critical hit on a natural ${critOn}–20.`);
  if (critMore) notes.push(`On a critical hit, ${critMore} more (${[brutal && 'Brutal Critical', savage && 'Savage Attacks'].filter(Boolean).join(' and ')}).`);

  for (const x of chosen) if (x.once) notes.push(`${x.name}: once a turn.`);

  // Weapon Mastery (2024): the weapon's property when the character has mastery with it.
  const mastery = masteryOf(sheet, calc, info, { mod, ability, edition: k.ed, damage: att.damage, type: r.type });
  if (mastery) notes.unshift(mastery.line);

  const parts = [
    start != null ? `${r.damage ?? r.flat}${r.type ? ` ${r.type}` : ''}` : '',
    ...chosen.map((x) => `${x.name} ${x.detail ?? ''}${x.type && x.dice ? ` ${x.type}` : ''}`.trim()),
  ].filter(Boolean);
  const spends = chosen.filter((x) => x.spend).map((x) => ({ ...x.spend, name: x.name }));
  return {
    ...base,
    hit: hitNotation(sheet, k, bonus, ability),
    bonus,
    damage,
    flat: damage ? null : flatTotal,
    crit,
    crit_on: critOn,
    parts,
    extras,
    mastery,
    notes,
    spends,
  };
}

/**
 * The extras for one of the map's actions (shared/attacks.js sheetActions:
 * { id, source: weapon | attack | spell | form, kind, name, ability,
 * finesse, ranged, damage: [{ dice, type }] }): the same list planAttack and
 * planSpell work from, so the map and the sheet offer the same things.
 * attack-riders.js turns these into the map's riders. [] for a save, a
 * Wild Shape form or a creature's action.
 */
export function actionExtras(sheet, values, action, { edition = '2014' } = {}) {
  if (!sheet || !action || action.kind !== 'attack') return [];
  const calc = { values: values ?? {} };
  if (action.source === 'spell') {
    const id = String(action.id ?? '').replace(/^spell:/, '');
    const spell = (sheet.spells ?? []).find((sp) => sp.id === id);
    return spell ? planSpell(sheet, calc, spell, { edition }).extras : [];
  }
  if (!['weapon', 'attack'].includes(action.source)) return [];
  const k = context(sheet, calc, edition);
  const a = { name: action.name, ability: action.finesse ? 'finesse' : action.ability };
  const info = attackInfo(a, null, false);
  if (!info.weaponAttack && action.source === 'weapon') info.weaponAttack = true;
  info.ranged = info.ranged || !!action.ranged;
  info.finesse = info.finesse || !!action.finesse;
  info.melee = info.weaponAttack && !info.ranged;
  const ability = action.ability || (info.finesse ? ((k.mod('str') >= k.mod('dex')) ? 'str' : 'dex') : 'str');
  return weaponExtras(k, info, a, { ability });
}

/** The mastery an attack's weapon has for this character (2024, chosen), with its numbers: { property, name, text, line }; null if none. */
function masteryOf(sheet, calc, info, { mod, ability, edition, damage, type }) {
  if (edition !== '2024' || !info.key || !masteryLimit(sheet, edition)) return null;
  const chosen = normalizeCombat(sheet?.combat).masteries;
  if (!chosen.includes(info.key)) return null;
  const property = WEAPON_MASTERY[info.key];
  const p = MASTERY_PROPERTIES[property];
  const pb = calc.values.proficiency_bonus ?? 2;
  let line = `${p.name}: ${p.text}`;
  if (property === 'graze') line = mod > 0 ? `Graze: on a miss, the target still takes ${mod}${type ? ` ${type}` : ''} damage.` : 'Graze: your modifier isn\'t above 0, so a miss does no damage.';
  if (property === 'topple') line = `Topple: on a hit, the target makes a DC ${8 + mod + pb} Constitution save or falls Prone.`;
  if (property === 'cleave') line = `Cleave: on a hit, once a turn, attack a second creature within 5 feet of the first; it takes ${splitDamage(damage).dice ?? damage}${mod < 0 ? `${mod}` : ''}${type ? ` ${type}` : ''} on a hit (no modifier).`;
  if (property === 'vex') line = 'Vex: on a hit that deals damage, you have Advantage on your next attack roll against that creature before the end of your next turn.';
  return { property, name: p.name, text: p.text, line, ability, graze: property === 'graze' ? Math.max(0, mod) : null, dc: property === 'topple' ? 8 + mod + pb : null };
}

/**
 * The weapon for a two-weapon fighting off-hand attack, when the character
 * has two equipped melee weapons that allow one (two daggers count): both
 * Light, or with Dual Wielder any without Two-Handed (2024: a Light one first;
 * with Dual Wielder, the other just needs to be one-handed). The inventory
 * line for the off hand (the last one that fits), or null.
 */
export function offhandWeapon(sheet, edition = '2014') {
  const ed = edition === '2024' ? '2024' : '2014';
  const dual = featsOf(sheet, { edition: ed }).some((f) => f.id === 'feat_dual_wielder');
  const props = (g) => g.weapon?.properties ?? [];
  const melee = (sheet?.inventory ?? []).filter((g) => g.equipped && g.weapon && !props(g).includes('ammunition') && !props(g).includes('two-handed') && !(masteryKey(g.name) && RANGED.has(masteryKey(g.name))));
  const hands = melee.flatMap((g) => Array.from({ length: Math.min(2, Math.max(1, Number(g.equipped) || 1)) }, () => g));
  if (hands.length < 2) return null;
  const light = hands.filter((g) => props(g).includes('light'));
  if (ed === '2014') return dual ? hands.at(-1) : light.length >= 2 ? light.at(-1) : null;
  if (!light.length) return null;
  const other = hands.filter((g, i) => i !== hands.indexOf(light[0]));
  const fits = other.filter((g) => dual || props(g).includes('light'));
  return fits.at(-1) ?? null;
}

/** A weapon's mastery for showing in the Inventory: { property, name, text, chosen, can } or null without one. */
export function weaponMastery(sheet, name, edition = '2014') {
  const key = masteryKey(name);
  if (!key) return null;
  const property = WEAPON_MASTERY[key];
  const can = masteryLimit(sheet, edition) > 0;
  return { key, property, ...MASTERY_PROPERTIES[property], chosen: can && normalizeCombat(sheet?.combat).masteries.includes(key), can };
}

/**
 * A spell worked out with this character's features (Agonizing Blast,
 * Potent Spellcasting, Empowered Evocation, Elemental Affinity, Disciple of
 * Life, Hex and Hunter's Mark on spell attacks). Returns spellRolls' result
 * with damage changed, crit (a spell attack's critical hit), notes, extras.
 */
export function planSpell(sheet, calc, spell, { edition = '2014', slot = spell.level, picks = {} } = {}) {
  const k = context(sheet, calc, edition);
  const r = spellRolls(spell, calc, slot);
  const { levels: L, sub, ed } = k;
  const extras = [];
  const add = (x) => extras.push({ dice: null, flat: 0, type: '', once: false, auto: false, on: false, note: '', ...x });
  const name = String(spell.name ?? '');
  const healing = /heal/i.test(r.type);
  if (r.damage && !healing) {
    if (k.has('agonizing_blast') && L.warlock >= 2 && (/eldritch blast/i.test(name) || (ed === '2024' && spell.level === 0))) {
      add({ id: 'agonizing_blast', name: 'Agonizing Blast', auto: /eldritch blast/i.test(name), flat: k.mod('cha'), detail: plus(k.mod('cha')), note: 'Each beam.' });
    }
    const potent = spell.level === 0 && ((ed === '2014' && L.cleric >= 8 && ['knowledge', 'light', 'arcana', 'grave', 'peace'].includes(sub.cleric))
      || (ed === '2024' && ((k.has('blessed_potent') && L.cleric >= 7) || (k.has('fury_potent') && L.druid >= 7))));
    if (potent) add({ id: 'potent_spellcasting', name: 'Potent Spellcasting', auto: true, flat: k.mod('wis'), detail: plus(k.mod('wis')), note: 'Your cleric or druid cantrips.' });
    if (sub.wizard === 'evocation' && L.wizard >= 10 && /evoc/i.test(spell.school ?? '')) {
      add({ id: 'empowered_evocation', name: 'Empowered Evocation', auto: true, flat: k.mod('int'), detail: plus(k.mod('int')), note: 'One damage roll of a wizard evocation spell.' });
    }
    if (sub.sorcerer === 'draconic' && L.sorcerer >= 6 && /acid|cold|fire|lightning|poison/i.test(r.type)) {
      add({ id: 'elemental_affinity', name: 'Elemental Affinity', flat: k.mod('cha'), on: true, detail: plus(k.mod('cha')), note: 'When it\'s your draconic ancestry\'s damage type.' });
    }
    if (r.kind === 'attack') {
      if (k.on('hex') || L.warlock || knowsSpell(sheet, /^hex$/i)) add({ id: 'hex', name: 'Hex', dice: '1d6', type: 'necrotic', on: k.on('hex'), detail: '1d6 necrotic', note: 'Against the creature you hexed.' });
      if (ed === '2024' && (k.on('hunters_mark') || L.ranger || knowsSpell(sheet, /hunter'?s mark/i))) {
        const d = L.ranger >= 20 ? '1d10' : '1d6';
        add({ id: 'hunters_mark', name: "Hunter's Mark", dice: d, type: 'force', on: k.on('hunters_mark'), detail: d, note: 'Against the creature you marked.' });
      }
    }
  }
  if (r.damage && healing && sub.cleric === 'life' && spell.level >= 1) {
    add({ id: 'disciple_of_life', name: 'Disciple of Life', auto: true, flat: 2 + (Number(slot) || spell.level), detail: `+${2 + (Number(slot) || spell.level)}`, note: 'A 1st-level or higher spell that heals.' });
  }
  for (const x of extras) {
    if (x.auto) x.on = true;
    else if (x.id in picks) x.on = !!picks[x.id];
  }
  const chosen = extras.filter((x) => x.on);
  const flat = chosen.reduce((n, x) => n + (x.flat || 0), 0);
  const more = chosen.filter((x) => x.dice).map((x) => x.dice).join('+') || null;
  const damage = r.damage ? addToRoll(r.damage, flat, more) : r.damage;
  const notes = chosen.filter((x) => x.note && !x.auto).map((x) => `${x.name}: ${x.note}`);
  return { ...r, hit: r.kind === 'attack' ? hitNotation(sheet, k, r.bonus, calc.values?.spell_ability) : r.hit, damage, crit: r.kind === 'attack' ? doubled(damage) : null, crit_on: 20, extras, notes, parts: [r.damage && `${r.damage}${r.type ? ` ${r.type}` : ''}`, ...chosen.map((x) => `${x.name} ${x.detail}`)].filter(Boolean) };
}

/**
 * Spend what an attack's damage used (plan.spends): spell slots, a Pact
 * Magic slot, uses of a feature. Returns a new sheet; throws when there's
 * none left.
 */
export function spendForAttack(sheet, spends, { edition = '2014', values = {} } = {}) {
  const out = structuredClone(sheet);
  for (const s of spends ?? []) {
    if (s.slot) {
      const used = out.spellcasting.slots_used[s.slot] ?? 0;
      if (used >= (values[`slots.${s.slot}`] ?? 0)) throw new Error(`You have no ${ordinal(s.slot)}-level spell slots left.`);
      out.spellcasting.slots_used[s.slot] = used + 1;
    } else if (s.pact) {
      if ((out.spellcasting.pact_used ?? 0) >= (values.pact_slots ?? 0)) throw new Error('You have no Pact Magic slots left.');
      out.spellcasting.pact_used = (out.spellcasting.pact_used ?? 0) + 1;
    } else if (s.feature) {
      const row = featureRow(out, s.feature, { edition, values });
      if (!row || row.left < 1) throw new Error(`You have no ${row?.name ?? s.name} left.`);
      out.class_features.spent[s.feature] = row.spent + 1;
    }
  }
  return out;
}

const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
