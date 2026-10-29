/**
 * A recording's clips (each burst of one person's speech, with when it began)
 * become a transcript in the format uploads use: "[HH:MM:SS] Speaker: text".
 */
import { formatTimestamp } from '@dndapp/shared';

/** Clips shorter than this are coughs and clicks, not words. */
export const MIN_CLIP_MS = 400;

/** Things Whisper is known to "hear" in noise or silence (it learned them from video subtitles). */
const HALLUCINATIONS = [
  /^(thanks|thank you)( so much)? for watching[.!]*$/i,
  /^please subscribe/i,
  /^subtitles? by/i,
  /^(transcribed|captioned) by/i,
  /^\[?(blank_audio|silence|music|inaudible|no speech)\]?\.?$/i,
  /^\(?(silence|music|inaudible|no speech|static|noise)\)?\.?$/i,
  /^♪+$/,
  /^[.…\s-]*$/,
];
export const isHallucination = (text) => HALLUCINATIONS.some((re) => re.test(text.trim()));

/** A name safe for a transcript line (no colon, which ends the name, and not too long). */
export const speakerName = (name) => String(name || 'Unknown').replace(/[:\r\n[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Unknown';

/**
 * Words for Whisper to expect, so it spells the campaign's names right:
 * character names, the glossary's terms and the campaign's name.
 */
export function namesPrompt({ campaignName, characters = [], glossary = [] }) {
  const names = [...new Set([...characters, ...glossary.map((g) => g.term)].map((n) => String(n ?? '').trim()).filter(Boolean))];
  let prompt = `A Dungeons & Dragons session${campaignName ? ` (${campaignName})` : ''}.`;
  for (const n of names) {
    const next = `${prompt}${prompt.includes('Names:') ? ',' : ' Names:'} ${n}`;
    if (next.length > 700) break; // Whisper reads about 224 tokens of prompt
    prompt = next;
  }
  return prompt;
}

/**
 * Lines in time order, a speaker's consecutive pieces from one clip run
 * together so a long speech reads as one line (up to ~600 characters).
 */
export function buildTranscript(pieces) {
  const sorted = [...pieces].filter((p) => p.text && !isHallucination(p.text)).sort((a, b) => a.at_ms - b.at_ms || a.speaker.localeCompare(b.speaker));
  const lines = [];
  for (const p of sorted) {
    const last = lines.at(-1);
    if (last && last.speaker === p.speaker && last.clip === p.clip && last.text.length + p.text.length < 600) last.text += ` ${p.text}`;
    else lines.push({ ...p });
  }
  return lines.map((l) => `[${formatTimestamp(l.at_ms / 1000)}] ${speakerName(l.speaker)}: ${l.text.replace(/\s+/g, ' ').trim()}`).join('\n') + (lines.length ? '\n' : '');
}

/**
 * Runs the engine over a recording's clips.
 *
 * clips: [{ speaker, start_ms, ms, audio: () => Float32Array }] (audio is read when needed).
 * onProgress(fraction, message). Returns { transcript, lines, speech_ms }.
 */
export async function transcribeClips(engine, clips, { prompt, language = 'en', onProgress = () => {} } = {}) {
  // Each clip is read when its turn comes, so a long session's audio is never all in memory at once.
  const todo = [...clips].map((c, i) => ({ ...c, clip: i })).filter((c) => c.ms >= MIN_CLIP_MS).sort((a, b) => a.start_ms - b.start_ms);
  const speech = todo.reduce((n, c) => n + c.ms, 0);
  const pieces = [];
  for (let k = 0; k < todo.length; k += engine.perCall) {
    const batch = todo.slice(k, k + engine.perCall);
    onProgress(k / todo.length, `Transcribing (${Math.min(todo.length, k + batch.length)} of ${todo.length} bits of speech)`);
    const results = await engine.transcribe(batch.map((c) => c.audio()), { prompt, language });
    batch.forEach((c, j) => {
      for (const seg of results[j] ?? []) pieces.push({ speaker: c.speaker, clip: c.clip, at_ms: c.start_ms + Math.max(0, seg.start_ms), text: seg.text });
    });
  }
  onProgress(1, 'Done');
  const transcript = buildTranscript(pieces);
  return { transcript, lines: transcript ? transcript.trim().split('\n').length : 0, speech_ms: speech };
}
