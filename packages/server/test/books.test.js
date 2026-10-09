import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, createFakeLLM, makePdf } from './helpers.js';
import { createBooks, bookTitle } from '../src/sheets/books.js';
import { joinItems } from '../src/sheets/pdf.js';
import { createQA, groupEdition } from '../src/qa/agent.js';

/** A cover, then four numbered pages (printed page = PDF page - 1). */
const HANDBOOK = [
  ["PLAYER'S HANDBOOK"],
  ['CHAPTER 9 | COMBAT', 'MAKING AN ATTACK', 'When you take the Attack action, you make one melee or ranged attack.', '1'],
  [
    'OPPORTUNITY ATTACKS',
    'You can make an opportunity attack when a hostile creature that you can see moves out of your reach.',
    'You can avoid provoking an opportunity attack by taking the Disengage action.',
    '2',
  ],
  ['CONDITIONS', 'Grappled', "A grappled creature's speed becomes 0.", '3'],
  ['SPELLS', 'A creature that takes the Disengage action avoids any oppor-', 'tunity attack for the rest of the turn.', '4'],
];
const BESTIARY = [['Introduction'], ['Brown Bear', 'Large beast, unaligned'], ['Wolf', 'Medium beast, unaligned']];

function shelf() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-books-'));
  fs.writeFileSync(path.join(dir, 'Players Handbook.pdf'), makePdf(HANDBOOK));
  fs.writeFileSync(path.join(dir, 'Monster Manual.pdf'), makePdf(BESTIARY, { bookmarks: [{ title: 'Beasts', page: 2 }, { title: 'Wolves', page: 3 }] }));
  return { dir, books: createBooks({ dir, log: {} }), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('books: keyword search over pages, best page first, with printed page numbers', async () => {
  const { books, cleanup } = shelf();
  try {
    await books.load();
    assert.deepEqual(
      books.status().books.map((b) => [b.title, b.range]),
      [['Monster Manual', '1-3'], ['Players Handbook', '0-4']],
    );

    const hits = await books.search(['opportunity attack', 'out of your reach', 'Disengage']);
    assert.equal(hits[0].book, 'Players Handbook');
    assert.equal(hits[0].page, 2);
    assert.match(hits[0].snippet, /opportunity attack/);
    // A word hyphenated across two lines is still found.
    assert.ok(hits.some((h) => h.page === 4));
    assert.ok(!hits.some((h) => h.page === 3));

    // Plurals and case don't matter; a book can be named loosely.
    assert.equal((await books.search(['GRAPPLED creature'], { book: 'handbook' }))[0].page, 3);
    assert.equal((await books.search(['brown bear'], { book: 'monster manual' }))[0].page, 2);
    assert.deepEqual(await books.search(['brown bear'], { book: 'Players Handbook' }), []);
    assert.deepEqual(await books.search(['x', '  ']), []);
  } finally {
    cleanup();
  }
});

test('books: reading pages and the table of contents (bookmarks, else headings)', async () => {
  const { books, cleanup } = shelf();
  try {
    const read = await books.readPages('players handbook', 2);
    assert.equal(read.pages.length, 1);
    assert.equal(read.pages[0].page, 2);
    assert.match(read.pages[0].text, /Disengage action/);
    assert.deepEqual((await books.readPages('Players Handbook', 3, 2)).pages.map((p) => p.page), [3, 4]);
    assert.match((await books.readPages('Players Handbook', 99)).error, /pages 0-4/);
    assert.match((await books.readPages("Dungeon Master's Guide", 1)).error, /The books are: Monster Manual; Players Handbook/);

    const headings = await books.contents('Players Handbook');
    assert.equal(headings.from, 'headings');
    assert.deepEqual(headings.entries.find((e) => e.page === 1), { page: 1, title: 'Chapter 9 | Combat', depth: 0 });
    assert.ok(headings.entries.some((e) => e.page === 2 && e.title === 'Opportunity Attacks'));
    const page2 = await books.contents('Players Handbook', { fromPage: 2, toPage: 2 });
    assert.deepEqual(page2.entries.map((e) => e.title), ['Opportunity Attacks']);

    const bookmarks = await books.contents('Monster Manual');
    assert.equal(bookmarks.from, 'bookmarks');
    assert.deepEqual(bookmarks.entries, [{ title: 'Beasts', page: 2, depth: 0 }, { title: 'Wolves', page: 3, depth: 0 }]);
  } finally {
    cleanup();
  }
});

test('Q&A can search, read and browse the books; without books it has no book tools', async () => {
  const llm = createFakeLLM({
    qaScript: [
      [
        { tool: 'search_books', input: { terms: ['opportunity attack', 'out of your reach', 'Disengage'], book: null } },
        { tool: 'read_book', input: { book: 'Players Handbook', page: 2, count: null } },
        { tool: 'book_contents', input: { book: 'Monster Manual', from_page: null, to_page: null } },
        { answer: 'Yes, when it moves out of your reach, unless it took the Disengage action (Players Handbook p. 2).' },
      ],
    ],
  });
  const t = await setup({ llm });
  try {
    fs.mkdirSync(t.config.booksDir, { recursive: true });
    fs.writeFileSync(path.join(t.config.booksDir, 'Players Handbook.pdf'), makePdf(HANDBOOK));
    fs.writeFileSync(path.join(t.config.booksDir, 'Monster Manual.pdf'), makePdf(BESTIARY, { bookmarks: [{ title: 'Beasts', page: 2 }] }));

    const res = await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { as: t.sam.token, body: { question: 'Can I hit the goblin running away from me?' } });
    assert.equal(res.statusCode, 200);
    const call = llm.calls.find((c) => c.purpose === 'qa');
    assert.ok(['search_books', 'read_book', 'book_contents'].every((n) => call.tools.includes(n)));
    assert.match(call.system, /<books [^>]*>\n- Monster Manual \(pages 1-3\)\n- Players Handbook \(pages 0-4\)\n<\/books>/);
    assert.match(call.system, /Never search with the player's sentence/);

    const [search, read, contents] = call.toolResults;
    assert.match(search.result, /^--- \(Players Handbook p\. 2\)\nOPPORTUNITY ATTACKS/);
    assert.match(read.result, /^--- \(Players Handbook p\. 2\)\n[\s\S]*Disengage action/);
    assert.match(contents.result, /Monster Manual \(the PDF's bookmarks\):\np\. 2: Beasts/);
    // Book pages aren't campaign citations: no transcript evidence.
    assert.deepEqual(JSON.parse(t.db.prepare('SELECT evidence FROM qa_log').get().evidence), []);
  } finally {
    await t.cleanup();
  }

  const bare = await setup({ llm: createFakeLLM({ qaScript: [[{ answer: 'Standard rules.' }]] }) });
  try {
    await bare.request('POST', `/campaigns/${bare.campaign.id}/ask`, { as: bare.sam.token, body: { question: 'How does grappling work?' } });
    const call = bare.llm.calls.find((c) => c.purpose === 'qa');
    assert.ok(!call.tools.includes('search_books'));
    assert.doesNotMatch(call.system, /<books/);
  } finally {
    await bare.cleanup();
  }
});

test('books: PDF text pieces are joined by position, so OCR layers read as words', () => {
  const at = (str, x, { y = 700, w = str.length * 5, eol = false } = {}) => ({ str, transform: [10, 0, 0, 10, x, y], width: w, height: 10, hasEOL: eol });
  const items = [
    at('H', 36, { w: 13 }), at('eavy', 49), at(' ', 69, { w: 12 }), at('rain', 81, { eol: true }),
    at('doesn', 36, { y: 686 }), at('’', 61, { y: 686, w: 2 }), at('t', 63, { y: 686, w: 3 }), at('stop', 80, { y: 686 }),
  ];
  assert.equal(joinItems(items), 'Heavy rain\ndoesn’t stop');
});

test('books: titles, printed years, footer page numbers, short terms, headings, ambiguous names', async () => {
  assert.equal(bookTitle('Dungeon Masters Guide (2024) -- Christopher Perkins -- 2024 -- Wizards of the Coast -- Anna’s Archive.pdf'), 'Dungeon Masters Guide (2024)');
  assert.equal(bookTitle('Players_Handbook.pdf'), 'Players Handbook');

  const footer = (n, lines) => [...lines, `CHAPTER 2 | RUNNING THE GAME ${n}`];
  const guide = [
    ['DUNGEON MASTER’S GUIDE', 'First Printing: November 2024'],
    footer(1, ['Weather', 'Heavy Precip itati on', 'Everything within an area of heavy rain is Lightly Obscured.']),
    footer(2, ['Grids', 'Use a hex grid. Each hex is 5 feet; a hex here, a hex there. Hexes everywhere.']),
    footer(3, ['HEX', 'You place a curse on a creature. Its action is hindered.']),
    footer(4, ['Armor', 'Your AC is 10 plus your Dexterity modifier.']),
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-books-'));
  fs.writeFileSync(path.join(dir, 'Dungeon Masters Guide (2024) -- Some Authors -- Anna’s Archive.pdf'), makePdf(guide));
  fs.writeFileSync(path.join(dir, 'Players Handbook (2014).pdf'), makePdf(HANDBOOK));
  fs.writeFileSync(path.join(dir, 'Players Handbook (2024).pdf'), makePdf(HANDBOOK));
  const books = createBooks({ dir, log: {} });
  try {
    await books.load();
    const dmg = books.status().books.find((b) => b.title === 'Dungeon Masters Guide (2024)');
    assert.equal(dmg.year, 2024);
    // Numbers in running footers ("... THE GAME 45") give the printed page numbers.
    assert.equal(dmg.range, '0-4');

    // A heading the OCR split inside words is still found, and "precipitation" matches it.
    assert.equal((await books.search(['heavy precipitation'], { book: 'dungeon' }))[0]?.page, 1);
    // A heading that is the term beats a page that only says it often.
    assert.deepEqual((await books.search(['hex'], { book: 'dungeon' })).map((h) => h.page), [3, 2]);
    // Short terms are whole words: "AC" doesn't find "action".
    assert.deepEqual((await books.search(['AC'], { book: 'dungeon' })).map((h) => h.page), [4]);

    // "Players Handbook" could be either edition: say so instead of picking one, or of finding nothing.
    assert.match((await books.search(['grappled'], { book: 'Players Handbook' })).error, /could be Players Handbook \(2014\) or Players Handbook \(2024\)/);
    assert.match((await books.readPages('players handbook', 2)).error, /Give the full title/);
    assert.match((await books.search(['grappled'], { book: 'Monster Manual' })).error, /No book called "Monster Manual"\. The books are:/);
    assert.equal((await books.search(['grappled'], { book: 'Players Handbook (2024)' }))[0].book, 'Players Handbook (2024)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('books: spells in the 2024 layout are found; class sections that look like spells are not', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-books-'));
  fs.writeFileSync(
    path.join(dir, 'Players Handbook (2024).pdf'),
    makePdf([
      ['ARCANE TRICKSTER SPELLCASTING', '3rd-level feature, chosen from the wizard list.', 'You learn three cantrips.', 'Spell slots.', 'The table shows them.', 'You regain them.', 'Spells known.', 'Spellcasting ability.'],
      ['FIREBALL', 'Level 3 Evocation (Sorcerer, Wizard)', 'Casting Time: Action', 'A bright streak flashes.'],
    ]),
  );
  const books = createBooks({ dir, log: {} });
  try {
    assert.deepEqual((await books.spellNames()).map((s) => s.name), ['Fireball']);
    assert.match((await books.findSpell('fireball')).text, /Level 3 Evocation[\s\S]*bright streak/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Q&A: the books' editions and a long contents trimmed to its chapters", async () => {
  assert.match(groupEdition([{ title: 'Players Handbook 5th Edition DD', year: 2014 }]), /the 2014 one, so answer with the 2014 rules/);
  assert.match(groupEdition([{ title: "Player's Handbook (2014)" }, { title: "Player's Handbook (2024)" }]), /both editions/);
  assert.match(groupEdition([{ title: 'Monster Manual' }]), /unknown/);

  const sections = Array.from({ length: 400 }, (_, i) => ({ title: `A rather long section heading number ${i}`, page: 2 }));
  const llm = createFakeLLM({
    qaScript: [[{ tool: 'book_contents', input: { book: 'Monster Manual', from_page: null, to_page: null } }, { answer: 'Chapter 1.' }]],
  });
  const t = await setup({ llm });
  try {
    fs.mkdirSync(t.config.booksDir, { recursive: true });
    const pdf = makePdf([...BESTIARY, ['First Printing: February 2025']], { bookmarks: [{ title: 'Beasts', page: 2 }] });
    fs.writeFileSync(path.join(t.config.booksDir, 'Monster Manual.pdf'), pdf);
    const books = createBooks({ dir: t.config.booksDir, log: {} });
    const many = { ...books, contents: async () => ({ book: 'Monster Manual', from: 'bookmarks', entries: [{ title: 'Chapter 1', page: 1, depth: 0 }, ...sections.map((s) => ({ ...s, depth: 1 }))] }) };
    await createQA({ ...t, books: many }).ask({ campaignId: t.campaign.id, userId: t.sam.id, question: 'What is in the Monster Manual?' });
    const call = llm.calls.find((c) => c.purpose === 'qa');
    assert.match(call.system, /- Monster Manual \(first printed 2025, pages 1-4\)/);
    assert.match(call.toolResults[0].result, /p\. 1: Chapter 1\n\(Deeper headings hidden to fit/);
  } finally {
    await t.cleanup();
  }
});

test('books: creatures\' stat blocks are found in the 2014 and 2024 layouts, by name, "Goblin 3" or "a goblin"', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-books-'));
  fs.writeFileSync(
    path.join(dir, 'Monster Manual.pdf'),
    makePdf([
      ['GOBLINS', 'Goblins are small, black-hearted humanoids.', 'Small humanoids that lair in caves.'],
      ['GOBLIN', 'Small humanoid (goblinoid), neutral evil', 'Armor Class 15 (leather armor, shield)', 'Hit Points 7 (2d6)', 'Speed 30 ft.', 'Nimble Escape.', 'HOBGOBLIN', 'Medium humanoid (goblinoid), lawful evil', 'Armor Class 18 (chain mail, shield)', 'Hit Points 11 (2d8 + 2)'],
    ]),
  );
  fs.writeFileSync(
    path.join(dir, 'Monster Manual (2025).pdf'),
    makePdf([['Owlbear', 'Large Monstrosity, Unaligned', 'AC 13 Initiative +1 (11)', 'HP 59 (7d10 + 21)', 'Speed 40 ft., Climb 40 ft.']]),
  );
  const books = createBooks({ dir, log: {} });
  try {
    const goblin = await books.findCreature('Goblin 3');
    assert.equal(goblin.name, 'Goblin');
    assert.equal(goblin.book, 'Monster Manual');
    assert.match(goblin.text, /Armor Class 15[\s\S]*Nimble Escape/);
    assert.doesNotMatch(goblin.text, /HOBGOBLIN/, 'stops at the next creature');
    assert.equal((await books.findCreature('a hobgoblin')).name, 'Hobgoblin');
    assert.match((await books.findCreature('owlbear')).text, /AC 13[\s\S]*7d10/);
    assert.equal((await books.findCreature('Goblins')).page, 2, 'the stat block, not the lore page before it');
    assert.equal(await books.findCreature('Ember Wyrmling'), null);
    assert.equal(await books.findSpell('Goblin'), null, 'creatures are not spells');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
