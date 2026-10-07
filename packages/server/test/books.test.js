import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, createFakeLLM, makePdf } from './helpers.js';
import { createBooks } from '../src/sheets/books.js';

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
