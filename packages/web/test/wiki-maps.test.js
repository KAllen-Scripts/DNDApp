/**
 * Wiki pages and maps meet from both sides (stage 2b): a page shows where it
 * is on the maps and can reveal a hidden place; the map's place dialog links a
 * page; and part of a page goes out as a handout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, importMap } from './helpers.js';

async function world(t) {
  const map = await importMap(t, { patch: { shown: true } });
  const make = async (body) => (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body })).json().page;
  const mill = await make({ title: 'Hollow Mill', kind: 'village', available: 'all', sections: [{ heading: 'Rumours', text: 'It creaks.\n:::dm\nA body under it.\n:::', available: 'all' }] });
  const res = await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${map.id}/places`, { body: { add: { name: 'Hollow Mill', x: 100, y: 100, page: { id: mill.id } } } });
  return { map, mill, place: res.json().places[0] };
}

test('wiki maps: a page shows the maps it is on, reveals a hidden place, and sends a section as a handout', async () => {
  await withPage({
    before: async (t) => ({ dana: await addDm(t), ...(await world(t)) }),
    page: (t, { dana, mill }) => ({ as: dana, path: `/?space=wiki#/page/${mill.id}` }),
  }, async (page, t, { map, mill }) => {
    await page.waitFor(() => page.$('#wiki-main .wiki-onmap'));
    const card = page.$('.wiki-onmap-card');
    assert.ok(card.textContent.includes(`on ${map.name}`));
    assert.ok(card.textContent.includes('Hidden from players'));
    // The compass has the mini-map, which opens the Atlas there.
    await page.waitFor(() => page.$('.wiki-compass .wiki-compass-map'));
    page.click('.wiki-compass .wiki-compass-map');
    await page.waitFor(() => page.window.location.hash === `#/atlas/${map.id}`);
    page.window.history.back();
    await page.waitFor(() => page.$('#wiki-main .wiki-onmap'));

    page.click(page.$$('.wiki-onmap-card button').find((b) => b.textContent === 'Also reveal it on the map'));
    await page.waitFor(() => t.maps.get(t.campaign.id, map.id).places[0].revealed);
    assert.equal(t.maps.get(t.campaign.id, map.id).places[0].revealed_to, null, 'to every player, as the page is');

    page.click(page.$$('.wiki-section .wiki-send')[0]);
    const dialog = page.$('#wiki-handout-dialog');
    assert.ok(dialog.open);
    page.click(page.$$('#wiki-handout-dialog button').find((b) => b.textContent === 'Send'));
    await page.waitFor(() => !dialog.open);
    const sent = (await t.request('GET', `/campaigns/${t.campaign.id}/handouts`)).json().handouts.find((x) => x.title === 'Hollow Mill: Rumours');
    assert.equal(sent.text, 'It creaks.');
    assert.equal(sent.to, 'everyone');
    assert.ok(mill.id);
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});

test('wiki atlas: the map moves into the wiki with its layers and back to the table after; the Map tab still works', async () => {
  await withPage({
    before: async (t) => {
      const w = await world(t);
      await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${w.map.id}/places`, { body: { set: { id: w.place.id, revealed: true } } });
      return { dana: await addDm(t), ...w };
    },
    page: (t, { dana }) => ({ as: dana, path: '/?space=wiki#/home' }),
  }, async (page, t, { map, mill }) => {
    const panel = page.$('#tab-map');
    page.click(page.$$('#wiki-rail button').find((b) => b.textContent.includes('Atlas')));
    await page.waitFor(() => page.$('#wiki-main .wiki-atlas #tab-map'));
    assert.equal(page.$('#wiki-main #tab-map'), panel, 'the same map, moved, not a copy');
    assert.equal(page.document.documentElement.dataset.browse, '');
    await page.waitFor(() => page.window.location.hash === `#/atlas/${map.id}`);
    await page.waitFor(() => page.$('#map-wiki .map-wiki-pin'));
    const pin = page.$('#map-wiki .map-wiki-pin');
    assert.equal(pin.title, 'Hollow Mill');
    page.click(pin);
    await page.waitFor(() => page.$('.map-wiki-card'));
    assert.ok(page.$('.map-wiki-card').textContent.includes('Hollow Mill'));

    // Open page from the card: the map goes home and the page opens.
    page.click(page.$$('.map-wiki-card button').find((b) => b.textContent === 'Open page'));
    await page.waitFor(() => page.window.location.hash === `#/page/${mill.id}`);
    assert.ok(!page.$('#wiki-main #tab-map'));
    assert.equal(page.document.documentElement.dataset.browse, undefined);

    // Put it on a map, from the page: the Atlas opens on the map chosen, waiting for a click.
    page.click(page.$$('.wiki-onmap button').find((b) => b.textContent === 'Put it on a map'));
    page.click(page.$$('#wiki-put-dialog button').find((b) => b.textContent === 'Choose the spot'));
    await page.waitFor(() => page.window.location.hash === `#/atlas/${map.id}`);
    await page.waitFor(() => !page.$('.wiki-atlas-placing')?.hidden);
    assert.ok(page.$('.wiki-atlas-placing').textContent.includes('Click where Hollow Mill goes'));
    page.click(page.$$('.wiki-atlas-placing button').find((b) => b.textContent === 'Cancel'));
    assert.ok(page.$('.wiki-atlas-placing').hidden);

    // Back to the table: the Map tab has its map and no wiki layers (the button is off).
    page.click(page.$$('#wiki-rail button').find((b) => b.textContent.includes('The table')));
    page.click('[data-tab=map]');
    assert.ok(page.visible('#tab-map'));
    assert.ok(page.$('#app-view > #tab-map'), 'back in its place');
    await page.settle();
    assert.equal(page.$$('#map-wiki .map-wiki-pin').length, 0);
    page.click('#map-wiki-layers');
    await page.waitFor(() => page.$('#map-wiki .map-wiki-pin'));
    assert.equal(page.errors.length, 0, page.errors.join('\n'));
  });
});
