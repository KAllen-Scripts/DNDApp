/**
 * Fights on a map (initiative and turns) and spell templates (areas of
 * effect): who may do what, what players see, and the archive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, terrain } from './helpers.js';

const readOut = { readable: true, kind: 'battle', name: 'Cave', description: '', grid: { visible: true, columns: 20, rows: 14 }, scale: { distance: null, unit: null, per: null }, notes: '' };

/** A shown 700 x 490 map with a 35 px grid, 5 ft squares. */
async function shownMap(t) {
  const png = await terrain(700, 490, { size: 35 });
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'cave.png', data: png.toString('base64') } });
  const id = res.json().id;
  for (let i = 0; t.maps.get(t.campaign.id, id).reading.status === 'pending'; i++) await new Promise((r) => setTimeout(r, 10));
  const base = `/campaigns/${t.campaign.id}/maps/${id}`;
  await t.request('PATCH', base, { body: { shown: true, grid: { size: 35, x: 0, y: 0 }, scale: { distance: 5, unit: 'ft', per: 'square' } } });
  const add = async (body) => (await t.request('POST', `${base}/tokens`, { body })).json().token;
  return { id, base, add };
}

const GOBLIN = '**Goblin**\n\n| STR | DEX | CON | INT | WIS | CHA |\n|---|---|---|---|---|---|\n| 8 (-1) | 14 (+2) | 10 (+0) | 10 (+0) | 8 (-1) | 8 (-1) |';

test('initiative: the DM starts a fight (enemies roll with their Dex), players roll with their sheet, turns go round', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const { base, add } = await shownMap(t);
    // Sam's sheet: Dex 16 gives +3 initiative.
    const sheet = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json();
    await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...sheet.sheet, abilities: { ...sheet.sheet.abilities, dex: 16 } }, version: sheet.version } });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 122.5, y: 52.5, stats: { text: GOBLIN } });
    const lurker = await add({ kind: 'enemy', name: 'Lurker', x: 192.5, y: 52.5, hidden: true });
    const fight = (body, as) => t.request('POST', `${base}/combat`, { body, as });

    // Only the DM starts one; nothing to do before it's started.
    assert.equal((await fight({ action: 'start' }, t.sam.token)).statusCode, 403);
    assert.equal((await fight({ action: 'next' })).statusCode, 400);

    const started = (await fight({ action: 'start' })).json();
    assert.equal(started.map.combat.round, 1);
    assert.equal(started.map.combat.turn, null);
    const goblinRoll = started.rolls.find((r) => r.id === goblin.id);
    assert.equal(goblinRoll.mod, 2); // from the stat block's table
    assert.ok(goblinRoll.d20 >= 1 && goblinRoll.d20 <= 20 && goblinRoll.total === goblinRoll.d20 + 2);
    assert.equal(started.rolls.find((r) => r.id === lurker.id).mod, 0); // no stat block
    assert.equal(started.rolls.some((r) => r.id === thorin.id), false); // players roll their own
    assert.equal(started.map.combat.entries.at(-1).id, thorin.id); // not rolled yet: last

    // Sam sees only what Thorin can see: not the hidden lurker.
    const seen = (await t.request('GET', base, { as: t.sam.token })).json();
    assert.deepEqual(seen.combat.entries.map((e) => e.id).sort(), [thorin.id, goblin.id].sort());

    // Sam can't roll for the goblin, or move the turn on; he rolls for Thorin once.
    assert.equal((await fight({ action: 'roll', id: goblin.id }, t.sam.token)).statusCode, 403); // not his token
    const rolled = await fight({ action: 'roll', id: thorin.id }, t.sam.token);
    assert.equal(rolled.statusCode, 200, rolled.body);
    const [r] = rolled.json().rolls;
    assert.equal(r.mod, 3);
    assert.equal((await fight({ action: 'roll', id: thorin.id }, t.sam.token)).json().error, 'You already rolled initiative.');
    // Or he types what he rolled at the table.
    assert.equal((await fight({ action: 'set', id: thorin.id, init: 30 }, t.sam.token)).statusCode, 200);
    assert.equal((await fight({ action: 'next' }, t.sam.token)).statusCode, 403); // not his turn (nobody's yet)

    // The DM types the others' rolls so the order is known: Thorin 30, goblin 20, lurker 10.
    await fight({ action: 'set', id: goblin.id, init: 20 });
    await fight({ action: 'set', id: lurker.id, init: 10 });
    let c = (await fight({ action: 'next' })).json().map.combat;
    assert.deepEqual([c.round, c.turn], [1, thorin.id]);
    // On his own turn, Sam ends it.
    c = (await fight({ action: 'next' }, t.sam.token)).json().map.combat;
    assert.deepEqual([c.round, c.turn], [1, goblin.id]);
    c = (await fight({ action: 'next' })).json().map.combat;
    assert.equal(c.turn, lurker.id);
    // While it's the hidden lurker's turn, Sam isn't told whose it is.
    const theirs = (await t.request('GET', base, { as: t.sam.token })).json().combat;
    assert.equal(theirs.turn, null);
    assert.equal(theirs.turn_unseen, true);
    // Back a turn, then forward past the end: round 2 starts at the top.
    c = (await fight({ action: 'prev' })).json().map.combat;
    assert.equal(c.turn, goblin.id);
    for (let i = 0; i < 2; i++) c = (await fight({ action: 'next' })).json().map.combat;
    assert.deepEqual([c.round, c.turn], [2, thorin.id]);
    // Back past the top returns to round 1's last turn.
    c = (await fight({ action: 'prev' })).json().map.combat;
    assert.deepEqual([c.round, c.turn], [1, lurker.id]);
    c = (await fight({ action: 'next' })).json().map.combat;

    // Removing a token whose turn it is passes the turn on; it leaves the order.
    await t.request('DELETE', `${base}/tokens/${thorin.id}`);
    c = (await t.request('GET', base)).json().combat;
    assert.equal(c.entries.length, 2);
    assert.deepEqual([c.round, c.turn], [2, goblin.id]);

    // The DM types a roll, takes a token out, adds it back (not rolled), and rolls for it.
    assert.equal((await fight({ action: 'set', id: goblin.id, init: 1 })).json().map.combat.entries.at(-1).id, goblin.id);
    assert.equal((await fight({ action: 'remove', id: goblin.id })).json().map.combat.entries.length, 1);
    c = (await fight({ action: 'add', ids: [goblin.id] })).json().map.combat;
    assert.deepEqual(c.entries.at(-1), { id: goblin.id, init: null, mod: null, moved: 0 });
    const all = (await fight({ action: 'roll' })).json();
    assert.deepEqual(all.rolls.map((x) => x.id), [goblin.id]); // only those not rolled yet

    // Ending it.
    assert.equal((await fight({ action: 'end' })).json().map.combat, null);

    // All archived with the map.
    const lines = fs.readFileSync(path.join(t.paths.archive, t.campaign.slug, 'maps', (await t.request('GET', base)).json().id, 'changes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(lines.some((l) => l.reason === 'fight started'));
    assert.ok(lines.some((l) => l.reason === 'fight ended'));
  } finally {
    await t.cleanup();
  }
});

test('templates: anyone places areas of effect; only their owner or the DM changes them; fog hides others\' from players', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const { base, add } = await shownMap(t);
    await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 });
    const place = (body, as) => t.request('POST', `${base}/templates`, { body, as });

    const res = await place({ shape: 'circle', x: 70, y: 70, size: 20, label: 'Fireball' }, t.sam.token);
    assert.equal(res.statusCode, 201, res.body);
    const fireball = res.json().template;
    assert.equal(fireball.user_id, t.sam.id);
    assert.equal(fireball.color, '#e8743b');
    const cone = (await place({ shape: 'cone', x: 600, y: 400, angle: 90, size: 15, label: 'Breath' })).json().template;

    // Alex sees both, but can only change the DM's and Sam's if he placed them: he didn't.
    assert.equal((await t.request('GET', base, { as: t.alex.token })).json().templates.length, 2);
    assert.equal((await t.request('PATCH', `${base}/templates/${fireball.id}`, { as: t.alex.token, body: { x: 10 } })).statusCode, 403);
    assert.equal((await t.request('DELETE', `${base}/templates/${cone.id}`, { as: t.sam.token })).statusCode, 403);
    // Sam turns and moves his own; bad shapes are refused.
    const moved = (await t.request('PATCH', `${base}/templates/${fireball.id}`, { as: t.sam.token, body: { x: 140, angle: 450 } })).json().template;
    assert.deepEqual([moved.x, moved.angle], [140, 90]);
    assert.equal((await place({ shape: 'star', x: 1, y: 1, size: 5 }, t.sam.token)).statusCode, 400);

    // With fog on, players only get templates whose point of origin they can see (and their own).
    await t.request('PATCH', `${base}/fog`, { body: { enabled: true, add: { op: 'reveal', x: 0, y: 0, w: 350, h: 245 } } });
    assert.deepEqual((await t.request('GET', base, { as: t.alex.token })).json().templates.map((x) => x.id), [fireball.id]);
    await t.request('PATCH', `${base}/fog`, { body: { reset: 'cover' } });
    assert.deepEqual((await t.request('GET', base, { as: t.sam.token })).json().templates.map((x) => x.id), [fireball.id]);
    assert.deepEqual((await t.request('GET', base, { as: t.alex.token })).json().templates, []);

    // The DM removes anyone's.
    assert.equal((await t.request('DELETE', `${base}/templates/${fireball.id}`)).statusCode, 200);
    assert.deepEqual((await t.request('GET', base)).json().templates.map((x) => x.id), [cone.id]);
  } finally {
    await t.cleanup();
  }
});

test('movement: paths with waypoints, walls checked on every leg, speed used per turn (double in difficult terrain)', async () => {
  const t = await setup({ llm: createFakeLLM({ structured: async () => readOut }) });
  try {
    const { base, add } = await shownMap(t);
    const sheet = (await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token })).json();
    await t.request('PUT', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token, body: { sheet: { ...sheet.sheet, race: 'Hill Dwarf' }, version: sheet.version } });
    const thorin = await add({ kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 17.5, y: 17.5 });
    const goblin = await add({ kind: 'enemy', name: 'Goblin', x: 612.5, y: 402.5, stats: { text: GOBLIN, speed: '30 ft.' } });
    const view = async (as) => (await t.request('GET', base, { as })).json();
    // How far each walks: the sheet (a dwarf: 25), the stat block, or what the DM sets.
    assert.equal((await view(t.sam.token)).tokens.find((x) => x.id === thorin.id).move_speed, 25);
    assert.equal((await view()).tokens.find((x) => x.id === goblin.id).move_speed, 30);

    // Difficult terrain is the DM's; players get the areas they can see.
    assert.equal((await t.request('PATCH', `${base}/terrain`, { as: t.sam.token, body: { add: { points: [[0, 0], [1, 0], [1, 1]] } } })).statusCode, 403);
    const area = (await t.request('PATCH', `${base}/terrain`, { body: { add: { points: [[105, 0], [175, 0], [175, 490], [105, 490]] } } })).json().terrain[0];
    assert.equal((await view(t.sam.token)).terrain.length, 1);

    // A wall down column 2 with a gap at the bottom: a straight move is refused, a path round it isn't.
    await t.request('PATCH', `${base}/walls`, { body: { add: { x1: 70, y1: 0, x2: 70, y2: 420 } } });
    const move = (body) => t.request('PATCH', `${base}/tokens/${thorin.id}`, { as: t.sam.token, body });
    assert.equal((await move({ x: 87.5, y: 17.5 })).statusCode, 400);
    assert.equal((await move({ x: 87.5, y: 17.5, path: [[17.5, 437.5], [87.5, 437.5]] })).statusCode, 200);

    // In a fight, moving counts against the turn; a new turn starts at nothing.
    await t.request('POST', `${base}/combat`, { body: { action: 'start' } });
    await t.request('POST', `${base}/combat`, { body: { action: 'set', id: thorin.id, init: 20 } });
    await t.request('POST', `${base}/combat`, { body: { action: 'set', id: goblin.id, init: 10 } });
    await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
    await move({ x: 192.5, y: 17.5 }); // 3 squares, two of them difficult: 5 squares
    const moved = (await view(t.sam.token)).combat.entries.find((e) => e.id === thorin.id).moved;
    assert.equal(moved, 25);
    await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
    await t.request('POST', `${base}/combat`, { body: { action: 'next' } });
    assert.equal((await view()).combat.entries.find((e) => e.id === thorin.id).moved, 0);

    await t.request('PATCH', `${base}/terrain`, { body: { remove: area.id } });
    assert.deepEqual((await view()).terrain, []);
  } finally {
    await t.cleanup();
  }
});
