/**
 * Attacks and area spells from the map (map/attacks.js): pick an enemy and Attack, pick an action, the card;
 * attacking from your own token and tapping the target; an area spell's template; the DM's Apply and Undo;
 * the campaign switch.
 *
 * The map view is 700 x 490 and fitted, so a point on screen is the same point on the map (35 px squares, 5 ft).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, importMap, addToken, mapReading, createFakeLLM } from './helpers.js';

const mapLLM = () => createFakeLLM({ structured: async () => mapReading() });
const SHOWN = { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } };
const NO_3D = { 'dndapp.dice': JSON.stringify({ threeD: false, sound: false, effects: false }) };

/** Dice the tests decide: each roll takes the next number (then 10s). */
function scripted() {
  const queue = [];
  return { random: (sides) => Math.min(sides, queue.length ? queue.shift() : 10), next: (...n) => queue.push(...n) };
}

const GOBLIN = `**Goblin**
**Armor Class** 15
**Saving Throws** Dex +4
| STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|
| 8 (-1) | 14 (+2) | 10 (+0) | 10 (+0) | 8 (-1) | 8 (-1) |
***Scimitar.*** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage.`;
const RAPIER = { name: 'Rapier', qty: 1, equipped: 1, proficient: true, kind: 'weapon', weapon: { damage: '1d8 piercing', ability: 'finesse', category: 'martial', properties: ['finesse'] } };
const FIREBALL = { name: 'Fireball', level: 3, range: '150 feet', description: 'Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.' };

async function openMapTab(page) {
  page.click('[data-tab=map]');
  page.setRect('#map-view', { width: 700, height: 490 });
  page.click('#map-fit');
  await page.settle();
}

const tokenEl = (page, name) => page.$(`#map-tokens .token[aria-label="${name}"]`);
const tap = (page, name, x, y) => {
  page.pointer(tokenEl(page, name), 'pointerdown', { clientX: x, clientY: y });
  page.pointer('#map-view', 'pointerup', { clientX: x, clientY: y });
};
const actionButton = (page, name) => [...page.$('#map-dialog').querySelectorAll('.attack-go')].find((b) => b.querySelector('strong')?.textContent === name);
const modeButton = (page, name) => [...page.$('#map-dialog').querySelectorAll('.attack-modes button')].find((b) => b.textContent === name);

async function sheet(t, who, changes) {
  const got = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: who.token })).json();
  await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: who.token, body: { sheet: { ...got.sheet, ...changes }, version: got.version } });
}

test('a player picks an enemy, presses Attack and taps their weapon: the server rolls, and a card says what happened', async () => {
  const dice = scripted();
  await withPage({
    setup: { llm: mapLLM(), random: dice.random },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await sheet(t, t.sam, { classes: [{ name: 'Rogue', subclass: '', level: 5 }], abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 }, inventory: [RAPIER] });
      const thorin = await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      const goblin = await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 87.5, y: 52.5, hp: { current: 20, max: 20 }, stats: { text: GOBLIN }, conditions: ['prone'] });
      return { map, thorin, goblin };
    },
    page: (t) => ({ as: t.sam, storage: NO_3D }),
  }, async (page, t, { map, goblin }) => {
    await openMapTab(page);
    tap(page, 'Goblin', 87, 52);
    await page.settle();
    const attack = page.$('#map-selection [data-attack="at"]');
    assert.ok(attack, 'the Attack button on the enemy');
    page.click(attack);
    await page.waitFor(() => page.$('#map-dialog').open && actionButton(page, 'Rapier'), { what: 'the attack picker' });
    assert.match(page.text('#map-dialog'), /Attack Goblin/);
    assert.match(page.text('#map-dialog'), /5 ft away/);
    assert.match(actionButton(page, 'Rapier').textContent, /\+6 · 1d8\+3 piercing/);
    // The prone goblin next to Thorin: advantage, said in the picker; Sneak Attack is ticked because of it.
    assert.match(page.text('#map-dialog .attack-row[data-action^="gear:"]'), /Advantage: Goblin is prone/);
    assert.equal(page.$('#map-dialog [data-rider="sneak_attack"]').checked, true);
    // d20s 14 and 3 (advantage keeps 14): 20 hits AC 15; 1d8 4 + 3; Sneak Attack 3d6 = 2 + 2 + 2.
    dice.next(14, 3, 4, 2, 2, 2);
    page.click(actionButton(page, 'Rapier'));
    await page.waitFor(() => page.$('#map-attack-cards .attack-card'), { what: 'the card' });
    const sent = page.requests.filter((r) => r.path.endsWith('/attack')).at(-1).body;
    assert.deepEqual(sent, { attacker: sent.attacker, action: sent.action, target: goblin.id, mode: 'normal', riders: ['sneak_attack'], rider_options: {}, two_hands: false });
    assert.match(page.text('#map-attack-cards'), /Thorin · Rapier · \+ Sneak Attack/);
    assert.match(page.text('#map-attack-cards'), /Goblin: 20 \(14, 3\), hit, 13 piercing damage/);
    assert.doesNotMatch(page.text('#map-attack-cards'), /AC 15/, 'players do not see its AC');
    assert.equal(t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.id === goblin.id).hp.current, 7);
    // The log has it.
    page.click('#map-attacks-log');
    await page.waitFor(() => page.$('#map-dialog .attack-log-list .attack-card'), { what: 'the log' });
    assert.match(page.text('#map-dialog'), /Attack log.*Thorin · Rapier/s);
  });
});

test('from your own token: Attack, the weapon, then tap who (or Cancel); an area spell places its template and catches who is in it', async () => {
  const dice = scripted();
  await withPage({
    setup: { llm: mapLLM(), random: dice.random },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await sheet(t, t.alex, { classes: [{ name: 'Wizard', subclass: '', level: 5 }], abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 }, spells: [FIREBALL], inventory: [{ ...RAPIER, name: 'Dagger', weapon: { damage: '1d4 piercing', ability: 'finesse', category: 'simple', properties: ['finesse', 'light', 'thrown'] } }] });
      await addToken(t, map, { kind: 'pc', name: 'Lyra', user_id: t.alex.id, x: 52.5, y: 52.5 });
      await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 332.5, y: 332.5, hp: { current: 20, max: 20 }, stats: { text: GOBLIN } });
      await addToken(t, map, { kind: 'enemy', name: 'Orc', x: 402.5, y: 297.5, hp: { current: 30, max: 30 } });
      return { map };
    },
    page: (t) => ({ as: t.alex, storage: NO_3D }),
  }, async (page, t, { map }) => {
    await openMapTab(page);
    tap(page, 'Lyra', 52, 52);
    await page.settle();
    page.click(page.$('#map-selection [data-attack="with"]'));
    await page.waitFor(() => actionButton(page, 'Dagger'), { what: 'the picker' });
    assert.match(page.text('#map-dialog'), /Attacks.*Dagger.*Spells.*Fireball.*DC 15 Dex save · 8d6 fire · 20 ft sphere/s);
    assert.match(page.text('#map-dialog'), /2 3rd-level slots left/);
    // The dagger, then Cancel instead of a target.
    page.click(actionButton(page, 'Dagger'));
    await page.settle();
    assert.ok(page.visible('#map-targeting'));
    assert.match(page.text('#map-targeting'), /Tap who Lyra attacks with Dagger/);
    assert.ok(tokenEl(page, 'Goblin').classList.contains('targetable'));
    page.click([...page.$('#map-targeting').querySelectorAll('button')].find((b) => b.textContent === 'Cancel'));
    assert.ok(!page.visible('#map-targeting'));
    // Again, and tap the goblin: d20 2 + 5 misses.
    tap(page, 'Lyra', 52, 52);
    await page.settle();
    page.click(page.$('#map-selection [data-attack="with"]'));
    await page.waitFor(() => actionButton(page, 'Dagger'), { what: 'the picker' });
    page.click(modeButton(page, 'Disadvantage'));
    page.click(actionButton(page, 'Dagger'));
    await page.settle();
    dice.next(2, 2);
    tap(page, 'Goblin', 332, 332);
    await page.waitFor(() => page.$('#map-attack-cards .attack-card'), { what: 'the card' });
    assert.equal(page.requests.filter((r) => r.path.endsWith('/attack')).at(-1).body.mode, 'disadvantage');
    assert.match(page.text('#map-attack-cards'), /Goblin: 7 \(2, 2\), miss/);

    // Fireball: the picker closes and the template follows the tap; the server catches the goblin and the orc.
    tap(page, 'Lyra', 52, 52);
    await page.settle();
    page.click(page.$('#map-selection [data-attack="with"]'));
    await page.waitFor(() => actionButton(page, 'Fireball'), { what: 'the picker' });
    page.click(actionButton(page, 'Fireball'));
    await page.settle();
    assert.equal(page.$('#map-template').getAttribute('aria-pressed'), 'true');
    assert.match(page.text('#map-status'), /Tap where Fireball centres/);
    // 8d6 = 8 × 3 = 24; Goblin saves 12 + 4 = 16 (half, 12), Orc 5 + 0 fails (24).
    dice.next(3, 3, 3, 3, 3, 3, 3, 3, 12, 5);
    page.pointer('#map-view', 'pointerdown', { clientX: 352, clientY: 318 });
    page.pointer('#map-view', 'pointerup', { clientX: 352, clientY: 318 });
    await page.waitFor(() => page.requests.some((r) => r.path.endsWith('/attack') && r.body.template), { what: 'the cast' });
    await page.waitFor(() => /Fireball/.test(page.text('#map-attack-cards')), { what: 'the Fireball card' });
    assert.match(page.text('#map-attack-cards'), /Lyra · Fireball · 3rd level/);
    assert.match(page.text('#map-attack-cards'), /Goblin: Dex save 16 vs DC 15: saved, 12 fire damage/);
    assert.match(page.text('#map-attack-cards'), /Orc: Dex save 5 vs DC 15: failed, 24 fire damage/);
    const m = t.maps.get(t.campaign.id, map.id);
    assert.deepEqual(m.tokens.filter((x) => x.kind === 'enemy').map((x) => x.hp.current), [8, 6]);
    assert.equal(m.templates[0].label, 'Fireball');
  });
});

test('the DM gets Apply buttons when damage waits, sees AC, and can Undo; the switch hides Attack', async () => {
  const dice = scripted();
  await withPage({
    setup: { llm: mapLLM(), random: dice.random },
    before: async (t) => {
      await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { attacks: { damage: 'dm' } } });
      const map = await importMap(t, { patch: SHOWN });
      await sheet(t, t.sam, { classes: [{ name: 'Fighter', subclass: '', level: 1 }], abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, inventory: [{ ...RAPIER, name: 'Longsword', weapon: { damage: '1d8 slashing', ability: 'str', category: 'martial', properties: ['versatile'] } }] });
      const thorin = await addToken(t, map, { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
      const goblin = await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 87.5, y: 52.5, hp: { current: 20, max: 20 }, stats: { text: GOBLIN } });
      return { map, thorin, goblin, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, storage: NO_3D }),
  }, async (page, t, { map, thorin, goblin }) => {
    await openMapTab(page);
    const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
    // Sam attacks; the DM's page gets the card, waiting, with Apply / Half / Skip.
    const acts = (await t.request('GET', `${base}/tokens/${thorin.id}/actions`, { as: t.sam.token })).json();
    dice.next(16, 6);
    await t.request('POST', `${base}/attack`, { as: t.sam.token, body: { attacker: thorin.id, action: acts.actions[0].id, target: goblin.id } });
    await page.waitFor(() => page.$('#map-attack-cards .attack-card.pending'), { what: 'the waiting card' });
    assert.match(page.text('#map-attack-cards'), /Goblin: 21 vs AC 15, hit, 9 slashing damage · waiting for the DM/);
    page.click([...page.$('#map-attack-cards').querySelectorAll('button')].find((b) => b.textContent === 'Half'));
    await page.waitFor(() => /now 16 \/ 20 HP/.test(page.text('#map-attack-cards')), { what: 'half applied' });
    assert.equal(t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.id === goblin.id).hp.current, 16);
    page.click([...page.$('#map-attack-cards').querySelectorAll('button')].find((b) => b.textContent === 'Undo'));
    await page.waitFor(() => /Undone by the DM/.test(page.text('#map-attack-cards')), { what: 'undone' });
    assert.equal(t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.id === goblin.id).hp.current, 20);

    // The DM's goblin: Attack is on the goblin itself (it acts).
    tap(page, 'Goblin', 87, 52);
    await page.settle();
    assert.ok(page.$('#map-selection [data-attack="with"]'));
    // Switched off: no Attack button.
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { attacks: { on: false } } });
    await page.waitFor(() => !page.$('#map-selection [data-attack]') || (tap(page, 'Goblin', 87, 52), false), { what: 'Attack to go' });
  });
});

test('spells that aren\'t attacks: Entangle places its area and restrains, it stays in play with Break free; Bless picks several, then Cast', async () => {
  const dice = scripted();
  const ENTANGLE = { name: 'Entangle', level: 1, range: '90 feet', duration: 'Concentration, up to 1 minute', concentration: true, description: 'Grasping weeds and vines sprout from the ground in a 20-foot square starting from a point within range. For the duration, these plants turn the ground in the area into difficult terrain. A creature in the area when you cast the spell must succeed on a Strength saving throw or be restrained by the entangling plants until the spell ends. A creature restrained by the plants can use its action to make a Strength check against your spell save DC.' };
  const BLESS = { name: 'Bless', level: 1, range: '30 feet', duration: 'Concentration, up to 1 minute', concentration: true, description: 'You bless up to three creatures of your choice within range.' };
  await withPage({
    setup: { llm: mapLLM(), random: dice.random },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      await sheet(t, t.alex, { classes: [{ name: 'Druid', subclass: '', level: 3 }], abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 }, spells: [ENTANGLE, BLESS] });
      await addToken(t, map, { kind: 'pc', name: 'Lyra', user_id: t.alex.id, x: 437.5, y: 437.5 });
      const goblin = await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 157.5, y: 157.5, hp: { current: 7, max: 7 }, stats: { text: GOBLIN } });
      return { map, goblin };
    },
    page: (t) => ({ as: t.alex, storage: NO_3D }),
  }, async (page, t, { map, goblin }) => {
    await openMapTab(page);
    const pick = async (name) => {
      tap(page, 'Lyra', 437, 437);
      await page.settle();
      page.click(page.$('#map-selection [data-attack="with"]'));
      await page.waitFor(() => actionButton(page, name), { what: 'the picker' });
    };
    await pick('Entangle');
    assert.match(actionButton(page, 'Entangle').textContent, /DC 13 Str save · restrains · difficult terrain · 20 ft cube · concentration, 1 minute/);
    assert.match(actionButton(page, 'Bless').textContent, /up to 3 · concentration, 1 minute/);
    page.click(actionButton(page, 'Entangle'));
    await page.settle();
    // The goblin's Strength save: 5 - 1 = 4, restrained.
    dice.next(5);
    page.pointer('#map-view', 'pointerdown', { clientX: 140, clientY: 140 });
    page.pointer('#map-view', 'pointerup', { clientX: 140, clientY: 140 });
    await page.waitFor(() => /Entangle/.test(page.text('#map-attack-cards')), { what: 'the Entangle card' });
    assert.match(page.text('#map-attack-cards'), /Goblin: Str save 4 vs DC 13: failed, restrained/);
    assert.match(page.text('#map-attack-cards'), /Lasts: concentration, 1 minute/);
    assert.deepEqual(t.maps.get(t.campaign.id, map.id).tokens.find((x) => x.id === goblin.id).conditions, ['restrained']);
    // In play: the log lists it, with Break free for the goblin (the DM's, not Alex's) and End spell for Alex.
    page.click('#map-attacks-log');
    await page.waitFor(() => page.$('#map-dialog .spell-in-play'), { what: 'spells in play' });
    assert.match(page.text('#map-dialog .spell-in-play'), /Entangle · Lyra \(concentrating\).*Goblin: restrained/s);
    assert.ok(!page.$('#map-dialog [data-spell-break]'), 'not Alex\'s goblin to roll for');
    assert.ok(page.$('#map-dialog [data-spell-end]'));
    assert.ok(page.$('#map-dialog [data-spell-again]'));
    page.$('#map-dialog').close();

    // Bless: tap the goblin (why not) and On yourself, then Cast. Entangle ends (concentration).
    await pick('Bless');
    page.click(actionButton(page, 'Bless'));
    await page.settle();
    assert.match(page.text('#map-targeting'), /Tap who Lyra casts Bless on \(up to 3\)/);
    tap(page, 'Goblin', 157, 157);
    await page.settle();
    assert.ok(tokenEl(page, 'Goblin').classList.contains('caught'), 'picked ones light up');
    page.click([...page.$('#map-targeting').querySelectorAll('button')].find((b) => b.textContent === 'On yourself'));
    assert.match(page.text('#map-targeting'), /Bless on Goblin, Lyra \(2 of 3\)/);
    page.click(page.$('#map-targeting [data-cast]'));
    await page.waitFor(() => /Bless/.test(page.text('#map-attack-cards')), { what: 'the Bless card' });
    assert.deepEqual(page.requests.filter((r) => r.path.endsWith('/attack')).at(-1).body.targets.length, 2);
    assert.match(page.text('#map-attack-cards'), /Entangle ended \(concentration\)/);
    const m = t.maps.get(t.campaign.id, map.id);
    assert.deepEqual([m.spells.map((x) => x.name), m.tokens.find((x) => x.id === goblin.id).conditions, m.templates.length], [['Bless'], [], 0]);
  });
});

test('the DM makes up their own effect: Effect, fill it in, tap who, Do it; and Something else in an NPC\'s picker', async () => {
  const dice = scripted();
  await withPage({
    setup: { llm: mapLLM(), random: dice.random },
    before: async (t) => {
      const map = await importMap(t, { patch: SHOWN });
      const goblin = await addToken(t, map, { kind: 'enemy', name: 'Goblin', x: 87.5, y: 52.5, hp: { current: 20, max: 20 }, stats: { text: GOBLIN } });
      const wolf = await addToken(t, map, { kind: 'npc', name: 'Wolf', x: 157.5, y: 157.5, hp: { current: 11, max: 11 } });
      return { map, goblin, wolf, dana: await addDm(t) };
    },
    page: (t, { dana }) => ({ as: dana, storage: NO_3D }),
  }, async (page, t, { map, goblin, wolf }) => {
    await openMapTab(page);
    assert.equal(page.$('#map-dm-effect').hidden, false, 'the DM has Effect');
    page.click('#map-dm-effect');
    await page.waitFor(() => page.$('#map-dialog').open && page.$('#map-dialog .custom-action'), { what: 'the custom form' });
    page.type('#map-dialog [name=name]', 'Poison gas');
    page.type('#map-dialog [name=from]', 'The vents');
    page.type('#map-dialog [name=dc]', '12');
    page.type('#map-dialog [name=save]', 'con');
    page.type('#map-dialog [name=damage]', '2d4 poison');
    page.click('#map-dialog [data-condition="poisoned"]');
    page.submit('#map-dialog form');
    await page.waitFor(() => !page.$('#map-targeting').hidden, { what: 'tap who' });
    assert.match(page.text('#map-targeting'), /Tap who gets Poison gas/);
    tap(page, 'Goblin', 87, 52);
    tap(page, 'Wolf', 157, 157);
    await page.settle();
    // 2d4 = 3 + 3; the goblin's Con save 5 fails, the wolf's 15 saves (half, ticked to start with).
    dice.next(3, 3, 5, 15);
    page.click('#map-targeting [data-cast]');
    await page.waitFor(() => page.$('#map-attack-cards .attack-card'), { what: 'the card' });
    assert.match(page.text('#map-attack-cards'), /The vents · Poison gas/);
    assert.match(page.text('#map-attack-cards'), /Goblin: Con save 5 vs DC 12: failed, poisoned, 6 poison damage/);
    const after = t.maps.get(t.campaign.id, map.id);
    assert.deepEqual(after.tokens.find((x) => x.id === goblin.id).conditions, ['poisoned']);
    assert.equal(after.tokens.find((x) => x.id === wolf.id).hp.current, 8);

    // From the goblin's own picker: Something else… opens the same form, done by the goblin.
    tap(page, 'Goblin', 87, 52);
    await page.settle();
    page.click('#map-selection [data-attack="with"]');
    await page.waitFor(() => page.$('#map-dialog').open && page.$('#map-dialog [data-custom]'), { what: 'the picker' });
    page.click('#map-dialog [data-custom]');
    await page.waitFor(() => page.$('#map-dialog .custom-action'), { what: 'the custom form again' });
    assert.equal(page.$('#map-dialog [name=by]').value, goblin.id);
    assert.equal(page.$('#map-dialog [name=name]').value, 'Poison gas', 'the last one is filled in');
  });
});
