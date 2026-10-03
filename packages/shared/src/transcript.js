/**
 * Transcript parsing.
 *
 * Expected format, one utterance per line:
 *   [HH:MM:SS] Speaker Name: what they said
 *
 * Also accepted: [H:MM:SS], [MM:SS], timestamps without brackets, and an
 * optional fractional part ([01:02:03.450]). Lines that don't start with a
 * timestamp are treated as a continuation of the previous utterance.
 * If the recorder uses a different format, add an adapter here rather than
 * changing the pipeline.
 */

/** @typedef {{ time: number, speaker: string, text: string }} Utterance */

const LINE_RE = /^\s*\[?(\d{1,2}(?::\d{2}){1,2})(?:[.,]\d+)?\]?\s*(?:-\s*)?([^:]{1,64}):\s?(.*)$/;

/** "01:02:03" | "02:03" -> seconds */
export function parseTimestamp(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** seconds -> "HH:MM:SS" */
export function formatTimestamp(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * @param {string} raw
 * @returns {{ utterances: Utterance[], skipped: number }}
 */
export function parseTranscript(raw) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  /** @type {Utterance[]} */
  const utterances = [];
  let skipped = 0;

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = LINE_RE.exec(line);
    if (m) {
      const time = parseTimestamp(m[1]);
      if (!Number.isNaN(time)) {
        utterances.push({ time, speaker: m[2].trim(), text: m[3].trim() });
        continue;
      }
    }
    const prev = utterances.at(-1);
    if (prev) prev.text = prev.text ? `${prev.text} ${line.trim()}` : line.trim();
    else skipped++;
  }

  return { utterances: utterances.filter((u) => u.text), skipped };
}

/** @param {Utterance} u */
export function formatUtterance(u) {
  return `[${formatTimestamp(u.time)}] ${u.speaker}: ${u.text}`;
}

/** @param {Utterance[]} utterances */
export function formatTranscript(utterances) {
  return utterances.map(formatUtterance).join('\n');
}
