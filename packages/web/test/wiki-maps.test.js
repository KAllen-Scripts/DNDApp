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
