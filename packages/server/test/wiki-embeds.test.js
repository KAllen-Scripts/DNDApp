/**
 * Live embeds (wiki space stage 9a): `[[creature:…]]`, `[[item:…]]`, `[[merchant:…]]`, `[[handout:…]]` and
 * `[[map:…]]` come with the page as the thing itself, live; a player gets only what they may see, and their text
 * loses the rest (the name too). They're never links to wiki pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';
import { wikiLinks, unlink, appEmbeds } from '@dndapp/shared/wiki.js';

test('app embeds: parsed apart from links', () => {
  const text = 'Beware [[creature:Goblin boss]] and [[Mira]]; the [[item:Sun Blade]] is here. [[map:The Vale]]';
  assert.deepEqual(wikiLinks(text), ['Mira']);
  assert.deepEqual(appEmbeds(text), [{ kind: 'creature', name: 'Goblin boss' }, { kind: 'item', name: 'Sun Blade' }, { kind: 'map', name: 'The Vale' }]);
  assert.equal(unlink(text), 'Beware Goblin boss and Mira; the Sun Blade is here. The Vale');
});

test('wiki live embeds: each kind for the DM, and a player gets only what they may see', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    const goblin = t.creatures.create(cid, { name: 'Goblin boss', stats: { name: 'Goblin Boss', ac: 17, hp_formula: '6d6', text: '**Scimitar.** Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 5 (1d6 + 2) slashing damage.' } }, { by: t.dm.id });
    t.items.create(cid, { name: 'Sun Blade', kind: 'weapon', rarity: 'rare', text: 'A hilt.' }, { by: t.dm.id });
    t.merchants.create(cid, { name: 'Old Pell' }, { by: t.dm.id });
    await t.handouts.create(cid, { title: 'The letter', text: 'Meet me at dawn.', to: [t.sam.id] }, { by: t.dm.id });
    const map = (await t.request('POST', `/campaigns/${cid}/maps`, { body: { filename: 'vale.png', data: (await terrain(140, 140, { size: 35 })).toString('base64') } })).json();
    await t.request('PATCH', `/campaigns/${cid}/maps/${map.id}`, { body: { name: 'The Vale' } });

    const page = (await t.request('POST', base, { body: { title: 'Ambush', kind: 'lore', available: 'all', sections: [{ heading: '', available: 'all', text: 'They meet [[creature:Goblin boss]] with the [[item:Sun Blade]], at [[merchant:Old Pell]]\'s.\n\n[[handout:The letter]]\n\n[[map:The Vale]]\n\n[[creature:Nobody]]' }] } })).json().page;

    const dm = (await t.request('GET', `${base}/${page.id}`)).json();
    const e = dm.embeds;
    assert.equal(e['creature:goblin boss'].id, goblin.id);
    assert.equal(e['creature:goblin boss'].stats.ac, 17);
    assert.equal(e['item:sun blade'].item.rarity, 'rare');
    assert.equal(e['merchant:old pell'].name, 'Old Pell');
    assert.equal(e['handout:the letter'].text, 'Meet me at dawn.');
    assert.equal(e['map:the vale'].id, map.id);
    assert.deepEqual(e['creature:nobody'], { app: 'creature', name: 'Nobody', missing: true });
    assert.ok(!dm.unknown_names?.includes?.('creature:Goblin boss'));
    // Never a missing-page link.
    assert.ok(!(await t.request('GET', `${base}/tidy`)).json().items.some((i) => i.rule === 'missing_link'));

    // Sam: the handout he got; no creature, item, merchant (no token he can see) or hidden map, and not their names.
    const sam = (await t.request('GET', `${base}/${page.id}`, { as: t.sam.token })).json();
    assert.deepEqual(Object.keys(sam.embeds), ['handout:the letter']);
    const text = sam.page.sections[0].text;
    assert.match(text, /\[\[handout:The letter\]\]/);
    assert.doesNotMatch(text, /Goblin|Sun Blade|Pell|Vale|Nobody/);
    // Lyra didn't get the letter.
    const lyra = (await t.request('GET', `${base}/${page.id}`, { as: t.alex.token })).json();
    assert.deepEqual(lyra.embeds, {});
    // The map once it's shown to them.
    await t.request('PATCH', `/campaigns/${cid}/maps/${map.id}`, { body: { shown: true } });
    const later = (await t.request('GET', `${base}/${page.id}`, { as: t.alex.token })).json();
    assert.deepEqual(Object.keys(later.embeds), ['map:the vale']);

    // What + Embed offers (the DM's).
    const { choices } = (await t.request('GET', `${base}/embeds`)).json();
    assert.ok(choices.some((c) => c.kind === 'creature' && c.name === 'Goblin boss'));
    assert.ok(choices.some((c) => c.kind === 'handout' && c.name === 'The letter'));
    assert.equal((await t.request('GET', `${base}/embeds`, { as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});
