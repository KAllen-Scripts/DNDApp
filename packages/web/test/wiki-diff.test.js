/** wiki-diff.js: what changed between two versions of a page, for History. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff, pageDiff } from '../public/wiki-diff.js';

const show = (runs) => runs.map((r) => (r.op === 'same' ? r.text : r.op === 'add' ? `[+${r.text}]` : `[-${r.text}]`)).join('');

test('wiki diff: words added and taken out are marked, the rest kept', () => {
  assert.equal(show(wordDiff('The mill is old.', 'The mill is haunted and old.')), 'The mill is [+haunted and ]old.');
  assert.equal(show(wordDiff('A ghost at dusk.', 'A ghost at dawn.')), 'A ghost at [-dusk][+dawn].');
  assert.deepEqual(wordDiff('', ''), []);
});

test('wiki diff: a page diff lists changed, added and removed sections and facts, and leaves out what stayed', () => {
  const before = { title: 'Mill', sections: [{ id: 'aaaaaa', heading: 'What', text: 'Old.' }, { id: 'bbbbbb', heading: 'Gone', text: 'Bye.' }, { id: 'cccccc', heading: 'Same', text: 'Kept.' }], facts: [{ label: 'Owner', value: 'Nobody' }, { label: 'Region', value: 'Vale' }] };
  const after = { title: 'Hollow Mill', sections: [{ id: 'aaaaaa', heading: 'What', text: 'Old and haunted.' }, { id: 'cccccc', heading: 'Same', text: 'Kept.' }, { id: 'dddddd', heading: 'New', text: 'Hi.' }], facts: [{ label: 'Owner', value: 'The cult' }, { label: 'Region', value: 'Vale' }] };
  const d = pageDiff(before, after);
  assert.equal(show(d.title), '[+Hollow ]Mill');
  assert.deepEqual(d.sections.map((s) => [s.heading, s.state]), [['What', 'changed'], ['New', 'added'], ['Gone', 'removed']]);
  assert.equal(show(d.sections[0].runs), 'Old[+ and haunted].');
  assert.deepEqual(d.facts.map((f) => [f.label, f.state]), [['Owner', 'changed']]);
  assert.equal(pageDiff(after, after).sections.length, 0);
});
