import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM, terrain } from './helpers.js';

const readOut = () => ({
  readable: true, kind: 'battle', name: 'Cave', description: 'A cave.', grid: { visible: true, columns: 20, rows: 14 },
  scale: { distance: null, unit: null, per: null }, notes: '',
});
const wolf = {
  found: true, name: 'Wolf', size: 'medium', ac: 13, hp_average: 11, hp_formula: '2d8 + 2', speed: '40 ft.', challenge: '1/4 (50 XP)',
  stat_block: '**Wolf** Medium beast\n\n| STR | DEX | CON | INT | WIS | CHA |\n|---|---|---|---|---|---|\n| 12 (+1) | 15 (+2) | 12 (+1) | 3 (-4) | 12 (+1) | 6 (-2) |\n\n***Bite.*** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 7 (2d4 + 2) piercing damage.',
};

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** A shown 700 x 490 map with 35 px squares, and Sam's character Thorin at (52.5, 52.5). */
async function cave(t) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename: 'cave.png', data: (await terrain(700, 490, { size: 35 })).toString('base64') } });
  const map = res.json();
  await until(() => t.maps.get(t.campaign.id, map.id).reading.status !== 'pending');
  const base = `/campaigns/${t.campaign.id}/maps/${map.id}`;
  await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 } } });
  const thorin = (await t.request('POST', `${base}/tokens`, { body: { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 50, y: 50 } })).json().token;
  return { base, thorin };
}

test('companions: a player adds their own familiar or summon, moves it, tracks its hit points and dismisses it; nobody else can', async () => {
  const llm = createFakeLLM({ structured: (opts) => (opts.purpose === 'map:stats' ? wolf : readOut()) });
  const t = await setup({ llm });
  try {
    const { base } = await cave(t);
    const add = (body, as = t.sam.token) => t.request('POST', `${base}/tokens`, { body, as });

    // Anything but a companion of their own is the DM's to add.
    assert.equal((await add({ kind: 'enemy', name: 'Goblin' })).statusCode, 403);
    assert.equal((await add({ name: 'Wolf', hidden: true })).statusCode, 403);
    assert.equal((await add({ name: 'Wolf', user_id: t.alex.id })).statusCode, 403);
    assert.equal((await add({ name: '' })).statusCode, 400);

    const res = await add({ name: 'Wolf', x: 200, y: 200, hp: { current: null, max: 11 } });
    assert.equal(res.statusCode, 201, res.body);
    const w = res.json().token;
    assert.equal(w.kind, 'companion');
    assert.equal(w.user_id, t.sam.id);
    assert.deepEqual({ x: w.x, y: w.y }, { x: 192.5, y: 192.5 }); // snapped to a square
    assert.deepEqual(w.hp, { current: 11, max: 11 });

    // Sam moves it and hurts it; Alex can't touch it, but sees how it's doing like a party member's.
    const patch = (body, as = t.sam.token) => t.request('PATCH', `${base}/tokens/${w.id}`, { body, as });
    assert.equal((await patch({ x: 300, y: 200 })).statusCode, 200);
    assert.equal((await patch({ hp: { current: 4, max: 11 }, name: 'Grey wolf' })).statusCode, 200);
    assert.equal((await patch({ hidden: true })).statusCode, 403);
    assert.equal((await patch({ user_id: t.alex.id })).statusCode, 403);
    assert.equal((await patch({ x: 100, y: 100 }, t.alex.token)).statusCode, 403);
    const forAlex = (await t.request('GET', base, { as: t.alex.token })).json().tokens.find((x) => x.id === w.id);
    assert.deepEqual(forAlex.hp, { current: 4, max: 11 });
    assert.equal(forAlex.name, 'Grey wolf');

    // A player can't remove the DM's tokens; only their own companion can be dismissed.
    const goblin = (await t.request('POST', `${base}/tokens`, { body: { kind: 'enemy', name: 'Goblin', x: 400, y: 400 } })).json().token;
    assert.equal((await t.request('DELETE', `${base}/tokens/${goblin.id}`, { as: t.sam.token })).statusCode, 403);
    assert.equal((await t.request('DELETE', `${base}/tokens/${w.id}`, { as: t.alex.token })).statusCode, 403);
    assert.equal((await t.request('DELETE', `${base}/tokens/${w.id}`, { as: t.sam.token })).statusCode, 200);
    assert.ok(!t.maps.get(t.campaign.id, base.split('/').pop()).tokens.some((x) => x.id === w.id));
  } finally {
    await t.cleanup();
  }
});

test('companions: its stat block goes only to the player who controls it, and their lookup never copies the DM\'s own creatures', async () => {
  const llm = createFakeLLM({ structured: (opts) => (opts.purpose === 'map:stats' ? wolf : readOut()) });
  const t = await setup({ llm });
  try {
    const { base } = await cave(t);
    // The DM keeps a secret creature called Wolf (a werewolf in disguise).
    const made = await t.request('POST', `/campaigns/${t.campaign.id}/creatures`, { body: { name: 'Wolf', kind: 'enemy', stats: { text: 'Secretly a werewolf.' } } });
    assert.equal(made.statusCode, 201, made.body);

    const w = (await t.request('POST', `${base}/tokens`, { body: { name: 'Wolf', x: 200, y: 200 }, as: t.sam.token })).json().token;
    const filled = await t.request('POST', `${base}/tokens/${w.id}/stats`, { as: t.sam.token });
    assert.equal(filled.statusCode, 200, filled.body);
    assert.match(filled.json().token.stats.text, /Bite/);
    assert.doesNotMatch(filled.json().token.stats.text, /werewolf/);
    assert.deepEqual(filled.json().token.hp, { current: 11, max: 11 });
    assert.ok(llm.calls.some((c) => c.purpose === 'map:stats'));

    // Alex can't fill it, and doesn't get it.
    assert.equal((await t.request('POST', `${base}/tokens/${w.id}/stats`, { as: t.alex.token })).statusCode, 403);
    const tokenFor = async (as) => (await t.request('GET', base, { as })).json().tokens.find((x) => x.id === w.id);
    assert.equal((await tokenFor(t.alex.token)).stats, null);
    assert.match((await tokenFor(t.sam.token)).stats.text, /Bite/);
  } finally {
    await t.cleanup();
  }
});

test('companions: the player sees what their companion sees, and can only put one where they can see', async () => {
  const llm = createFakeLLM({ structured: () => readOut() });
  const t = await setup({ llm });
  try {
    const { base } = await cave(t);
    const goblin = (await t.request('POST', `${base}/tokens`, { body: { kind: 'enemy', name: 'Goblin', x: 600, y: 60 } })).json().token;
    // A wall down the middle; Thorin is on the left, the goblin on the right.
    await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 350, y1: 0, x2: 350, y2: 490 } } });
    await t.request('PATCH', `${base}/fog`, { body: { enabled: true, sight: true } });
    const seen = async () => (await t.request('GET', base, { as: t.sam.token })).json().tokens.map((x) => x.name).sort();
    assert.deepEqual(await seen(), ['Thorin']);

    // Asking for a spot behind the wall puts it next to Thorin instead.
    const add = (body) => t.request('POST', `${base}/tokens`, { body, as: t.sam.token });
    const owl = (await add({ name: 'Owl', size: 0.5, x: 600, y: 400 })).json().token;
    assert.ok(owl.x < 350, `next to Thorin, not behind the wall: ${owl.x}`);

    // The DM sends the owl over the wall to scout: Sam sees the goblin through it.
    await t.request('PATCH', `${base}/tokens/${owl.id}`, { body: { x: 550, y: 60 } });
    assert.deepEqual(await seen(), ['Goblin', 'Owl', 'Thorin']);
    // It can't walk back through the wall when Sam moves it.
    assert.equal((await t.request('PATCH', `${base}/tokens/${owl.id}`, { body: { x: 100, y: 60 }, as: t.sam.token })).statusCode, 400);

    // Dismissed: the goblin is out of sight again.
    await t.request('DELETE', `${base}/tokens/${owl.id}`, { as: t.sam.token });
    assert.deepEqual(await seen(), ['Thorin']);
    assert.ok(goblin.id);
  } finally {
    await t.cleanup();
  }
});

test('companions: in a fight it rolls from its stat block, and its player can set or end its turn', async () => {
  const llm = createFakeLLM({ structured: () => readOut() });
  const t = await setup({ llm });
  try {
    const { base } = await cave(t);
    const w = (await t.request('POST', `${base}/tokens`, { body: { name: 'Wolf', x: 200, y: 200, stats: { text: wolf.stat_block } }, as: t.sam.token })).json().token;
    const fight = (body, as) => t.request('POST', `${base}/combat`, { body, ...(as && { as }) });
    const started = (await fight({ action: 'start' })).json();
    assert.ok(started.rolls.some((r) => r.id === w.id && r.mod === 2), 'rolled with its Dexterity');
    assert.equal((await fight({ action: 'set', id: w.id, init: 30 }, t.sam.token)).statusCode, 200);
    assert.equal((await fight({ action: 'set', id: w.id, init: 1 }, t.alex.token)).statusCode, 403);
    await fight({ action: 'set', id: started.map.tokens.find((x) => x.kind === 'pc').id, init: 2 });
    await fight({ action: 'next' });
    assert.equal(t.maps.get(t.campaign.id, base.split('/').pop()).combat.turn, w.id);
    assert.equal((await fight({ action: 'next' }, t.sam.token)).statusCode, 200, 'Sam ends the wolf\'s turn');
  } finally {
    await t.cleanup();
  }
});

test('companions on the sheet: put on the map next to the character, hit points kept in step both ways, one map at a time, gone when dismissed on the sheet', async () => {
  const llm = createFakeLLM({ structured: () => readOut() });
  const t = await setup({ llm });
  try {
    const { base, thorin } = await cave(t);
    const cid = t.campaign.id;
    const mapId = base.split('/').pop();
    const sheetOf = () => t.sheets.get(cid, t.sam.id);
    const owl = { id: 'owl-1', name: 'Hoot', kind: 'familiar', form: (await (await t.request('GET', `/campaigns/${cid}/forms/lookup?name=Owl`, { as: t.sam.token })).json()), from: { kind: 'spell', name: 'Find Familiar' } };
    t.sheets.save(cid, t.sam.id, { name: 'Thorin', companions: [owl] });
    assert.equal(sheetOf().sheet.companions[0].hp.max, 1, 'an owl has 1 hit point (SRD)');

    // Only its player; the DM has none.
    const put = (as = t.sam.token, body = {}) => t.request('POST', `/campaigns/${cid}/sheet/companions/owl-1/map`, { body, as });
    assert.equal((await put(t.alex.token)).statusCode, 404);
    assert.equal((await put(t.dmToken)).statusCode, 403);
    const res = await put();
    assert.equal(res.statusCode, 200, res.body);
    const token = res.json().token;
    assert.equal(token.kind, 'companion');
    assert.equal(token.companion, 'owl-1');
    assert.equal(token.name, 'Hoot');
    assert.equal(token.follows, thorin.id, 'it follows its character');
    assert.ok(Math.abs(token.x - thorin.x) <= 40, 'next to the character');
    assert.match(token.stats.text, /Talons/);
    assert.deepEqual(token.hp, { current: 1, max: 1 });

    // Hurt on the map: the sheet changes. Healed on the sheet: the token shows it.
    t.sheets.save(cid, t.sam.id, { ...sheetOf().sheet, companions: [{ ...sheetOf().sheet.companions[0], hp: { current: 1, max: 1 } }] });
    const hit = await t.request('PATCH', `${base}/tokens/${token.id}`, { body: { hp: { current: 0, max: 1 } }, as: t.sam.token });
    assert.equal(hit.statusCode, 200, hit.body);
    assert.equal(sheetOf().sheet.companions[0].hp.current, 0);
    assert.equal(hit.json().token.hp.current, 0);
    t.sheets.save(cid, t.sam.id, { ...sheetOf().sheet, companions: [{ ...sheetOf().sheet.companions[0], name: 'Hooty', hp: { current: 1, max: 1 } }] });
    const seen = (as) => t.request('GET', base, { as }).then((r) => r.json().tokens.find((x) => x.id === token.id));
    assert.deepEqual((await seen(t.sam.token)).hp, { current: 1, max: 1 });
    assert.equal((await seen(t.sam.token)).name, 'Hooty');
    // Another player sees its hit points but not its stat block, and can't move it.
    const forAlex = await seen(t.alex.token);
    assert.deepEqual(forAlex.hp, { current: 1, max: 1 });
    assert.equal(forAlex.stats, null);
    assert.equal((await t.request('PATCH', `${base}/tokens/${token.id}`, { body: { x: 300 }, as: t.alex.token })).statusCode, 403);

    // Where it is, for the sheet.
    const where = (await t.request('GET', `/campaigns/${cid}/sheet/companions/where`, { as: t.sam.token })).json().where;
    assert.equal(where['owl-1'].map_id, mapId);

    // Put on the map again: still one token. Off the map: it stays on the sheet.
    await put();
    assert.equal(t.maps.get(cid, mapId).tokens.filter((x) => x.companion === 'owl-1').length, 1);
    assert.equal((await t.request('DELETE', `/campaigns/${cid}/sheet/companions/owl-1/map`, { as: t.sam.token })).statusCode, 200);
    assert.ok(!t.maps.get(cid, mapId).tokens.some((x) => x.companion === 'owl-1'));
    assert.equal(sheetOf().sheet.companions.length, 1);

    // Dismissed on the sheet: its token goes.
    await put();
    t.sheets.save(cid, t.sam.id, { ...sheetOf().sheet, companions: [] });
    assert.ok(!t.maps.get(cid, mapId).tokens.some((x) => x.companion === 'owl-1'));
  } finally {
    await t.cleanup();
  }
});
