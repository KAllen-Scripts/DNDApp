/**
 * What changed between two versions of a wiki page, for History: section by
 * section (matched by id, else heading) and fact by fact, with the words
 * added and taken out marked. Plain functions, so they're tested without a
 * page.
 */

// Words, the spaces between them and each mark of punctuation, so "dusk." to "dawn." changes only the word.
const words = (s) => String(s ?? '').match(/\s+|[\p{L}\p{N}'’]+|[^\s\p{L}\p{N}]/gu) ?? [];

/**
 * The words of `a` and `b` as runs: [{ op: 'same' | 'add' | 'del', text }].
 * A longest-common-subsequence diff of the words; long texts fall back to
 * "all out, all in" past a size where it would be slow.
 */
export function wordDiff(a, b) {
  const x = words(a);
  const y = words(b);
  if (x.length * y.length > 4_000_000) return merge([...(a ? [{ op: 'del', text: a }] : []), ...(b ? [{ op: 'add', text: b }] : [])]);
  const n = x.length;
  const m = y.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ op: 'same', text: x[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ op: 'del', text: x[i++] });
    else out.push({ op: 'add', text: y[j++] });
  }
  while (i < n) out.push({ op: 'del', text: x[i++] });
  while (j < m) out.push({ op: 'add', text: y[j++] });
  return merge(out);
}

function merge(runs) {
  const out = [];
  for (const r of runs) {
    const last = out.at(-1);
    if (last && last.op === r.op) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

const changed = (runs) => runs.some((r) => r.op !== 'same');

/**
 * What changed from page `before` to page `after` (either may be null):
 * { title, sections: [{ heading, state: 'added' | 'removed' | 'changed', heading_runs, runs }],
 *   facts: [{ label, state, runs }] }, leaving out what stayed the same.
 */
export function pageDiff(before, after) {
  const b = before ?? { title: '', sections: [], facts: [] };
  const a = after ?? { title: '', sections: [], facts: [] };
  const key = (s, i) => s.id ?? `${s.heading}#${i}`;
  const old = new Map(b.sections.map((s, i) => [key(s, i), s]));
  const used = new Set();
  const sections = [];
  a.sections.forEach((s, i) => {
    const k = old.has(key(s, i)) ? key(s, i) : [...old.keys()].find((ok) => !used.has(ok) && old.get(ok).heading === s.heading);
    const was = k != null ? old.get(k) : null;
    if (k != null) used.add(k);
    const runs = wordDiff(was?.text ?? '', s.text);
    const headingRuns = wordDiff(was?.heading ?? '', s.heading);
    if (!was) sections.push({ heading: s.heading, state: 'added', heading_runs: headingRuns, runs });
    else if (changed(runs) || changed(headingRuns)) sections.push({ heading: s.heading, state: 'changed', heading_runs: headingRuns, runs });
  });
  for (const [k, s] of old) if (!used.has(k)) sections.push({ heading: s.heading, state: 'removed', heading_runs: wordDiff(s.heading, ''), runs: wordDiff(s.text, '') });
  const facts = [];
  const oldFacts = new Map((b.facts ?? []).map((f) => [f.label, f]));
  for (const f of a.facts ?? []) {
    const was = oldFacts.get(f.label);
    oldFacts.delete(f.label);
    const runs = wordDiff(was?.value ?? '', f.value);
    if (!was) facts.push({ label: f.label, state: 'added', runs });
    else if (changed(runs)) facts.push({ label: f.label, state: 'changed', runs });
  }
  for (const f of oldFacts.values()) facts.push({ label: f.label, state: 'removed', runs: wordDiff(f.value, '') });
  return { title: b.title === a.title ? null : wordDiff(b.title, a.title), sections, facts };
}
