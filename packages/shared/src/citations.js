/**
 * Citation format used in answers and notes: [S12], [S12 01:23:45], or a
 * range [S12 01:23:45-01:24:10]. Groups: session, from, to. Shared by the
 * server (evidence) and the page (citation buttons, served at /shared/citations.js).
 */
export const CITATION_RE = /\[S(\d+)(?:\s+(\d{1,2}:\d{2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}:\d{2}))?)?\]/g;
