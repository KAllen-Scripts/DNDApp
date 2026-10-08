/**
 * Map events for the archivist: what happened on the maps players saw on a
 * session's day, worked out from the archived change lines.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEvents } from '../src/maps/events.js';
import { sessionDateFor } from '../src/store.js';
import { setup, createFakeLLM, terrain, SAMPLE } from './helpers.js';

const at = (h, m = 0, day = 8) => new Date(2026, 9, day, h, m).toISOString(); // local time, as the server's clock
const tok = (id, name, kind, extra = {}) => ({ id, name, kind, x: 10, y: 10, ...extra });

test('mapEvents: fights, tokens going down and up, doors, travel; never hidden tokens or unshown maps; by session date', () => {
  const keep = 'aaaaaaaaaa';
  const cellar = 'bbbbbbbbbb';
  const image = { file: 'image.png', type: 'image/png', width: 100, height: 100 };
  const door = { id: 'door01', x1: 0, y1: 0, x2: 10, y2: 0, door: true, open: false };
  const histories = [
    {
      id: keep,
      entries: [
        { saved_at: at(12, 0, 1), changes: [{ p: [], v: { name: 'Keep', image, shown: true, tokens: [tok('thorin1', 'Thorin', 'pc')] } }] },
        // Last week: not this session.
        { saved_at: at(20, 0, 1), changes: [{ p: ['tokens', 1], v: tok('rat001', 'Rat', 'enemy') }] },
        { saved_at: at(19, 5), changes: [{ p: ['tokens', 2], v: tok('gob001', 'Goblin', 'enemy', { hp: { current: 7, max: 7 } }) }, { p: ['tokens', 3], v: tok('spy001', 'Spy', 'npc', { hidden: true }) }, { p: ['walls'], v: [door] }] },
        { saved_at: at(19, 10), changes: [{ p: ['combat'], v: { round: 1, turn: null, entries: [] } }] },
        { saved_at: at(19, 20), changes: [{ p: ['tokens', 2, 'hp', 'current'], v: 0 }, { p: ['tokens', 3, 'hp'], v: { current: 0, max: 5 } }, { p: ['tokens', 0, 'conditions'], v: ['poisoned'] }] },
        { saved_at: at(19, 30), changes: [{ p: ['combat', 'round'], v: 3 }] },
        { saved_at: at(19, 31), changes: [{ p: ['combat'], v: null }] },
        { saved_at: at(19, 40), changes: [{ p: ['walls', 0, 'open'], v: true }] },
        { saved_at: at(19, 41), changes: [{ p: ['walls', 0, 'open'], v: false }] },
        { saved_at: at(19, 42), changes: [{ p: ['walls', 0, 'open'], v: true }] },
        // The spy steps out of hiding.
        { saved_at: at(19, 45), changes: [{ p: ['tokens', 3, 'hidden'], v: false }] },
        // Thorin takes the stairs, after midnight (still the same session: before the 6am rollover).
        { saved_at: at(0, 30, 9), reason: `left for ${cellar}`, changes: [{ p: ['tokens', 0], v: tok('rat001', 'Rat', 'enemy') }, { p: ['tokens'], len: 3 }] },
      ],
    },
    {
      id: cellar,
      entries: [
        { saved_at: at(18), changes: [{ p: [], v: { name: 'Cellar', image, shown: false, tokens: [tok('ghoul1', 'Ghoul', 'enemy')] } }] },
        // The DM's own setup on a map players can't see: nothing.
        { saved_at: at(18, 30), changes: [{ p: ['tokens', 1], v: tok('ghoul2', 'Ghoul', 'enemy') }] },
        { saved_at: at(0, 20, 9), changes: [{ p: ['shown'], v: true }, { p: ['description'], v: 'A damp cellar under the keep.' }] },
        { saved_at: at(0, 30, 9), reason: `arrived from ${keep}`, changes: [{ p: ['tokens', 2], v: tok('thorin1', 'Thorin', 'pc', { conditions: ['poisoned'] }) }] },
      ],
    },
  ];
  assert.deepEqual(mapEvents(histories, { date: '2026-10-08', rolloverHour: 6 }), [
    '[19:05] Goblin (enemy) appeared on "Keep".',
    '[19:10] A fight began on "Keep": Thorin, Rat (enemy), Goblin (enemy).',
    '[19:20] Thorin became poisoned on "Keep".',
    '[19:20] Goblin (enemy) went down on "Keep".',
    '[19:31] The fight on "Keep" ended after 3 rounds.',
    '[19:40] A door was opened on "Keep".', // and again at 19:42: the same thing twice in a row is said once
    '[19:45] Spy (NPC) was revealed on "Keep".',
    '[00:20] The DM showed the map "Cellar" (A damp cellar under the keep.).',
    '[00:30] Thorin went from "Keep" to "Cellar".',
  ]);
  assert.deepEqual(mapEvents(histories, { date: '2026-10-01', rolloverHour: 6 }), ['[12:00] The DM showed the map "Keep".', '[20:00] Rat (enemy) appeared on "Keep".']);
  assert.deepEqual(mapEvents(histories, { date: '2026-10-02', rolloverHour: 6 }), []);
});

test('the archivist gets the map events of the session\'s day with the transcript', async () => {
  const llm = createFakeLLM({ structured: async () => ({ readable: true, kind: 'battle', name: 'Crypt', description: '', grid: { visible: true, columns: 20, rows: 14 }, scale: { distance: null, unit: null, per: null }, notes: '' }) });
  const t = await setup({ llm });
  try {
    const png = await terrain(700, 490, { size: 35 });
    const id = (await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'crypt.png', data: png.toString('base64') } })).json().id;
    while (t.maps.get(t.campaign.id, id).reading.status === 'pending') await new Promise((r) => setTimeout(r, 10));
    const base = `/campaigns/${t.campaign.id}/maps/${id}`;
    await t.request('PATCH', base, { body: { name: 'Crypt', shown: true } });
    await t.request('POST', `${base}/tokens`, { body: { kind: 'pc', name: 'Thorin', user_id: t.sam.id, x: 52.5, y: 52.5 } });
    const gob = (await t.request('POST', `${base}/tokens`, { body: { kind: 'enemy', name: 'Goblin', x: 152.5, y: 52.5, hp: { current: 7, max: 7 } } })).json().token;
    await t.request('POST', `${base}/tokens`, { body: { kind: 'enemy', name: 'Lurker', x: 252.5, y: 52.5, hidden: true } });
    await t.request('POST', `${base}/combat`, { body: { action: 'start' } });
    await t.request('PATCH', `${base}/tokens/${gob.id}`, { body: { hp: { current: 0, max: 7 } } });

    const played_on = sessionDateFor(new Date(), t.config.notes.rolloverHour);
    await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, played_on, transcript: SAMPLE } });
    await t.jobs.idle();
    const { prompt, system } = llm.calls.find((c) => c.purpose === 'archivist:session 1');
    const block = /<map_events date="[\d-]+">\n([\s\S]*?)\n<\/map_events>/.exec(prompt)?.[1];
    assert.ok(block, 'the map events are in the prompt');
    assert.match(block, /\] The DM showed the map "Crypt"/);
    assert.match(block, /\] A fight began on "Crypt": Thorin, Goblin \(enemy\)\./);
    assert.match(block, /\] Goblin \(enemy\) went down on "Crypt"\./);
    assert.doesNotMatch(block, /Lurker/, 'hidden tokens never');
    assert.match(system, /Map events:/);
  } finally {
    await t.cleanup();
  }
});
