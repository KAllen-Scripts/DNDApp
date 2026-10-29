/**
 * The sheet's Companions box (sheet/companions.js): a familiar from Find
 * Familiar, a Steel Defender worked out from the sheet, rolling their
 * attacks, Put on the map and Dismiss.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, importMap, addToken, mapReading, createFakeLLM } from './helpers.js';
import { emptySheet } from '@dndapp/shared/sheet.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const saved = (page) => page.waitFor(() => page.text('#sheet-status') === 'Saved', { what: 'the sheet to save' });

test('companions: a familiar from Find Familiar joins the sheet, rolls, goes on the map next to the character and is dismissed', async () => {
  await withPage({
    setup: { llm: createFakeLLM({ structured: async () => mapReading() }) },
    before: async (t) => {
      t.sheets.save(t.campaign.id, t.sam.id, {
        ...emptySheet({ name: 'Thorin' }), classes: [{ name: 'Wizard', level: 3 }], abilities: { str: 10, dex: 12, con: 12, int: 16, wis: 10, cha: 10 },
        spells: [{ name: 'Find Familiar', level: 1 }],
      });
      const map = await importMap(t, { patch: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52, y: 52 });
      return { map };
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t, { map }) => {
    page.click('[data-tab=sheet]');
    const box = () => page.$('#sheet .companions');
    assert.match(box().textContent, /Familiars, pets, mounts/);
    const from = box().querySelector('[aria-label="Where the companion comes from"]');
    assert.ok([...from.options].some((o) => o.value === 'find_familiar'), 'Find Familiar is offered: the sheet has the spell');
    page.type(from, 'find_familiar');
    assert.ok([...box().querySelectorAll('#dl-companion-creatures option')].some((o) => o.value === 'Owl'));
    page.type(box().querySelector('[aria-label="Creature"]'), 'Owl');
    page.type(box().querySelector('[aria-label="Companion name"]'), 'Hoot');
    page.submit(box().querySelector('form.companion-add'));
    await page.waitFor(() => box().querySelector('.companion'), { what: 'the owl on the sheet' });
    const card = box().querySelector('.companion');
    assert.equal(card.querySelector('.companion-name').textContent, 'Hoot');
    assert.match(card.textContent, /from Find Familiar \(spell\)/);
    assert.equal(card.querySelector('[aria-label="Hoot hit points"]').value, '1');

    // Its attack rolls from its stat block (the SRD owl's Talons: +3 to hit).
    page.click(card.querySelector('[aria-label="Roll Hoot Talons to hit"]'));
    await page.settle();
    assert.equal(page.requests.filter((r) => r.path.endsWith('/roll')).at(-1).body.notation, '1d20+3');

    // Put on the map: the token is next to Thorin and tied to the sheet.
    page.click([...box().querySelectorAll('button')].find((b) => b.textContent === 'Put on the map'));
    await page.waitFor(() => /is on "/.test(box().textContent), { what: 'the owl on the map' });
    const token = t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.kind === 'companion');
    const owl = t.sheets.get(t.campaign.id, t.sam.id).sheet.companions[0];
    assert.equal(token.companion, owl.id);
    assert.equal(token.name, 'Hoot');
    assert.ok(box().querySelector('.companion-where'));

    // Dismissed on the sheet: off the sheet and the map.
    page.window.confirm = () => true;
    page.click(box().querySelector('[aria-label="Dismiss Hoot"]'));
    await saved(page);
    assert.equal(t.sheets.get(t.campaign.id, t.sam.id).sheet.companions.length, 0);
    assert.ok(!t.maps.get(t.campaign.id, map.id).tokens.some((x) => x.kind === 'companion'));
  });
});

test("companions: a Battle Smith's Steel Defender is worked out from the sheet, with no lookup", async () => {
  await withPage({
    before: async (t) => {
      t.sheets.save(t.campaign.id, t.sam.id, {
        ...emptySheet({ name: 'Tink' }), classes: [{ name: 'Artificer', subclass: 'Battle Smith', level: 5 }], abilities: { str: 10, dex: 12, con: 12, int: 18, wis: 10, cha: 10 },
      });
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t) => {
    page.click('[data-tab=sheet]');
    const box = () => page.$('#sheet .companions');
    page.type(box().querySelector('[aria-label="Where the companion comes from"]'), 'steel_defender');
    page.submit(box().querySelector('form.companion-add'));
    await page.waitFor(() => box().querySelector('.companion'), { what: 'the defender' });
    const card = box().querySelector('.companion');
    // 2 + Int (4) + 5 × artificer level 5.
    assert.equal(card.querySelector('[aria-label="Steel Defender hit points"]').value, '31');
    assert.match(card.textContent, /Force-Empowered Rend\s*\+7 to hit · 1d8\+3 force/);
    assert.ok(!page.requests.some((r) => r.path.includes('/forms/lookup')));
    await saved(page);
    assert.equal(t.sheets.get(t.campaign.id, t.sam.id).sheet.companions[0].form.name, 'Steel Defender');
  });
});

test("companions: the map's Companion button lists the sheet's companions to put on this map", async () => {
  await withPage({
    setup: { llm: createFakeLLM({ structured: async () => mapReading() }) },
    before: async (t) => {
      const form = (await (await t.request('GET', `/campaigns/${t.campaign.id}/forms/lookup?name=Mastiff`, { as: t.sam.token })).json());
      t.sheets.save(t.campaign.id, t.sam.id, { ...emptySheet({ name: 'Thorin' }), companions: [{ id: 'dog-1', name: 'Biscuit', kind: 'pet', form }] });
      const map = await importMap(t, { patch: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52, y: 52 });
      return { map };
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t, { map }) => {
    page.click('[data-tab=map]');
    await page.waitFor(() => !page.$('#map-add-companion').disabled, { what: 'the map' });
    page.click('#map-add-companion');
    await page.waitFor(() => /From your sheet/.test(page.text('#map-dialog')), { what: "the sheet's companions" });
    page.click([...page.$('#map-dialog').querySelectorAll('button')].find((b) => b.textContent === 'Put on the map'));
    await page.waitFor(() => t.maps.get(t.campaign.id, map.id).tokens.some((x) => x.companion === 'dog-1'), { what: 'Biscuit on the map' });
    await page.waitFor(() => page.$('#map-tokens .token[aria-label="Biscuit"]'), { what: "Biscuit's token" });
  });
});

test("regression: the map's Companion button is one of the main map tools, not hidden behind More in full screen", async () => {
  await withPage({ page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page) => {
    const button = page.$('#map-add-companion');
    assert.ok(button.classList.contains('map-main'), 'full screen shows only .map-main tools until More');
    assert.ok(button.classList.contains('player-only'));
  });
});
