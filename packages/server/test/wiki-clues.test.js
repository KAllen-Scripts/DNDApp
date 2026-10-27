/**
 * Clues and reusable secrets (wiki space stage 7a): `[[!Clue]]` puts a clue page's opening words where it's
 * written; who sees them is the clue's own business, so one reveal shows it everywhere, and a player who can't see
 * it gets nothing at all (not its title, not in search).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

test('wiki clues: embedded per viewer, one reveal shows it everywhere, nothing hidden leaks', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    const make = async (body) => {
      const res = await t.request('POST', base, { body });
      assert.equal(res.statusCode, 201, res.body);
      return res.json().page;
    };
    const clue = await make({ title: 'The Bloody Ledger', kind: 'clue', available: 'all', sections: [
      { heading: '', text: 'A ledger with the Baron\'s seal, its last page torn out.', available: 'dm' },
      { heading: 'Points to', text: 'The Baron pays the cult.', available: 'dm' },
    ] });
    const mill = await make({ title: 'Hollow Mill', kind: 'place', available: 'all', sections: [
      { heading: '', text: 'An old mill.', available: 'all' },
      { heading: 'In the loft', text: '[[!The Bloody Ledger]]', available: 'all' },
    ] });
    const inn = await make({ title: 'The Prancing Goat', kind: 'tavern', available: 'all', sections: [{ heading: '', text: 'The barkeep keeps [[!The Bloody Ledger]] under the bar.', available: 'all' }] });

    // The DM gets the clue's opening words, with who has it; not its DM notes.
    const dmMill = (await t.request('GET', `${base}/${mill.id}`)).json();
    const e = dmMill.embeds['the bloody ledger'];
    assert.equal(e.id, clue.id);
    assert.match(e.text, /Baron's seal/);
    assert.equal(e.section_available, 'dm');
    assert.ok(!JSON.stringify(dmMill.embeds).includes('pays the cult'));
    assert.ok(dmMill.mentioned_in !== undefined);

    // Sam can't see the clue yet: no embed, no title, the section that was only the clue is gone.
    const hidden = async (pid) => (await t.request('GET', `${base}/${pid}`, { as: t.sam.token })).json();
    let samMill = await hidden(mill.id);
    assert.deepEqual(samMill.embeds, {});
    assert.ok(!JSON.stringify(samMill).includes('Bloody Ledger'));
    assert.deepEqual(samMill.page.sections.map((s) => s.heading), ['']);
    let samInn = await hidden(inn.id);
    assert.ok(!JSON.stringify(samInn).includes('Bloody'));
    assert.match(samInn.page.sections[0].text, /keeps\s+under the bar/);
    // Nor in Find or the list.
    assert.ok(!(await t.request('GET', `${base}/find?q=ledger`, { as: t.sam.token })).body.includes('Bloody'));
    assert.ok(!(await t.request('GET', base, { as: t.sam.token })).body.includes('Bloody'));

    // Reveal the clue's opening to Sam once: it shows in both places.
    const page = (await t.request('GET', `${base}/${clue.id}`)).json().page;
    const sections = page.sections.map((s, i) => (i === 0 ? { ...s, available: [t.sam.id] } : s));
    assert.equal((await t.request('PUT', `${base}/${clue.id}`, { body: { version: page.version, sections } })).statusCode, 200);
    samMill = await hidden(mill.id);
    samInn = await hidden(inn.id);
    for (const r of [samMill, samInn]) {
      assert.match(r.embeds['the bloody ledger'].text, /Baron's seal/);
      assert.ok(!JSON.stringify(r).includes('pays the cult'), 'only the opening, as they may see it');
    }
    assert.ok(samMill.page.sections.some((s) => s.text === '[[!The Bloody Ledger]]'));
    // Alex still gets nothing.
    assert.ok(!(await t.request('GET', `${base}/${inn.id}`, { as: t.alex.token })).body.includes('Bloody'));
    // The DM's View as matches the player.
    assert.deepEqual((await t.request('GET', `${base}/${inn.id}?as=${t.sam.id}`)).json().embeds, samInn.embeds);
    // An embed links its page (mentioned in, for the compass and the Web).
    assert.deepEqual((await t.request('GET', `${base}/${clue.id}`)).json().mentioned_in.map((m) => m.title).sort(), ['Hollow Mill', 'The Prancing Goat']);
  } finally {
    await t.cleanup();
  }
});
