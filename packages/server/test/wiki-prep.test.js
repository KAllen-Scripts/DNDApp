/**
 * Session prep (wiki space stage 7b): the Session plan template; the Home names the prep page being prepared (the
 * newest not yet played), never as "last time"; arcs hold their quests and sessions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { STARTER_TEMPLATES, templateFor } from '@dndapp/shared/wiki-templates.js';
import { openPrepPage } from '@dndapp/shared/wiki.js';

test('wiki prep: the Session plan template, the open prep page on the Home, arcs', async () => {
  const plan = STARTER_TEMPLATES.find((t) => t.id === 'starter-session-plan');
  assert.deepEqual(plan.sections.map((s) => s.heading), ['Strong start', 'Scenes', 'Clues', 'People', 'Places', 'Encounters', 'Treasure']);
  assert.ok(plan.sections.every((s) => s.available === 'dm' && s.canon === 'planned'), 'prep is the DM\'s');
  assert.equal(templateFor('Session plan').id, 'starter-session-plan');
  assert.equal(openPrepPage([]), null);

  const t = await setup();
  const base = `/campaigns/${t.campaign.id}/wiki`;
  try {
    const make = async (body) => (await t.request('POST', base, { body: { available: 'all', sections: [{ heading: '', text: 'Words.', available: 'all' }], ...body } })).json().page;
    await make({ title: 'Session 1', kind: 'session' });
    const played = await make({ title: 'Plan for session 1', kind: 'session plan', available: 'dm', facts: [{ label: 'Played', value: 'Day 3' }] });
    assert.equal((await t.request('GET', `${base}/home`)).json().prep, null, 'only played plans');
    const next = await make({ title: 'Plan for session 2', kind: 'session plan', available: 'dm', facts: [{ label: 'Played', value: '' }] });
    const home = (await t.request('GET', `${base}/home`)).json();
    assert.equal(home.prep.id, next.id);
    assert.equal(home.last_session.title, 'Session 1', 'a plan is never the last session');
    assert.ok(played.id);
    // A player's Home has neither.
    const samHome = (await t.request('GET', `${base}/home`, { as: t.sam.token })).json();
    assert.equal(samHome.prep, undefined);

    // An arc with a quest inside it: its compass lists it.
    const arc = await make({ title: 'The Pale Hand', kind: 'arc' });
    const quest = await make({ title: 'Find the ledger', kind: 'quest', parent: arc.id });
    const compass = (await t.request('GET', `${base}/${arc.id}/compass`)).json();
    assert.ok(JSON.stringify(compass).includes(quest.id));
  } finally {
    await t.cleanup();
  }
});
