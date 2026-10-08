import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript } from '@dndapp/shared';
import { applySpeakerMap, makeGlossaryFixer, chunkUtterances } from '../src/pipeline/prepare.js';
import { ftsQuery } from '../src/search.js';
import { SAMPLE } from './helpers.js';

test('speaker map is case-insensitive and leaves unknown speakers alone', () => {
  const out = applySpeakerMap(
    [{ time: 0, speaker: 'kennydm', text: 'hi' }, { time: 1, speaker: 'Stranger', text: 'yo' }],
    [{ speaker: 'KennyDM', display_name: 'DM' }],
  );
  assert.deepEqual(out.map((u) => u.speaker), ['DM', 'Stranger']);
  assert.deepEqual(out.map((u) => u.rawSpeaker), ['kennydm', 'Stranger']);
});

test('glossary fixes whole words only, longest variant first', () => {
  const fix = makeGlossaryFixer([
    { term: 'Brother Hal', variants: ['Brother Hall', 'brother hell'] },
    { term: 'Hal', variants: ['Hall'] },
  ]);
  assert.equal(fix('Brother Hall said hi. Hall again. The hallway.'), 'Brother Hal said hi. Hal again. The hallway.');
  assert.equal(fix('BROTHER HELL'), 'Brother Hal');
});

test('chunking covers every utterance, respects size and overlaps', () => {
  const { utterances } = parseTranscript(SAMPLE);
  const chunks = chunkUtterances(utterances, { targetTokens: 40, overlap: 1 });
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].start_sec, 5);
  assert.equal(chunks.at(-1).end_sec, 120);
  for (const c of chunks) assert.ok(c.tokens <= 40 || c.text.split('\n').length === 1);
  // Last line of one chunk is repeated as the first line of the next.
  assert.equal(chunks[0].text.split('\n').at(-1), chunks[1].text.split('\n')[0]);
});

test('ftsQuery produces a safe OR query', () => {
  assert.equal(ftsQuery('Who is "Brother Hal"? OR NOT *'), '"who" OR "is" OR "brother" OR "hal" OR "or" OR "not"');
  assert.equal(ftsQuery('?!'), '');
});
