/**
 * The Wheel (the wiki's "What?"): the kind families as slices of a colour
 * wheel round the party's portraits, each with how many pages it has. A click
 * on a slice picks that family; the page then shows its kinds as chips and
 * its pages as cards (wiki.js). The counts come from the server, for the DM
 * or as a player (GET …/wiki/wheel).
 */
import { fileUrl } from '../../page/api.js';
import { nav } from '../data.js';
import { svg } from '../../page/dom.js';

const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

/** The outline of a slice of a ring, from angle a0 to a1 (radians, 0 = right, clockwise). */
export function slicePath(r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = at(r1, a0);
  const [x1, y1] = at(r1, a1);
  const [x2, y2] = at(r0, a1);
  const [x3, y3] = at(r0, a0);
  const f = (n) => n.toFixed(2);
  return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${large} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`;
}

// The party's token pictures, fetched once each (with the login).
const tokens = new Map();
const tokenUrl = (cid, p) => {
  const path = `/campaigns/${cid}/members/${p.id}/token?v=${encodeURIComponent(p.token)}`;
  if (!tokens.has(path)) tokens.set(path, fileUrl(path).catch((err) => { tokens.delete(path); throw err; }));
  return tokens.get(path);
};

/**
 * The wheel as an <svg>. families: from the server; selected: a family or
 * null; onPick(family) on a click (the picked one again: null). `small` draws
 * it without names (the Home's), where a click also picks.
 */
export function drawWheel({ campaignId, families, party = [], selected = null, onPick, small = false }) {
  const R = 100;
  const r0 = small ? 44 : 46;
  const out = svg('svg', { class: `wiki-wheel${small ? ' small' : ''}`, viewBox: `-${R + 6} -${R + 6} ${2 * R + 12} ${2 * R + 12}`, role: 'group', 'aria-label': 'Kinds of page' });
  const step = (2 * Math.PI) / families.length;
  families.forEach((f, i) => {
    const a0 = -Math.PI / 2 + i * step + 0.012;
    const a1 = a0 + step - 0.024;
    const on = selected === f.family;
    const pop = on ? 5 : 0;
    const [dx, dy] = at(pop, (a0 + a1) / 2);
    const g = svg('g', {
      class: `wiki-slice fam-${f.family}${on ? ' on' : ''}${f.count ? '' : ' empty'}`,
      transform: pop ? `translate(${dx.toFixed(2)} ${dy.toFixed(2)})` : null,
      role: 'button',
      tabindex: f.count ? '0' : '-1',
      'aria-pressed': on ? 'true' : 'false',
      'aria-label': `${f.label}: ${f.count}`,
      'data-family': f.family,
    },
    svg('title', {}, `${f.label}: ${f.count} page${f.count === 1 ? '' : 's'}`),
    svg('path', { d: slicePath(r0, R, a0, a1) }));
    const [lx, ly] = at((r0 + R) / 2, (a0 + a1) / 2);
    g.append(svg('text', { class: 'wiki-slice-icon', x: lx.toFixed(2), y: (ly - (small ? 0 : 6)).toFixed(2) }, f.icon));
    if (!small) {
      g.append(svg('text', { class: 'wiki-slice-count', x: lx.toFixed(2), y: (ly + 9).toFixed(2) }, String(f.count)));
    }
    const pick = () => { if (f.count) onPick?.(on ? null : f.family); };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    out.append(g);
  });
  // The party in the middle: their token pictures, or their initials.
  const centre = svg('g', { class: 'wiki-wheel-party' }, svg('circle', { class: 'wiki-wheel-hub', r: r0 - 4 }));
  const shown = party.slice(0, 8);
  const pr = shown.length > 1 ? Math.min(13, (r0 - 8) * Math.sin(Math.PI / shown.length) * 0.9) : 18;
  const ring = shown.length > 1 ? r0 - 8 - pr : 0;
  shown.forEach((p, i) => {
    const [x, y] = at(ring, -Math.PI / 2 + (2 * Math.PI * i) / shown.length);
    const name = p.character_name || p.name;
    const g = svg('g', { class: 'wiki-wheel-member' }, svg('title', {}, name), svg('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: pr.toFixed(2) }));
    g.append(svg('text', { x: x.toFixed(2), y: y.toFixed(2) }, name.slice(0, 1).toUpperCase()));
    if (p.token && campaignId != null) {
      const id = `wm${p.id}${Math.random().toString(36).slice(2, 6)}`;
      const img = svg('image', { x: (x - pr).toFixed(2), y: (y - pr).toFixed(2), width: (2 * pr).toFixed(2), height: (2 * pr).toFixed(2), 'clip-path': `url(#${id})`, preserveAspectRatio: 'xMidYMid slice' });
      g.append(svg('clipPath', { id }, svg('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: pr.toFixed(2) })), img);
      tokenUrl(campaignId, p).then((src) => img.setAttribute('href', src), () => img.remove());
    }
    // A character's page (stage 6b) opens from their place in the middle.
    if (p.page) {
      Object.assign(g.dataset, { page: p.page });
      g.setAttribute('role', 'link');
      g.setAttribute('tabindex', '0');
      g.classList.add('has-page');
      const open = (e) => { e.stopPropagation(); nav.go(`#/page/${p.page}`); };
      g.addEventListener('click', open);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    }
    centre.append(g);
  });
  out.append(centre);
  return out;
}
