/**
 * The Timeline (#/timeline, #/timeline/<page id>; wiki space stage 4c): when things happened, in lanes. The
 * server works it out for the viewer (GET …/wiki/timeline, wiki-timeline.js there); this draws it: picture cards
 * for pages with a time, slim bars for events (styled by truth and by who wrote them), the calendar's names on the
 * scale, full moons, the Now line, and trays for what has no time. Drag sideways to move along it, the wheel or a
 * pinch to zoom from ages to hours. A click opens a card: Open page, Show on the map. On a phone it's a vertical
 * ribbon of cards.
 */
import { api } from '../../page/api.js';
import { timeTicks, fullMoons, whenText } from '/shared/wiki-time.js';
import { KIND_FAMILIES, isArcPage } from '/shared/wiki.js';
import { panZoom } from '../../page/pan-zoom.js';
import { canonBadge } from '../canon.js';
import { showOnMap } from './atlas.js';
import { state, nav, base, report, pictureImg, playerName, truthOn } from '../data.js';
import { h } from '../../page/dom.js';

const DAY = 1440;
const ROW = 34; // one row of items
const SCALE = 34; // the scale across the top
const LABEL = 132; // the lanes' names down the left

let pan = null;

const phone = () => window.matchMedia?.('(max-width: 700px)').matches ?? false;

/** About how wide an item is drawn, in pixels, at k pixels a minute (its span, or its card or label). */
const widthOf = (x, k) => {
  const span = Math.max(0, (x.when.to - x.when.from) * k);
  return x.type === 'page' ? Math.max(150, span) : Math.max(8, span) + 10 + Math.min(240, label(x).length * 6.6);
};
const label = (x) => (x.type === 'page' ? x.title : x.text.length > 70 ? `${x.text.slice(0, 67)}…` : x.text);

// Lanes by character (stage 11): each player character's own lane of where they went.
let byCharacter = false;

/** Draw the Timeline into the wiki's main area. */
export async function drawTimeline(main) {
  pan?.destroy();
  pan = null;
  const q = new URLSearchParams();
  if (state.as != null) q.set('as', String(state.as));
  else if (truthOn()) q.set('truth', '1');
  if (byCharacter) q.set('characters', '1');
  let data;
  try {
    data = await state.guarded(() => api('GET', `${base()}/timeline?${q}`));
  } catch (err) {
    return report(err);
  }
  if (state.view !== 'timeline' || !main.isConnected) return;

  const card = h('aside', { class: 'wiki-web-card wiki-tl-card', hidden: true, 'aria-live': 'polite' });
  const bar = drawBar(data);
  const trays = drawTrays(data);
  const note = data.capped ? h('p', { class: 'muted small' }, 'Showing the first 600 times; narrow it with View as or the Truth button.') : null;
  if (phone()) {
    main.replaceChildren(h('div', { class: 'wiki-timeline phone' }, bar, ribbon(data, card), card, note, trays));
    return;
  }
  const frame = h('div', { class: 'wiki-tl-frame' });
  const dummy = h('div', { hidden: true });
  const stage = h('div', { class: 'wiki-tl-stage' }, frame, card);
  main.replaceChildren(h('div', { class: 'wiki-timeline' }, bar, stage, note, trays));

  // The scale, the lanes and their items (made once; placed on every move).
  const scale = h('div', { class: 'wiki-tl-scale', 'aria-hidden': 'true' });
  const nowLine = h('div', { class: 'wiki-tl-now', title: `Now: ${whenText({ from: data.now, to: data.now }, data.calendar)}` }, h('span', {}, 'Now'));
  const lanes = data.lanes.map((l) => {
    const items = data.items.filter((x) => x.lane === l.id).map((x) => ({ x, el: itemEl(x, () => openCard(card, x, data)) }));
    const remove = l.page && state.as == null ? h('button', { type: 'button', class: 'ghost icon-btn small', title: 'Remove this lane', 'aria-label': `Remove the lane ${l.title}`, 'data-no-pan': '', onclick: () => setLanes(data.lanes.filter((x) => x.page && x.page !== l.page).map((x) => x.page)) }, '✕') : null;
    const name = h('div', { class: `wiki-tl-lane-name${l.family ? ` fam-${l.family}` : ''}` },
      l.page ? h('button', { type: 'button', class: 'link', 'data-no-pan': '', onclick: () => nav.go(`#/page/${l.page}`) }, l.title) : h('span', {}, l.title), remove);
    const el = h('div', { class: 'wiki-tl-lane', 'data-lane': l.id }, ...items.map((i) => i.el));
    return { l, items, el, name };
  }).filter((x) => x.items.length || x.l.page || x.l.id === 'campaign');
  const names = h('div', { class: 'wiki-tl-names' }, ...lanes.map((x) => x.name));
  const body = h('div', { class: 'wiki-tl-body' }, ...lanes.map((x) => x.el));
  frame.append(scale, body, nowLine, names, dummy);

  const place = (view) => {
    const width = frame.clientWidth || 800;
    const X = (t) => LABEL + view.x + t * view.k;
    const from = (-view.x - LABEL) / view.k;
    const to = (width - view.x) / view.k;
    // The scale: the calendar's names, and the full moons.
    // A label that would run into the one before it is left out (the mark stays).
    let free = -Infinity;
    const ticks = timeTicks(from, to, view.k, data.calendar).map((t) => {
      const x = X(t.at);
      const shown = x >= free;
      if (shown) free = x + t.label.length * 6.5 + 10;
      return h('span', { class: `wiki-tl-tick${t.major ? ' major' : ''}`, style: `left:${x}px` }, shown ? t.label : '');
    });
    scale.replaceChildren(
      ...ticks,
      ...fullMoons(from, to, data.calendar).map((m) => h('span', { class: 'wiki-tl-moon', style: `left:${X(m.at + DAY / 2)}px`, title: `${m.name} full` }, '○')),
    );
    nowLine.style.left = `${X(data.now)}px`;
    nowLine.hidden = X(data.now) < LABEL || X(data.now) > width;
    // Each lane: items in rows, so none sit on another at this zoom.
    let top = SCALE;
    for (const lane of lanes) {
      const ends = [];
      for (const { x, el } of lane.items) {
        const left = X(x.when.from);
        const w = widthOf(x, view.k);
        let row = ends.findIndex((end) => end < left - 6);
        if (row === -1) row = ends.push(0) - 1;
        ends[row] = left + w;
        el.style.left = `${left}px`;
        el.style.top = `${6 + row * ROW}px`;
        el.style.setProperty('--span', `${Math.max(x.type === 'page' ? 0 : 8, (x.when.to - x.when.from) * view.k)}px`);
      }
      const height = Math.max(1, ends.length) * ROW + 12;
      lane.el.style.top = `${top}px`;
      lane.el.style.height = `${height}px`;
      lane.name.style.top = `${top}px`;
      lane.name.style.height = `${height}px`;
      top += height;
    }
    body.style.height = `${top}px`;
    frame.style.height = `${Math.max(top + 8, 240)}px`;
  };

  // What to fit: every dated item and now (Fit all), or at first the campaign's (History is off to the left).
  const width = Math.max(200, (frame.clientWidth || 800) - LABEL - 40);
  const span = (list) => {
    const ats = [data.now, ...list.flatMap((x) => [x.when.from, x.when.to])];
    const lo = Math.min(...ats);
    const hi = Math.max(...ats, lo + DAY);
    return { lo, k: width / (hi - lo) };
  };
  const whole = span(data.items);
  const played = span(data.items.filter((x) => x.lane !== 'history'));
  const fitK = whole.k;
  pan = panZoom(frame, dummy, { axis: 'x', min: whole.k / 4, max: 2, onChange: place });
  const fitTo = ({ lo, k }) => pan.set({ x: 20 - lo * k, y: 0, k });
  const fit = () => fitTo(whole);
  const centreOn = (t, k = pan.view().k) => pan.set({ x: (frame.clientWidth - LABEL) / 2 - t * k, y: 0, k });
  bar.querySelector('[data-fit]')?.addEventListener('click', fit);
  bar.querySelector('[data-now]')?.addEventListener('click', () => centreOn(data.now, Math.max(pan.view().k, 300 / (7 * DAY))));
  const focus = state.timelineFocus && lanes.flatMap((l) => l.items).filter((i) => i.x.page_id === state.timelineFocus);
  if (focus?.length) {
    for (const i of focus) i.el.classList.add('focus');
    const a = Math.min(...focus.map((i) => i.x.when.from));
    const b = Math.max(...focus.map((i) => i.x.when.to));
    pan.set({ x: 0, y: 0, k: Math.min(2, Math.max(fitK, width / Math.max(DAY, (b - a) * 3))) });
    centreOn((a + b) / 2);
    focus[0].el.scrollIntoView?.({ block: 'nearest' });
  } else {
    fitTo(played);
  }
  if (!data.items.length) body.append(h('p', { class: 'wiki-tl-empty muted' }, state.as != null ? `Nothing with a time is available to ${playerName(state.as)}.` : 'Nothing has a time yet. Give a page a When, or add events to it (Edit).'));
}

/** The bar: the name, Fit all, Now, View as, and Add a lane. */
function drawBar(data) {
  const viewAs = h('select', { 'aria-label': 'View as' },
    h('option', { value: '' }, 'As you see it'),
    ...state.players.map((p) => h('option', { value: String(p.id), selected: state.as === p.id }, `As ${p.character_name || p.name} knows it`)));
  viewAs.addEventListener('change', () => { state.as = viewAs.value ? Number(viewAs.value) : null; nav.drawMain(); });
  const own = data.lanes.filter((l) => l.page).map((l) => l.page);
  const addLane = state.as == null ? h('select', { 'aria-label': 'Add a lane', title: 'A lane of its own for a page: it, the pages inside it and the pages that link to it' },
    h('option', { value: '' }, 'Add a lane…'),
    ...state.pages.filter((p) => !own.includes(p.id)).sort((a, b) => a.title.localeCompare(b.title)).map((p) => h('option', { value: p.id }, p.title))) : null;
  addLane?.addEventListener('change', () => addLane.value && setLanes([...own, addLane.value]));
  return h('div', { class: 'wiki-web-bar wiki-tl-head' }, ...[
    h('h2', {}, 'Timeline'),
    phone() ? null : h('button', { type: 'button', class: 'ghost small', 'data-fit': '' }, 'Fit all'),
    phone() ? null : h('button', { type: 'button', class: 'ghost small', 'data-now': '' }, 'Now'),
    viewAs,
    addLane,
    // Group by arc (stage 7b): a lane for each arc page, with its quests and sessions inside it.
    state.as == null && state.pages.some(isArcPage) ? h('button', { type: 'button', class: 'ghost small', title: 'A lane for each arc: the arc, its quests and sessions, and what links to it', onclick: () => setLanes(state.pages.filter(isArcPage).map((p) => p.id)) }, 'Lanes by arc') : null,
    h('button', { type: 'button', class: 'ghost small', 'aria-pressed': String(byCharacter), title: 'A lane for each player character: where they went, from their journeys on the maps', onclick: () => { byCharacter = !byCharacter; nav.drawMain(); } }, 'Lanes by character'),
  ].filter(Boolean));
}

async function setLanes(lanes) {
  try {
    await state.guarded(() => api('PATCH', `/campaigns/${state.campaignId}/settings`, { wiki: { lanes } }));
    nav.drawMain();
  } catch (err) {
    report(err);
  }
}

/** An item on a lane: a picture card for a page, a slim bar with its words for an event. */
function itemEl(x, onclick) {
  const cls = `wiki-tl-item ${x.type} fam-${x.family} canon-${x.canon} by-${x.by}`;
  const when = whenText(x.when, state.calendar);
  if (x.type === 'page') {
    return h('button', { type: 'button', class: cls, title: `${x.title}: ${when}`, 'data-no-pan': '', onclick },
      h('span', { class: `wiki-tl-art${x.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, x.picture ? pictureImg(x.picture, { size: 'thumb' }) : null),
      h('span', { class: 'wiki-tl-title' }, x.title));
  }
  return h('button', { type: 'button', class: cls, title: `${when}: ${x.text} (${x.type === 'journey' ? `on ${x.title}` : x.title})`, 'data-no-pan': '', onclick },
    h('span', { class: 'wiki-tl-bar', 'aria-hidden': 'true' }),
    h('span', { class: 'wiki-tl-label' }, label(x)));
}

/** The card for an item: what and when, Open page, and Show on the map where its page is pinned. */
function openCard(card, x, data) {
  card.hidden = false;
  card.replaceChildren(...[
    h('button', { type: 'button', class: 'ghost icon-btn wiki-web-close', 'aria-label': 'Close', onclick: () => { card.hidden = true; } }, '✕'),
    x.picture ? pictureImg(x.picture, { size: 'thumb', cls: 'wiki-web-card-pic' }) : null,
    h('p', { class: 'muted small' }, whenText(x.when, data.calendar) || 'Undated'),
    h('h3', {}, x.type === 'page' ? x.title : x.text),
    x.type === 'event' ? h('p', { class: 'small' }, canonBadge(x), ` On ${x.title}`)
      : x.type === 'journey' ? h('p', { class: 'muted small' }, `A journey on the map "${x.title}"${x.done ? '' : ', still on the way'}`)
      : h('p', { class: 'muted small' }, KIND_FAMILIES[x.family]?.label ?? ''),
    x.available && x.available !== 'all' ? h('p', { class: 'wiki-available small' }, x.available === 'dm' ? 'Only you' : `Only ${x.available.map(playerName).join(', ')}`) : null,
    h('div', { class: 'wiki-web-actions' },
      x.page_id ? h('button', { type: 'button', class: 'primary', onclick: () => nav.go(`#/page/${x.page_id}`) }, 'Open page') : null,
      x.place ? h('button', { type: 'button', class: 'ghost', onclick: () => showOnMap(x.place) }, `Show on the map (${x.place.map_name})`) : null),
  ].filter(Boolean));
}

/** On a phone: one card after another, down the screen, with the lane's name. */
function ribbon(data, card) {
  if (!data.items.length) return h('p', { class: 'muted' }, 'Nothing has a time yet.');
  const laneName = new Map(data.lanes.map((l) => [l.id, l.title]));
  return h('ol', { class: 'wiki-tl-ribbon' }, ...data.items.map((x) => h('li', { class: `fam-${x.family}${x.page_id === state.timelineFocus ? ' focus' : ''}` },
    h('span', { class: 'wiki-tl-when small' }, whenText(x.when, data.calendar), h('span', { class: 'muted' }, ` · ${laneName.get(x.lane)}`)),
    itemEl(x, () => openCard(card, x, data)))));
}

/** What has no time: undated items, and session pages not yet given one. */
function drawTrays(data) {
  if (!data.undated.length && !data.sessions.length) return null;
  const chip = (title, picture, onclick, cls = '') => h('button', { type: 'button', class: `wiki-compass-chip${cls}`, onclick },
    h('span', { class: `wiki-compass-art${picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, picture ? pictureImg(picture, { size: 'thumb' }) : null),
    h('span', { class: 'wiki-compass-title' }, title));
  return h('div', { class: 'wiki-tl-trays' }, ...[
    data.undated.length ? h('section', {}, h('h3', { class: 'small' }, 'Undated'),
      h('div', { class: 'wiki-compass-chips' }, ...data.undated.map((x) => chip(x.type === 'event' ? `${x.when?.text ? `${x.when.text}: ` : ''}${label(x)}` : `${x.title}${x.when?.text ? ` (${x.when.text})` : ''}`, x.picture, () => nav.go(`#/page/${x.page_id}`), ` fam-${x.family} canon-${x.canon}`)))) : null,
    data.sessions.length ? h('section', {}, h('h3', { class: 'small' }, 'Sessions with no time yet'),
      h('div', { class: 'wiki-compass-chips' }, ...data.sessions.map((s) => chip(s.title, s.picture, () => nav.go(`#/page/${s.id}`), ' fam-session')))) : null,
  ].filter(Boolean));
}

/** Leaving the Timeline: stop listening for moves. */
export function leaveTimeline() {
  pan?.destroy();
  pan = null;
}
