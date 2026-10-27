/**
 * Relationships are facts (wiki space stage 3c): a fact linking a page has a
 * tone, the DM's or guessed from its label, kept through saves and a
 * player's filtered page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { guessTone, factLinks, factTone } from '@dndapp/shared/wiki.js';

test('wiki ties: links and guessed tones', () => {
  assert.deepEqual(factLinks({ value: '[[Lord Vex]] and [[The Crows|crows]]' }), ['Lord Vex', 'The Crows']);
  assert.equal(guessTone('Rival'), 'hostile');
  assert.equal(guessTone('Hunted by'), 'hostile');
  assert.equal(guessTone('Ally'), 'friendly');
  assert.equal(guessTone('Member of'), 'friendly');
  assert.equal(guessTone('Knows'), 'neutral');
  assert.equal(factTone({ label: 'Rival', tone: 'friendly' }), 'friendly', "the DM's choice wins");
  assert.equal(factTone({ label: 'Rival', tone: 'bogus' }), 'hostile');
});

test('wiki ties: the tone round-trips, a player keeps it, and a page holds 60 facts', async () => {
  const t = await setup();
  const base = `/campaigns/${t.campaign.id}/wiki`;
  try {
    const facts = [
      { label: 'Rival', value: '[[Lord Vex]]', available: 'all', tone: 'neutral' },
      { label: 'Ally', value: '[[Mira]]', available: 'all', tone: null },
      ...Array.from({ length: 58 }, (_, i) => ({ label: `Fact ${i}`, value: String(i), available: 'all' })),
    ];
    let page = (await t.request('POST', base, { body: { title: 'Thorin', available: 'all', facts } })).json().page;
    assert.equal(page.facts.length, 60);
    assert.equal(page.facts[0].tone, 'neutral');
    assert.ok(!('tone' in page.facts[1]), 'no choice: guessed when drawn');
    page = (await t.request('PUT', `${base}/${page.id}`, { body: { version: page.version, facts: page.facts } })).json().page;
    assert.equal(page.facts[0].tone, 'neutral');
    const as = (await t.request('GET', `${base}/${page.id}?as=${t.sam.id}`)).json().page;
    assert.equal(as.facts[0].tone, 'neutral');
    assert.equal((await t.request('POST', base, { body: { title: 'Too many', facts: [...facts, { label: 'x', value: 'y' }] } })).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});
