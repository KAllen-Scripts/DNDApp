import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript, parseTimestamp, formatTimestamp, formatTranscript } from '../src/index.js';

test('parses timestamps', () => {
  assert.equal(parseTimestamp('01:02:03'), 3723);
  assert.equal(parseTimestamp('2:03'), 123);
  assert.equal(formatTimestamp(3723), '01:02:03');
});

test('parses standard lines, continuations and variants', () => {
  const raw = [
    '﻿[00:00:05] Kenny: Welcome back everyone.',
    'Last time you reached Brindle.',
    '',
    '[00:01:10.500] Sam: I check the inn.',
    '0:01:30 - Alex: Me too',
    'garbage before nothing',
  ].join('\r\n');
  const { utterances, skipped } = parseTranscript(raw);
  assert.equal(skipped, 0);
  assert.equal(utterances.length, 3);
  assert.deepEqual(utterances[0], {
    time: 5,
    speaker: 'Kenny',
    text: 'Welcome back everyone. Last time you reached Brindle.',
  });
  assert.equal(utterances[1].time, 70);
  assert.equal(utterances[2].speaker, 'Alex');
  assert.equal(utterances[2].text, 'Me too garbage before nothing');
});

test('counts leading lines with no utterance as skipped', () => {
  const { utterances, skipped } = parseTranscript('Recording started\n[00:00:01] A: hi');
  assert.equal(skipped, 1);
  assert.equal(utterances.length, 1);
});

test('round-trips through formatTranscript', () => {
  const raw = '[00:00:05] Kenny: Hello\n[01:00:00] Sam: Bye';
  assert.equal(formatTranscript(parseTranscript(raw).utterances), raw);
});
