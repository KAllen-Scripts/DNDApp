/**
 * Character backgrounds from the books the group has (SPEC §6.4 "Backgrounds"),
 * and the DM's own (custom) ones from the campaign settings.
 *
 * A background gives skill proficiencies, tool proficiencies, languages and
 * equipment, and then, by edition:
 * - 2014 (Player's Handbook 2014): a feature (a short summary here, in our
 *   own words) and suggested characteristics (not copied).
 * - 2024 (Player's Handbook 2024): three abilities to raise (+2 and +1, or +1
 *   to all three; the point buy calculator uses them) and an origin feat.
 * Glory of the Giants' and The Book of Many Things' two backgrounds each give
 * a feat as well (their own rule, for games of either edition).
 *
 * The sheet suggests these in its Background box and, when one is picked,
 * applies it (`applyBackground`): it only ever adds (ticks a skill not yet
 * ticked, adds lines that aren't there yet) and fills boxes that are empty,
 * so nothing the player typed is overwritten, and it says what changed.
 *
 * Checked against the owner's PDFs of the 2014 and 2024 Player's Handbooks
 * (docs/notes/books-worked-through.md). Plain JS: the server and the page use it.
 */
import { ABILITIES, ABILITY_NAMES, SKILLS } from './sheet.js';

// Skill keys from words: 'Sleight of Hand' -> 'sleight_of_hand'.
const sk = (...names) => names.map((n) => n.toLowerCase().replace(/ /g, '_'));

/** The 2014 Player's Handbook's backgrounds (with the variants it prints). */
const B2014 = [
  { name: 'Acolyte', skills: sk('Insight', 'Religion'), tools: '', languages: 'Two of your choice', equipment: 'A holy symbol, a prayer book or prayer wheel, 5 sticks of incense, vestments, a set of common clothes, and a pouch', gold: 15,
    feature: { name: 'Shelter of the Faithful', text: 'You and your companions can expect free healing and care at a temple, shrine or other presence of your faith, and you can call on its priests for help (not dangerous help). You have ties to one temple where you have a residence.' } },
  { name: 'Charlatan', skills: sk('Deception', 'Sleight of Hand'), tools: 'Disguise kit, forgery kit', languages: '', equipment: 'A set of fine clothes, a disguise kit, tools of the con of your choice (stoppered bottles of coloured liquid, weighted dice, a deck of marked cards, or a signet ring of an imaginary duke), and a pouch', gold: 15,
    feature: { name: 'False Identity', text: 'You have a second identity with documents, acquaintances and disguises to keep it up, and you can forge documents (official papers, personal letters) if you have seen an example.' } },
  { name: 'Criminal', skills: sk('Deception', 'Stealth'), tools: "One type of gaming set, thieves' tools", languages: '', equipment: 'A crowbar, a set of dark common clothes including a hood, and a pouch', gold: 15,
    feature: { name: 'Criminal Contact', text: 'You have a reliable contact who acts as your link to a network of other criminals, and you know how to get messages to and from them over great distances.' } },
  { name: 'Spy', variant: 'Criminal', skills: sk('Deception', 'Stealth'), tools: "One type of gaming set, thieves' tools", languages: '', equipment: 'A crowbar, a set of dark common clothes including a hood, and a pouch', gold: 15,
    feature: { name: 'Criminal Contact', text: 'You have a reliable contact (as a spy, someone in your spymaster\'s network) who passes messages to and from you over great distances.' } },
  { name: 'Entertainer', skills: sk('Acrobatics', 'Performance'), tools: 'Disguise kit, one type of musical instrument', languages: '', equipment: 'A musical instrument (one of your choice), the favour of an admirer (a love letter, a lock of hair or a trinket), a costume, and a pouch', gold: 15,
    feature: { name: 'By Popular Demand', text: 'You can always find a place to perform (an inn, a tavern, a circus, a noble\'s court), getting free lodging and food of a modest or comfortable standard as long as you perform each night. Locals recognise you and tend to like you.' } },
  { name: 'Gladiator', variant: 'Entertainer', skills: sk('Acrobatics', 'Performance'), tools: 'Disguise kit, one type of musical instrument', languages: '', equipment: 'An inexpensive but unusual weapon (a trident or a net), the favour of an admirer, a costume, and a pouch', gold: 15,
    feature: { name: 'By Popular Demand', text: 'You can always find a place to perform, here in an arena or pit fighting, getting free lodging and food as long as you perform. Locals recognise you and tend to like you.' } },
  { name: 'Folk Hero', skills: sk('Animal Handling', 'Survival'), tools: "One type of artisan's tools, vehicles (land)", languages: '', equipment: "A set of artisan's tools (one of your choice), a shovel, an iron pot, a set of common clothes, and a pouch", gold: 10,
    feature: { name: 'Rustic Hospitality', text: 'Common folk will shelter you and your companions, hiding you from the law or anyone searching for you (but not at the risk of their lives), since you came from their ranks.' } },
  { name: 'Guild Artisan', skills: sk('Insight', 'Persuasion'), tools: "One type of artisan's tools", languages: 'One of your choice', equipment: "A set of artisan's tools (one of your choice), a letter of introduction from your guild, a set of traveller's clothes, and a pouch", gold: 15,
    feature: { name: 'Guild Membership', text: 'Your guild gives you lodging and food if needed and pays for your funeral; its members help you, and its contacts reach people in power. You pay 5 gp a month in dues.' } },
  { name: 'Guild Merchant', variant: 'Guild Artisan', skills: sk('Insight', 'Persuasion'), tools: "Navigator's tools, or another language instead", languages: 'One of your choice', equipment: "A mule and a cart (instead of artisan's tools), a letter of introduction from your guild, a set of traveller's clothes, and a pouch", gold: 15,
    feature: { name: 'Guild Membership', text: 'Your guild of merchants and traders gives you lodging and food if needed and pays for your funeral; its members help you. You pay 5 gp a month in dues.' } },
  { name: 'Hermit', skills: sk('Medicine', 'Religion'), tools: 'Herbalism kit', languages: 'One of your choice', equipment: 'A scroll case stuffed full of notes from your studies or prayers, a winter blanket, a set of common clothes, an herbalism kit', gold: 5,
    feature: { name: 'Discovery', text: 'In your seclusion you found a unique and powerful discovery: a great truth about the cosmos or the gods, a hidden site, or a long-forgotten fact. Work out with the DM what it is and how it matters.' } },
  { name: 'Noble', skills: sk('History', 'Persuasion'), tools: 'One type of gaming set', languages: 'One of your choice', equipment: 'A set of fine clothes, a signet ring, a scroll of pedigree, and a purse', gold: 25,
    feature: { name: 'Position of Privilege', text: 'People think the best of you: you are welcome in high society, common folk try to accommodate you, and you can get an audience with a local noble if you need one.' } },
  { name: 'Knight', variant: 'Noble', skills: sk('History', 'Persuasion'), tools: 'One type of gaming set', languages: 'One of your choice', equipment: 'A set of fine clothes, a signet ring, a scroll of pedigree, and a purse', gold: 25,
    feature: { name: 'Retainers', text: 'You have three retainers loyal to your family (as a knight, a squire and two commoners): they do mundane tasks for you but won\'t fight for you or follow you into danger.' } },
  { name: 'Outlander', skills: sk('Athletics', 'Survival'), tools: 'One type of musical instrument', languages: 'One of your choice', equipment: "A staff, a hunting trap, a trophy from an animal you killed, a set of traveller's clothes, and a pouch", gold: 10,
    feature: { name: 'Wanderer', text: 'You have an excellent memory for maps and geography, and can always recall the general layout of terrain, settlements and other features around you. You can find food and fresh water for yourself and up to five others each day, if the land offers it.' } },
  { name: 'Sage', skills: sk('Arcana', 'History'), tools: '', languages: 'Two of your choice', equipment: 'A bottle of black ink, a quill, a small knife, a letter from a dead colleague posing a question you have not yet been able to answer, a set of common clothes, and a pouch', gold: 10,
    feature: { name: 'Researcher', text: 'When you try to learn or recall a piece of lore and don\'t know it, you often know where and from whom to get it (a library, a scriptorium, a university, a sage).' } },
  { name: 'Sailor', skills: sk('Athletics', 'Perception'), tools: "Navigator's tools, vehicles (water)", languages: '', equipment: 'A belaying pin (club), 50 feet of silk rope, a lucky charm such as a rabbit foot or a small stone with a hole in the centre, a set of common clothes, and a pouch', gold: 10,
    feature: { name: "Ship's Passage", text: 'You can get free passage on a sailing ship for yourself and your companions, as long as you help the crew during the voyage. It might not go where you want, and not at once.' } },
  { name: 'Pirate', variant: 'Sailor', skills: sk('Athletics', 'Perception'), tools: "Navigator's tools, vehicles (water)", languages: '', equipment: 'A belaying pin (club), 50 feet of silk rope, a lucky charm, a set of common clothes, and a pouch', gold: 10,
    feature: { name: 'Bad Reputation', text: 'People in civilised places are afraid of you because of your piracy, so you can get away with minor crimes (refusing to pay for food, breaking down doors) that others would be arrested for.' } },
  { name: 'Soldier', skills: sk('Athletics', 'Intimidation'), tools: 'One type of gaming set, vehicles (land)', languages: '', equipment: 'An insignia of rank, a trophy taken from a fallen enemy (a dagger, broken blade or piece of a banner), a set of bone dice or deck of cards, a set of common clothes, and a pouch', gold: 10,
    feature: { name: 'Military Rank', text: 'Soldiers loyal to your former military organisation still recognise your rank and defer to you if they are of a lower rank; you can requisition simple equipment or horses for temporary use and get into friendly military encampments and fortresses.' } },
  { name: 'Urchin', skills: sk('Sleight of Hand', 'Stealth'), tools: "Disguise kit, thieves' tools", languages: '', equipment: 'A small knife, a map of the city you grew up in, a pet mouse, a token to remember your parents by, a set of common clothes, and a pouch', gold: 10,
    feature: { name: 'City Secrets', text: 'You know the secret patterns and flow of cities and can find passages through the urban sprawl that others would miss: out of combat, you and companions you lead travel between any two places in the city twice as fast as your speed would allow.' } },
].map((b) => ({ ...b, edition: '2014', book: "Player's Handbook (2014)" }));

/** Glory of the Giants: backgrounds with a feat, for any edition's game. */
const GIANTS = [
  { name: 'Giant Foundling', skills: sk('Intimidation', 'Survival'), tools: '', languages: 'Giant and one other language of your choice', equipment: "A backpack, a set of traveller's clothes, a small stone or sprig that reminds you of home, and a pouch", gold: 10,
    feat: 'Strike of the Giants' },
  { name: 'Rune Carver', skills: sk('History', 'Perception'), tools: "One type of artisan's tools", languages: 'One of your choice', equipment: "A set of artisan's tools, a small knife, a whetstone, a set of common clothes, and a pouch", gold: 10,
    feat: 'Rune Shaper' },
].map((b) => ({ ...b, edition: null, book: 'Bigby Presents: Glory of the Giants', note: "From Claude's knowledge (the owner's copy is a picture-only scan): check it against the book." }));

/**
 * The Book of Many Things: two backgrounds with a feat. The owner's PDF only names them, so skills and
 * feat are from Claude's knowledge, and their tools, languages and equipment are left for the player
 * to copy from the book (`note`), rather than guessed.
 */
const MANY_THINGS = [
  { name: 'Rewarded', skills: sk('Insight', 'Persuasion'), tools: '', languages: '', equipment: '', gold: 0, feat: 'Lucky', note: 'Its tools, languages and equipment: see The Book of Many Things (chapter 8).' },
  { name: 'Ruined', skills: sk('Stealth', 'Survival'), tools: '', languages: '', equipment: '', gold: 0, feat: 'Tough', note: 'Its tools, languages and equipment: see The Book of Many Things (chapter 8).' },
].map((b) => ({ ...b, edition: null, book: 'The Book of Many Things' }));

/** The 2024 Player's Handbook's 16 backgrounds. Equipment is option A; option B is always 50 GP instead. */
const B2024 = [
  { name: 'Acolyte', abilities: ['int', 'wis', 'cha'], feat: 'Magic Initiate (Cleric)', skills: sk('Insight', 'Religion'), tools: "Calligrapher's Supplies", equipment: "Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe", gold: 8 },
  { name: 'Artisan', abilities: ['str', 'dex', 'int'], feat: 'Crafter', skills: sk('Investigation', 'Persuasion'), tools: "One kind of Artisan's Tools", equipment: "Artisan's Tools (the same as above), 2 Pouches, Traveler's Clothes", gold: 32 },
  { name: 'Charlatan', abilities: ['dex', 'con', 'cha'], feat: 'Skilled', skills: sk('Deception', 'Sleight of Hand'), tools: 'Forgery Kit', equipment: 'Forgery Kit, Costume, Fine Clothes', gold: 15 },
  { name: 'Criminal', abilities: ['dex', 'con', 'int'], feat: 'Alert', skills: sk('Sleight of Hand', 'Stealth'), tools: "Thieves' Tools", equipment: "2 Daggers, Thieves' Tools, Crowbar, 2 Pouches, Traveler's Clothes", gold: 16 },
  { name: 'Entertainer', abilities: ['str', 'dex', 'cha'], feat: 'Musician', skills: sk('Acrobatics', 'Performance'), tools: 'One kind of Musical Instrument', equipment: "Musical Instrument (the same as above), 2 Costumes, Mirror, Perfume, Traveler's Clothes", gold: 11 },
  { name: 'Farmer', abilities: ['str', 'con', 'wis'], feat: 'Tough', skills: sk('Animal Handling', 'Nature'), tools: "Carpenter's Tools", equipment: "Sickle, Carpenter's Tools, Healer's Kit, Iron Pot, Shovel, Traveler's Clothes", gold: 30 },
  { name: 'Guard', abilities: ['str', 'int', 'wis'], feat: 'Alert', skills: sk('Athletics', 'Perception'), tools: 'One kind of Gaming Set', equipment: "Spear, Light Crossbow, 20 Bolts, Gaming Set (the same as above), Hooded Lantern, Manacles, Quiver, Traveler's Clothes", gold: 12 },
  { name: 'Guide', abilities: ['dex', 'con', 'wis'], feat: 'Magic Initiate (Druid)', skills: sk('Stealth', 'Survival'), tools: "Cartographer's Tools", equipment: "Shortbow, 20 Arrows, Cartographer's Tools, Bedroll, Quiver, Tent, Traveler's Clothes", gold: 3 },
  { name: 'Hermit', abilities: ['con', 'wis', 'cha'], feat: 'Healer', skills: sk('Medicine', 'Religion'), tools: 'Herbalism Kit', equipment: "Quarterstaff, Herbalism Kit, Bedroll, Book (philosophy), Lamp, Oil (3 flasks), Traveler's Clothes", gold: 16 },
  { name: 'Merchant', abilities: ['con', 'int', 'cha'], feat: 'Lucky', skills: sk('Animal Handling', 'Persuasion'), tools: "Navigator's Tools", equipment: "Navigator's Tools, 2 Pouches, Traveler's Clothes", gold: 22 },
  { name: 'Noble', abilities: ['str', 'int', 'cha'], feat: 'Skilled', skills: sk('History', 'Persuasion'), tools: 'One kind of Gaming Set', equipment: 'Gaming Set (the same as above), Fine Clothes, Perfume', gold: 29 },
  { name: 'Sage', abilities: ['con', 'int', 'wis'], feat: 'Magic Initiate (Wizard)', skills: sk('Arcana', 'History'), tools: "Calligrapher's Supplies", equipment: "Quarterstaff, Calligrapher's Supplies, Book (history), Parchment (8 sheets), Robe", gold: 8 },
  { name: 'Sailor', abilities: ['str', 'dex', 'wis'], feat: 'Tavern Brawler', skills: sk('Acrobatics', 'Perception'), tools: "Navigator's Tools", equipment: "Dagger, Navigator's Tools, Rope, Traveler's Clothes", gold: 20 },
  { name: 'Scribe', abilities: ['dex', 'int', 'wis'], feat: 'Skilled', skills: sk('Investigation', 'Perception'), tools: "Calligrapher's Supplies", equipment: "Calligrapher's Supplies, Fine Clothes, Lamp, Oil (3 flasks), Parchment (12 sheets)", gold: 23 },
  { name: 'Soldier', abilities: ['str', 'dex', 'con'], feat: 'Savage Attacker', skills: sk('Athletics', 'Intimidation'), tools: 'One kind of Gaming Set', equipment: "Spear, Shortbow, 20 Arrows, Gaming Set (the same as above), Healer's Kit, Quiver, Traveler's Clothes", gold: 14 },
  { name: 'Wayfarer', abilities: ['dex', 'wis', 'cha'], feat: 'Lucky', skills: sk('Insight', 'Stealth'), tools: "Thieves' Tools", equipment: "2 Daggers, Thieves' Tools, Gaming Set (any), Bedroll, 2 Pouches, Traveler's Clothes", gold: 16 },
].map((b) => ({ ...b, languages: '', edition: '2024', book: "Player's Handbook (2024)" }));

/** Every background from the books, each { name, edition ('2014' | '2024' | null: any), book, skills, tools, languages, equipment, gold, feature?, abilities?, feat?, variant? }. */
export const BOOK_BACKGROUNDS = [...B2014, ...GIANTS, ...MANY_THINGS, ...B2024];

/** What the 2024 rules give every character whatever the background (for the help text). */
export const LANGUAGES_2024 = 'Every character knows Common and two other standard languages of their choice (2024 rules: chosen with the species and background, not from the background).';

export const MAX_CUSTOM_BACKGROUNDS = 50;

const text = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * One of the DM's own backgrounds (campaign settings `backgrounds`), with
 * anything unknown dropped: { id, name, skills, tools, languages, equipment,
 * gold, feature: { name, text } | null, abilities (none or three), feat }.
 */
export function normalizeCustomBackground(b = {}) {
  const skills = [...new Set((Array.isArray(b.skills) ? b.skills : []).filter((k) => Object.hasOwn(SKILLS, k)))].slice(0, 6);
  const abilities = [...new Set((Array.isArray(b.abilities) ? b.abilities : []).filter((a) => ABILITIES.includes(a)))];
  const featureName = text(b.feature?.name, 100);
  const gold = Number(b.gold);
  return {
    id: /^[a-z0-9]{6,16}$/.test(String(b.id ?? '')) ? String(b.id) : Math.random().toString(36).slice(2, 10).padEnd(8, '0'),
    name: text(String(b.name ?? '').replace(/\s+/g, ' '), 60), // as findBackground matches it
    skills,
    tools: text(b.tools, 300),
    languages: text(b.languages, 300),
    equipment: text(b.equipment, 1000),
    gold: Number.isFinite(gold) && gold >= 0 ? Math.min(Math.round(gold), 100000) : 0,
    feature: featureName ? { name: featureName, text: text(b.feature?.text, 2000) } : null,
    abilities: abilities.length === 3 ? abilities : [],
    feat: text(b.feat, 100),
  };
}

/** The DM's list: valid, named, no two with the same name, at most MAX_CUSTOM_BACKGROUNDS. */
export function normalizeCustomBackgrounds(list) {
  const seen = new Set();
  const out = [];
  for (const b of Array.isArray(list) ? list : []) {
    const n = normalizeCustomBackground(b);
    const key = n.name.toLowerCase();
    if (!n.name || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= MAX_CUSTOM_BACKGROUNDS) break;
  }
  return out;
}

/**
 * The backgrounds a sheet can pick for the campaign's edition: the DM's own
 * first (marked custom), then the edition's book ones (and Glory of the
 * Giants'), by name. A 2024 game also lists nothing of 2014's (its
 * backgrounds were rewritten), and the other way round.
 */
export function backgroundsFor(edition = '2014', custom = []) {
  const ed = edition === '2024' ? '2024' : '2014';
  const own = normalizeCustomBackgrounds(custom).map((b) => ({ ...b, edition: null, book: 'Your DM', custom: true }));
  const books = BOOK_BACKGROUNDS.filter((b) => b.edition === ed || b.edition === null).sort((a, b) => a.name.localeCompare(b.name));
  return [...own, ...books.filter((b) => !own.some((o) => o.name.toLowerCase() === b.name.toLowerCase()))];
}

/** A background by what's typed (any case, extra spaces): the DM's, else this edition's, else the other edition's. */
export function findBackground(name, { edition = '2014', custom = [] } = {}) {
  const key = String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  const match = (b) => b.name.toLowerCase() === key;
  return backgroundsFor(edition, custom).find(match) ?? BOOK_BACKGROUNDS.find(match) ?? null;
}

/** The three abilities a 2024 background raises (the point buy calculator), or null. */
export function backgroundAbilities(name, { custom = [] } = {}) {
  const b = findBackground(name, { edition: '2024', custom });
  return b?.abilities?.length === 3 ? [...b.abilities] : null;
}

const listAnd = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '');
const skillNames = (keys) => keys.map((k) => SKILLS[k]?.name ?? k);
const abilityList = (keys) => listAnd(keys.map((a) => ABILITY_NAMES[a]));

/** What a background gives, as short lines for the sheet's help: [{ label, text }]. */
export function backgroundSummary(b) {
  if (!b) return [];
  const lines = [];
  if (b.abilities?.length === 3) lines.push({ label: 'Ability scores', text: `${abilityList(b.abilities)}: +2 to one and +1 to another, or +1 to all three (the Point buy box uses these)` });
  if (b.feat) lines.push({ label: b.edition === '2024' || b.custom ? 'Origin feat' : 'Feat', text: b.feat });
  if (b.skills?.length) lines.push({ label: 'Skill proficiencies', text: listAnd(skillNames(b.skills)) });
  if (b.tools) lines.push({ label: 'Tool proficiencies', text: b.tools });
  if (b.languages) lines.push({ label: 'Languages', text: b.languages });
  else if (b.edition === '2024') lines.push({ label: 'Languages', text: LANGUAGES_2024 });
  if (b.equipment || b.gold) lines.push({ label: 'Equipment', text: `${[b.equipment, b.gold ? `${b.gold} ${b.edition === '2024' ? 'GP' : 'gp'}` : ''].filter(Boolean).join(b.equipment && b.edition !== '2024' ? ' containing ' : ', ')}${b.edition === '2024' ? '; or 50 GP instead' : ''}` });
  if (b.feature) lines.push({ label: `Feature: ${b.feature.name}`, text: b.feature.text });
  if (b.note) lines.push({ label: 'Note', text: b.note });
  return lines;
}

const hasLine = (box, needle) => String(box ?? '').toLowerCase().includes(String(needle).toLowerCase());
const addLine = (box, line) => (String(box ?? '').trim() ? `${String(box).replace(/\s+$/, '')}\n${line}` : line);

/**
 * Apply a background to a sheet, filling only what's empty and never
 * overwriting what the player typed. Returns { sheet (a new one), changes:
 * [plain sentences: what it did], notes: [what's left to the player] }.
 * - skills not yet proficient are ticked (expertise stays);
 * - its feature (2014) or feat goes into Features & traits, unless it's there already;
 * - tools and languages go into Other proficiencies & languages, unless they're there;
 * - Equipment is filled only when it's empty, and gold set only when the purse is empty.
 */
export function applyBackground(sheet, b) {
  const out = structuredClone(sheet);
  const changes = [];
  const notes = [];
  if (!b) return { sheet: out, changes, notes };
  out.skills ??= {};
  const ticked = (b.skills ?? []).filter((k) => !out.skills[k]);
  for (const k of ticked) out.skills[k] = 'proficient';
  if (ticked.length) changes.push(`Ticked ${listAnd(skillNames(ticked))}.`);
  const feats = [];
  if (b.feature && !hasLine(out.features, b.feature.name)) feats.push(`${b.feature.name} (${b.name} background). ${b.feature.text}`.trim());
  if (b.feat && !hasLine(out.features, b.feat)) feats.push(`${b.edition === '2024' || b.custom ? 'Origin feat' : 'Feat'}: ${b.feat} (${b.name} background).`);
  for (const f of feats) out.features = addLine(out.features, f);
  if (feats.length) changes.push(`Added ${listAnd([b.feature && !hasLine(sheet.features, b.feature.name) ? b.feature.name : null, b.feat && !hasLine(sheet.features, b.feat) ? b.feat : null].filter(Boolean))} to Features & traits.`);
  const profs = [];
  if (b.tools && !hasLine(out.proficiencies_languages, b.tools)) profs.push(`Tools: ${b.tools} (${b.name}).`);
  if (b.languages && !hasLine(out.proficiencies_languages, b.languages)) profs.push(`Languages: ${b.languages} (${b.name}).`);
  for (const p of profs) out.proficiencies_languages = addLine(out.proficiencies_languages, p);
  if (profs.length) changes.push(`Added ${listAnd([b.tools && profs.some((p) => p.startsWith('Tools')) ? 'tool proficiencies' : null, b.languages && profs.some((p) => p.startsWith('Languages')) ? 'languages' : null].filter(Boolean))} to Other proficiencies & languages.`);
  if (b.equipment && !String(out.equipment ?? '').trim()) {
    out.equipment = `${b.equipment} (${b.name} background).`;
    changes.push('Filled in Equipment.');
  }
  const purse = out.coins ?? {};
  if (b.gold && !['cp', 'sp', 'ep', 'gp', 'pp'].some((c) => Number(purse[c]) > 0)) {
    out.coins = { ...purse, gp: b.gold };
    changes.push(`Set your gold to ${b.gold} gp.`);
  }
  if (b.abilities?.length === 3) notes.push(`Raise ${abilityList(b.abilities)}: +2 to one and +1 to another, or +1 to each (the Point buy box can do it).`);
  if (/choice|choose|one type|one kind|any/i.test(`${b.tools} ${b.languages}`)) notes.push('Pick the tools and languages it lets you choose, and write them in Other proficiencies & languages.');
  return { sheet: out, changes, notes };
}
