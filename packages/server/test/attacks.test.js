/**
 * Attacks and area spells from the map: rolling against AC, saves, damage on hit points (tokens and sheets),
 * the DM's OK and Undo, the campaign switch, and what players may see.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, terrain } from './helpers.js';

const readOut = { readable: true, kind: 'battle', name: 'Cave', description: '', grid: { visible: true, columns: 20, rows: 14 }, scale: { distance: null, unit: null, per: null }, notes: '' };

/** Dice the tests decide: each roll takes the next number (then 10s). */
function scripted() {
  const queue = [];
  const random = (sides) => Math.min(sides, queue.length ? queue.shift() : 10);
  return { random, next: (...n) => queue.push(...n), queue };
}

async function table() {
  const dice = scripted();
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }), random: dice.random });
  const png = await terrain(700, 490, { size: 35 });
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'cave.png', data: png.toString('base64') } });
  const id = res.json().id;
  for (let i = 0; t.maps.get(t.campaign.id, id).reading.status === 'pending'; i++) await new Promise((r) => setTimeout(r, 10));
  const base = `/campaigns/${t.campaign.id}/maps/${id}`;
  await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } } });
  const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
  const sheet = async (who, changes) => {
    const got = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: who.token })).json();
    const r = await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: who.token, body: { sheet: { ...got.sheet, ...changes }, version: got.version } });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const sheetOf = async (who) => (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: who.token })).json().sheet;
  const attack = (body, as) => t.request('POST', `${base}/attack`, { body, as });
  return { t, dice, base, add, sheet, sheetOf, attack, id };
}

const GOBLIN = `**Goblin**
**Armor Class** 15
**Saving Throws** Dex +4
**Damage Immunities** poison
| STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|
| 8 (-1) | 14 (+2) | 10 (+0) | 10 (+0) | 8 (-1) | 8 (-1) |
***Scimitar.*** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage.`;

const RAPIER = { name: 'Rapier', qty: 1, equipped: 1, proficient: true, kind: 'weapon', weapon: { damage: '1d8 piercing', ability: 'finesse', category: 'martial', properties: ['finesse'] } };
const FIREBALL = { name: 'Fireball', level: 3, school: 'Evocation', range: '150 feet', description: 'Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.', higher_levels: 'When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.' };

test('a player attacks an enemy they can see: to hit against its AC, damage on its hit points, and a card that hides its AC', async () => {
  const { t, dice, base, add, sheet, attack } = await table();
  try {
    await sheet(t.sam, { classes: [{ name: 'Rogue', subclass: '', level: 5 }], abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 }, inventory: [RAPIER] });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 87.5, y: 52.5, hp: { current: 12, max: 12 }, stats: { text: GOBLIN } });
    const lurker = await add({ kind: 'enemy', name: 'Lurker', x: 122.5, y: 52.5, hidden: true, hp: { current: 9, max: 9 } });

    // What Thorin can do against the goblin, with Sneak Attack offered.
    const acts = await t.request('GET', `${base}/tokens/${thorin.id}/actions?target=${goblin.id}`, { as: t.sam.token });
    assert.equal(acts.statusCode, 200, acts.body);
    const rapier = acts.json().actions.find((x) => x.name === 'Rapier');
    assert.deepEqual([rapier.kind, rapier.bonus, rapier.damage], ['attack', 6, '1d8+3 piercing']);
    assert.equal(acts.json().gap, 5);
    assert.deepEqual(acts.json().riders[rapier.id].map((x) => [x.id, x.dice, x.checked]), [['sneak_attack', '3d6', false]]);

    // d20 13 + 6 = 19 hits AC 15; 1d8 5 + 3 = 8, Sneak Attack 3d6 = 1 + 2 + 3.
    dice.next(13, 5, 1, 2, 3);
    const res = await attack({ attacker: thorin.id, action: rapier.id, target: goblin.id, riders: ['sneak_attack'] }, t.sam.token);
    assert.equal(res.statusCode, 200, res.body);
    const card = res.json().attack;
    assert.equal(card.targets[0].hit, true);
    assert.equal(card.targets[0].amount, 14);
    assert.equal(card.targets[0].ac, null, 'players do not see an enemy AC unless the DM shows it');
    assert.equal(card.targets[0].after, null, 'nor its hit points');
    assert.deepEqual(card.action.riders, ['Sneak Attack']);
    assert.equal(res.json().rolls.length, 3);
    assert.equal(t.maps.get(t.campaign.id, res.json().map.id).tokens.find((x) => x.id === goblin.id).hp.current, 0, '12 - 14, to 0 at the lowest');
    // The DM's card has it all.
    const dm = (await t.request('GET', base)).json().attacks.at(-1);
    assert.equal(dm.targets[0].ac, 15);
    assert.deepEqual(dm.targets[0].after, { current: 0, max: 12 });

    // A miss: natural 1.
    dice.next(1);
    const miss = (await attack({ attacker: thorin.id, action: rapier.id, target: goblin.id }, t.sam.token)).json().attack;
    assert.equal(miss.targets[0].hit, false);
    assert.equal(miss.targets[0].amount, 0);

    // Not someone else's token, nor a hidden one; and Alex (who can see the map) sees the cards but not the hidden.
    assert.equal((await attack({ attacker: goblin.id, action: 'stat:0', target: thorin.id }, t.sam.token)).statusCode, 403);
    assert.equal((await attack({ attacker: thorin.id, action: rapier.id, target: lurker.id }, t.sam.token)).statusCode, 404);
    assert.equal((await t.request('GET', base, { as: t.alex.token })).json().attacks.length, 2);

    // The DM shows enemies' AC: now players see it.
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { attacks: { show_ac: true } } });
    assert.equal((await t.request('GET', base, { as: t.sam.token })).json().attacks[0].targets[0].ac, 15);

    // Switched off: no attacks from the map.
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { attacks: { on: false } } });
    const off = await attack({ attacker: thorin.id, action: rapier.id, target: goblin.id }, t.sam.token);
    assert.equal(off.statusCode, 400);
    assert.match(off.json().error, /switched off/);
  } finally {
    await t.cleanup();
  }
});

test('the DM attacks a character with an enemy: temporary hit points go first, onto the sheet', async () => {
  const { t, dice, add, sheet, sheetOf, attack } = await table();
  try {
    await sheet(t.sam, { classes: [{ name: 'Fighter', subclass: '', level: 1 }], abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, hp: { current: 12, temp: 3 } });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 87.5, y: 52.5, stats: { text: GOBLIN } });
    // Thorin's AC 10; d20 8 + 4 = 12 hits; 1d6 4 + 2 = 6: 3 from temporary, 3 from hit points.
    dice.next(8, 4);
    const res = await attack({ attacker: goblin.id, action: 'stat:0', target: thorin.id });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().attack.targets[0].amount, 6);
    const after = await sheetOf(t.sam);
    assert.deepEqual([after.hp.current, after.hp.temp], [9, 0]);
    // Sam sees the attack and his own numbers (and the goblin's dice aren't his to see).
    const seen = (await t.request('GET', res.json().map ? `/campaigns/${t.campaign.id}/maps/${res.json().map.id}` : '', { as: t.sam.token })).json().attacks.at(-1);
    assert.equal(seen.attacker.name, 'Goblin');
    assert.deepEqual([seen.targets[0].before.current, seen.targets[0].after.current], [12, 9]);
    assert.equal(seen.action.dice, '');
    assert.equal(seen.targets[0].rolled[0].notation, '1d6+2');
  } finally {
    await t.cleanup();
  }
});

test('an area spell: the template catches everyone in it (hidden ones too), each saves, half on a success, a slot is spent', async () => {
  const { t, dice, base, add, sheet, sheetOf, attack } = await table();
  try {
    await sheet(t.alex, { classes: [{ name: 'Wizard', subclass: '', level: 5 }], abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 }, spells: [FIREBALL] });
    await sheet(t.sam, { classes: [{ name: 'Fighter', subclass: '', level: 3 }], abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, hp: { current: 28 } });
    const lyra = await add({ kind: 'pc', name: 'Lyra', user_id: t.alex.id, x: 437.5, y: 437.5 });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 157.5, y: 157.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 192.5, y: 157.5, hp: { current: 20, max: 20 }, stats: { text: GOBLIN } });
    const lurker = await add({ kind: 'enemy', name: 'Lurker', x: 157.5, y: 192.5, hidden: true, hp: { current: 30, max: 30 } });
    const tpl = (await t.request('POST', `${base}/templates`, { as: t.alex.token, body: { shape: 'circle', x: 175, y: 175, size: 20, label: 'Fireball' } })).json().template;
    const acts = (await t.request('GET', `${base}/tokens/${lyra.id}/actions`, { as: t.alex.token })).json();
    const fb = acts.actions.find((x) => x.name === 'Fireball');
    assert.deepEqual([fb.kind, fb.dc, fb.save, fb.area], ['save', 15, 'dex', { shape: 'circle', size: 20 }]);
    assert.equal(acts.slots[3], 2);

    // 8d6 all 3s = 24; then saves in map order: Thorin d20 10 + 0 fails; Goblin 12 + 4 = 16 succeeds; Lurker 2 fails.
    dice.next(3, 3, 3, 3, 3, 3, 3, 3, 10, 12, 2);
    const res = await attack({ attacker: lyra.id, action: fb.id, template: tpl.id }, t.alex.token);
    assert.equal(res.statusCode, 200, res.body);
    const mine = res.json().attack;
    assert.deepEqual(mine.targets.map((x) => [x.name, x.save.success, x.amount]), [['Thorin', false, 24], ['Goblin', true, 12]], 'Alex does not see the hidden lurker');
    const dm = (await t.request('GET', base)).json().attacks.at(-1);
    assert.deepEqual(dm.targets.map((x) => x.name), ['Thorin', 'Goblin', 'Lurker']);
    const map = t.maps.get(t.campaign.id, res.json().map.id);
    assert.equal(map.tokens.find((x) => x.id === goblin.id).hp.current, 8);
    assert.equal(map.tokens.find((x) => x.id === lurker.id).hp.current, 6);
    assert.equal((await sheetOf(t.sam)).hp.current, 4);
    assert.equal((await sheetOf(t.alex)).spellcasting.slots_used[3], 1, 'a 3rd-level slot spent');
    assert.equal(map.tokens.some((x) => x.id === thorin.id), true);

    // Cast at 4th level: no 4th-level slots at wizard 5.
    const no = await attack({ attacker: lyra.id, action: fb.id, template: tpl.id, slot: 4 }, t.alex.token);
    assert.equal(no.statusCode, 400);
    assert.match(no.json().error, /no 4th-level spell slots/);

    // Undo (the DM): the hit points and the slot come back.
    const undo = await t.request('POST', `${base}/attacks/${dm.id}`, { body: { do: 'undo' } });
    assert.equal(undo.statusCode, 200, undo.body);
    const back = t.maps.get(t.campaign.id, res.json().map.id);
    assert.equal(back.tokens.find((x) => x.id === goblin.id).hp.current, 20);
    assert.equal(back.tokens.find((x) => x.id === lurker.id).hp.current, 30);
    assert.equal((await sheetOf(t.sam)).hp.current, 28);
    assert.equal((await sheetOf(t.alex)).spellcasting.slots_used[3] ?? 0, 0);
    assert.equal(undo.json().attack.status, 'undone');
    // Players can't undo.
    assert.equal((await t.request('POST', `${base}/attacks/${dm.id}`, { as: t.alex.token, body: { do: 'undo' } })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('damage can wait for the DM: Apply, Half or Skip', async () => {
  const { t, dice, base, add, sheet, attack } = await table();
  try {
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { attacks: { damage: 'dm' } } });
    await sheet(t.sam, { classes: [{ name: 'Rogue', subclass: '', level: 1 }], abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 }, inventory: [RAPIER] });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 87.5, y: 52.5, hp: { current: 12, max: 12 }, stats: { text: GOBLIN }, conditions: ['concentrating'] });
    const rapier = (await t.request('GET', `${base}/tokens/${thorin.id}/actions`, { as: t.sam.token })).json().actions.find((x) => x.name === 'Rapier');
    dice.next(15, 7);
    const card = (await attack({ attacker: thorin.id, action: rapier.id, target: goblin.id }, t.sam.token)).json().attack;
    assert.equal(card.status, 'pending');
    assert.equal(card.targets[0].status, 'pending');
    const mapId = base.split('/').at(-1);
    assert.equal(t.maps.get(t.campaign.id, mapId).tokens.find((x) => x.id === goblin.id).hp.current, 12, 'nothing yet');
    // Half: 10 → 5. The concentrating goblin rolls its Con save (DC 10): 4 + 0 fails, so it stops concentrating.
    dice.next(4);
    const half = (await t.request('POST', `${base}/attacks/${card.id}`, { body: { do: 'half' } })).json().attack;
    assert.equal(half.status, 'done');
    assert.equal(half.targets[0].amount, 5);
    assert.deepEqual(half.targets[0].concentration, { dc: 10, rolled: 4, kept: false });
    const gob = t.maps.get(t.campaign.id, mapId).tokens.find((x) => x.id === goblin.id);
    assert.deepEqual([gob.hp.current, gob.conditions], [7, []]);
    // Skip another.
    dice.next(15, 7);
    const second = (await attack({ attacker: thorin.id, action: rapier.id, target: goblin.id }, t.sam.token)).json().attack;
    const skipped = (await t.request('POST', `${base}/attacks/${second.id}`, { body: { do: 'skip' } })).json().attack;
    assert.equal(skipped.targets[0].status, 'skipped');
    assert.equal(t.maps.get(t.campaign.id, mapId).tokens.find((x) => x.id === goblin.id).hp.current, 7);
    // The DM's own attacks don't wait.
    dice.next(15, 3);
    const dms = (await attack({ attacker: goblin.id, action: 'stat:0', target: thorin.id })).json().attack;
    assert.equal(dms.status, 'done');
  } finally {
    await t.cleanup();
  }
});

test('Divine Smite from the map: offered unticked, its slot spent on a hit, refused with no slots left', async () => {
  const { t, dice, base, add, sheet, sheetOf, attack } = await table();
  try {
    const LONGSWORD = { name: 'Longsword', qty: 1, equipped: 1, proficient: true, kind: 'weapon', weapon: { damage: '1d8 slashing', ability: 'str', category: 'martial', properties: ['versatile'] } };
    await sheet(t.sam, { classes: [{ name: 'Paladin', subclass: '', level: 2 }], abilities: { str: 16, dex: 10, con: 12, int: 10, wis: 10, cha: 14 }, inventory: [LONGSWORD] });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 87.5, y: 52.5, hp: { current: 30, max: 30 }, stats: { text: GOBLIN } });
    const acts = (await t.request('GET', `${base}/tokens/${thorin.id}/actions?target=${goblin.id}`, { as: t.sam.token })).json();
    const sword = acts.actions.find((x) => x.name === 'Longsword');
    assert.deepEqual(acts.riders[sword.id].map((x) => [x.id, x.dice, x.checked]), [['divine_smite', '2d8', false]]);
    // A hit: d20 15 + 5; 1d8 4 + 3, smite 2d8 = 5 + 6.
    dice.next(15, 4, 5, 6);
    const hit = await attack({ attacker: thorin.id, action: sword.id, target: goblin.id, riders: ['divine_smite'] }, t.sam.token);
    assert.equal(hit.statusCode, 200, hit.body);
    assert.equal(hit.json().attack.targets[0].amount, 18);
    assert.equal((await sheetOf(t.sam)).spellcasting.slots_used[1], 1);
    // A miss spends nothing.
    dice.next(1);
    await attack({ attacker: thorin.id, action: sword.id, target: goblin.id, riders: ['divine_smite'] }, t.sam.token);
    assert.equal((await sheetOf(t.sam)).spellcasting.slots_used[1], 1);
    // The second slot on the next hit; then, with none left, Divine Smite isn't offered and isn't added.
    dice.next(15, 4, 5, 6);
    await attack({ attacker: thorin.id, action: sword.id, target: goblin.id, riders: ['divine_smite'] }, t.sam.token);
    assert.equal((await sheetOf(t.sam)).spellcasting.slots_used[1], 2);
    const after = (await t.request('GET', `${base}/tokens/${thorin.id}/actions?target=${goblin.id}`, { as: t.sam.token })).json();
    assert.equal(after.riders[sword.id], undefined);
    dice.next(15, 4);
    const none = await attack({ attacker: thorin.id, action: sword.id, target: goblin.id, riders: ['divine_smite'] }, t.sam.token);
    assert.deepEqual(none.json().attack.targets[0].rolled.map((r) => r.notation), ['1d8+3']);
  } finally {
    await t.cleanup();
  }
});

test('from the map: Divine Smite with the slot the player picks; Weapon Mastery Topple knocks the target prone (Undo stands it up)', async () => {
  const { t, dice, base, add, sheet, sheetOf, attack } = await table();
  try {
    await t.request('PATCH', `/campaigns/${t.campaign.id}/settings`, { body: { edition: '2024' } });
    const LONGSWORD = { name: 'Longsword', qty: 1, equipped: 1, proficient: true, kind: 'weapon', weapon: { damage: '1d8 slashing', ability: 'str', category: 'martial', properties: ['versatile'] } };
    const MAUL = { name: 'Maul', qty: 1, equipped: 1, proficient: true, kind: 'weapon', weapon: { damage: '2d6 bludgeoning', ability: 'str', category: 'martial', properties: ['heavy', 'two-handed'] } };
    await sheet(t.sam, { classes: [{ name: 'Paladin', subclass: '', level: 5 }], abilities: { str: 16, dex: 10, con: 12, int: 10, wis: 10, cha: 14 }, inventory: [LONGSWORD, MAUL], combat: { masteries: ['maul'], choices: [], on: {} } });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 87.5, y: 52.5, hp: { current: 60, max: 60 }, stats: { text: GOBLIN } });
    const acts = (await t.request('GET', `${base}/tokens/${thorin.id}/actions?target=${goblin.id}`, { as: t.sam.token })).json();
    const sword = acts.actions.find((x) => x.name === 'Longsword');
    const smite = acts.riders[sword.id].find((x) => x.id === 'divine_smite');
    assert.deepEqual(smite.options.map((o) => o.value), ['free', 1, 2]);
    // The 2nd-level slot: 3d8. d20 15 + 6; 1d8 4 + 3; 3d8 = 2 + 3 + 4.
    dice.next(15, 4, 2, 3, 4);
    const hit = await attack({ attacker: thorin.id, action: sword.id, target: goblin.id, riders: ['divine_smite'], rider_options: { divine_smite: 2 } }, t.sam.token);
    assert.equal(hit.statusCode, 200, hit.body);
    assert.equal(hit.json().attack.targets[0].amount, 16);
    assert.equal((await sheetOf(t.sam)).spellcasting.slots_used[2], 1);

    // The maul (Topple): hit, damage 3 + 3 + 3, the goblin's Con save 5 against DC 8 + 3 + 3: prone.
    const maul = acts.actions.find((x) => x.name === 'Maul');
    dice.next(15, 3, 3, 5);
    const top = (await attack({ attacker: thorin.id, action: maul.id, target: goblin.id }, t.sam.token)).json();
    assert.match(top.attack.targets[0].notes.join(' '), /Topple: Constitution save 5 against DC 14, falls prone/);
    assert.ok(t.maps.get(t.campaign.id, top.map.id).tokens.find((x) => x.id === goblin.id).conditions.includes('prone'));
    await t.request('POST', `${base}/attacks/${top.attack.id}`, { body: { do: 'undo' } });
    assert.ok(!t.maps.get(t.campaign.id, top.map.id).tokens.find((x) => x.id === goblin.id).conditions.includes('prone'));
  } finally {
    await t.cleanup();
  }
});
