/**
 * What a player can do with an item (an inventory line's `actions`): summon
 * a creature (Bag of Tricks, a Figurine of Wondrous Power, the Horn of
 * Valhalla…), cast a spell from it with its DC and charges (Wand of
 * Fireballs, Necklace of Fireballs), make an attack, heal, or something else
 * that spends a charge (Pipes of Haunting). The sheet shows them under Item
 * actions with a Use button; the server spends the charges, rolls and does
 * it (routes/item-actions.js).
 *
 * Where they come from (`source` on each action):
 *   - rules: the items here (`KNOWN_ITEMS`, from the DMG 2014 and 2024), by name;
 *   - text: read from the description's usual wording ("expend 1 charge to cast fireball (save DC 15)");
 *   - ai: worked out by the AI when the item was looked up (marked on the sheet: check it);
 *   - manual: changed by the player.
 *
 * Plain JS like gear.js: the server and the page use it.
 */

export const ACTION_KINDS = ['summon', 'spell', 'attack', 'heal', 'other'];
export const ACTION_SOURCES = ['rules', 'text', 'ai', 'manual'];
export const ACTION_NEEDS = ['', 'equipped', 'attuned'];
export const MAX_ACTIONS = 8;
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const int = (v, { min = 0, max = 999, fallback = null } = {}) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/^\s*\+/, ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
/** Dice or a number ("2d4+2", "3", "d8"); '' for anything else. */
const DICE_RE = /^(\d{0,2}d\d{1,3}([+-]\d{1,3})?|\d{1,3})$/i;
const dice = (v) => {
  const t = String(v ?? '').replace(/\s+/g, '').toLowerCase();
  return DICE_RE.test(t) ? (t.startsWith('d') ? `1${t}` : t) : '';
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'action';

/**
 * One action, cleaned up. Summons: `table` ([{ min, max, creature, count }],
 * rolled with `roll`, e.g. "1d8") or `creature`; `count` (dice or a number);
 * `form` (a stat block of its own when the creature isn't one to look up,
 * like the Ebony Fly's giant fly); `until`, `expires` ('dawn'), `illusion`.
 * Spells and attacks: `spell`, `level`, `dc`, `save`, `bonus` (to hit),
 * `damage` ("8d6 fire"), `extra` (dice more for each extra charge) and
 * `max_extra`. Heals: `heal`. All: `cost` (charges), `consumes` (one of the
 * item is used up), `needs` (equipped / attuned), `crumble` (on the last
 * charge a d20: on 1 it's destroyed), `text`, `source`, `rule` (a KNOWN_ITEMS
 * key: the server works it out again for the campaign's edition).
 */
export function normalizeAction(a = {}) {
  const kind = ACTION_KINDS.includes(a.kind) ? a.kind : 'other';
  const name = str(a.name, 80).trim() || 'Use';
  return {
    id: str(a.id, 48) || slug(name),
    name,
    kind,
    cost: int(a.cost, { min: 0, max: 50, fallback: 0 }),
    consumes: a.consumes === true,
    needs: ACTION_NEEDS.includes(a.needs) ? a.needs : '',
    roll: dice(a.roll),
    table: (Array.isArray(a.table) ? a.table : []).slice(0, 100).map((r) => ({
      min: int(r?.min, { min: 1, max: 100, fallback: 1 }),
      max: int(r?.max, { min: 1, max: 100, fallback: int(r?.min, { min: 1, max: 100, fallback: 1 }) }),
      creature: str(r?.creature, 80).trim(),
      count: dice(r?.count) || '1',
      size: str(r?.size, 12),
    })).filter((r) => r.creature),
    creature: str(a.creature, 80).trim(),
    count: dice(a.count) || '1',
    form: a.form && typeof a.form === 'object' ? a.form : null,
    until: str(a.until, 80),
    expires: a.expires === 'dawn' ? 'dawn' : '',
    illusion: a.illusion === true,
    spell: str(a.spell, 80).trim(),
    level: int(a.level, { min: 0, max: 9, fallback: null }),
    dc: int(a.dc, { min: 1, max: 40, fallback: null }),
    save: ABILITIES.includes(a.save) ? a.save : '',
    bonus: a.bonus == null || a.bonus === '' ? null : int(a.bonus, { min: -10, max: 30, fallback: null }),
    damage: str(a.damage, 60).trim(),
    extra: dice(a.extra),
    max_extra: int(a.max_extra, { min: 0, max: 20, fallback: 0 }),
    heal: dice(a.heal),
    crumble: a.crumble === true,
    text: str(a.text, 1000),
    source: ACTION_SOURCES.includes(a.source) ? a.source : 'manual',
    rule: str(a.rule, 60),
  };
}

export const normalizeActions = (list) => {
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || typeof a !== 'object' || out.length >= MAX_ACTIONS) continue;
    const n = normalizeAction(a);
    while (out.some((x) => x.id === n.id)) n.id = `${n.id}-2`.slice(0, 48);
    out.push(n);
  }
  return out;
};

// ---------- the items the app knows (DMG 2014 and 2024) ----------

const BAG_TABLES = {
  gray: ['Weasel', 'Giant Rat', 'Badger', 'Boar', 'Panther', 'Giant Badger', 'Dire Wolf', 'Giant Elk'],
  rust: ['Rat', 'Owl', 'Mastiff', 'Goat', 'Giant Goat', 'Giant Boar', 'Lion', 'Brown Bear'],
  tan: ['Jackal', 'Ape', 'Baboon', 'Axe Beak', 'Black Bear', 'Giant Weasel', 'Giant Hyena', 'Tiger'],
};

const GIANT_FLY = {
  name: 'Giant Fly', size: 'large', type: 'beast', cr: '0', ac: 11, hp_max: 19, hp_formula: '3d10+3', speed: { walk: 30, fly: 60 },
  abilities: { str: 14, dex: 13, con: 13, int: 2, wis: 10, cha: 3 }, senses: 'darkvision 60 ft., passive Perception 10',
  traits: [{ name: 'Mount', text: 'It can be ridden as a mount. It has no attacks.' }], attacks: [], source: 'manual', source_note: "Dungeon Master's Guide (Figurine of Wondrous Power, Ebony Fly)",
};

/** The 2024 Deck of Illusions' d100 table (3 each, 97–00 the drawer); the 2014 deck's 34 cards are spread evenly over a d100. */
const ILLUSIONS_2024 = ['Adult Red Dragon', 'Archmage', 'Assassin', 'Bandit Captain', 'Beholder', 'Berserker', 'Bugbear Warrior', 'Cloud Giant', 'Druid', 'Erinyes', 'Ettin', 'Fire Giant',
  'Frost Giant', 'Gnoll Warrior', 'Goblin Warrior', 'Guardian Naga', 'Hill Giant', 'Hobgoblin Warrior', 'Incubus', 'Iron Golem', 'Knight', 'Kobold Warrior', 'Lich', 'Medusa', 'Night Hag',
  'Ogre', 'Oni', 'Priest', 'Succubus', 'Troll', 'Veteran Warrior', 'Wyvern'];
const ILLUSIONS_2014 = ['Red Dragon', 'Knight and four guards', 'Succubus or incubus', 'Druid', 'Cloud Giant', 'Ettin', 'Bugbear', 'Goblin', 'Beholder', 'Archmage and mage apprentice', 'Night Hag',
  'Assassin', 'Fire Giant', 'Ogre Mage', 'Gnoll', 'Kobold', 'Lich', 'Priest and two acolytes', 'Medusa', 'Veteran', 'Frost Giant', 'Troll', 'Hobgoblin', 'Goblin', 'Iron Golem',
  'Bandit Captain and three bandits', 'Erinyes', 'Berserker', 'Hill Giant', 'Ogre', 'Orc', 'Kobold', 'You (the card drawer)', 'You (the card drawer)'];
const BIG = /dragon|giant|golem|beholder|ettin|troll|wyvern|naga|ogre|oni|medusa/i;

/** Spread names over d100: [{ min, max, creature }]. The last one runs to 100. */
function d100(names) {
  const n = names.length;
  return names.map((creature, i) => ({ min: Math.floor((i * 100) / n) + 1, max: i === n - 1 ? 100 : Math.floor(((i + 1) * 100) / n), creature, size: BIG.test(creature) ? 'large' : 'medium' }));
}

const FIGURINES = {
  'bronze griffon': { creature: 'Griffon', until: '6 hours', recharge: '5 days' },
  'ebony fly': { creature: 'Giant Fly', form: GIANT_FLY, until: '12 hours', recharge: '2 days' },
  'golden lions': { creature: 'Lion', count: '2', until: '1 hour', recharge: '7 days' },
  'marble elephant': { creature: 'Elephant', until: '24 hours', recharge: '7 days' },
  'obsidian steed': { creature: 'Nightmare', until: '24 hours', recharge: '5 days', text: 'It fights only to defend itself, and 10% of the time ignores your orders.' },
  'onyx dog': { creature: 'Mastiff', until: '6 hours', recharge: '7 days', text: 'Intelligence 8, speaks Common; it sees invisible things (2014: darkvision 60 ft.; 2024: blindsight 60 ft.).' },
  'serpentine owl': { creature: 'Giant Owl', until: '8 hours', recharge: '2 days', text: 'It can talk to you telepathically at any range on the same plane.' },
  'silver raven': { creature: 'Raven', until: '12 hours', recharge: '2 days', text: 'While it is a raven you can cast Animal Messenger on it.' },
};

const ELEMENTALS = { bowl: 'Water Elemental', brazier: 'Fire Elemental', censer: 'Air Elemental', stone: 'Earth Elemental' };
const GEMS = { 'blue sapphire': 'Air Elemental', sapphire: 'Air Elemental', 'yellow diamond': 'Earth Elemental', diamond: 'Earth Elemental', 'red corundum': 'Fire Elemental', corundum: 'Fire Elemental', emerald: 'Water Elemental' };
const HORNS = { silver: { y2014: '2d4+2', y2024: '2', needs: 'none' }, brass: { y2014: '3d4+3', y2024: '3', needs: 'proficiency with all simple weapons' }, bronze: { y2014: '4d4+4', y2024: '4', needs: 'proficiency with all medium armour' }, iron: { y2014: '5d4+5', y2024: '5', needs: 'proficiency with all martial weapons' } };

const fireball = (e2024, { extraMax, cost = 1, consumes = false, crumble = false, what = 'charge' }) => ({
  id: 'fireball', name: 'Fireball', kind: 'spell', spell: 'Fireball', level: 3, dc: 15, save: 'dex', damage: '8d6 fire', cost, consumes, crumble,
  extra: '1d6', max_extra: extraMax, text: `A 3rd-level Fireball (save DC 15): each creature in a 20-foot sphere makes a Dexterity save, 8d6 fire damage, half on a success. Each extra ${what} adds 1d6${e2024 && what === 'charge' ? ' (at most 3 charges)' : ''}.`,
});

/**
 * The rules for an item the app knows, by name and edition: { charges, actions } (charges only when the item
 * has a set number), or null. `rule` on each action is its key here, so the server can work it out again.
 */
export function knownItem(name, edition = '2014') {
  const n = String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const e2024 = edition === '2024';
  const rule = (key, actions, charges = null) => ({ charges, actions: normalizeActions(actions.map((a) => ({ ...a, rule: key, source: 'rules' }))) });
  let m = /^bag of tricks(?:,?\s*\(?\s*(gr[ae]y|rust|tan)\s*\)?)?$/.exec(n) ?? /^(gr[ae]y|rust|tan) bag of tricks$/.exec(n);
  if (m) {
    const colour = (m[1] ?? 'gray').replace('grey', 'gray');
    return rule(`bag-of-tricks:${colour}`, [{
      id: 'pull', name: 'Pull out a fuzzy ball', kind: 'summon', cost: 1, roll: '1d8',
      table: BAG_TABLES[colour].map((creature, i) => ({ min: i + 1, max: i + 1, creature })),
      until: e2024 ? 'until the next dawn or 0 hit points' : 'no set duration (gone at 0 hit points)', expires: e2024 ? 'dawn' : '',
      text: `Throw it up to 20 feet: it becomes a creature from the ${colour} bag's table (d8). It's friendly, acts ${e2024 ? 'right after you' : 'on your turn'}; a bonus action commands it. Three per dawn.`,
    }], { max: 3, recharge: 'all', when: 'dawn' });
  }
  m = /^figurine of wondrous power,?\s*\(?\s*([a-z ]+?)\s*\)?$/.exec(n) ?? /^(bronze griffon|ebony fly|golden lions|ivory goats|marble elephant|obsidian steed|onyx dog|serpentine owl|silver raven)(?: figurine)?$/.exec(n);
  if (m) {
    const which = m[1].trim();
    if (which === 'ivory goats') {
      return rule('figurine:ivory-goats', [
        { id: 'traveling', name: 'Goat of Traveling', kind: 'summon', creature: 'Riding Horse', until: 'an hour a charge (24 charges)', text: 'Has the riding horse stats; 7 days before it can be used again once its charges run out.' },
        { id: 'travail', name: 'Goat of Travail', kind: 'summon', creature: 'Giant Goat', until: '3 hours', text: '30 days before it can be used again.' },
        { id: 'terror', name: 'Goat of Terror', kind: 'summon', creature: 'Giant Goat', until: '3 hours', text: "It can't attack; its horns become a +1 lance and a +2 longsword; while ridden, a 30-foot aura of terror (DC 15 Wisdom save or frightened). 15 days before it can be used again." },
      ]);
    }
    const f = FIGURINES[which];
    if (!f) return null;
    return rule(`figurine:${slug(which)}`, [{ id: 'throw', name: `Become a ${f.creature.toLowerCase()}`, kind: 'summon', cost: 1, creature: f.creature, count: f.count ?? '1', form: f.form ?? null, until: f.until, text: `Throw it up to 60 feet: it becomes ${f.count === '2' ? 'two lions' : `a ${f.creature.toLowerCase()}`} for ${f.until} (or until 0 hit points, or you command it back). Friendly, obeys you. ${f.text ?? ''}`.trim() }], { max: 1, recharge: 'all', when: `after ${f.recharge}` });
  }
  m = /^horn of valhalla(?:,?\s*\(?\s*(silver|brass|bronze|iron)\s*\)?)?$/.exec(n) ?? /^(silver|brass|bronze|iron) horn of valhalla$/.exec(n);
  if (m) {
    const h = HORNS[m[1] ?? 'silver'];
    return rule(`horn-of-valhalla:${m[1] ?? 'silver'}`, [{ id: 'blow', name: 'Blow the horn', kind: 'summon', cost: 1, creature: 'Berserker', count: e2024 ? h.y2024 : h.y2014, until: '1 hour or 0 hit points', text: `Berserkers appear within 60 feet. Needs ${h.needs}: without it they attack you. ${e2024 ? 'Immune to charmed and frightened. ' : ''}7 days before it can be blown again.` }], { max: 1, recharge: 'all', when: 'after 7 days' });
  }
  m = /^(bowl|brazier|censer|stone) of (?:commanding|controlling) (?:water|fire|air|earth) elementals?$/.exec(n);
  if (m) {
    const creature = ELEMENTALS[m[1]];
    return rule(`elemental:${m[1]}`, [{ id: 'summon', name: `Summon a ${creature.toLowerCase()}`, kind: 'summon', cost: 1, creature, until: e2024 ? '1 hour, until it dies or you dismiss it' : 'as Conjure Elemental (concentration, up to 1 hour)', text: `The elemental obeys you${e2024 ? ' and acts right after you' : ''}. Once per dawn.` }], { max: 1, recharge: 'all', when: 'dawn' });
  }
  m = /^elemental gem(?:,?\s*\(?\s*([a-z ]+?)\s*\)?)?$/.exec(n);
  if (m) {
    const creature = GEMS[m[1]?.trim()] ?? null;
    const gems = creature ? [[m[1].trim(), creature]] : [['blue sapphire', 'Air Elemental'], ['yellow diamond', 'Earth Elemental'], ['red corundum', 'Fire Elemental'], ['emerald', 'Water Elemental']];
    return rule('elemental-gem', gems.map(([gem, c]) => ({ id: slug(gem), name: creature ? 'Break the gem' : `Break it (${gem}: ${c.toLowerCase()})`, kind: 'summon', consumes: true, creature: c, until: e2024 ? '1 hour (you can dismiss it)' : 'as Conjure Elemental, without concentration', text: 'The gem is used up.' })));
  }
  if (n === 'cube of summoning' && e2024) {
    const spirits = ['Aberrant Spirit', 'Bestial Spirit', 'Construct Spirit', 'Draconic Spirit', 'Elemental Spirit', 'Fey Spirit'];
    return rule('cube-of-summoning', [{ id: 'summon', name: 'Summon a spirit', kind: 'summon', cost: 1, roll: '1d6', table: spirits.map((creature, i) => ({ min: i + 1, max: i + 1, creature: `${creature} (level 5)` })), until: 'as the spell (no concentration)', text: 'A d6 picks the Summon spell (Aberration, Beast, Construct, Dragon, Elemental, Fey), cast at level 5 (save DC 17, +9 to hit). Once per dawn.' }], { max: 1, recharge: 'all', when: 'dawn' });
  }
  if (n === 'deck of illusions') {
    return rule('deck-of-illusions', [{ id: 'draw', name: 'Draw a card', kind: 'summon', roll: '1d100', illusion: true, table: e2024 ? [...ILLUSIONS_2024.map((creature, i) => ({ min: 3 * i + 1, max: 3 * i + 3, creature, size: BIG.test(creature) ? 'large' : 'medium' })), { min: 97, max: 100, creature: 'You (the card drawer)' }] : d100(ILLUSIONS_2014), until: 'until the card is moved or the illusion dispelled', text: 'Throw it up to 30 feet: an illusion of a creature that does no harm (a DC 15 Investigation check sees through it). The card is used up.' }]);
  }
  if (n === 'necklace of fireballs') {
    return rule('necklace-of-fireballs', [fireball(e2024, { extraMax: e2024 ? 4 : 6, what: 'bead' })], { max: 6, recharge: '', when: '' });
  }
  if (n === 'wand of fireballs') {
    return rule('wand-of-fireballs', [fireball(e2024, { extraMax: e2024 ? 2 : 6, crumble: true })], { max: 7, recharge: '1d6+1', when: 'dawn' });
  }
  if (n === 'pipes of haunting') {
    return rule('pipes-of-haunting', [{ id: 'play', name: 'Play the pipes', kind: 'other', cost: 1, dc: 15, save: 'wis', text: `Creatures within 30 feet that hear it make a DC 15 Wisdom save or are frightened of you for 1 minute (they repeat the save each turn; one that succeeds is immune for 24 hours).${e2024 ? '' : ' You must be proficient with wind instruments.'}` }], { max: 3, recharge: '1d3', when: 'dawn' });
  }
  if (n === 'ring of djinni summoning') {
    return rule('ring-of-djinni', [{ id: 'summon', name: 'Summon the djinni', kind: 'summon', cost: 1, needs: 'attuned', creature: 'Djinni', until: 'while you concentrate, up to 1 hour, or 0 hit points', text: 'It appears within 120 feet, friendly and obeying you. 24 hours before it can be summoned again; if it dies, the ring loses its magic.' }], { max: 1, recharge: 'all', when: 'after 24 hours' });
  }
  if (n === 'staff of the python') {
    return rule('staff-of-the-python', [{ id: 'throw', name: 'Throw it: a giant constrictor snake', kind: 'summon', needs: 'attuned', creature: 'Giant Constrictor Snake', until: 'until you turn it back (a bonus action)', text: `It's under your control${e2024 ? ' and acts right after you' : ' and has its own initiative'}. If it drops to 0 hit points it dies and the staff is destroyed; turned back sooner, it gets its hit points back.` }]);
  }
  return null;
}

// ---------- reading actions from a description ----------

const SPELL_RE = /(?:expend|use|spend)\s+(\d+|one|two|three)\s+(?:or more\s+)?(?:of\s+its\s+)?charges?\s+to\s+cast\s+(?:the\s+)?(?!one\b|any\b|following\b|a\s+spell\b)([a-z][a-z' -]{2,40}?)\s+spell(?:\s*\((?:save\s+)?DC\s*(\d{1,2})[^)]*\))?/gi;
const WORDS = { one: 1, two: 2, three: 3 };

/**
 * Actions read from an item's description, the usual wording only: "expend 1
 * of its charges to cast the fireball spell (save DC 15)". Anything else is
 * left for the AI (on lookup) or the player.
 */
export function readItemActions(text = '') {
  const t = String(text).replace(/\s+/g, ' ');
  const out = [];
  const dc = /\bsave DC (\d{1,2})\b/i.exec(t)?.[1] ?? null;
  for (const m of t.matchAll(SPELL_RE)) {
    const spell = m[2].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    out.push({ id: slug(spell), name: spell, kind: 'spell', spell, cost: WORDS[m[1].toLowerCase()] ?? Number(m[1]), dc: m[3] ?? dc, source: 'text', text: '' });
  }
  return normalizeActions(out);
}

/** An item's actions: the known rules for it by name, else what its description says. */
export function itemActions({ name = '', text = '', edition = '2014' } = {}) {
  return knownItem(name, edition)?.actions ?? readItemActions(text);
}

/** Can this line's action be used now? '' if so, else why not. */
export function actionProblem(line, action) {
  // A magic item that needs attunement does nothing until you're attuned to it.
  if ((line.attunement || action.needs === 'attuned') && !line.attuned && line.attunement) return `Attune to ${line.name} first.`;
  if (action.needs === 'equipped' && !line.equipped) return `Equip ${line.name} first.`;
  const left = line.charges ? line.charges.max - line.charges.used : null;
  if (action.cost && left == null) return `${line.name} has no charges set: add them under Details.`;
  if (action.cost && left < action.cost) return `${line.name} has ${left} charge${left === 1 ? '' : 's'} left${line.charges.when ? ` (they come back ${/^after/.test(line.charges.when) ? line.charges.when : `at ${line.charges.when}`})` : ''}.`;
  return '';
}

/** The spell's damage with `extra` more charges (Fireball with two extra charges: 8d6 → 10d6). */
export function damageWithExtra(action, extra = 0) {
  const m = /^\s*(\d+)d(\d+)(.*)$/.exec(action.damage);
  const e = /^(\d+)d(\d+)$/.exec(action.extra);
  if (!m || !e || !extra || e[2] !== m[2]) return action.damage;
  return `${Number(m[1]) + Number(e[1]) * extra}d${m[2]}${m[3]}`;
}
