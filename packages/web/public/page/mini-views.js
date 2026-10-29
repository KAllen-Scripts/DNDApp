/**
 * Small drawings to look at, not to work in: a crop of a map with pins, a
 * ring of portraits round a page, and a ribbon of moments. The wiki uses them
 * on a page's compass strip, the Home and the rail; a click on one opens the
 * full view (the caller's job). Each returns an <svg> sized to fit its box.
 *
 * They draw only what they're given: the server has already left out what
 * the viewer may not see.
 */

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

const titled = (el, text) => {
  if (text) el.append(svg('title', {}, document.createTextNode(text)));
  return el;
};

const frame = (width, height, cls, label) =>
  svg('svg', { class: `mini ${cls}`, viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': label });

/**
 * A crop of a map: `src` is the picture, `crop` { x, y, w, h } the part of it
 * to show (in the picture's pixels), pins [{ x, y, family, title }] in the
 * same pixels. Pins outside the crop are left out.
 */
export function miniCrop({ src, crop, pins = [], width = 120, height = 80, label = 'Map' }) {
  const out = frame(width, height, 'mini-crop', label);
  const k = Math.max(width / crop.w, height / crop.h);
  const ox = (width - crop.w * k) / 2 - crop.x * k;
  const oy = (height - crop.h * k) / 2 - crop.y * k;
  const id = `mc${Math.random().toString(36).slice(2, 8)}`;
  out.append(svg('defs', {}, svg('clipPath', { id }, svg('rect', { width, height, rx: 6 }))));
  const g = svg('g', { 'clip-path': `url(#${id})` });
  if (src) g.append(svg('image', { href: src, x: ox, y: oy, width: crop.w * k, height: crop.h * k, preserveAspectRatio: 'none' }));
  for (const p of pins) {
    const x = ox + p.x * k;
    const y = oy + p.y * k;
    if (x < 0 || y < 0 || x > width || y > height) continue;
    g.append(titled(svg('circle', { class: `mini-pin fam-${p.family ?? 'other'}`, cx: x, cy: y, r: 4 }), p.title));
  }
  out.append(g);
  return out;
}

/** Where the n neighbours sit round the middle of a ring of radius r (the first at the top, then clockwise). */
export function ringPoints(n, r, cx = 0, cy = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

/**
 * A page in the middle with its nearest pages round it, joined by lines.
 * centre and each neighbour: { title, family, picture (a url or null), rumour }.
 * At most `max` neighbours are drawn.
 */
export function miniRing({ centre, neighbours = [], width = 120, height = 80, max = 8, label = 'Who' }) {
  const out = frame(width, height, 'mini-ring', label);
  const cx = width / 2;
  const cy = height / 2;
  const shown = neighbours.slice(0, max);
  const r = Math.min(width, height) / 2 - 10;
  const points = ringPoints(shown.length, r, cx, cy);
  shown.forEach((n, i) => out.append(svg('line', { class: `mini-line${n.rumour ? ' rumour' : ''}`, x1: cx, y1: cy, x2: points[i].x, y2: points[i].y })));
  shown.forEach((n, i) => out.append(node(n, points[i].x, points[i].y, 7)));
  out.append(node(centre, cx, cy, 11));
  return out;
}

function node(p, x, y, r) {
  const g = titled(svg('g', { class: `mini-node fam-${p.family ?? 'other'}` }), p.title);
  const id = `mn${Math.random().toString(36).slice(2, 8)}`;
  if (p.picture) {
    g.append(svg('clipPath', { id }, svg('circle', { cx: x, cy: y, r })));
    g.append(svg('image', { href: p.picture, x: x - r, y: y - r, width: 2 * r, height: 2 * r, 'clip-path': `url(#${id})`, preserveAspectRatio: 'xMidYMid slice' }));
  }
  g.append(svg('circle', { class: p.picture ? 'mini-ring-edge' : 'mini-dot', cx: x, cy: y, r }));
  return g;
}

/**
 * A ribbon of moments: events [{ at, family, title }] with `at` a number (in-game
 * minutes, or anything that sorts), spread along a line from the first to the last.
 */
export function miniRibbon({ events = [], width = 120, height = 32, label = 'When' }) {
  const out = frame(width, height, 'mini-ribbon', label);
  const y = height / 2;
  out.append(svg('line', { class: 'mini-axis', x1: 6, y1: y, x2: width - 6, y2: y }));
  const ats = events.map((e) => e.at);
  const lo = Math.min(...ats);
  const span = Math.max(...ats) - lo;
  for (const e of events) {
    const x = span > 0 ? 6 + ((e.at - lo) / span) * (width - 12) : width / 2;
    out.append(titled(svg('circle', { class: `mini-dot fam-${e.family ?? 'other'}`, cx: x, cy: y, r: 3.5 }), e.title));
  }
  return out;
}
