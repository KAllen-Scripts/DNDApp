/**
 * Places and tokens on maps link to wiki pages (src/wiki-maps.js): the map
 * keeps the page's id and title, the page lists where it is on maps, a renamed
 * page renames its links, a deleted one loses them, players never get the
 * link, and the DM can take a crop of a map for a page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup, terrain } from './helpers.js';

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

const all = (text) => [{ heading: '', text, available: 'all' }];

async function world(t) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'vale.png', data: (await terrain(700, 490, { size: 35 })).toString('base64') } });
  const map = res.json();
  await until(() => t.maps.get(t.campaign.id, map.id).reading.status !== 'pending');
  const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
  await t.request('PATCH', base, { body: { shown: true } });
  const make = async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body })).json().page;
  const mill = await make({ title: 'Hollow Mill', kind: 'village', available: 'all', sections: all('A mill.') });
  const lady = await make({ title: 'The Grey Lady', kind: 'npc', available: 'dm', sections: all('A ghost.') });
  return { map, base, mill, lady };
}

test('wiki maps: a place and a token link to pages, the page lists them, and players never get the link', async () => {
  const t = await setup();
  try {
    const { map, base, mill, lady } = await world(t);
    const placed = (await t.request('PATCH', `${base}/places`, { body: { add: { name: 'Hollow Mill', x: 100, y: 100, revealed: true, page: { id: mill.id } } } })).json();
    const place = placed.places.find((p) => p.name === 'Hollow Mill');
    assert.deepEqual(place.page, { id: mill.id, title: 'Hollow Mill' }, 'the map keeps the title too');
    const tok = await t.request('POST', `${base}/tokens`, { body: { kind: 'npc', name: 'Ghost', x: 200, y: 200, page: { id: lady.id } } });
    assert.equal(tok.statusCode, 201, tok.body);
    assert.deepEqual(tok.json().token.page, { id: lady.id, title: 'The Grey Lady' });
    assert.equal((await t.request('PATCH', `${base}/places`, { body: { add: { name: 'Nowhere', x: 1, y: 1, page: { id: 'abcdef0123' } } } })).statusCode, 404, 'no such page');

    const onMaps = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${mill.id}`)).json().on_maps;
    assert.deepEqual(onMaps.map(({ crop: _c, ...x }) => x), [{ map_id: map.id, map_name: map.name, kind: 'place', id: place.id, name: 'Hollow Mill', x: 100, y: 100, revealed: true }]);

    const asSam = await t.request('GET', base, { as: t.sam.token });
    assert.equal(asSam.statusCode, 200);
    assert.ok(asSam.json().places.some((p) => p.name === 'Hollow Mill' && p.page === null), 'Sam gets the place, without its link');
    const body = JSON.stringify(asSam.json());
    assert.ok(!body.includes(mill.id) && !body.includes(lady.id), 'no page link reaches a player');
  } finally {
    await t.cleanup();
  }
});

test('wiki maps: renaming a page renames its links and a place called by the old title; deleting it drops the links', async () => {
  const t = await setup();
  try {
    const { map, base, mill, lady } = await world(t);
    await t.request('PATCH', `${base}/places`, { body: { add: { name: 'Hollow Mill', x: 100, y: 100, page: { id: mill.id } } } });
    await t.request('PATCH', `${base}/places`, { body: { add: { name: 'The old mill', x: 300, y: 100, page: { id: mill.id } } } });
    await t.request('POST', `${base}/tokens`, { body: { kind: 'npc', name: 'Ghost', x: 200, y: 200, page: { id: lady.id } } });

    const put = await t.request('PUT', `/campaigns/${t.campaign.id}/wiki/${mill.id}`, { body: { version: mill.version, title: 'Burnt Mill' } });
    assert.equal(put.statusCode, 200, put.body);
    const m = t.maps.get(t.campaign.id, map.id);
    assert.deepEqual(m.places.map((p) => [p.name, p.page?.title]), [['Burnt Mill', 'Burnt Mill'], ['The old mill', 'Burnt Mill']], "a name the DM chose stays");

    await t.request('DELETE', `/campaigns/${t.campaign.id}/wiki/${lady.id}`);
    const after = t.maps.get(t.campaign.id, map.id);
    assert.equal(after.tokens.find((x) => x.name === 'Ghost').page, null);
    assert.equal(after.places[0].page.id, mill.id, 'other links stay');
  } finally {
    await t.cleanup();
  }
});

test('wiki maps: the DM takes a crop of a map, as a picture or for a page; a player cannot', async () => {
  const t = await setup();
  try {
    const { map, base } = await world(t);
    const res = await t.request('GET', `${base}/image?crop=70,35,140,70&size=100`);
    assert.equal(res.statusCode, 200, res.body);
    const meta = await sharp(res.rawPayload).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 100, 50]);
    assert.equal((await t.request('GET', `${base}/image?crop=650,450,500,500&size=100`)).statusCode, 200, 'a crop past the edge is kept inside');
    assert.equal((await t.request('GET', `${base}/image?crop=0,0,10,10`, { as: t.sam.token })).statusCode, 403);

    const pic = await t.request('POST', `/campaigns/${t.campaign.id}/wiki/pictures`, { body: { from: { kind: 'map', id: map.id, crop: { x: 0, y: 0, w: 70, h: 35 } } } });
    assert.equal(pic.statusCode, 201, pic.body);
    assert.deepEqual([pic.json().picture.width, pic.json().picture.height], [70, 35]);
    assert.deepEqual(pic.json().picture.from.crop, { x: 0, y: 0, w: 70, h: 35 });
  } finally {
    await t.cleanup();
  }
});

test('wiki maps: making a page from a place names it, cuts its picture from the map, puts it inside the page of the place that opens the map, and links it', async () => {
  const t = await setup();
  try {
    const { map, base, mill } = await world(t);
    const inner = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'inside.png', data: (await terrain(350, 245, { size: 35 })).toString('base64') } });
    const room = inner.json();
    await until(() => t.maps.get(t.campaign.id, room.id).reading.status !== 'pending');
    await t.request('PATCH', base, { body: { kind: 'region' } });
    await t.request('PATCH', `${base}/places`, { body: { add: { name: 'Hollow Mill', x: 100, y: 100, to: room.id, page: { id: mill.id } } } });
    const cellar = (await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${room.id}/places`, { body: { add: { name: 'Cellar', x: 50, y: 50 } } })).json().places[0];

    const res = await t.request('POST', `/campaigns/${t.campaign.id}/wiki/from-map`, { body: { map_id: room.id, kind: 'place', id: cellar.id } });
    assert.equal(res.statusCode, 201, res.body);
    const { page } = res.json();
    assert.equal(page.title, 'Cellar');
    assert.equal(page.parent, mill.id, 'inside the page of the place that opens this map');
    assert.equal(page.available, 'dm', "the DM's alone to start with");
    assert.ok(page.picture?.id, 'a picture cut from the map');
    assert.deepEqual(t.maps.get(t.campaign.id, room.id).places[0].page, { id: page.id, title: 'Cellar' });
    const again = await t.request('POST', `/campaigns/${t.campaign.id}/wiki/from-map`, { body: { map_id: room.id, kind: 'place', id: cellar.id } });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().page.id, page.id, 'a linked place keeps its page');

    const ghost = (await t.request('POST', `${base}/tokens`, { body: { kind: 'npc', name: 'Hollow Mill', x: 200, y: 200 } })).json().token;
    const p2 = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki/from-map`, { body: { map_id: map.id, kind: 'token', id: ghost.id } })).json().page;
    assert.equal(p2.kind, 'npc');
    assert.equal(p2.title, `Hollow Mill (${map.name})`, 'a taken title gets the map name');
    const onMaps = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${mill.id}`)).json().on_maps;
    assert.equal(onMaps[0].revealed, false);
    assert.ok(onMaps[0].crop.w > 0);
  } finally {
    await t.cleanup();
  }
});

test('wiki handouts: a section goes as a handout without its DM and :::for blocks, and sharing it opens that section to them', async () => {
  const t = await setup();
  try {
    const make = async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body })).json().page;
    const page = await make({ title: 'The Old Well', kind: 'place', available: [t.sam.id], sections: [
      { heading: 'Rumours', text: 'The well is cursed, says [[Rennick]].\n:::dm\nIt is not.\n:::\n:::for Lyra\nLyra heard it sing.\n:::', available: 'dm' },
    ], facts: [{ label: 'Depth', value: '40 ft', available: 'all' }, { label: 'Secret', value: 'A door', available: 'dm' }] });
    const sec = page.sections[0];
    const send = (body) => t.request('POST', `/campaigns/${t.campaign.id}/wiki/${page.id}/handout`, { body });

    const res = await send({ part: { section: sec.id }, to: [t.alex.id], share: true });
    assert.equal(res.statusCode, 201, res.body);
    const handout = (await t.request('GET', `/campaigns/${t.campaign.id}/handouts`)).json().handouts.find((x) => x.id === res.json().handout.id);
    assert.equal(handout.title, 'The Old Well: Rumours');
    assert.equal(handout.text, 'The well is cursed, says Rennick.');
    assert.deepEqual(res.json().page.sections[0].available, [t.alex.id], 'the section is shared with them');
    assert.equal(res.json().page_hidden, true, 'the page is only for Thorin, so the DM is told');

    const glance = await send({ part: { glance: true }, to: 'everyone' });
    assert.equal(glance.statusCode, 201);
    const g = (await t.request('GET', `/campaigns/${t.campaign.id}/handouts`)).json().handouts.find((x) => x.id === glance.json().handout.id);
    assert.equal(g.text, 'Depth: 40 ft', 'only the facts for everyone');

    assert.equal((await send({ part: { section: sec.id }, to: [t.dm.id] })).statusCode, 400, 'only players');
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/wiki/${page.id}/handout`, { body: { part: { glance: true }, to: 'everyone' }, as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});
