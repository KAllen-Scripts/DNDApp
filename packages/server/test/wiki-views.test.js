/**
 * The wiki space's views (src/wiki-views.js, GET …/wiki/wheel and …/wiki/home):
 * counts, lists and the party, worked out for the DM or as a player, so a
 * player's version never holds a hidden page, not even in a count.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

const all = (text) => [{ heading: '', text, available: 'all' }];

async function world(t) {
  const make = async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body })).json().page;
  const vale = await make({ title: 'The Vale', kind: 'region', available: 'all', sections: all('Green hills.') });
  const mill = await make({ title: 'Hollow Mill', kind: 'village', parent: vale.id, available: 'all', sections: all('A mill.') });
  const lady = await make({ title: 'The Grey Lady', kind: 'npc', available: 'all', sections: all('A ghost.') });
  const hand = await make({ title: 'The Pale Hand', kind: 'cult', parent: vale.id, available: 'dm', sections: all('Secret cult.') });
  const crypt = await make({ title: 'The Crypt', kind: 'dungeon', parent: hand.id, available: [t.sam.id], sections: all('Under the mill.') });
  const s1 = await make({ title: 'Session 1', kind: 'session', available: 'all', sections: all('They met the Lady.') });
  return { vale, mill, lady, hand, crypt, s1 };
}

test('wiki views: the wheel counts families and kinds; as a player it counts only what they may see', async () => {
  const t = await setup();
  try {
    const { hand, crypt } = await world(t);
    const base = `/campaigns/${t.campaign.id}/wiki/wheel`;
    const dm = (await t.request('GET', base)).json();
    const fam = (res, f) => res.families.find((x) => x.family === f);
    assert.equal(dm.families.length, 9, 'every family, so the wheel keeps its shape');
    assert.equal(fam(dm, 'place').count, 3);
    assert.deepEqual(fam(dm, 'place').kinds, [{ kind: 'dungeon', count: 1 }, { kind: 'region', count: 1 }, { kind: 'village', count: 1 }]);
    assert.equal(fam(dm, 'faction').count, 1);
    assert.deepEqual(dm.party.map((p) => p.character_name).sort(), ['Lyra', 'Thorin']);
    assert.equal(dm.pages.length, 6);

    const sam = (await t.request('GET', `${base}?as=${t.sam.id}`)).json();
    assert.equal(fam(sam, 'faction').count, 0, 'the hidden cult is not counted');
    assert.equal(fam(sam, 'place').count, 3, "Thorin's crypt counts for Thorin");
    const body = JSON.stringify(sam);
    assert.ok(!body.includes(hand.id) && !body.includes('Pale Hand'), 'no trace of the hidden page');
    assert.equal(sam.pages.find((p) => p.id === crypt.id).parent, null, 'a hidden parent is left out');

    const alex = (await t.request('GET', `${base}?as=${t.alex.id}`)).json();
    assert.equal(fam(alex, 'place').count, 2);
    assert.ok(!JSON.stringify(alex).includes('Crypt'));

    assert.equal((await t.request('GET', `${base}?as=${t.dm.id}`)).statusCode, 400, 'only a player can be viewed as');
    assert.equal((await t.request('GET', base, { as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('wiki views: the home has the last session, the newest changes and what waits, and as a player none of the hidden pages or the waiting list', async () => {
  const t = await setup();
  try {
    const { s1, hand } = await world(t);
    const base = `/campaigns/${t.campaign.id}/wiki/home`;
    const dm = (await t.request('GET', base)).json();
    assert.equal(dm.count, 6);
    assert.equal(dm.last_session.id, s1.id);
    assert.equal(dm.recent[0].id, s1.id, 'newest first');
    assert.deepEqual(dm.waiting, { proposals: 0 });

    const alex = (await t.request('GET', `${base}?as=${t.alex.id}`)).json();
    assert.equal(alex.count, 4);
    assert.equal(alex.waiting, undefined);
    assert.ok(!JSON.stringify(alex).includes(hand.id));
    assert.ok(alex.recent.every((p) => !['The Pale Hand', 'The Crypt'].includes(p.title)));
  } finally {
    await t.cleanup();
  }
});

test("wiki views: a page's compass has its chain, what it holds and its links both ways, and as a player only what they may see", async () => {
  const t = await setup();
  try {
    const { vale, mill, lady, hand, crypt } = await world(t);
    const put = (p, sections) => t.request('PUT', `/campaigns/${t.campaign.id}/wiki/${p.id}`, { body: { version: p.version, sections } });
    await put(lady, [{ heading: '', text: 'Haunts [[Hollow Mill]].\n:::dm\nServes [[The Pale Hand]].\n:::', available: 'all' }]);
    const base = (p) => `/campaigns/${t.campaign.id}/wiki/${p.id}/compass`;
    const titles = (list) => list.map((p) => p.title);

    const dm = (await t.request('GET', base(crypt))).json().compass;
    assert.equal(dm.family, 'place');
    assert.deepEqual(titles(dm.chain), ['The Vale', 'The Pale Hand']);
    const ladyDm = (await t.request('GET', base(lady))).json().compass;
    assert.deepEqual(titles(ladyDm.links_to), ['Hollow Mill', 'The Pale Hand']);
    const millDm = (await t.request('GET', base(mill))).json().compass;
    assert.deepEqual(titles(millDm.linked_from), ['The Grey Lady']);
    assert.deepEqual(titles((await t.request('GET', base(vale))).json().compass.children), ['Hollow Mill', 'The Pale Hand']);

    const sam = (await t.request('GET', `${base(crypt)}?as=${t.sam.id}`)).json().compass;
    assert.deepEqual(sam.chain, [], 'the hidden cult (and so the chain through it) is left out');
    const ladySam = (await t.request('GET', `${base(lady)}?as=${t.sam.id}`)).json().compass;
    assert.deepEqual(titles(ladySam.links_to), ['Hollow Mill'], "a link in the DM's block leads nowhere");
    assert.ok(!JSON.stringify(ladySam).includes(hand.id));
    assert.deepEqual(titles((await t.request('GET', `${base(vale)}?as=${t.alex.id}`)).json().compass.children), ['Hollow Mill']);
    assert.equal((await t.request('GET', `${base(hand)}?as=${t.alex.id}`)).json().compass, null);
  } finally {
    await t.cleanup();
  }
});


test('wiki find: names first, then pages whose text matches, and as a player never a hidden page', async () => {
  const t = await setup();
  try {
    const { hand } = await world(t);
    const make = (body) => t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body });
    await make({ title: 'Rennick', kind: 'npc', available: 'all', sections: all('A one-eyed smuggler with an eyepatch.') });
    await make({ title: 'Mother Ash', kind: 'npc', available: 'dm', sections: all('Wears an eyepatch made of bark.') });
    const find = async (q, as) => (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/find?q=${encodeURIComponent(q)}${as ? `&as=${as}` : ''}`)).json().pages;

    const grey = await find('the grey');
    assert.deepEqual([grey[0].title, grey[0].found_by], ['The Grey Lady', 'name'], 'a name match comes first');
    const patch = await find('eyepatch');
    assert.deepEqual(patch.slice(0, 2).map((p) => p.title).sort(), ['Mother Ash', 'Rennick'], 'then the pages whose text says it');
    assert.equal(patch[0].found_by, 'text');
    const alex = await find('eyepatch', t.alex.id);
    assert.equal(alex[0].title, 'Rennick');
    assert.ok(!alex.some((p) => p.title === 'Mother Ash'), "the DM's own page is not found for a player");
    assert.ok(!JSON.stringify(await find('cult', t.alex.id)).includes(hand.id));
    assert.equal((await find('cult'))[0].id, hand.id);
    assert.deepEqual(await find(''), []);
  } finally {
    await t.cleanup();
  }
});
