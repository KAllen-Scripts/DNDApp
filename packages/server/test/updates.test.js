/**
 * Between sessions the archivist reads character sheets (the whole sheet the
 * first time, then each change with when it happened), notes written, edited
 * or deleted after their session was processed, and handouts (kb/updates.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, defaultArchivist, SAMPLE } from './helpers.js';
import { sheetChanges, sheetText, localTime } from '../src/kb/updates.js';
import { emptySheet, normalizeSheet } from '@dndapp/shared/sheet.js';

const archivistCalls = (t) => t.llm.calls.filter((c) => c.purpose.startsWith('archivist:'));
const updateCalls = (t) => t.llm.calls.filter((c) => c.purpose === 'archivist:updates');

function sheetFor(over = {}) {
  return normalizeSheet({ ...emptySheet({ name: 'Thorin', player_name: 'Sam' }), classes: [{ name: 'Fighter', subclass: '', level: 3 }], race: 'Hill Dwarf', ...over });
}

test('sheetChanges: the first save is the whole sheet; later saves are changes with their time; quick saves of one field merge', () => {
  const s0 = sheetFor();
  const at = (min) => new Date(Date.UTC(2026, 9, 8, 12, min)).toISOString();
  const entries = [
    { version: 1, saved_at: at(0), changes: [{ p: [], v: s0 }] },
    { version: 2, saved_at: at(30), changes: [{ p: ['backstory'], v: 'Raised by' }] },
    { version: 3, saved_at: at(31), changes: [{ p: ['backstory'], v: 'Raised by monks.' }] },
    { version: 4, saved_at: at(90), changes: [{ p: ['classes', 0, 'level'], v: 4 }] },
    { version: 5, saved_at: at(95), changes: [{ p: ['coins', 'gp'], v: 50 }] },
    { version: 6, saved_at: at(96), changes: [{ p: ['coins', 'gp'], v: 0 }] },
  ];
  const all = sheetChanges(entries, { since: '1970-01-01T00:00:00.000Z', until: at(200) });
  assert.equal(all.before, null);
  assert.deepEqual(all.changes.map((c) => (c.created ? 'created' : `${c.field}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)} @${c.at.slice(11, 16)}`)), [
    'created',
    'backstory: "" -> "Raised by monks." @12:31',
    'classes[Fighter].level: 3 -> 4 @13:30',
    // 50 gold then back to 0 within minutes: no change at all.
  ]);
  assert.equal(all.after.classes[0].level, 4);

  // From a later point: the sheet was read before, so only what came after.
  const later = sheetChanges(entries, { since: at(60), until: at(200) });
  assert.equal(later.before.backstory, 'Raised by monks.');
  assert.deepEqual(later.changes.map((c) => c.field), ['classes[Fighter].level']);
  // Up to a point: later saves are left for next time.
  assert.equal(sheetChanges(entries, { since: at(60), until: at(80) }).changes.length, 0);
});

test('sheetText: what the player entered plus the numbers worked out from it', () => {
  const text = sheetText(sheetFor({ abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, spells: [{ name: 'Shield', level: 1, prepared: true }], backstory: 'Exiled from the mountain.' }));
  assert.match(text, /Character: Thorin/);
  assert.match(text, /Classes: Fighter 3 \(level 3\)/);
  assert.match(text, /Strength 16/);
  assert.match(text, /Hit points: \d+ of \d+/);
  assert.match(text, /Spells: Shield \(level 1, prepared\)/);
  assert.match(text, /backstory: Exiled from the mountain\./);
});

test('a new sheet and its changes reach the archivist with their times, once the player stops editing', async () => {
  const t = await setup({ config: { archivist: { ...(await import('../src/config.js')).config.archivist, updatesDelayMinutes: 0.002 } } });
  try {
    const url = `/campaigns/${t.campaign.id}/sheet`;
    const first = await t.request('PUT', url, { as: t.sam.token, body: { sheet: sheetFor(), version: 0 } });
    assert.equal(first.statusCode, 200, first.body);
    await t.request('PUT', url, { as: t.sam.token, body: { sheet: sheetFor({ backstory: 'Exiled from the mountain.' }), version: 1 } });
    // The quiet spell passes, then the job runs.
    for (let i = 0; !updateCalls(t).length && i < 100; i++) await new Promise((r) => setTimeout(r, 20));
    await t.jobs.idle();
    assert.equal(updateCalls(t).length, 1);
    const { prompt, system } = updateCalls(t)[0];
    assert.match(system, /Character sheets: each player's own sheet/);
    assert.match(prompt, new RegExp(`<character_sheet user="${t.sam.id}" player="Sam" plays="Thorin">`));
    assert.match(prompt, /New sheet, first saved \d{4}-\d\d-\d\d \d\d:\d\d\./);
    assert.match(prompt, /Character: Thorin/);
    assert.match(prompt, /backstory: Exiled from the mountain\./);

    // A later change: only that change, with its time, and the sheet as it is now.
    const saved = await t.request('PUT', url, { as: t.sam.token, body: { sheet: sheetFor({ backstory: 'Exiled from the mountain.', classes: [{ name: 'Fighter', subclass: '', level: 4 }] }), version: 2 } });
    for (let i = 0; updateCalls(t).length < 2 && i < 100; i++) await new Promise((r) => setTimeout(r, 20));
    await t.jobs.idle();
    const second = updateCalls(t)[1].prompt;
    assert.match(second, /You have read this sheet before\. Changes since then, oldest first:/);
    assert.ok(second.includes(`[${localTime(saved.json().updated_at)}] classes[Fighter].level: 3 → 4`), second);
    assert.doesNotMatch(second, /backstory: "" →/);

    // A sheet the DM saved before the DM had Creatures isn't a player's: nothing for the archivist.
    t.sheets.save(t.campaign.id, t.dm.id, sheetFor({ name: 'Old DM sheet' }), { baseVersion: 0 });
    assert.equal(t.updates.pendingSince(t.campaign.id), false);
    // Nothing new: no AI call.
    t.jobs.enqueueUpdates(t.campaign.id);
    await t.jobs.idle();
    assert.equal(updateCalls(t).length, 2);
  } finally {
    await t.cleanup();
  }
});

test('notes changed after their session was processed reach the archivist; notes for sessions not yet processed wait for them', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}`;
    const note = (await t.request('POST', `${base}/notes`, { as: t.sam.token, body: { text: 'The innkeeper is Brother Hall.', session_date: '2026-10-01' } })).json();
    await t.request('POST', `${base}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    await t.jobs.idle();
    const seen = archivistCalls(t).length;

    // Nothing changed since: nothing to read.
    t.jobs.enqueueUpdates(t.campaign.id);
    await t.jobs.idle();
    assert.equal(archivistCalls(t).length, seen);

    await t.request('PATCH', `${base}/notes/${note.id}`, { as: t.sam.token, body: { text: 'The innkeeper is Brother Hal.' } });
    await t.request('POST', `${base}/notes`, { as: t.alex.token, body: { text: 'Lyra kept the silver key.', session_date: '2026-10-01' } });
    await t.request('POST', `${base}/notes`, { as: t.alex.token, body: { text: 'For a later session.', session_date: '2026-10-09' } });
    t.jobs.enqueueUpdates(t.campaign.id);
    await t.jobs.idle();
    const { prompt } = updateCalls(t).at(-1);
    const block = /<note_changes>\n([\s\S]*?)\n<\/note_changes>/.exec(prompt)[1].split('\n');
    assert.equal(block.length, 2, prompt);
    assert.match(block[0], new RegExp(`user ${t.sam.id} \\(Sam\\) edited their note \\[note S1 Sam\\] from "The innkeeper is Brother Hall\\." to "The innkeeper is Brother Hal\\."`));
    assert.match(block[1], new RegExp(`user ${t.alex.id} \\(Alex\\) added a note to the session of 2026-10-01 \\[note S1 Alex\\]: "Lyra kept the silver key\\."`));
    assert.doesNotMatch(prompt, /For a later session/);

    // Deleted: the archivist is told to drop what only that note supported.
    await t.request('DELETE', `${base}/notes/${note.id}`, { as: t.sam.token });
    t.jobs.enqueueUpdates(t.campaign.id);
    await t.jobs.idle();
    assert.match(updateCalls(t).at(-1).prompt, /deleted their note \[note S1 Sam\]: "The innkeeper is Brother Hal\."\. Remove anything only this note supported\./);
    // And the deleted note is gone from what the archivist reads for that session.
    assert.ok(!t.store.playerNotes(t.campaign.id, { date: '2026-10-01' }).some((n) => n.id === note.id));
  } finally {
    await t.cleanup();
  }
});

test('handouts reach the archivist with who got them', async () => {
  const t = await setup();
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/handouts`, { body: { title: 'Letter from the Baron', text: 'Meet me at the mill.', to: [t.sam.id] } });
    t.jobs.enqueueUpdates(t.campaign.id);
    await t.jobs.idle();
    const { prompt } = updateCalls(t).at(-1);
    assert.match(prompt, new RegExp(`<handout title="Letter from the Baron" given="[\\d-]+ [\\d:]+" to="user ${t.sam.id} \\(Sam\\)">\\nMeet me at the mill\\.\\n</handout>`));
  } finally {
    await t.cleanup();
  }
});

test('a rebuild replays sheet changes in time order around the sessions', async () => {
  const llm = createFakeLLM({ archivist: defaultArchivist });
  const t = await setup({ llm });
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    await t.jobs.idle();
    t.sheets.save(t.campaign.id, t.sam.id, sheetFor());
    t.jobs.enqueueUpdates(t.campaign.id);
    await t.jobs.idle();
    const before = archivistCalls(t).map((c) => c.purpose);
    assert.deepEqual(before, ['archivist:session 1', 'archivist:updates']);

    t.jobs.enqueueRebuild(t.campaign.id);
    await t.jobs.idle();
    // The sheet was made after session 1 was played, so it's read after it again.
    assert.deepEqual(archivistCalls(t).map((c) => c.purpose).slice(before.length), ['archivist:session 1', 'archivist:updates']);
    assert.match(updateCalls(t).at(-1).prompt, /New sheet, first saved/);
  } finally {
    await t.cleanup();
  }
});
