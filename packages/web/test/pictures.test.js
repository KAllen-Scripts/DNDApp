/**
 * Pictures of characters (sheet.js, map.js): a player uploads a token
 * picture, which shows on their token on the map for everyone; and a full
 * picture, which the AI describes into the Appearance box.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { withPage, importMap, addToken, mapReading, createFakeLLM } from './helpers.js';

const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false }) };
const picture = (width = 300, height = 300) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 60 } } }).png().toBuffer();
const byLabel = (page, label) => page.el(`#sheet [aria-label="${label}"]`);
const picturesBox = (page) => page.$('#sheet .d-pictures');
const boxButton = (page, text, which = '') => [...page.$$(`#sheet .d-pictures ${which} button`)].find((b) => b.textContent === text);
const described = { is_character: true, appearance: 'A broad dwarf with a braided red beard and a dented helm.', eyes: 'Brown', hair: 'Red, braided', skin: '', notes: '' };

test('pictures: a player uploads a token picture on the sheet; it shows on their token on the map for everyone, live', async () => {
  const llm = createFakeLLM({ structured: async () => mapReading() });
  await withPage({
    setup: { llm },
    before: async (t) => {
      const map = await importMap(t, { patch: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      return { map };
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t) => {
    page.click('[data-tab=sheet]');
    assert.match(page.text(picturesBox(page)), /Token.*Shows on the map for everyone.*Full picture.*Only you see it/);
    assert.ok(page.$('#sheet .d-pictures .token-preview.no-picture'));

    page.setFiles('#sheet .d-pictures input[aria-label="Token picture"]', [{ name: 'thorin.png', type: 'image/png', content: await picture(400, 300) }]);
    await page.waitFor(() => /token picture is saved/.test(page.text('#sheet-status')), { what: 'the upload' });
    await page.waitFor(() => /^blob:/.test(page.$('#sheet .d-pictures img.token-preview')?.src ?? ''), { what: 'the preview' });
    assert.ok(boxButton(page, 'Change', '.pic-token'));
    assert.ok((await t.request('GET', `/campaigns/${t.campaign.id}/character/pictures`, { as: t.sam.token })).json().token);

    // On the map, Thorin's token shows the picture instead of initials.
    page.click('[data-tab=map]');
    const thorin = () => page.$('#map-tokens .token[aria-label="Thorin"]');
    await page.waitFor(() => thorin()?.querySelector('img.token-picture')?.src.startsWith('blob:'), { what: 'the token picture' });
    assert.ok(thorin().classList.contains('has-picture'));
    assert.equal(thorin().querySelector('.token-initials'), null);

    // Removing it puts the initials back, live.
    page.click('[data-tab=sheet]');
    page.click(boxButton(page, 'Remove', '.pic-token'));
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /Remove your token picture/);
    assert.ok(page.$('#sheet .d-pictures .token-preview.no-picture'));
    await page.waitFor(() => thorin()?.querySelector('.token-initials'), { what: 'the initials' });
    assert.equal(page.text(thorin().querySelector('.token-initials')), 'T');
  });
});

test("pictures: another player's map shows the new token picture as soon as it's uploaded", async () => {
  const llm = createFakeLLM({ structured: async () => mapReading() });
  await withPage({
    setup: { llm },
    before: async (t) => {
      const map = await importMap(t, { patch: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
      await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    },
    page: (t) => ({ as: t.alex, storage: NO_3D }),
  }, async (page, t) => {
    page.click('[data-tab=map]');
    const thorin = () => page.$('#map-tokens .token[aria-label="Thorin"]');
    await page.waitFor(() => thorin(), { what: 'the token' });
    assert.ok(!thorin().classList.contains('has-picture'));
    const res = await t.request('PUT', `/campaigns/${t.campaign.id}/character/token`, { as: t.sam.token, body: { data: (await picture()).toString('base64') } });
    assert.equal(res.statusCode, 200);
    await page.waitFor(() => thorin()?.querySelector('img.token-picture')?.src.startsWith('blob:'), { what: 'the token picture' });
  });
});

test('pictures: the AI describes a full picture into Appearance; text the player wrote is only replaced if they agree', async () => {
  const llm = createFakeLLM({ structured: async () => described });
  await withPage({ setup: { llm }, page: (t) => ({ as: t.sam, storage: NO_3D, answers: { confirm: false } }) }, async (page, t) => {
    page.click('[data-tab=sheet]');
    page.setFiles('#sheet .d-pictures input[aria-label="Character picture"]', [{ name: 'thorin-full.png', type: 'image/png', content: await picture(300, 500) }]);
    await page.waitFor(() => /described your picture in Appearance/.test(page.text('#sheet-status')), { what: 'the description' });
    assert.equal(page.dialogs.length, 0, 'nothing to replace, so no question');
    assert.equal(byLabel(page, 'Character appearance').value, described.appearance);
    assert.equal(byLabel(page, 'Eyes').value, 'Brown');
    assert.equal(byLabel(page, 'Hair').value, 'Red, braided');
    await page.waitFor(() => /^blob:/.test(page.$('#sheet .d-pictures img.full-preview')?.src ?? ''), { what: 'the picture' });

    // The sheet the server saved is the one on screen: typing saves without a conflict.
    page.type(byLabel(page, 'Character appearance'), 'Short, even for a dwarf.');
    await page.waitFor(() => page.text('#sheet-status') === 'Saved', { what: 'the save' });
    const sheet = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json().sheet;
    assert.equal(sheet.appearance, 'Short, even for a dwarf.');
    assert.equal(sheet.eyes, 'Brown');

    // Describing again asks first; saying no keeps the text and shows the description to use if wanted.
    page.click(boxButton(page, 'Describe again'));
    await page.waitFor(() => /your own Appearance text was kept/.test(page.text('#sheet-status')), { what: 'the description' });
    assert.match(page.dialogs.at(-1).message, /Replace your Appearance text/);
    assert.equal(byLabel(page, 'Character appearance').value, 'Short, even for a dwarf.');
    assert.match(page.text('#sheet .unused-description'), /braided red beard/);
    page.click(boxButton(page, 'Use it'));
    assert.equal(byLabel(page, 'Character appearance').value, described.appearance);
    assert.equal(page.$('#sheet .unused-description'), null);
    await page.waitFor(() => page.text('#sheet-status') === 'Saved', { what: 'the save' });
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json().sheet.appearance, described.appearance);
  });
});

test("pictures: something that isn't a picture is refused with the server's reason", async () => {
  await withPage({ page: (t) => ({ as: t.sam, storage: NO_3D }) }, async (page) => {
    page.click('[data-tab=sheet]');
    page.setFiles('#sheet .d-pictures input[aria-label="Token picture"]', [{ name: 'notes.png', type: 'image/png', content: 'hello' }]);
    await page.waitFor(() => /Couldn't upload/.test(page.text('#sheet-status')), { what: 'the error' });
    assert.match(page.text('#sheet-status'), /isn't a picture that can be read/);
    assert.ok(page.$('#sheet-status').classList.contains('error'));
  });
});
