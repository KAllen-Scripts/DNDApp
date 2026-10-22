/**
 * Writes docs/notes/class-features-audit.md: every class, subclass and race
 * feature the sheet knows, by edition, with what the app does with it and
 * whether that's all it needs. Made from the lists themselves
 * (packages/shared/src/class-traits.js, class-features.js,
 * subclass-features*.js, race-features.js), so run it again after changing
 * them:
 *
 *   node scripts/class-features-audit.js
 */
import { writeFileSync } from 'node:fs';
import { CLASS_TRAITS, RACE_TRAITS } from '../packages/shared/src/class-traits.js';
import { FEATURES } from '../packages/shared/src/class-features.js';
import { SUBCLASS_FEATURES, SUBCLASSES } from '../packages/shared/src/subclass-features.js';
import { BOOK_SUBCLASS_FEATURES, BOOK_SUBCLASSES } from '../packages/shared/src/subclass-features-books.js';
import { RACE_FEATURES, RACE_BY_KEY } from '../packages/shared/src/race-features.js';

const FIXED = '2026-10-22';
/** Bugs found in the audit, by feature name: what was wrong. */
const BUGS = {
  'Sneak Attack': 'only a note; nothing added its dice to an attack',
  "Thieves' Cant": 'nowhere on the sheet',
  'Unarmored Movement': 'added to speed in armour or with a shield too',
  'Aura of Protection': "not added to the paladin's own saves",
  'Draconic Resilience': 'AC and hit points not applied; the 2024 AC was missing',
  'Weapon Mastery': 'not on the sheet at all',
};

/** Subclass and race rows whose effect the sheet works out (beyond the row itself). */
const APPLIED = {
  frenzy: '2024: a tick box on Strength attacks while raging adds the d6s',
  divine_fury: 'Added to the first hit each turn while raging (a tick box)',
  divine_fury_2014: 'Added to the first hit each turn while raging (a tick box)',
  dazzling_footwork: 'AC 10+Dex+Cha without armour; unarmed strikes use Dex and the Bardic Inspiration die',
  disciple_of_life: 'Added to the healing of 1st-level and higher spells',
  improved_critical: 'Critical hits on 19–20 (18–20 from 15th level)',
  superiority_dice: 'A tick box on weapon attacks adds a die and spends it',
  psionic_energy: 'Psionic Strike: a tick box on weapon attacks adds the die and spends it',
  psionic_energy_2014: 'Psionic Strike: a tick box on weapon attacks adds the die and spends it',
  dreadful_strikes: 'A tick box on weapon attacks adds the psychic damage',
  dreadful_strikes_2014: 'A tick box on weapon attacks adds the psychic damage',
  dread_ambusher: '2024 Dreadful Strike: a tick box adds the d8 and spends a use; Wisdom on initiative',
  dread_ambusher_2014: 'A tick box adds 1d8 on the first turn; Wisdom on initiative',
  slayers_prey: 'A tick box on weapon attacks adds 1d6',
  draconic_resilience: 'AC (13+Dex in 2014, 10+Dex+Cha in 2024) and one more hit point each level',
  hexblades_curse: 'A tick box adds the proficiency bonus to damage; critical hits on 19–20',
  giants_might: 'A tick box on weapon attacks adds the d6',
  bladesong: 'A Now toggle: AC +Int, speed +10 (spends a use)',
  hunters_prey: 'Colossus Slayer or Horde Breaker chosen in Features & traits; Colossus Slayer is a tick box on attacks',
  rage: 'Also a Now toggle; the damage is added to Strength attacks while raging',
  martial_arts: 'Unarmed strikes and monk weapons use the martial arts die and Dex',
  aura_of_protection: "Added to the paladin's own saves",
  paladins_smite: '2024: Divine Smite once a long rest with no slot, from the attack',
};

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
const ctx = (edition, level, extra = {}) => ({ edition, level, pb: 2 + Math.floor((level - 1) / 4), mod: () => 0, race: '', ...extra });
const val = (v, c) => { try { return typeof v === 'function' ? v(c) : v; } catch { return null; } };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fromOf = (f, ed) => Number(val(f.from, ctx(ed, 1))) || 1;
const short = (s, n = 180) => { const t = clean(s); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
const nameOf = (f, c) => val(f.name, c) ?? `${f.id.replace(/_/g, ' ')}`;
const noteOf = (f, c) => { const n = val(f.note, c); return n ? ` ${short(n)}` : ''; };

const RECHARGE = { short: 'back on a short or long rest', long: 'back on a long rest', short_one: 'one back on a short rest, all on a long rest', none: 'not by resting' };
function rowWhat(f, c) {
  const kind = val(f.kind, c) ?? 'info';
  const recharge = RECHARGE[val(f.recharge, c)] ?? '';
  if (kind === 'uses') return `Class features row: uses ticked off${recharge ? `, ${recharge}` : ''}`;
  if (kind === 'pool') return `Class features row: a pool of points${recharge ? `, ${recharge}` : ''}`;
  return 'Class features row: a note with its numbers';
}

const HOW = {
  tracked: ['Class features row', 'Works (tracked)'],
  number: ["Worked into the sheet's numbers; listed in Features & traits", 'Works (applied)'],
  roll: ['Added to attacks or spells rolled from the sheet', 'Works (applied)'],
  choice: ['Picked in Features & traits; the pick changes the numbers or rolls', 'Works (choice)'],
  text: ['Listed in Features & traits with a short summary', 'Listed (nothing to work out)'],
};

const status = (name, base) => (BUGS[name] ? `Fixed ${FIXED} (was ${BUGS[name]})` : base);
const editions = (e) => (e ? [e] : ['2014', '2024']);
const lines = [];
const out = (s = '') => lines.push(s);
const table = (rows) => {
  out('| Feature | Class/level | Edition | What it does in the app now | Status |');
  out('|---|---|---|---|---|');
  for (const r of rows) out(`| ${r.map(clean).join(' | ')} |`);
  out();
};

out('# Class features audit');
out();
out(`Made by \`node scripts/class-features-audit.js\` from the app's own lists (${FIXED}); run it again after changing them. Kenny asked for every class feature to be checked (feedback 2026-10-21, item 9).`);
out();
out('**Status:** *Works (tracked)*: a row of the Class features box with its uses or points. *Works (applied)*: the app works the number out (AC, speed, saves, damage...). *Works (choice)*: the player picks it in Features & traits and the pick is applied. *Listed*: shown in Features & traits with a summary; it has nothing the sheet could work out (a language, an action the player takes). *Note only*: a Class features note with the numbers filled in; applying it is the player\'s (the DM decides when it applies). *Fixed*: a bug found in this audit, now covered by a regression test (docs/regressions.md).');
out();
out('Editions: "2014" and "2024" are the two Player\'s Handbooks; the campaign\'s Settings decide which the sheet follows. The artificer is Tasha\'s (2014 only).');
out();

// ---------- Classes ----------
out('## Classes');
out();
const byClass = new Map();
for (const t of CLASS_TRAITS) {
  for (const ed of editions(t.edition)) {
    const c = ctx(ed, t.from);
    const name = val(t.name, c);
    const text = val(t.text, c);
    const [how, st] = HOW[t.how];
    const row = t.id ? FEATURES.find((f) => f.id === t.id) : null;
    const what = [row ? rowWhat(row, c) : how, APPLIED[t.id]].filter(Boolean).join('. ');
    if (!byClass.has(t.class)) byClass.set(t.class, []);
    byClass.get(t.class).push({ from: t.from, ed, cells: [name, `${cap(t.class)} ${t.from}`, ed, `${what}. ${text}`, status(name, row && t.how === 'roll' ? 'Works (tracked and applied)' : st)] });
  }
}
// Rows of the Class features box that the class tables above don't name.
for (const f of FEATURES.filter((x) => !x.race && !x.sc && !CLASS_TRAITS.some((t) => t.id === x.id) && byClass.has(x.class))) {
  for (const ed of editions(f.edition)) {
    const from = fromOf(f, ed);
    const c = ctx(ed, from);
    byClass.get(f.class).push({ from, ed, cells: [nameOf(f, c), `${cap(f.class)} ${from}`, ed, `${rowWhat(f, c)}${APPLIED[f.id] ? `. ${APPLIED[f.id]}` : ''}.${noteOf(f, c)}`, status(f.name, 'Works (tracked)')] });
  }
}
for (const [cls, rows] of byClass) {
  out(`### ${cap(cls)}`);
  out();
  rows.sort((a, b) => a.from - b.from || a.ed.localeCompare(b.ed));
  // Same feature, same text in both editions: one row.
  const merged = [];
  for (const r of rows) {
    const twin = merged.find((m) => m.cells[0] === r.cells[0] && m.from === r.from && m.cells[3] === r.cells[3] && m.ed !== r.ed);
    if (twin) { twin.cells[2] = 'both'; twin.ed = 'both'; } else merged.push({ ...r, cells: [...r.cells] });
  }
  table(merged.map((r) => r.cells));
}

// ---------- Subclasses ----------
out('## Subclasses');
out();
out('Subclass features with uses or numbers are rows of the Class features box (under a Subclass heading). Those marked *applied* are also worked into the numbers or rolls. Subclass features with no uses and nothing to work out (most ribbons) aren\'t listed on the sheet; the player writes them in Features & traits. That is a gap left for later (see HANDOFF.md).');
out();
const subName = new Map([...SUBCLASSES, ...BOOK_SUBCLASSES].map((s) => [s.key, s.name]));
const subRows = [...SUBCLASS_FEATURES, ...BOOK_SUBCLASS_FEATURES];
const subByClass = new Map();
for (const f of subRows) {
  for (const ed of editions(f.edition)) {
    const from = fromOf(f, ed);
    const c = ctx(ed, from);
    const kind = val(f.kind, c) ?? 'info';
    const st = APPLIED[f.id] ? 'Works (applied)' : kind === 'info' ? 'Note only' : 'Works (tracked)';
    const sub = subName.get(f.sc) ?? f.sc;
    if (!subByClass.has(f.class)) subByClass.set(f.class, []);
    subByClass.get(f.class).push({ key: `${f.id}`, cells: [nameOf(f, c), `${cap(f.class)} (${sub}) ${from}`, ed, `${rowWhat(f, c)}${APPLIED[f.id] ? `. ${APPLIED[f.id]}` : ''}.${noteOf(f, c)}`, status(nameOf(f, c), st)] });
  }
}
for (const [cls, rows] of subByClass) {
  out(`### ${cap(cls)} subclasses`);
  out();
  const merged = [];
  for (const r of rows) {
    const twin = merged.find((m) => m.key === r.key && m.cells[3] === r.cells[3] && m.cells[4] === r.cells[4]);
    if (twin) twin.cells[2] = 'both'; else merged.push({ ...r, cells: [...r.cells] });
  }
  table(merged.map((r) => r.cells));
}

// ---------- Races ----------
out('## Races');
out();
const raceRows = [];
for (const t of RACE_TRAITS) {
  for (const ed of editions(t.edition)) {
    const [how, st] = HOW[t.how];
    const text = val(t.text, ctx(ed, 1));
    raceRows.push([t.name, RACE_BY_KEY[t.race]?.name ?? t.race, ed, `${how}. ${text}`, status(t.name, st)]);
  }
}
for (const f of RACE_FEATURES) {
  for (const ed of editions(f.edition)) {
    const from = fromOf(f, ed);
    const c = ctx(ed, from);
    const kind = val(f.kind, c) ?? 'info';
    raceRows.push([nameOf(f, c), `${RACE_BY_KEY[f.race]?.name ?? f.race ?? 'feat'}${from > 1 ? ` ${from}` : ''}`, ed, `${rowWhat(f, c).replace('Class features', 'Race features')}.${noteOf(f, c)}`, kind === 'info' ? 'Note only' : 'Works (tracked)']);
  }
}
raceRows.push(['Speed', 'Dwarf, halfling, gnome', '2024', "Worked into the sheet's speed: 30 feet (25 under 2014)", `Fixed ${FIXED} (was 25 feet under 2024 rules too)`]);
const mergedRace = [];
for (const r of raceRows) {
  const twin = mergedRace.find((m) => m[0] === r[0] && m[1] === r[1] && m[3] === r[3] && m[4] === r[4]);
  if (twin) twin[2] = 'both'; else mergedRace.push([...r]);
}
table(mergedRace);

out('## Still not on the sheet');
out();
out('- Subclass features with nothing to track or work out (most "ribbons") aren\'t listed in Features & traits yet; the player writes them in.');
out('- Feats (Great Weapon Master, Sharpshooter, Elven Accuracy...) and the halfling\'s Luck rerolls aren\'t applied to rolls; they\'re text the player keeps.');
out('- Two-Weapon Fighting\'s off-hand attack isn\'t its own attack line; the Two-Weapon Fighting style is chosen in Features & traits and noted on the attack.');
out('- The AI sheet review (Review sheet) still checks the 2014 numbers; its prompt says so.');

writeFileSync(new URL('../docs/notes/class-features-audit.md', import.meta.url), `${lines.join('\n')}\n`);
console.log(`Wrote docs/notes/class-features-audit.md (${lines.length} lines).`);
