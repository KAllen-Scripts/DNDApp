/**
 * Players read their own version of the wiki (wiki space stage 6a): every view route as the player, filtered for
 * them; and a sweep: no player response carries a hidden page's id or title, a planned part, a truth, a :::dm
 * block, another name or a hidden fact, event or pin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, terrain } from './helpers.js';

const SECRETS = ['Secret Lair', 'Planned ambush', 'The real truth', 'DM block words', 'Shadowname', 'Hidden fact value', 'Hidden event text', 'For Alex only'];

test('wiki for players: every route as the player, and nothing hidden in any of them', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    const make = async (body) => {
      const res = await t.request('POST', base, { body });
      assert.equal(res.statusCode, 201, res.body);
      return res.json().page;
    };
    const lair = await make({ title: 'Secret Lair', kind: 'place', available: 'dm', sections: [{ heading: '', text: 'The villain\'s den.', available: 'all' }] });
    const town = await make({
      title: 'Millbrook', kind: 'town', aliases: ['Shadowname'], available: 'all',
      sections: [
        { heading: '', text: 'A quiet town near [[Secret Lair|the old den]].\n\n:::dm\nDM block words\n:::', available: 'all' },
        { heading: 'Plans', text: 'Planned ambush at dawn.', available: 'all', canon: 'planned' },
        { heading: 'Gossip', text: 'The mayor is kind.', available: 'all', canon: 'false', truth: 'The real truth' },
        { heading: 'Alex', text: 'For Alex only', available: [t.alex.id] },
      ],
      facts: [{ label: 'Ruler', value: 'Mayor Bram' }, { label: 'Hidden', value: 'Hidden fact value', available: 'dm' }],
      events: [{ when: { text: 'Day 2' }, text: 'The fair opened.' }, { when: { text: 'Day 3' }, text: 'Hidden event text', available: 'dm' }],
    });
    await make({ title: 'Inside the lair', kind: 'place', parent: lair.id, available: 'all', sections: [{ heading: '', text: 'A cellar.', available: 'all' }] });
    // A map shown to the players, with a pin for each page; only the town's place is revealed.
    const map = (await t.request('POST', `/campaigns/${cid}/maps`, { body: { filename: 'm.png', name: 'Vale', data: (await terrain(400, 300)).toString('base64') } })).json();
    await t.request('PATCH', `/campaigns/${cid}/maps/${map.id}`, { body: { shown: true } });
    await t.maps.change(cid, map.id, (m) => {
      m.places.push({ id: 'p00001', name: 'Millbrook', x: 10, y: 10, revealed: true, page: { id: town.id } }, { id: 'p00002', name: 'Lair', x: 50, y: 50, revealed: false, page: { id: lair.id } });
    }, { by: t.dm.id, reason: 'test' });

    const as = { as: t.sam.token };
    const get = async (path) => {
      const res = await t.request('GET', `${base}${path}`, as);
      return { code: res.statusCode, body: res.body, json: res.statusCode === 200 ? res.json() : null };
    };
    const responses = {
      list: await get(''),
      home: await get('/home'),
      wheel: await get('/wheel'),
      page: await get(`/${town.id}`),
      compass: await get(`/${town.id}/compass`),
      find: await get('/find?q=lair'),
      findText: await get('/find?q=villain den'),
      atlas: await get('/atlas'),
      web: await get('/web'),
      timeline: await get('/timeline'),
      evidence: await get('/evidence'),
      inside: await get(`/${(await t.request('GET', base)).json().pages.find((p) => p.title === 'Inside the lair').id}`),
    };
    for (const [name, r] of Object.entries(responses)) {
      assert.equal(r.code, 200, `${name}: ${r.body}`);
      for (const s of [...SECRETS, lair.id]) assert.ok(!r.body.includes(s), `${name} leaks "${s}"`);
    }
    // What they do get.
    assert.deepEqual(responses.list.json.pages.map((p) => p.title).sort(), ['Inside the lair', 'Millbrook']);
    assert.equal(responses.list.json.proposals, undefined);
    assert.equal(responses.page.json.page.title, 'Millbrook');
    assert.deepEqual(responses.page.json.page.aliases, []);
    assert.deepEqual(responses.page.json.page.facts.map((f) => f.label), ['Ruler']);
    assert.deepEqual(responses.page.json.page.events.map((e) => e.text), ['The fair opened.']);
    assert.ok(responses.page.json.page.sections.some((s) => s.canon === 'rumour'), 'false reads as a rumour');
    assert.equal(responses.inside.json.page.parent, null, 'a hidden parent isn\'t named');
    assert.deepEqual(responses.atlas.json.layers.pins.map((p) => p.page.title), ['Millbrook']);
    assert.equal(responses.home.json.waiting, undefined);
    // A hidden page is the same 404 as one that doesn't exist; ?as= can't look as someone else.
    assert.equal((await get(`/${lair.id}`)).code, 404);
    assert.equal((await get(`/${lair.id}/compass`)).code, 404);
    assert.equal((await get('/aaaaaaaaaa')).code, 404);
    assert.ok(!(await get(`/${town.id}?as=${t.alex.id}`)).body.includes('For Alex only'));
    assert.ok((await t.request('GET', `${base}/${town.id}`, { as: t.alex.token })).body.includes('For Alex only'), 'Alex gets his own part');
    // The DM's routes stay the DM's.
    for (const path of ['/proposals', '/templates', `/${town.id}/history`, `/${town.id}/links`, '/pictures']) assert.equal((await get(path)).code, 403, path);
    assert.equal((await t.request('PUT', `${base}/${town.id}`, { body: { title: 'X' }, ...as })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});
