/**
 * Reviewing a character sheet (the Review sheet button): free rules checks on
 * the server, then the AI against the group's books (fake AI here).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, makePdf } from './helpers.js';
import { config as baseConfig } from '../src/config.js';
import { sheetChecks, sheetForReview } from '../src/sheets/review.js';
import { emptySheet, normalizeSheet } from '@dndapp/shared/sheet.js';

const sheetOf = (over) => normalizeSheet({ ...emptySheet(), ...over });
const areas = (findings) => findings.map((f) => `${f.severity} ${f.area}`);

test('sheet review checks: a valid sheet has nothing to report', () => {
  const sheet = sheetOf({
    race: 'High Elf', xp: '6500',
    classes: [{ name: 'Wizard', subclass: 'Evocation', level: 5 }],
    abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 },
    skills: { arcana: 'proficient', history: 'proficient' },
    spells: [{ name: 'Fireball', level: 3 }, { name: 'Fire Bolt', level: 0 }],
  });
  assert.deepEqual(sheetChecks(sheet), []);
});

test('sheet review checks: levels, XP, scores, multiclassing, spells too high, expertise and typed-over numbers', () => {
  const sheet = sheetOf({
    xp: '2,700',
    classes: [{ name: 'Fighter', level: 2 }, { name: 'Wizard', level: 1 }],
    abilities: { str: 15, dex: 10, con: 14, int: 10, wis: 10, cha: 22 },
    skills: { stealth: 'expertise' },
    spells: [{ name: 'Fireball', level: 3 }],
    overrides: { proficiency_bonus: 3, hp_max: 99, 'save_prof.wis': true, 'slots.1': 4 },
  });
  const found = sheetChecks(sheet);
  assert.deepEqual(areas(found), [
    'check Experience', // 2700 XP is level 4, the sheet is level 3
    'check Ability scores', // Charisma 22
    'problem Multiclassing', // wizard needs Int 13
    'check Spells', // Fireball with only 1st-level slots
    'check Skills', // expertise without a rogue or bard
    'problem Proficiency bonus',
    'check Spell slots',
    'check Saving throws',
    'check Hit points',
  ]);
  assert.match(found[0].message, /enough for level 4/);
  assert.match(found[2].message, /Wizard needs Intelligence of 13/);
  assert.match(found[3].message, /highest spell slots are 1st level.*Fireball \(3rd\)/);
  assert.ok(found.every((f) => f.source === "The sheet's rules"));
  // Milestone groups: no XP check.
  assert.ok(!areas(sheetChecks(sheetOf({ xp: 'milestone', classes: [{ name: 'Rogue', level: 3 }] }))).includes('check Experience'));
});

test('sheet review: the rules checks plus the AI reading the books; only your own sheet, and not for the DM', async () => {
  const llm = createFakeLLM({
    qaScript: [[
      { tool: 'search_books', input: { terms: ['Fighting Style'], book: null } },
      { tool: 'submit_review', input: { summary: 'Mostly fine.', findings: [{ severity: 'problem', area: 'Class features', message: 'A 1st-level fighter has no Action Surge yet.', source: 'Players Handbook p. 1' }] } },
      { answer: 'Done.' },
    ]],
  });
  const t = await setup({ llm });
  try {
    fs.mkdirSync(t.config.booksDir, { recursive: true });
    fs.writeFileSync(path.join(t.config.booksDir, 'Players Handbook.pdf'), makePdf([['FIGHTER', 'Fighting Style', 'Action Surge starting at 2nd level']]));
    const url = `/campaigns/${t.campaign.id}/sheet/review`;

    // Nothing to review before the sheet is saved.
    assert.equal((await t.request('POST', url, { as: t.sam.token })).statusCode, 400);

    const sheet = sheetOf({ name: 'Thorin', classes: [{ name: 'Fighter', level: 1 }], features: 'Action Surge', backstory: 'A long secret past', overrides: { proficiency_bonus: 4 } });
    await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet, version: 0 } });
    const res = await t.request('POST', url, { as: t.sam.token });
    assert.equal(res.statusCode, 200);
    const review = res.json();
    assert.equal(review.ai, true);
    assert.equal(review.summary, 'Mostly fine.');
    assert.deepEqual(areas(review.findings), ['problem Proficiency bonus', 'problem Class features']);
    assert.equal(review.edition, '2014');
    assert.equal(review.lookups.books, 1);

    const call = llm.calls.at(-1);
    assert.equal(call.purpose, 'sheet-review');
    assert.deepEqual(call.tools, ['search_books', 'read_book', 'book_contents', 'look_up_online', 'submit_review']);
    assert.match(call.prompt, /Classes: Fighter 1/);
    assert.match(call.prompt, /Features and traits: Action Surge/);
    assert.match(call.prompt, /<already_checked>\n- Proficiency bonus/);
    assert.match(call.prompt, /- Players Handbook/);
    assert.doesNotMatch(call.prompt, /secret past/); // the backstory isn't rules
    assert.match(call.toolResults[0].result, /Fighting Style/);

    // The DM has no sheet to review.
    assert.equal((await t.request('POST', url, { as: t.dmToken })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('sheet review: web lookups only through the tool, a few at most; the free checks still come back when the AI is out', async () => {
  const llm = createFakeLLM({
    research: async ({ prompt }) => `Echo Knight: ${prompt}. https://example.com/echo`,
    qaScript: [[
      { tool: 'look_up_online', input: { question: 'Echo Knight features' } },
      { tool: 'look_up_online', input: { question: 'again' } },
      { tool: 'submit_review', input: { summary: 'Fine.', findings: [] } },
      { answer: 'Done.' },
    ]],
  });
  const t = await setup({ llm, config: { sheets: { ...baseConfig.sheets, reviewWebLookups: 1, aiPerHour: 1 } } });
  try {
    const sheet = sheetOf({ classes: [{ name: 'Fighter', subclass: 'Echo Knight', level: 3 }], overrides: { proficiency_bonus: 5 } });
    await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet, version: 0 } });
    const url = `/campaigns/${t.campaign.id}/sheet/review`;
    const first = (await t.request('POST', url, { as: t.sam.token })).json();
    assert.equal(first.ai, true);
    assert.equal(first.lookups.web, 1);
    const call = llm.calls.find((c) => c.purpose === 'sheet-review');
    assert.deepEqual(call.tools, ['look_up_online', 'submit_review']); // no books, no book tools
    assert.match(call.toolResults[1].result, /No more web lookups/);
    assert.equal(llm.calls.filter((c) => c.purpose === 'sheet-review:web').length, 1);

    // Over the hourly limit: the rules checks still come back, with why the AI didn't run.
    const second = (await t.request('POST', url, { as: t.sam.token })).json();
    assert.equal(second.ai, false);
    assert.match(second.error, /a lot of sheet lookups/);
    assert.deepEqual(areas(second.findings), ['problem Proficiency bonus']);
  } finally {
    await t.cleanup();
  }
});

test('sheet review: the sheet as the AI sees it lists gear proficiency, spells and typed-over numbers', () => {
  const text = sheetForReview(sheetOf({
    classes: [{ name: 'Cleric', subclass: 'Life', level: 3 }],
    spells: [{ name: 'Bless', level: 1, prepared: true }, { name: 'My Spell', level: 2, source: 'custom' }],
    inventory: [{ name: 'Chain mail', kind: 'armor', equipped: true, proficient: false, armor: { type: 'heavy', base: 16, strength: 13, stealth: true } }],
    overrides: { ac: 20 },
  }));
  assert.match(text, /Bless \(1st level, prepared\)/);
  assert.match(text, /My Spell \(2nd level, the player's own homebrew\)/);
  assert.match(text, /Chain mail, equipped, not proficient/);
  assert.match(text, /ac 20 \(automatic 16\)/);
});
