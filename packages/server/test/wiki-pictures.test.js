/**
 * The wiki's pictures (2026-10-21, "make the wiki more visual"): uploaded or
 * copied from what the app already has, archived as they came, sent smaller,
 * and only ever reaching a player where the part of the page they're in does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup, createFakeLLM, SAMPLE } from './helpers.js';
import { pictureAlt, wikiPictures, unpicture, pagePictureIds, kindFamily } from '@dndapp/shared/wiki.js';

const picture = (width, height, format = 'png', r = 40) =>
  sharp({ create: { width, height, channels: 3, background: { r, g: 90, b: 160 } } })[format]().toBuffer();

const addPicture = async (t, buf, name = 'pic.png') => {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/wiki/pictures`, { body: { filename: name, data: buf.toString('base64') } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().picture;
};

test('wiki pictures: the text syntax, and the kinds a page can be', () => {
  const text = 'Before ![The mill at dusk|right](picture:0123456789) after ![](picture:abcdefabcd) and ![x](picture:nothex!!!!).';
  assert.deepEqual(wikiPictures(text), ['0123456789', 'abcdefabcd']);
  assert.deepEqual(pictureAlt('The mill at dusk|right'), { caption: 'The mill at dusk', place: 'right' });
  assert.deepEqual(pictureAlt('A | B'), { caption: 'A | B', place: '' });
  assert.equal(unpicture(text), 'Before [picture: The mill at dusk] after [picture] and ![x](picture:nothex!!!!).');
  assert.deepEqual(pagePictureIds({ picture: { id: 'a' }, banner: null, gallery: [{ id: 'b' }], sections: [{ text }] }), ['a', 'b', '0123456789', 'abcdefabcd']);
  assert.equal(kindFamily('NPC'), 'person');
  assert.equal(kindFamily('Tavern'), 'place');
  assert.equal(kindFamily('thieves guild'), 'faction');
  assert.equal(kindFamily('sessions'), 'session');
  assert.equal(kindFamily(''), 'other');
  assert.equal(kindFamily('weather'), 'other');
});

test('wiki pictures: the DM uploads one or copies one the app has; it is archived as it came and sent smaller', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    const base = `/campaigns/${cid}/wiki/pictures`;
    const big = await picture(3000, 2000, 'jpeg');
    assert.equal((await t.request('POST', base, { as: t.sam.token, body: { data: big.toString('base64') } })).statusCode, 403, 'players add no pictures');
    assert.equal((await t.request('GET', base, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('POST', base, { body: { data: Buffer.from('not a picture').toString('base64') } })).statusCode, 400);

    const up = await addPicture(t, big, 'Brindle.jpg');
    assert.equal(up.name, 'Brindle');
    assert.deepEqual([up.width, up.height], [3000, 2000]);
    const dir = path.join(t.paths.archive, t.campaign.slug, 'wiki', 'pictures');
    assert.ok(fs.readFileSync(path.join(dir, `${up.id}.jpg`)).equals(big), 'archived exactly as uploaded');
    assert.equal(fs.readFileSync(path.join(dir, 'pictures.jsonl'), 'utf8').trim().split('\n').length, 1);

    const full = await t.request('GET', `${base}/${up.id}`);
    assert.equal(full.statusCode, 200);
    assert.equal(full.headers['content-type'], 'image/webp');
    const fullMeta = await sharp(full.rawPayload).metadata();
    assert.equal(fullMeta.width, 1800, 'made smaller on the server');
    const thumb = await sharp((await t.request('GET', `${base}/${up.id}?size=thumb`)).rawPayload).metadata();
    assert.equal(thumb.width, 480);

    // A creature's picture and a map, from the chooser.
    const goblin = (await t.request('POST', `/campaigns/${cid}/creatures`, { body: { name: 'Goblin King', kind: 'enemy', picture: { filename: 'g.png', data: (await picture(300, 300)).toString('base64') } } })).json();
    const map = t.maps.create(cid, { name: 'Brindle', buf: await picture(4000, 3000), ext: 'png', type: 'image/png', width: 4000, height: 3000, by: t.dm.id });
    const { sources } = (await t.request('GET', base)).json();
    assert.deepEqual(sources.map((s) => `${s.kind}:${s.name}`).sort(), ['creature:Goblin King', 'map:Brindle']);
    assert.equal((await t.request('GET', `/campaigns/${cid}/wiki/picture-sources/creature/${goblin.id}`)).statusCode, 200);
    assert.equal((await t.request('GET', `/campaigns/${cid}/wiki/picture-sources/creature/${goblin.id}`, { as: t.sam.token })).statusCode, 403);

    const fromCreature = (await t.request('POST', base, { body: { from: { kind: 'creature', id: goblin.id } } })).json().picture;
    assert.deepEqual(fromCreature.from, { kind: 'creature', id: goblin.id, name: 'Goblin King' });
    const fromMap = (await t.request('POST', base, { body: { from: { kind: 'map', id: map.id } } })).json().picture;
    assert.ok(fromMap.width <= 2400 && fromMap.height <= 2400, 'a map is copied smaller');
    assert.equal((await t.request('POST', base, { body: { from: { kind: 'item', id: 'ffffffffff' } } })).statusCode, 404);
    assert.deepEqual((await t.request('GET', base)).json().pictures.map((p) => p.id), [fromMap.id, fromCreature.id, up.id], 'newest first');

    // A page can only use pictures the wiki has.
    const bad = await t.request('POST', `/campaigns/${cid}/wiki`, { body: { title: 'Brindle', picture: { id: 'ffffffffff' } } });
    assert.equal(bad.statusCode, 400);
    const page = (await t.request('POST', `/campaigns/${cid}/wiki`, { body: { title: 'Brindle', kind: 'town', picture: { id: fromMap.id, caption: 'Brindle from above' }, facts: [{ label: 'Region', value: 'The Vale' }] } })).json().page;
    assert.equal(page.picture.id, fromMap.id);
    assert.equal(page.picture.available, 'all');
    assert.deepEqual(page.facts, [{ label: 'Region', value: 'The Vale', available: 'all', canon: 'true' }]);
    const listed = (await t.request('GET', `/campaigns/${cid}/wiki`)).json().pages[0];
    assert.equal(listed.picture, fromMap.id, 'the list gives each page its picture for the cards');
  } finally {
    await t.cleanup();
  }
});

test('wiki pictures: a player never gets the address or the bytes of a picture that is not available to them', async () => {
  const llm = createFakeLLM();
  const t = await setup({ llm });
  try {
    const cid = t.campaign.id;
    const ids = {};
    for (const [i, name] of ['open', 'banner', 'gallerySam', 'inText', 'inDmBlock', 'inThorinBlock', 'inDmSection', 'galleryAll'].entries()) ids[name] = (await addPicture(t, await picture(200, 120, 'png', 10 + i * 20), name)).id;
    const page = (await t.request('POST', `/campaigns/${cid}/wiki`, {
      body: {
        title: 'Hollow Mill',
        kind: 'place',
        available: 'all',
        picture: { id: ids.open, caption: 'The mill at dusk' },
        banner: { id: ids.banner, caption: 'The secret cellar', available: 'dm', focus: 30 },
        gallery: [{ id: ids.gallerySam, caption: 'What Thorin saw', available: [t.sam.id] }, { id: ids.galleryAll, caption: 'The wheel' }],
        facts: [{ label: 'Region', value: 'North of [[Brindle]]' }, { label: 'Owner', value: 'The cult', available: 'dm' }],
        sections: [
          { heading: 'What it is', text: `An old mill. ![The wheel|right](picture:${ids.inText})\n:::dm\nThe cult meets here. ![The altar](picture:${ids.inDmBlock})\n:::\n:::for Thorin\n![The letter](picture:${ids.inThorinBlock})\n:::`, available: 'all' },
          { heading: 'Plans', text: `![The trap](picture:${ids.inDmSection}) Burn it down.`, available: 'dm' },
        ],
      },
    })).json().page;
    assert.ok(page.id);
    const base = `/campaigns/${cid}/wiki`;
    const visibleTo = {
      [t.alex.id]: ['open', 'galleryAll', 'inText'],
      [t.sam.id]: ['open', 'galleryAll', 'inText', 'gallerySam', 'inThorinBlock'],
    };
    for (const p of [t.alex, t.sam]) {
      const seen = JSON.stringify((await t.request('GET', `${base}/${page.id}?as=${p.id}`)).json().page);
      for (const [name, id] of Object.entries(ids)) {
        const may = visibleTo[p.id].includes(name);
        assert.equal(seen.includes(id), may, `${p.name}: ${name} ${may ? 'is' : 'is not'} in what Ask may tell them`);
        const res = await t.request('GET', `${base}/pictures/${id}`, { as: p.token });
        assert.equal(res.statusCode, may ? 200 : 404, `${p.name} fetching ${name}`);
      }
      assert.ok(!seen.includes('The cult') && !seen.includes('secret cellar'), 'the DM-only fact and banner caption stay with the DM');
    }
    assert.equal((await t.request('GET', `${base}/pictures/${ids.inDmSection}`)).statusCode, 200, 'the DM gets every picture');

    // Ask: the player reads the facts and captions available to them, never the DM's.
    await t.request('POST', `/campaigns/${cid}/ask`, { as: t.alex.token, body: { question: 'What is at the Hollow Mill?' } });
    const call = llm.calls.at(-1);
    assert.match(call.prompt, /Region: North of Brindle/);
    assert.match(call.prompt, /\[picture: The wheel\]/);
    assert.doesNotMatch(call.prompt, /The cult|altar|The trap|picture:[a-f0-9]/);

    // When the page stops being available, so do its pictures.
    await t.request('PUT', `${base}/${page.id}`, { body: { version: page.version, available: 'dm' } });
    assert.equal((await t.request('GET', `${base}/pictures/${ids.open}`, { as: t.alex.token })).statusCode, 404);
    assert.equal((await t.request('GET', `${base}/pictures/ffffffffff`, { as: t.alex.token })).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test('wiki pictures: the AI offers a picture the app has for a new page, and its changes keep the DM\'s pictures', async () => {
  let millSection;
  let mill;
  const llm = createFakeLLM({
    wiki: ({ purpose }) => {
      if (purpose === 'wiki:session 1') {
        return {
          changes: [
            { action: 'new_page', page_id: null, section_id: null, new_page: { title: 'Goblin King', kind: 'npc', aliases: [], parent_title: null, sections: [{ heading: '', text: 'Rules the hills.', sources: [] }] }, section: null, players: [], sources: [], reason: 'New.' },
            { action: 'update_section', page_id: mill.id, section_id: millSection.id, new_page: null, section: { heading: 'What it is', text: 'An old mill, burnt.', sources: [] }, players: [], sources: [], reason: 'It burnt.' },
          ],
        };
      }
      return { changes: [] };
    },
  });
  const t = await setup({ llm });
  try {
    const cid = t.campaign.id;
    const goblin = (await t.request('POST', `/campaigns/${cid}/creatures`, { body: { name: 'Goblin King', kind: 'enemy', picture: { filename: 'g.png', data: (await picture(300, 300)).toString('base64') } } })).json();
    const pic = await addPicture(t, await picture(100, 100));
    mill = (await t.request('POST', `/campaigns/${cid}/wiki`, { body: { title: 'Hollow Mill', sections: [{ heading: 'What it is', text: `An old mill.\n\n![The wheel](picture:${pic.id})`, available: 'all' }] } })).json().page;
    millSection = mill.sections[0];
    const res = await t.request('POST', `/campaigns/${cid}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    assert.equal(res.statusCode, 201);
    await t.jobs.idle();
    const { proposals } = (await t.request('GET', `/campaigns/${cid}/wiki/proposals`)).json();
    const king = proposals.find((p) => p.action === 'new_page');
    assert.deepEqual(king.picture, { kind: 'creature', id: goblin.id, name: 'Goblin King' }, 'matched by name, no AI call');
    const page = (await t.request('POST', `/campaigns/${cid}/wiki/proposals/${king.id}/approve`, { body: {} })).json().page;
    assert.ok(page.picture?.id, 'approving takes the picture');
    assert.equal((await t.request('GET', `/campaigns/${cid}/wiki/pictures`)).json().pictures[0].from.kind, 'creature');

    const change = proposals.find((p) => p.action === 'update_section');
    const after = (await t.request('POST', `/campaigns/${cid}/wiki/proposals/${change.id}/approve`, { body: {} })).json().page;
    assert.match(after.sections[0].text, /^An old mill, burnt\./);
    assert.ok(after.sections[0].text.includes(`![The wheel](picture:${pic.id})`), 'the DM\'s picture stays');
  } finally {
    await t.cleanup();
  }
});
