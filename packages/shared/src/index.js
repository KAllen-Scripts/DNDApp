export * from './transcript.js';

export const ROLES = Object.freeze({ DM: 'dm', PLAYER: 'player' });

/**
 * Citation format used in answers and notes: [S12], [S12 01:23:45], or a
 * range [S12 01:23:45-01:24:10]. Groups: session, from, to.
 */
export const CITATION_RE = /\[S(\d+)(?:\s+(\d{1,2}:\d{2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}:\d{2}))?)?\]/g;
