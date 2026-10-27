/**
 * Players' lore (wiki space stage 6c): a player adds to their own character's story; it waits for the DM, who
 * approves it (as their account, true, or false with the truth), edits it or rejects it; the player can change their
 * own approved parts, nobody else's; another player gets only what it's for; the AI never rewrites it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM } from './helpers.js';

test('players\' lore: added, approved with a canon, private as chosen, edited only by its player', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  const as = (who) => ({ as: who.token });
  try {
    // No character page yet: only a page of its own works.
    assert.equal((await t.request('POST', `${base}/lore`, { ...as(t.sam), body: { type: 'section', text: 'I was a smith.' } })).statusCode, 400);
    const thorin = (await t.request('POST', `${base}/characters`, { body: { player: t.sam.id } })).json().page;
    const lyra = (await t.request('POST', `${base}/characters`, { body: { player: t.alex.id } })).json().page;
    assert.equal((await t.request('POST', `${base}/lore`, { body: { type: 'section', text: 'x' } })).statusCode, 403, "the DM doesn't add lore");

    const add = async (who, body) => {
      const res = await t.request('POST', `${base}/lore`, { ...as(who), body });
      assert.equal(res.statusCode, 201, res.body);
      return res.json().lore;
    };
    await add(t.sam, { type: 'section', heading: 'Exile', text: 'Thorin was cast out of the Iron Hills.', available: 'all' });
    await add(t.sam, { type: 'relationship', label: 'Sister', value: 'Dagna', available: 'dm' });
    await add(t.sam, { type: 'event', when: 'Ten years ago', text: 'The forge fire.', available: [t.sam.id] });
    await add(t.sam, { type: 'page', title: 'The Iron Hills', text: 'Thorin\'s home.', available: 'all' });
    assert.equal((await t.request('GET', `${base}/lore`, as(t.sam))).json().lore.length, 4);
    assert.equal((await t.request('GET', `${base}/lore`, as(t.alex))).json().lore.length, 0, 'only their own');

    // Waiting: four from Thorin's player, nothing on the page yet.
    const { proposals } = (await t.request('GET', `${base}/proposals`)).json();
    const byAction = Object.fromEntries(proposals.filter((p) => p.from === 'player').map((p) => [p.action, p]));
    assert.deepEqual(Object.keys(byAction).sort(), ['add_event', 'add_section', 'new_page', 'set_fact']);
    assert.ok(!(await t.request('GET', `${base}/${thorin.id}`, as(t.alex))).body.includes('Iron Hills'));

    // Approve: the section as their account, the tie as true, the event false with the truth; reject the page.
    const approve = (p, body = {}) => t.request('POST', `${base}/proposals/${p.id}/approve`, { body });
    assert.equal((await approve(byAction.add_section)).statusCode, 200);
    assert.equal((await approve(byAction.set_fact, { canon: 'true' })).statusCode, 200);
    assert.equal((await approve(byAction.add_event, { canon: 'false', truth: 'Dagna set it.' })).statusCode, 200);
    assert.equal((await t.request('POST', `${base}/proposals/${byAction.new_page.id}/reject`)).statusCode, 200);
    assert.deepEqual((await t.request('GET', `${base}/lore`, as(t.sam))).json().lore.map((l) => l.status).sort(), ['approved', 'approved', 'approved', 'rejected']);

    const dmPage = (await t.request('GET', `${base}/${thorin.id}`)).json().page;
    const section = dmPage.sections.find((s) => s.heading === 'Exile');
    assert.deepEqual([section.by, section.owner, section.canon], ['player', t.sam.id, 'told']);
    assert.deepEqual([dmPage.facts[0].by, dmPage.facts[0].canon, dmPage.facts[0].owner], ['player', 'true', t.sam.id]);
    assert.deepEqual([dmPage.events[0].canon, dmPage.events[0].truth], ['false', 'Dagna set it.']);

    // Alex sees the section (for everyone), not the DM-only tie, not Sam's event.
    const alexPage = (await t.request('GET', `${base}/${thorin.id}`, as(t.alex))).json().page;
    assert.ok(alexPage.sections.some((s) => s.heading === 'Exile'));
    assert.equal(alexPage.facts.length, 0);
    assert.equal(alexPage.events.length, 0);
    // Sam sees their event as a rumour, never the truth.
    const samPage = (await t.request('GET', `${base}/${thorin.id}`, as(t.sam))).json().page;
    assert.equal(samPage.events[0].canon, 'rumour');
    assert.ok(!JSON.stringify(samPage).includes('Dagna set it'));

    // Sam changes their section; it applies at once. Alex can't; nor can Sam change a DM's section.
    const put = (who, pid, body) => t.request('PUT', `${base}/${pid}/lore`, { ...as(who), body });
    assert.equal((await put(t.sam, thorin.id, { section_id: section.id, text: 'Cast out, and glad of it.' })).statusCode, 200);
    assert.equal((await put(t.alex, thorin.id, { section_id: section.id, text: 'Hacked.' })).statusCode, 404);
    const dmSection = (await t.request('PUT', `${base}/${thorin.id}`, { body: { version: (await t.request('GET', `${base}/${thorin.id}`)).json().page.version, sections: [...(await t.request('GET', `${base}/${thorin.id}`)).json().page.sections, { heading: 'DM notes', text: 'Public bit.', available: 'all' }] } })).json().page.sections.find((s) => s.heading === 'DM notes');
    assert.equal((await put(t.sam, thorin.id, { section_id: dmSection.id, text: 'Hacked.' })).statusCode, 404);
    assert.equal((await put(t.sam, lyra.id, { section_id: section.id, text: 'x' })).statusCode, 404);
    // The tie the DM confirmed goes back to their account when they change it.
    assert.equal((await put(t.sam, thorin.id, { fact_label: 'Sister', value: 'Dagna Ironfist' })).statusCode, 200);
    const after = (await t.request('GET', `${base}/${thorin.id}`)).json().page;
    assert.equal(after.sections.find((s) => s.id === section.id).text, 'Cast out, and glad of it.');
    assert.equal(after.sections.find((s) => s.id === section.id).by, 'player', 'the DM saving the page kept it theirs');
    assert.deepEqual([after.facts[0].value, after.facts[0].canon], ['Dagna Ironfist', 'told']);
    assert.equal(after.updated_by, t.sam.id);
  } finally {
    await t.cleanup();
  }
});

test('players\' lore: the AI never rewrites it', async () => {
  const t = await setup({ llm: createFakeLLM({ wiki: () => ({ section: { heading: 'Exile', text: 'Rewritten.', sources: [] }, text: 'Rewritten.', reason: 'tidier', changes: [] }) }) });
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    const thorin = (await t.request('POST', `${base}/characters`, { body: { player: t.sam.id } })).json().page;
    await t.request('POST', `${base}/lore`, { as: t.sam.token, body: { type: 'section', heading: 'Exile', text: 'Cast out.', available: 'all' } });
    const p = (await t.request('GET', `${base}/proposals`)).json().proposals[0];
    await t.request('POST', `${base}/proposals/${p.id}/approve`, { body: {} });
    const section = (await t.request('GET', `${base}/${thorin.id}`)).json().page.sections[0];
    for (const mode of ['tidy', 'expand']) {
      const res = await t.request('POST', `${base}/draft`, { body: { mode, page_id: thorin.id, section_id: section.id } });
      assert.equal(res.statusCode, 400, `${mode}: ${res.body}`);
    }
  } finally {
    await t.cleanup();
  }
});
