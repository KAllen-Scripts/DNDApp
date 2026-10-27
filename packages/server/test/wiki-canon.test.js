import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createFakeLLM } from './helpers.js';
import { canonMarker, playerCanon } from '@dndapp/shared/wiki.js';

const ask = (t, token, question) =>
  t.request('POST', `/campaigns/${t.campaign.id}/ask`, { as: token, body: { question } });

const MILL = (t) => ({
  title: 'Hollow Mill',
  available: 'all',
  sections: [
    { heading: 'Talk', text: 'They say a ghost turns the wheel.', available: 'all', canon: 'rumour' },
    { heading: 'Belief', text: 'The miller drowned in the race.', available: 'all', canon: 'false', truth: 'The miller lives, hiding in the cellar.' },
    { heading: 'Prep', text: 'Cultists will meet here at midsummer.', available: 'all', canon: 'planned' },
    { heading: 'Thorin', text: 'Thorin was born in the loft.', available: 'all', canon: 'told', owner: t.sam.id },
  ],
  facts: [
    { label: 'Owner', value: 'Old Jory', available: 'all', canon: 'false', truth: 'The Baron owns it.' },
    { label: 'Next meeting', value: 'Midsummer eve', available: 'all', canon: 'planned' },
  ],
  picture: null,
});

test('wiki canon: markers', () => {
  assert.equal(playerCanon('false'), 'rumour');
  assert.equal(playerCanon('nonsense'), 'true');
  assert.equal(canonMarker('false'), '[rumour]');
  assert.match(canonMarker('false', { forDm: true, truth: 'X' }), /^\[false: .*Truth: X\]$/);
  assert.equal(canonMarker('told', { owner: 'Thorin' }), "[Thorin's account]");
  assert.equal(canonMarker('true', { forDm: true }), '');
});

test('wiki canon: a player never gets a planned part or the truth, and gets a falsehood as a rumour', async () => {
  const t = await setup();
  try {
    const page = (await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: MILL(t) })).json().page;
    const dm = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${page.id}`)).json().page;
    assert.deepEqual(dm.sections.map((s) => s.canon), ['rumour', 'false', 'planned', 'told']);
    assert.equal(dm.sections[1].truth, 'The miller lives, hiding in the cellar.');
    assert.equal(dm.sections[3].owner, t.sam.id);

    const as = (await t.request('GET', `/campaigns/${t.campaign.id}/wiki/${page.id}?as=${t.alex.id}`)).json().page;
    const text = JSON.stringify(as);
    assert.deepEqual(as.sections.map((s) => s.canon), ['rumour', 'rumour', 'told']);
    assert.deepEqual(as.facts.map((f) => f.canon), ['rumour']);
    assert.doesNotMatch(text, /cellar|Baron|Cultists|Midsummer|"false"|planned|truth/);
  } finally {
    await t.cleanup();
  }
});

test('wiki canon: Ask tells a player rumours as rumours and never "false"; the DM gets the truth', async () => {
  const llm = createFakeLLM({
    qaScript: [
      [{ tool: 'read_wiki_page', input: { title: 'Hollow Mill' } }, { answer: 'dm' }],
      [{ tool: 'read_wiki_page', input: { title: 'Hollow Mill' } }, { answer: 'alex' }],
    ],
  });
  const t = await setup({ llm });
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/wiki`, { body: MILL(t) });

    assert.equal((await ask(t, t.dmToken, 'Who owns the Hollow Mill?')).statusCode, 200);
    const dmCall = llm.calls.at(-1);
    const dmSaw = dmCall.toolResults.map((r) => r.result).join('\n');
    assert.match(dmSaw, /\[false: the players believe this\. Truth: The miller lives, hiding in the cellar\.\]/);
    assert.match(dmSaw, /\[false: .*Truth: The Baron owns it\.\] Owner: Old Jory/);
    assert.match(dmSaw, /\[planned: .*\]\nCultists/);
    assert.match(dmSaw, /\[rumour\]\nThey say a ghost/);
    assert.match(dmCall.system, /\[rumour\]/);

    assert.equal((await ask(t, t.alex.token, 'Who owns the Hollow Mill?')).statusCode, 200);
    const alexCall = llm.calls.at(-1);
    const alexSaw = alexCall.toolResults.map((r) => r.result).join('\n') + alexCall.prompt + alexCall.system;
    assert.match(alexSaw, /\[rumour\]\nThe miller drowned/);
    assert.match(alexSaw, /\[rumour\] Owner: Old Jory/);
    assert.match(alexSaw, /account\]\nThorin was born/);
    assert.doesNotMatch(alexSaw, /cellar|Baron owns|Cultists|Midsummer|\[false|\[planned|Truth:/);
  } finally {
    await t.cleanup();
  }
});
