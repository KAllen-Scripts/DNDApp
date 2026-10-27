/**
 * Citation format used in answers and notes: [S12], [S12 01:23:45], or a
 * range [S12 01:23:45-01:24:10]. Groups: session, from, to. Shared by the
 * server (evidence) and the page (citation buttons, served at /shared/citations.js).
 */
export const CITATION_RE = /\[S(\d+)(?:\s+(\d{1,2}:\d{2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}:\d{2}))?)?\]/g;

/** One transcript source as kept on a wiki part (stage 3b): 'S12', 'S12 01:23:45' or 'S12 01:23:45-01:24:10'. */
const SOURCE_RE = /^S(\d+)(?:\s+(\d{1,2}:\d{2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}:\d{2}))?)?$/;

export const MAX_SOURCES = 20;

/** A source in its one spelling, or null if it isn't a transcript citation (a note, a sheet, a handout). */
export function normalizeSource(s) {
  const m = SOURCE_RE.exec(String(s ?? '').trim());
  if (!m) return null;
  return `S${Number(m[1])}${m[2] ? ` ${m[2]}${m[3] ? `-${m[3]}` : ''}` : ''}`;
}

/** A part's sources: transcript citations only, each once, at most MAX_SOURCES. */
export const normalizeSources = (list) =>
  [...new Set((Array.isArray(list) ? list : []).map(normalizeSource).filter(Boolean))].slice(0, MAX_SOURCES);

/** "From session 12, 1:02:03" for a chip. */
export function sourceLabel(s) {
  const m = SOURCE_RE.exec(s);
  if (!m) return s;
  return `From session ${m[1]}${m[2] ? `, ${m[2].replace(/^0(\d)/, '$1')}` : ''}`;
}
