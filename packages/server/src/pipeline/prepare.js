/** Deterministic transcript preparation: speaker map, glossary fixes, chunking. */
import { formatUtterance, formatTimestamp, parseTranscript } from '@dndapp/shared';
import { estimateTokens } from '../config.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace transcript speaker names with display names. The original name is
 * kept as `rawSpeaker` (used to work out attendance).
 * @param {{speaker: string, display_name: string}[]} speakers
 */
export function applySpeakerMap(utterances, speakers) {
  const map = new Map(speakers.map((s) => [s.speaker.toLowerCase(), s.display_name]));
  return utterances.map((u) => ({ ...u, rawSpeaker: u.rawSpeaker ?? u.speaker, speaker: map.get(u.speaker.toLowerCase()) ?? u.speaker }));
}

/**
 * Replace known misspellings with the correct term (whole words, any case).
 * @param {{term: string, variants: string[]}[]} glossary
 */
export function makeGlossaryFixer(glossary) {
  const rules = glossary
    .flatMap((g) => (g.variants ?? []).filter(Boolean).map((v) => ({ v, term: g.term })))
    .sort((a, b) => b.v.length - a.v.length) // longest first, so "Mister Grey" beats "Grey"
    .map(({ v, term }) => ({ re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(v)}(?![\\p{L}\\p{N}])`, 'giu'), term }));
  return (text) => rules.reduce((t, r) => t.replace(r.re, r.term), text);
}

/**
 * Group utterances into chunks of roughly `targetTokens`, repeating the last
 * `overlap` utterances at the start of the next chunk so context isn't lost
 * at the boundary.
 */
export function chunkUtterances(utterances, { targetTokens, overlap }) {
  const chunks = [];
  let start = 0;
  while (start < utterances.length) {
    let end = start;
    let tokens = 0;
    while (end < utterances.length && (end === start || tokens + estimateTokens(formatUtterance(utterances[end])) <= targetTokens)) {
      tokens += estimateTokens(formatUtterance(utterances[end]));
      end++;
    }
    const slice = utterances.slice(start, end);
    chunks.push({
      start_sec: slice[0].time,
      end_sec: slice.at(-1).time,
      text: slice.map(formatUtterance).join('\n'),
      tokens,
    });
    if (end >= utterances.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/**
 * A session's transcript with speaker names and glossary fixes applied.
 * @returns {import('@dndapp/shared').Utterance[]}
 */
export function preparedTranscript(store, campaignId, sessionNum) {
  const fix = makeGlossaryFixer(store.getGlossary(campaignId));
  const { utterances } = parseTranscript(store.readTranscript(campaignId, sessionNum));
  return applySpeakerMap(utterances, store.getSpeakers(campaignId)).map((u) => ({ ...u, text: fix(u.text) }));
}

export const chunkTitle = (sessionNum, c) =>
  `Session ${sessionNum} transcript ${formatTimestamp(c.start_sec)}-${formatTimestamp(c.end_sec)}`;
