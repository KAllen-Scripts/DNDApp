/**
 * Character pages (wiki space stage 6b): one offered under Waiting for each player's character (one click); its race, class,
 * looks and backstory drawn live from the sheet (never copied), seen by the DM and the player, and by the other
 * players only as far as the player shares them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

test('character pages: offered for each character, drawn live from the sheet, shared only as the player chooses', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    // Thorin's sheet.
    t.sheets.save(cid, t.sam.id, { name: 'Thorin', race: 'Dwarf', classes: [{ name: 'Fighter', subclass: 'Champion', level: 3 }], eyes: 'Grey', appearance: 'A braided red beard.', backstory: 'Exiled from the Iron Hills.', allies: 'The Smiths\' Guild' }, { baseVersion: 0, by: t.sam.id });

    // Offered under Waiting, one for each character with a name and no page.
    const offers = () => t.request('GET', `${base}/proposals`).then((r) => r.json().characters);
    assert.deepEqual((await offers()).map((c) => c.character_name).sort(), ['Lyra', 'Thorin']);
    assert.equal((await t.request('POST', `${base}/characters`, { as: t.sam.token, body: { player: t.sam.id } })).statusCode, 403, "the DM's");

    // One click makes the page, for the whole party; then it isn't offered.
    const res = await t.request('POST', `${base}/characters`, { body: { player: t.sam.id } });
    assert.equal(res.statusCode, 201, res.body);
    const page = res.json().page;
    assert.equal(page.player, t.sam.id);
    assert.equal(page.title, 'Thorin');
    assert.equal(page.kind, 'character');
    assert.equal(page.available, 'all');
    assert.deepEqual((await offers()).map((c) => c.character_name), ['Lyra']);
    assert.equal((await t.request('POST', `${base}/characters`, { body: { player: t.sam.id } })).statusCode, 400, 'not twice');

    // The DM and Sam see every part; nothing is copied into the page.
    const dmView = (await t.request('GET', `${base}/${page.id}`)).json();
    assert.deepEqual(dmView.from_sheet.facts.map((f) => `${f.label}: ${f.value}`), ['Race: Dwarf', 'Class: Fighter (Champion)', 'Level: 3', 'Eyes: Grey']);
    assert.deepEqual(dmView.from_sheet.sections.map((s) => s.heading), ['Appearance', 'Backstory', 'Allies and organisations']);
    assert.ok(!JSON.stringify(dmView.page).includes('Iron Hills'), 'never copied into the page');
    const samView = (await t.request('GET', `${base}/${page.id}`, { as: t.sam.token })).json();
    assert.equal(samView.from_sheet.mine, true);
    assert.equal(samView.from_sheet.sections.length, 3);

    // Alex sees the page but none of the sheet until Sam shares.
    let alexView = (await t.request('GET', `${base}/${page.id}`, { as: t.alex.token })).json();
    assert.equal(alexView.page.title, 'Thorin');
    assert.deepEqual([alexView.from_sheet.facts, alexView.from_sheet.sections], [[], []]);
    assert.equal(alexView.from_sheet.mine, false);
    assert.equal((await t.request('PUT', `${base}/${page.id}/sheet-share`, { as: t.alex.token, body: { share: ['backstory'] } })).statusCode, 403, 'only its player chooses');
    assert.equal((await t.request('PUT', `${base}/${page.id}/sheet-share`, { as: t.sam.token, body: { share: ['basics', 'backstory'] } })).statusCode, 200);
    alexView = (await t.request('GET', `${base}/${page.id}`, { as: t.alex.token })).json();
    assert.deepEqual(alexView.from_sheet.facts.map((f) => f.label), ['Race', 'Class', 'Level']);
    assert.deepEqual(alexView.from_sheet.sections.map((s) => s.heading), ['Backstory']);
    assert.ok(!JSON.stringify(alexView).includes('braided'), 'appearance still private');
    // The DM's View as matches.
    assert.deepEqual((await t.request('GET', `${base}/${page.id}?as=${t.alex.id}`)).json().from_sheet.sections, alexView.from_sheet.sections);

    // Live: a sheet change shows at once.
    const { version } = t.sheets.get(cid, t.sam.id);
    t.sheets.save(cid, t.sam.id, { ...t.sheets.get(cid, t.sam.id).sheet, backstory: 'Now a hero of Brindle.' }, { baseVersion: version, by: t.sam.id });
    alexView = (await t.request('GET', `${base}/${page.id}`, { as: t.alex.token })).json();
    assert.equal(alexView.from_sheet.sections[0].text, 'Now a hero of Brindle.');

    // The party in the Wheel knows the page; one page per character.
    const wheel = (await t.request('GET', `${base}/wheel`, { as: t.alex.token })).json();
    assert.equal(wheel.party.find((p) => p.id === t.sam.id).page, page.id);
    const again = await t.request('POST', base, { body: { title: 'Thorin again', player: t.sam.id } });
    assert.equal(again.statusCode, 400);
    assert.equal((await t.request('POST', base, { body: { title: 'Nobody', player: t.dm.id } })).statusCode, 400, 'only a player can have a character page');
  } finally {
    await t.cleanup();
  }
});
