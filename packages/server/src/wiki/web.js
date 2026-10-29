/**
 * The Web (wiki space stage 3d): the wiki's pages as a picture of who is tied
 * to whom, worked out for one viewer from the pages they may see (as the
 * compass is), so a hidden page, or a line from a part they can't see, never
 * reaches them. Lines come from relationship facts ("Rival: [[Lord Vex]]"),
 * from a page being inside another, and (on request) from links in the text.
 * The layout is d3-force from positions derived from the page ids, run a
 * fixed number of steps, so the same pages give the same picture.
 */
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';
import { packEnclose } from 'd3-hierarchy';
import { kindFamily, wikiKey, wikiLinks, factLinks, factTone, normalizeCanon } from '@dndapp/shared/wiki.js';
import { summary } from './views.js';

export const WEB_LIMITS = { around: 80, whole: 400, steps: 3 };

const KINDS = ['fact', 'inside', 'mention']; // a merged line keeps the strongest
const TONE_ORDER = ['hostile', 'friendly', 'neutral']; // and the sharpest tone
const FAMILY_WORDS = /\b(parent|mother|father|child|children|son|daughter|sibling|brother|sister|twin|married|spouse|wife|husband|grandmother|grandfather|grandparent|grandchild|aunt|uncle|niece|nephew|cousin)\b/;
const UP = /\b(parent|mother|father|grandmother|grandfather|grandparent)\b/; // "Mother: [[X]]": X is a generation up
const DOWN = /\b(child|children|son|daughter|grandchild)\b/;

/** A number from a page id, for starting positions that don't change from one call to the next. */
const seed = (id, salt) => {
  let n = 2166136261 ^ salt;
  for (const c of String(id)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return ((n >>> 0) % 10000) / 10000;
};

/**
 * Every line between the viewer's pages: { from, to, labels, tone, canon, by, kind, available? }.
 * `mentions` adds links in the text; `truth` (the DM's) leaves out rumours and falsehoods; `forDm` keeps who
 * each fact is available to.
 */
export function webLines(pages, { mentions = false, truth = false, forDm = false } = {}) {
  const byName = new Map();
  for (const p of pages) for (const n of [p.title, ...p.aliases]) if (!byName.has(wikiKey(n))) byName.set(wikiKey(n), p);
  const ids = new Set(pages.map((p) => p.id));
  const merged = new Map();
  const add = (from, to, line) => {
    if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    const was = merged.get(key);
    if (!was) return merged.set(key, { from, to, ...line, labels: line.labels.filter(Boolean) });
    for (const l of line.labels) if (l && !was.labels.includes(l)) was.labels.push(l);
    if (KINDS.indexOf(line.kind) < KINDS.indexOf(was.kind)) Object.assign(was, { from, to, kind: line.kind, canon: line.canon, by: line.by, ...(forDm && { available: line.available }) });
    if (TONE_ORDER.indexOf(line.tone) < TONE_ORDER.indexOf(was.tone)) was.tone = line.tone;
  };
  for (const p of pages) {
    for (const f of p.facts ?? []) {
      const canon = normalizeCanon(f.canon);
      if (truth && (canon === 'rumour' || canon === 'false')) continue;
      for (const name of factLinks(f)) {
        add(p.id, byName.get(wikiKey(name))?.id, { labels: [f.label], tone: factTone(f), canon, by: f.by === 'ai' ? 'ai' : 'dm', kind: 'fact', ...(forDm && { available: f.available }) });
      }
    }
    if (p.parent) add(p.id, p.parent, { labels: ['inside'], tone: 'neutral', canon: 'true', by: 'dm', kind: 'inside' });
    if (mentions) {
      for (const s of p.sections) {
        const canon = normalizeCanon(s.canon);
        if (truth && (canon === 'rumour' || canon === 'false')) continue;
        for (const name of wikiLinks(s.text)) add(p.id, byName.get(wikiKey(name))?.id, { labels: [], tone: 'neutral', canon, by: s.by === 'ai' ? 'ai' : 'dm', kind: 'mention' });
      }
    }
  }
  return [...merged.values()];
}

/** The pages within `steps` lines of `around`, nearest first (then by title), at most `max`. */
function nearby(around, lines, pages, steps, max) {
  const next = new Map(pages.map((p) => [p.id, []]));
  for (const l of lines) {
    next.get(l.from)?.push(l.to);
    next.get(l.to)?.push(l.from);
  }
  const title = new Map(pages.map((p) => [p.id, p.title]));
  const seen = new Set([around]);
  let ring = [around];
  for (let i = 0; i < steps && seen.size < max; i++) {
    const out = [...new Set(ring.flatMap((id) => next.get(id) ?? []))].filter((id) => !seen.has(id)).sort((a, b) => title.get(a).localeCompare(title.get(b)));
    for (const id of out.slice(0, max - seen.size)) seen.add(id);
    ring = out;
  }
  return seen;
}

/** Family trees: a generation for each page, from parent and child labels (married and siblings share one). */
function generations(nodes, lines) {
  const gen = new Map();
  const edges = lines.map((l) => {
    const label = l.labels.join(' ').toLowerCase();
    // On the page `from`, "Mother: [[to]]": `to` is a generation above.
    const d = UP.test(label) ? -1 : DOWN.test(label) ? 1 : 0;
    return { from: l.from, to: l.to, d };
  });
  for (const start of nodes.map((n) => n.id).sort()) {
    if (gen.has(start)) continue;
    gen.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const id = queue.shift();
      for (const e of edges) {
        const [other, d] = e.from === id ? [e.to, e.d] : e.to === id ? [e.from, -e.d] : [null];
        if (other == null || gen.has(other)) continue;
        gen.set(other, gen.get(id) + d);
        queue.push(other);
      }
    }
  }
  return gen;
}

/**
 * The Web for one viewer: `pages` are the ones they may see (as they see them). Options:
 * - around: a page id (the nearest 80 within `steps`), else the whole web (the 400 most tied)
 * - steps: 1 to 3
 * - families: kind families to keep (the page in the middle always stays)
 * - mentions: lines from links in the text too
 * - preset: 'factions' (factions and their ties) or 'family' (a family tree, in generations)
 * - truth, forDm: as webLines
 * Returns { nodes: [{ id, title, kind, family, picture, x, y, r }], lines, bubbles: [{ id, title, family, x, y, r }] }.
 */
export function webGraph(pages, { around = null, steps = 2, families = null, mentions = false, preset = null, truth = false, forDm = false } = {}) {
  let lines = webLines(pages, { mentions: mentions && !preset, truth, forDm });
  let keep = pages;
  if (preset === 'factions') {
    keep = pages.filter((p) => kindFamily(p.kind) === 'faction' || p.id === around);
  } else if (preset === 'family') {
    lines = lines.filter((l) => l.kind === 'fact' && FAMILY_WORDS.test(l.labels.join(' ').toLowerCase()));
    const tied = new Set(lines.flatMap((l) => [l.from, l.to]));
    keep = pages.filter((p) => tied.has(p.id) || p.id === around);
  }
  if (families?.length) keep = keep.filter((p) => families.includes(kindFamily(p.kind)) || p.id === around);
  let ids = new Set(keep.map((p) => p.id));
  lines = lines.filter((l) => ids.has(l.from) && ids.has(l.to) && (preset !== 'factions' || l.kind === 'fact'));
  if (around && ids.has(around)) {
    ids = nearby(around, lines, keep, Math.min(WEB_LIMITS.steps, Math.max(1, steps)), WEB_LIMITS.around);
  } else {
    around = null;
    const degree = new Map();
    for (const l of lines) for (const id of [l.from, l.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
    ids = new Set([...keep].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.title.localeCompare(b.title)).slice(0, WEB_LIMITS.whole).map((p) => p.id));
  }
  lines = lines.filter((l) => ids.has(l.from) && ids.has(l.to));
  const degree = new Map();
  for (const l of lines) for (const id of [l.from, l.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const nodes = keep.filter((p) => ids.has(p.id)).sort((a, b) => a.id.localeCompare(b.id)).map((p) => {
    const s = summary(p);
    return { id: p.id, title: p.title, kind: p.kind, family: kindFamily(p.kind), picture: s.picture, r: Math.round(18 + Math.min(14, 3 * Math.sqrt(degree.get(p.id) ?? 0)) + (p.id === around ? 8 : 0)), x: 0, y: 0, parent: p.parent };
  });

  if (preset === 'family') {
    // Layers, not forces: each generation a row, in order of title.
    const gen = generations(nodes, lines);
    const rows = new Map();
    for (const n of [...nodes].sort((a, b) => a.title.localeCompare(b.title))) {
      const g = gen.get(n.id) ?? 0;
      if (!rows.has(g)) rows.set(g, []);
      rows.get(g).push(n);
    }
    for (const [g, row] of rows) row.forEach((n, i) => Object.assign(n, { x: Math.round((i - (row.length - 1) / 2) * 140), y: g * 160 }));
  } else {
    for (const n of nodes) {
      const a = seed(n.id, 1) * Math.PI * 2;
      const d = 60 + seed(n.id, 2) * 40 * Math.sqrt(nodes.length);
      Object.assign(n, n.id === around ? { x: 0, y: 0, fx: 0, fy: 0 } : { x: Math.cos(a) * d, y: Math.sin(a) * d });
    }
    const sim = forceSimulation(nodes)
      .force('link', forceLink(lines.map((l) => ({ source: l.from, target: l.to, kind: l.kind }))).id((n) => n.id).distance((l) => (l.kind === 'inside' ? 70 : 120)).strength((l) => (l.kind === 'mention' ? 0.2 : 0.6)))
      .force('charge', forceManyBody().strength(-260))
      .force('collide', forceCollide((n) => n.r + 10))
      .force('x', forceX(0).strength(0.04))
      .force('y', forceY(0).strength(0.04))
      .stop();
    sim.tick(300);
    for (const n of nodes) {
      n.x = Math.round(n.x);
      n.y = Math.round(n.y);
      delete n.fx;
      delete n.fy;
      delete n.vx;
      delete n.vy;
      delete n.index;
    }
  }

  // A faction or a place with pages inside it in view: a bubble round them.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const bubbles = [];
  for (const p of pages) {
    if (!['faction', 'place'].includes(kindFamily(p.kind)) || preset === 'family') continue;
    const inside = nodes.filter((n) => n.parent === p.id);
    if (inside.length < 2) continue;
    const circles = [...inside, byId.get(p.id)].filter(Boolean).map((n) => ({ x: n.x, y: n.y, r: n.r + 14 }));
    const c = packEnclose(circles);
    bubbles.push({ id: p.id, title: p.title, family: kindFamily(p.kind), x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.r) });
  }
  for (const n of nodes) delete n.parent;
  return { around, nodes, lines, bubbles };
}
