/**
 * The Web (#/web, #/web/<page id>; wiki space stage 3d): who is tied to whom.
 * The server works out the picture for the viewer (GET …/wiki/web, wiki-web.js
 * there); this draws it: portraits in their family's ring, lines coloured by
 * tone and styled by truth and by who made them (from play solid, your notes
 * dashed), faction and place bubbles round what's inside them. A click opens
 * a card: Open page, Centre here, Add a link. On a phone, a page's web is a
 * ring round it, and a tap re-centres.
 */
import { api, h } from './api.js';
import { KIND_FAMILIES } from './shared/wiki.js';
import { panZoom } from './pan-zoom.js';
import { state, nav, base, report, pictureImg, playerName } from './wiki-data.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  el.append(...kids.filter(Boolean));
  return el;
};

// What the Web shows, kept while the DM moves round the wiki.
const opts = { steps: 2, families: [], mentions: false, preset: null };
let pan = null;

const phone = () => window.matchMedia?.('(max-width: 700px)').matches ?? false;
const truthOn = () => document.querySelector('#tab-wiki')?.hasAttribute('data-truth') ?? false;

/** On a phone: the page in the middle and the pages tied to it round it, the rest left out. */
function ring(web) {
  const mid = web.nodes.find((n) => n.id === web.around);
  if (!mid) return web;
  const near = new Set(web.lines.filter((l) => l.from === mid.id || l.to === mid.id).flatMap((l) => [l.from, l.to]));
  const round = web.nodes.filter((n) => near.has(n.id) && n.id !== mid.id).sort((a, b) => a.title.localeCompare(b.title));
  const d = Math.max(140, round.length * 22);
  const nodes = [{ ...mid, x: 0, y: 0 }, ...round.map((n, i) => ({ ...n, x: Math.round(Math.cos((i / round.length) * Math.PI * 2 - Math.PI / 2) * d), y: Math.round(Math.sin((i / round.length) * Math.PI * 2 - Math.PI / 2) * d) }))];
  const ids = new Set(nodes.map((n) => n.id));
  return { ...web, nodes, lines: web.lines.filter((l) => ids.has(l.from) && ids.has(l.to)), bubbles: [] };
}

/** The address's page in the middle (`#/web/<id>`), or the whole web. */
export function webRoute() {
  return `#/web${state.webAround ? `/${state.webAround}` : ''}`;
}

/** Draw the Web into the wiki's main area. */
export async function drawWebView(main) {
  const frame = h('div', { class: 'wiki-web-frame' });
  const content = h('div', { class: 'wiki-web-content' });
  const card = h('aside', { class: 'wiki-web-card', hidden: true, 'aria-live': 'polite' });
  const bar = h('div', { class: 'wiki-web-bar' });
  frame.append(content);
  main.replaceChildren(h('div', { class: 'wiki-web' }, bar, h('div', { class: 'wiki-web-stage' }, frame, card)));
  pan?.destroy();
  pan = panZoom(frame, content, { min: 0.15, max: 1.5 });

  const load = async () => {
    const q = new URLSearchParams();
    if (state.webAround) q.set('around', state.webAround);
    q.set('steps', String(opts.steps));
    if (opts.families.length) q.set('families', opts.families.join(','));
    if (opts.mentions) q.set('mentions', '1');
    if (opts.preset) q.set('preset', opts.preset);
    if (state.as != null) q.set('as', String(state.as));
    else if (truthOn()) q.set('truth', '1');
    let web;
    try {
      web = await state.guarded(() => api('GET', `${base()}/web?${q}`));
    } catch (err) {
      return report(err);
    }
    if (state.view !== 'web' || !frame.isConnected) return;
    if (phone() && web.around && !opts.preset) web = ring(web);
    draw(web);
  };

  const chip = (label, on, onclick, title = null) => h('button', { type: 'button', class: `wiki-chip${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', title, onclick }, label);
  const drawBar = () => {
    const viewAs = h('select', { 'aria-label': 'View as' },
      h('option', { value: '' }, 'As you see it'),
      ...state.players.map((p) => h('option', { value: String(p.id), selected: state.as === p.id }, `As ${p.character_name || p.name} knows it`)));
    viewAs.addEventListener('change', () => { state.as = viewAs.value ? Number(viewAs.value) : null; load(); });
    bar.replaceChildren(...[
      h('div', { class: 'wiki-chips', role: 'group', 'aria-label': 'What to show' },
        chip('Ties', !opts.preset, () => { opts.preset = null; drawBar(); load(); }, 'People, places and factions and how they are tied'),
        chip('Factions', opts.preset === 'factions', () => { opts.preset = 'factions'; drawBar(); load(); }, 'Factions and how they stand with each other'),
        chip('Family', opts.preset === 'family', () => { opts.preset = 'family'; drawBar(); load(); }, 'Family trees, in generations'),
        state.webAround ? chip('Whole web', false, () => { state.webAround = null; nav.routed(); drawBar(); load(); }) : null),
      state.webAround && !opts.preset ? h('div', { class: 'wiki-chips', role: 'group', 'aria-label': 'Steps out' },
        ...[1, 2, 3].map((n) => chip(`${n} step${n > 1 ? 's' : ''}`, opts.steps === n, () => { opts.steps = n; drawBar(); load(); }))) : null,
      !opts.preset ? h('details', { class: 'wiki-web-filter', open: opts.families.length || opts.mentions ? true : null },
        h('summary', { class: 'small' }, opts.families.length ? `Only ${opts.families.map((f) => KIND_FAMILIES[f].label.toLowerCase()).join(', ')}` : 'Every kind'),
        h('div', { class: 'wiki-chips', role: 'group', 'aria-label': 'Families' },
        ...Object.entries(KIND_FAMILIES).filter(([f]) => f !== 'other').map(([f, k]) => {
          const on = opts.families.includes(f);
          return h('button', { type: 'button', class: `wiki-chip wiki-kind fam-${f}${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => {
            opts.families = on ? opts.families.filter((x) => x !== f) : [...opts.families, f];
            drawBar();
            load();
          } }, k.label);
        }),
        chip('Links in the text', opts.mentions, () => { opts.mentions = !opts.mentions; drawBar(); load(); }))) : null,
      viewAs,
    ].filter(Boolean));
  };

  const draw = (web) => {
    card.hidden = true;
    const byId = new Map(web.nodes.map((n) => [n.id, n]));
    const bubbleIds = new Set(web.bubbles.map((b) => b.id));
    const lines = web.lines.filter((l) => !(l.kind === 'inside' && bubbleIds.has(l.to)));
    const layer = svg('svg', { class: 'wiki-web-lines', width: 1, height: 1, overflow: 'visible', 'aria-hidden': 'true' },
      ...web.bubbles.map((b) => svg('g', { class: `wiki-web-bubble fam-${b.family}` },
        svg('circle', { cx: b.x, cy: b.y, r: b.r }),
        svg('text', { x: b.x, y: b.y - b.r + 18, 'text-anchor': 'middle' }, b.title))),
      ...lines.map((l) => {
        const a = byId.get(l.from);
        const b = byId.get(l.to);
        if (!a || !b) return null;
        const cls = `wiki-web-line kind-${l.kind} tone-${l.tone} canon-${l.canon} by-${l.by}`;
        return svg('g', { class: cls },
          svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }),
          l.labels.length && l.kind !== 'inside' ? svg('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 4, 'text-anchor': 'middle' }, `${l.canon === 'told' ? '“' : ''}${l.labels.join(' · ')}`) : null);
      }));
    const nodes = web.nodes.map((n) => {
      const btn = h('button', {
        type: 'button',
        class: `wiki-web-node fam-${n.family}${n.id === web.around ? ' middle' : ''}`,
        style: `left: ${n.x - n.r}px; top: ${n.y - n.r}px; width: ${n.r * 2}px; height: ${n.r * 2}px;`,
        title: n.title,
        'data-id': n.id,
        'data-no-pan': '', // a click, not the start of a drag
      },
      h('span', { class: `wiki-web-art${n.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, n.picture ? pictureImg(n.picture, { size: 'thumb' }) : null),
      h('span', { class: 'wiki-web-name' }, n.title));
      btn.addEventListener('click', () => (phone() && web.around && n.id !== web.around ? centre(n.id) : showCard(n)));
      return btn;
    });
    content.replaceChildren(layer, ...nodes);
    if (!web.nodes.length) {
      content.replaceChildren(h('p', { class: 'wiki-web-empty muted' }, state.as != null ? `Nothing here is available to ${playerName(state.as)}.` : 'No pages to show. Facts that link a page ("Rival: [[Lord Vex]]") draw the lines.'));
      return pan.set({ x: 24, y: 24, k: 1 });
    }
    const xs = web.nodes.flatMap((n) => [n.x - n.r, n.x + n.r]);
    const ys = web.nodes.flatMap((n) => [n.y - n.r, n.y + n.r + 18]);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    pan.fit(box);
  };

  const centre = (id) => {
    state.webAround = id;
    nav.routed();
    drawBar();
    load();
  };

  const showCard = (n) => {
    const page = state.pages.find((p) => p.id === n.id);
    card.hidden = false;
    card.replaceChildren(...[
      h('button', { type: 'button', class: 'ghost icon-btn wiki-web-close', 'aria-label': 'Close', onclick: () => { card.hidden = true; } }, '✕'),
      n.picture ? pictureImg(n.picture, { size: 'thumb', cls: 'wiki-web-card-pic' }) : null,
      h('h3', {}, n.title),
      h('p', { class: 'muted small' }, n.kind || KIND_FAMILIES[n.family]?.label || ''),
      page?.excerpt ? h('p', { class: 'small' }, page.excerpt) : null,
      h('div', { class: 'wiki-web-actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => nav.go(`#/page/${n.id}`) }, 'Open page'),
        n.id !== state.webAround ? h('button', { type: 'button', class: 'ghost', onclick: () => centre(n.id) }, 'Centre here') : null,
        state.as == null ? h('button', { type: 'button', class: 'ghost', onclick: () => addLink(n) }, 'Add a link…') : null),
    ].filter(Boolean));
  };

  /** A new fact on this page linking another: "Rival: [[Lord Vex]]", saved with the page's version. */
  const addLink = (n) => {
    const others = state.pages.filter((p) => p.id !== n.id).sort((a, b) => a.title.localeCompare(b.title));
    const label = h('input', { maxLength: 60, placeholder: 'Rival, Ally, Mother, Member of…', 'aria-label': 'How they are tied', required: true });
    const to = h('select', { 'aria-label': 'Tied to' }, ...others.map((p) => h('option', { value: p.id }, p.title)));
    const form = h('form', { class: 'wiki-web-add' },
      h('p', { class: 'small' }, `A fact on ${n.title}:`),
      h('label', { class: 'small' }, 'How ', label),
      h('label', { class: 'small' }, 'To ', to),
      h('div', { class: 'wiki-web-actions' }, h('button', { type: 'submit', class: 'primary' }, 'Add'), h('button', { type: 'button', class: 'ghost', onclick: () => showCard(n) }, 'Cancel')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const other = others.find((p) => p.id === to.value);
      if (!other || !label.value.trim()) return;
      try {
        await state.guarded(async () => {
          const { page } = await api('GET', `${base()}/${n.id}`);
          await api('PUT', `${base()}/${n.id}`, { version: page.version, facts: [...page.facts, { label: label.value.trim(), value: `[[${other.title}]]`, available: 'all' }] });
        });
        load();
      } catch (err) {
        report(err);
      }
    });
    card.replaceChildren(form);
    queueMicrotask(() => label.focus());
  };

  drawBar();
  await load();
}

/** Leaving the Web: stop listening for moves. */
export function leaveWeb() {
  pan?.destroy();
  pan = null;
}
