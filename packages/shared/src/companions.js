/**
 * A character's companions (the sheet's `companions`): familiars, pets,
 * mounts, summons, sidekicks and animal companions, each with its own stat
 * block (the same shape as a Wild Shape form, wild-shape.js) and hit points.
 * They're kept on the sheet, so they follow the character from map to map;
 * "Put on the map" makes a token tied to the entry (the server keeps the two
 * hit points the same, like a character's token and their sheet).
 *
 * Some come from a spell or a class feature whose stat block scales with the
 * character (Steel Defender, the Primal Companion beasts, a drake, the 2024
 * Otherworldly Steed): `builtStatBlock` works those out. The rest are looked
 * up by name like Wild Shape forms (the SRD, the group's books, the AI).
 *
 * Plain JS like sheet.js: the server uses it and the page loads it from /shared/companions.js.
 */
import { normalizeForm } from './wild-shape.js';
import { classKey } from './sheet.js';

export const MAX_SHEET_COMPANIONS = 20;
export const COMPANION_KINDS = { familiar: 'Familiar', pet: 'Pet', mount: 'Mount', summon: 'Summon', sidekick: 'Sidekick', companion: 'Animal companion' };
export const COMPANION_FROM = ['', 'spell', 'feature', 'item'];

const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const int = (v, { min = -9999, max = 9999, fallback = null } = {}) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/^\s*\+/, ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * One companion, cleaned up: { id, name, kind, form (its stat block),
 * hp: { current, max }, temp, from: { kind, name, item_id }, until (how long
 * it lasts, in words: "until dawn", "1 hour"), expires ('' | 'dawn': gone at
 * the next dawn on the campaign's clock), notes }.
 */
export function normalizeCompanion(c = {}) {
  const form = normalizeForm({ ...(c.form ?? {}), name: c.form?.name || c.name || 'Companion' });
  const max = int(c.hp?.max, { min: 1, max: 9999, fallback: form.hp_max });
  return {
    id: str(c.id, 64) || newId(),
    name: str(c.name, 80).trim() || form.name,
    kind: Object.hasOwn(COMPANION_KINDS, c.kind) ? c.kind : 'companion',
    form,
    hp: { current: int(c.hp?.current, { min: -9999, max, fallback: max }), max },
    temp: int(c.temp, { min: 0, max: 9999, fallback: 0 }),
    from: {
      kind: COMPANION_FROM.includes(c.from?.kind) ? c.from.kind : '',
      name: str(c.from?.name, 100),
      item_id: c.from?.item_id ? str(c.from.item_id, 64) : null,
    },
    until: str(c.until, 80),
    expires: c.expires === 'dawn' ? 'dawn' : '',
    notes: str(c.notes, 2000),
  };
}

export const normalizeCompanions = (list) => (Array.isArray(list) ? list : []).slice(0, MAX_SHEET_COMPANIONS).map(normalizeCompanion);

/** A companion's hit points changed (the sheet or its token): at most its maximum. */
export function setCompanionHp(sheet, id, current) {
  const out = structuredClone(sheet);
  const c = out.companions.find((x) => x.id === id);
  if (!c) return { sheet: out, companion: null };
  c.hp.current = Math.min(c.hp.max, Math.max(-9999, Math.trunc(Number(current) || 0)));
  return { sheet: out, companion: c };
}

const signed = (n) => (n < 0 ? `-${Math.abs(n)}` : `+${n}`);
const mod = (score) => Math.floor((score - 10) / 2);

/**
 * A companion's stat block as text, for its map token (the map's Roll reads
 * attacks and ability scores from it, shared/map.js statBlockRolls).
 */
export function companionStatsText(c) {
  const f = c.form;
  const speed = Object.entries(f.speed).map(([k, n]) => (k === 'walk' ? `${n} ft.` : `${k} ${n} ft.`)).join(', ') || '0 ft.';
  const lines = [
    `**${c.name}**${c.name !== f.name ? ` (${f.name})` : ''}, ${f.size} ${f.type}`,
    `**Armor Class** ${f.ac} · **Hit Points** ${c.hp.max}${f.hp_formula ? ` (${f.hp_formula})` : ''} · **Speed** ${speed}`,
    '',
    '| STR | DEX | CON | INT | WIS | CHA |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => `${f.abilities[a]} (${signed(mod(f.abilities[a]))})`).join(' | ')} |`,
    '',
  ];
  if (f.senses) lines.push(`**Senses** ${f.senses}`, '');
  for (const t of f.traits) lines.push(`***${t.name}.*** ${t.text}`, '');
  if (f.attacks.length) lines.push('**Actions**', '');
  for (const a of f.attacks) {
    const dice = /^\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*(.*)$/i.exec(a.damage ?? '');
    const hit = a.bonus != null ? `${signed(a.bonus)} to hit. Hit: ${dice ? `(${dice[1].replace(/\s+/g, '')}) ${dice[2]}`.trim() : a.damage}.` : '';
    const save = a.dc ? `DC ${a.dc}${a.save ? ` ${a.save.toUpperCase()}` : ''} save${a.damage ? `, ${a.damage}` : ''}.` : '';
    lines.push(`***${a.name}.*** ${[hit, save, hit ? '' : a.notes].filter(Boolean).join(' ')}`.trim(), '');
  }
  return lines.join('\n').trim();
}

/** The token's `stats` for a companion (see TOKEN in routes/maps.js). */
export const companionTokenStats = (c) => ({ text: companionStatsText(c).slice(0, 8000), ac: c.form.ac, hp_formula: c.form.hp_formula.slice(0, 40), speed: Object.entries(c.form.speed).map(([k, n]) => `${k === 'walk' ? '' : `${k} `}${n} ft.`).join(', ').slice(0, 120), challenge: c.form.cr });

/** Map token size (squares across) for a stat block's size. */
export const tokenSize = (size) => ({ tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 })[size] ?? 1;

// ---------- where companions come from: spells and class features ----------

/** How many levels of a class a sheet has (and its subclasses). */
function levelsOf(sheet, key) {
  const list = (sheet?.classes ?? []).filter((c) => classKey(c.name) === key);
  return { level: list.reduce((n, c) => n + (Number(c.level) || 0), 0), subclass: list.map((c) => c.subclass ?? '').join(' ') };
}

const FAMILIARS_2014 = ['Bat', 'Cat', 'Crab', 'Frog', 'Hawk', 'Lizard', 'Octopus', 'Owl', 'Poisonous Snake', 'Quipper', 'Rat', 'Raven', 'Sea Horse', 'Spider', 'Weasel'];
const FAMILIARS_2024 = ['Bat', 'Cat', 'Frog', 'Hawk', 'Lizard', 'Octopus', 'Owl', 'Rat', 'Raven', 'Spider', 'Weasel'];
const STEEDS_2014 = ['Warhorse', 'Pony', 'Camel', 'Elk', 'Mastiff'];

/**
 * The spells and class features that give a companion, for the sheet's
 * Add a companion: { id, name, kind (familiar, mount…), from ('spell' |
 * 'feature'), creatures: names to look up (a choice), built: true when the
 * stat block is worked out here (builtStatBlock), choices: options for a
 * built one, count: how many a choice brings (Conjure Animals), until, note }.
 * Only the ones this sheet has: its spells, its classes and subclasses.
 */
export function companionSources(sheet, { edition = '2014' } = {}) {
  const e2024 = edition === '2024';
  const spells = new Set((sheet?.spells ?? []).map((s) => String(s.name).trim().toLowerCase()));
  const has = (name) => spells.has(name.toLowerCase());
  const out = [];
  const druid = levelsOf(sheet, 'druid');
  const ranger = levelsOf(sheet, 'ranger');
  const artificer = levelsOf(sheet, 'artificer');
  const paladin = levelsOf(sheet, 'paladin');
  const warlock = levelsOf(sheet, 'warlock');
  if (has('Find Familiar') || /chain/i.test(warlock.subclass) || /pact of the chain/i.test(sheet?.features ?? '')) {
    out.push({ id: 'find_familiar', name: 'Find Familiar', kind: 'familiar', from: 'spell', creatures: e2024 ? FAMILIARS_2024 : FAMILIARS_2014, until: '', note: `A celestial, fey or fiend in the form of a beast${e2024 ? ' of challenge 0' : ''}. It can't attack; it acts on its own turn.` });
  }
  if (druid.level >= 2) {
    out.push({ id: 'wild_companion', name: 'Wild Companion', kind: 'familiar', from: 'feature', creatures: e2024 ? FAMILIARS_2024 : FAMILIARS_2014, until: `${Math.floor(druid.level / 2)} hours`, note: 'Find Familiar for a Wild Shape use: the familiar is fey and lasts hours equal to half your druid level.' });
  }
  if (has('Find Steed') || (e2024 && paladin.level >= 5)) {
    if (e2024) out.push({ id: 'find_steed', name: 'Find Steed', kind: 'mount', from: 'spell', built: true, choices: { celestial: 'Celestial', fey: 'Fey', fiend: 'Fiend' }, levels: [2, 3, 4, 5, 6, 7, 8, 9], note: 'The Otherworldly Steed: its numbers grow with the slot it is cast with.' });
    else out.push({ id: 'find_steed', name: 'Find Steed', kind: 'mount', from: 'spell', creatures: STEEDS_2014, until: '', note: 'A celestial, fey or fiend in the form of the steed (Intelligence 6, understands one language of yours).' });
  }
  if (has('Find Greater Steed')) out.push({ id: 'find_greater_steed', name: 'Find Greater Steed', kind: 'mount', from: 'spell', creatures: ['Griffon', 'Pegasus', 'Peryton', 'Dire Wolf', 'Rhinoceros', 'Saber-Toothed Tiger'], until: '', note: 'Intelligence at least 6, understands one language of yours.' });
  if (has('Conjure Animals')) {
    if (e2024) out.push({ id: 'conjure_animals', name: 'Conjure Animals', kind: 'summon', from: 'spell', built: true, choices: { pack: 'A pack of spirit animals' }, levels: [3, 4, 5, 6, 7, 8, 9], until: 'Concentration, up to 10 minutes', note: 'A Large pack of nature spirits: creatures near it make a Dexterity save or take 3d10 slashing (more with a higher slot).' });
    else out.push({ id: 'conjure_animals', name: 'Conjure Animals', kind: 'summon', from: 'spell', creatures: null, count: { 2: 1, 1: 2, 0.5: 4, 0.25: 8 }, until: 'Concentration, up to 1 hour', note: 'Fey spirits as beasts: one of challenge 2, two of 1, four of 1/2 or eight of 1/4. Type the beast and how many.' });
  }
  if (ranger.level >= 3 && /beast\s*master/i.test(ranger.subclass)) {
    out.push({ id: 'primal_companion', name: 'Primal Companion', kind: 'companion', from: 'feature', built: true, choices: { land: 'Beast of the Land', sea: 'Beast of the Sea', sky: 'Beast of the Sky' }, until: '', note: e2024 ? 'Player\'s Handbook (2024).' : "Tasha's Cauldron of Everything (instead of the Ranger's Companion)." });
    if (!e2024) out.push({ id: 'rangers_companion', name: "Ranger's Companion", kind: 'companion', from: 'feature', creatures: null, until: '', note: 'A beast of challenge 1/4 or lower (PHB 2014): it adds your proficiency bonus to its AC, attacks, damage, saves and skills, and has at least four times your ranger level in hit points.' });
  }
  if (ranger.level >= 3 && /drake\s*warden/i.test(ranger.subclass)) {
    out.push({ id: 'drake_companion', name: 'Drake Companion', kind: 'companion', from: 'feature', built: true, choices: { acid: 'Acid', cold: 'Cold', fire: 'Fire', lightning: 'Lightning', poison: 'Poison' }, until: '', note: "Fizban's Treasury of Dragons: pick its draconic essence." });
  }
  if (artificer.level >= 3 && /battle\s*smith/i.test(artificer.subclass)) {
    out.push({ id: 'steel_defender', name: 'Steel Defender', kind: 'companion', from: 'feature', built: true, choices: { defender: 'Steel Defender' }, until: '', note: "Tasha's Cauldron of Everything." });
  }
  return out;
}

/**
 * The stat block of a built companion (a spell or feature whose numbers come
 * from the character): Steel Defender, a Primal Companion beast, a drake,
 * the 2024 Otherworldly Steed and Conjure Animals' pack. values: the sheet's
 * worked-out values (proficiency_bonus, spell_attack, spell_dc, mod.*);
 * choice: one of the source's choices; level: the spell slot's level.
 * @returns a form (normalizeForm) with source 'manual' and a note, or null
 */
export function builtStatBlock(sourceId, { sheet, values = {}, edition = '2014', choice = '', level = null } = {}) {
  const pb = Number(values.proficiency_bonus) || 2;
  const spellAttack = Number(values.spell_attack ?? 0) || pb;
  const spellDc = Number(values.spell_dc ?? 0) || 8 + pb;
  const wis = Number(values['mod.wis'] ?? 0);
  const intMod = Number(values['mod.int'] ?? 0);
  const e2024 = edition === '2024';
  const ranger = levelsOf(sheet, 'ranger').level || 3;
  const artificer = levelsOf(sheet, 'artificer').level || 3;
  const note = (book) => ({ source: 'manual', source_note: `${book}, worked out from your sheet (proficiency +${pb}, spell attack ${signed(spellAttack)}). Check it.` });

  if (sourceId === 'steel_defender') {
    return normalizeForm({
      name: 'Steel Defender', size: 'medium', type: 'construct', cr: '0', ac: 15, hp_max: 2 + intMod + 5 * artificer, hp_formula: `${artificer}d8`, speed: { walk: 40 },
      abilities: { str: 14, dex: 12, con: 14, int: 4, wis: 10, cha: 6 }, saves: { dex: 1 + pb, con: 2 + pb }, skills: { athletics: 2 + pb, perception: 2 * pb },
      senses: `darkvision 60 ft., passive Perception ${10 + 2 * pb}`,
      traits: [{ name: 'Vigilant', text: "The defender can't be surprised. Immune to poison damage; can't be charmed, exhausted or poisoned." },
        { name: 'In combat', text: 'It takes its turn right after yours. It takes the Dodge action unless you use a bonus action to command it.' },
        { name: 'Deflect Attack (reaction)', text: 'Imposes disadvantage on the attack roll of one creature it can see within 5 feet of it, against a creature other than the defender.' }],
      attacks: [{ name: 'Force-Empowered Rend', bonus: spellAttack, damage: `1d8+${pb} force`, notes: 'Melee, reach 5 ft., one target it can see.' },
        { name: 'Repair (3/day)', bonus: null, damage: `2d8+${pb} healing`, notes: 'Restores hit points to itself or one construct or object within 5 feet.' }],
      ...note("Tasha's Cauldron of Everything"),
    });
  }
  if (sourceId === 'primal_companion') {
    const kind = ['land', 'sea', 'sky'].includes(choice) ? choice : 'land';
    const sky = kind === 'sky';
    const bonusMod = e2024 ? wis : pb;
    const strike = e2024 ? "Beast's Strike" : kind === 'land' ? 'Maul' : kind === 'sea' ? 'Binding Strike' : 'Shred';
    const dmg = sky ? `1d4+${3 + bonusMod} slashing` : kind === 'sea' ? `1d6+${2 + bonusMod} piercing` : `1d8+${2 + bonusMod} slashing`;
    const traits = [{ name: 'Primal Bond', text: 'Add your proficiency bonus to any ability check or saving throw the beast makes.' },
      { name: 'In combat', text: 'It acts on your turn and takes the Dodge action unless you use a bonus action to command it (or give up one of your attacks for it to attack).' }];
    if (kind === 'land') traits.push({ name: e2024 ? 'Charge' : 'Charge', text: 'If it moved at least 20 feet straight at the target before hitting, the target takes an extra 1d6 damage and is knocked prone (a Strength save against your spell save DC in the 2014 rules).' });
    if (kind === 'sea') traits.push({ name: 'Amphibious', text: `It breathes air and water.${e2024 ? '' : ' Binding Strike grapples the target (escape DC = your spell save DC).'}` });
    if (sky) traits.push({ name: 'Flyby', text: "It doesn't provoke opportunity attacks when it flies out of an enemy's reach." });
    return normalizeForm({
      name: { land: 'Beast of the Land', sea: 'Beast of the Sea', sky: 'Beast of the Sky' }[kind], size: sky ? 'small' : 'medium', type: 'beast', cr: '0',
      ac: 13 + (e2024 ? wis : pb), hp_max: sky ? 4 + 4 * ranger : 5 + 5 * ranger, hp_formula: `${ranger}d${sky ? 6 : 8}`,
      speed: kind === 'land' ? { walk: 40, climb: 40 } : kind === 'sea' ? { walk: 5, swim: 60 } : { walk: 10, fly: 60 },
      abilities: sky ? { str: 6, dex: 16, con: 13, int: 8, wis: 14, cha: 11 } : { str: 14, dex: 14, con: 15, int: 8, wis: 14, cha: 11 },
      senses: `darkvision ${kind === 'sea' && e2024 ? 90 : 60} ft., passive Perception 12`,
      traits,
      attacks: [{ name: strike, bonus: spellAttack, damage: dmg, notes: 'Melee, reach 5 ft., one target.' }],
      ...note(e2024 ? "Player's Handbook (2024)" : "Tasha's Cauldron of Everything"),
    });
  }
  if (sourceId === 'drake_companion') {
    const essence = ['acid', 'cold', 'fire', 'lightning', 'poison'].includes(choice) ? choice : 'fire';
    const size = ranger >= 15 ? 'large' : ranger >= 7 ? 'medium' : 'small';
    return normalizeForm({
      name: 'Drake', size, type: 'dragon', cr: '0', ac: 14 + pb, hp_max: 5 + 5 * ranger, hp_formula: `${ranger}d10`,
      speed: ranger >= 7 ? { walk: 40, fly: 40 } : { walk: 40 },
      abilities: { str: 16, dex: 12, con: 15, int: 8, wis: 14, cha: 8 }, saves: { dex: 1 + pb, wis: 2 + pb },
      senses: 'darkvision 60 ft., passive Perception 12',
      traits: [{ name: 'Draconic Essence', text: `Immune to ${essence} damage.` },
        { name: 'Infused Strikes (reaction)', text: `When another creature within 30 feet of it that it can see hits with a weapon attack, that creature's attack deals an extra ${ranger >= 15 ? '2d6' : '1d6'} ${essence} damage.` },
        { name: 'In combat', text: 'It acts on your turn and takes the Dodge action unless you use a bonus action to command it.' }],
      attacks: [{ name: 'Bite', bonus: spellAttack, damage: `1d6+${pb} piercing${ranger >= 15 ? ` plus 1d6 ${essence}` : ''}`, notes: 'Melee, reach 5 ft., one target.' }],
      ...note("Fizban's Treasury of Dragons"),
    });
  }
  if (sourceId === 'find_steed') {
    const lvl = Math.max(2, Math.min(9, Number(level) || 2));
    const type = ['celestial', 'fey', 'fiend'].includes(choice) ? choice : 'celestial';
    const extra = { celestial: { name: 'Healing Touch (bonus action, once per long rest)', text: `One creature within 5 feet regains 2d8+${lvl} hit points.` }, fey: { name: 'Fey Step (bonus action, once per long rest)', text: 'It teleports, with its rider, up to 60 feet.' }, fiend: { name: 'Fell Glare (bonus action, once per long rest)', text: `One creature within 60 feet makes a Wisdom save against DC ${spellDc} or is frightened until the end of your next turn.` } }[type];
    return normalizeForm({
      name: 'Otherworldly Steed', size: 'large', type, cr: '0', ac: 10 + lvl, hp_max: 5 + 10 * lvl, hp_formula: `${lvl}d10`,
      speed: lvl >= 4 ? { walk: 60, fly: 60 } : { walk: 60 },
      abilities: { str: 18, dex: 12, con: 14, int: 6, wis: 12, cha: 8 }, senses: 'passive Perception 11',
      traits: [{ name: 'Life Bond', text: 'When you regain hit points from a spell of level 1 or higher, the steed regains as many if it is within 5 feet of you.' }, extra,
        { name: 'In combat', text: 'It shares your initiative; a controlled mount while you ride it.' }],
      attacks: [{ name: 'Otherworldly Slam', bonus: spellAttack, damage: `1d8+${lvl} ${{ celestial: 'radiant', fey: 'psychic', fiend: 'necrotic' }[type]}`, notes: 'Melee, reach 5 ft.' }],
      ...note("Player's Handbook (2024)"),
    });
  }
  if (sourceId === 'conjure_animals') {
    const lvl = Math.max(3, Math.min(9, Number(level) || 3));
    return normalizeForm({
      name: 'Spirit pack', size: 'large', type: 'fey', cr: '0', ac: 10, hp_max: 1, speed: { walk: 30 },
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      traits: [{ name: 'Pack', text: 'An intangible pack of spirit animals in a 10-foot cube; it can\'t be hurt. You have advantage on Strength saves within 5 feet of it.' }],
      attacks: [{ name: 'Spirit Strike', bonus: null, save: 'dex', dc: spellDc, damage: `${3 + 2 * (lvl - 3)}d10 slashing`, notes: 'When it moves within 10 feet of a creature, or a creature starts its turn there.' }],
      ...note("Player's Handbook (2024)"),
    });
  }
  return null;
}

/**
 * The Ranger's Companion (2014 Beast Master): the beast's stat block with
 * your proficiency bonus added to its AC, attacks, damage, saves and skills,
 * and hit points at least four times your ranger level.
 */
export function rangersCompanion(form, { sheet, values = {} } = {}) {
  const pb = Number(values.proficiency_bonus) || 2;
  const ranger = levelsOf(sheet, 'ranger').level || 3;
  const f = normalizeForm(form);
  const addDamage = (d) => d.replace(/^(\s*\d+d\d+)\s*(?:([+-])\s*(\d+))?/i, (_, dice, sign, n) => `${dice.trim()}+${(sign === '-' ? -Number(n) : Number(n || 0)) + pb}`);
  return normalizeForm({
    ...f,
    id: null,
    ac: f.ac + pb,
    hp_max: Math.max(f.hp_max, 4 * ranger),
    saves: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => [a, (f.saves[a] ?? mod(f.abilities[a])) + pb])),
    skills: Object.fromEntries(Object.entries(f.skills).map(([k, n]) => [k, n + pb])),
    attacks: f.attacks.map((a) => ({ ...a, bonus: a.bonus == null ? null : a.bonus + pb, damage: a.bonus == null || !a.damage ? a.damage : addDamage(a.damage) })),
    source_note: `${f.source_note}; with your proficiency bonus (+${pb}) added (Ranger's Companion).`,
  });
}
