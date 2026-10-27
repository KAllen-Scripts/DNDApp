/**
 * Boards (wiki space stage 10b): `#/boards` lists the viewer's boards, `#/boards/<id>` draws one: page cards
 * (small, medium or large: picture, title and opening words), sticky notes, wiki pictures, links to other boards
 * and labelled arrows, on a canvas that pans and zooms (pan-zoom.js). The owner drags and resizes cards and it
 * saves after a pause; a page card opens the drawer. On a phone a board is for looking and moving, not building.
 * The server sends each card as this viewer may see it: one they can't see (now) is "gone".
 */
import { api, h } from './api.js';
import { state, nav, base, report, status, pictureImg, fam, kindBadge, choosePicture } from './wiki-data.js';
import { panZoom } from './pan-zoom.js';

const SIZES = { small: [160, 64], medium: [220, 150], large: [300, 260] };
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'grey'];
const SAVE_AFTER_MS = 800;
const phone = () => window.matchMedia?.('(max-width: 560px)').matches ?? false;
const hex = () => Math.random().toString(16).slice(2, 8).padEnd(6, '0');

/** Make a board (theirs) and open it: { title, items?, arrows? }. */
export async function makeBoard(fields) {
  try {
    const { board } = await state.guarded(() => api('POST', `${base()}/boards`, fields));
    nav.go(`#/boards/${board.id}`);
    return board;
  } catch (err) {
    report(err);
    return null;
  }
}

/** `#/boards`: the boards this viewer may open. */
async function drawList(main) {
  const box = h('div', { class: 'wiki-boards' }, h('p', { class: 'muted small' }, 'Loading…'));
  main.replaceChildren(box);
  let boards;
  try {
    ({ boards } = await state.guarded(() => api('GET', `${base()}/boards`)));
  } catch (err) {
    return report(err);
  }
  if (!box.isConnected) return;
  const title = h('input', { type: 'text', placeholder: 'A new board…', maxlength: 120, 'aria-label': 'New board\'s name' });
  const card = (b) => h('button', { type: 'button', class: 'wiki-board-tile card', onclick: () => nav.go(`#/boards/${b.id}`) },
    h('strong', {}, b.title),
    h('span', { class: 'muted small' }, `${b.cards} card${b.cards === 1 ? '' : 's'}${b.mine ? '' : ` · ${b.owner_name}'s`}${b.shared_with_dm && b.mine ? ' · shared with the DM' : ''}`));
  const mine = boards.filter((b) => b.mine);
  const others = boards.filter((b) => !b.mine);
  box.replaceChildren(...[
    h('h2', {}, 'Boards'),
    h('p', { class: 'muted small' }, state.dm
      ? 'Lay pages, notes and pictures out on a board and draw arrows between them. Players make their own; you see one when they share it.'
      : 'Your own boards: pin up the pages you know, add notes and draw arrows between them. Only you see them, unless you share one with the DM.'),
    h('form', { class: 'wiki-transfer-row', onsubmit: (e) => { e.preventDefault(); makeBoard({ title: title.value.trim() }); } }, title, h('button', { type: 'submit', class: 'primary' }, 'New board')),
    mine.length ? h('div', { class: 'wiki-board-tiles' }, ...mine.map(card)) : h('p', { class: 'muted small' }, 'No boards yet.'),
    others.length ? h('h3', {}, state.dm ? 'Shared with you' : 'Others') : null,
    others.length ? h('div', { class: 'wiki-board-tiles' }, ...others.map(card)) : null,
  ].filter(Boolean));
}

/** Choose one of the viewer's pages: resolves its id, or null. */
function choosePage() {
  const dialog = document.querySelector('#wiki-dialog');
  return new Promise((resolve) => {
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      dialog.close();
      resolve(id);
    };
    dialog.addEventListener('close', () => finish(null), { once: true });
    const find = h('input', { type: 'search', placeholder: 'Find a page…', 'aria-label': 'Find a page' });
    const pages = [...state.pages].sort((a, b) => a.title.localeCompare(b.title));
    const list = h('div', { class: 'wiki-embed-choices' });
    const draw = () => {
      const q = find.value.trim().toLowerCase();
      list.replaceChildren(...pages.filter((p) => !q || p.title.toLowerCase().includes(q)).slice(0, 80)
        .map((p) => h('button', { type: 'button', class: 'ghost small', onclick: () => finish(p.id) }, p.title)));
    };
    find.addEventListener('input', draw);
    draw();
    dialog.className = 'map-dialog wiki-dialog wiki-chooser';
    dialog.replaceChildren(h('div', { class: 'map-dialog-inner' },
      h('div', { class: 'wiki-chooser-head' }, h('h2', {}, 'Put a page on the board'), h('button', { type: 'button', class: 'ghost', onclick: () => finish(null) }, 'Cancel')),
      find, list));
    dialog.showModal?.();
    find.focus?.();
  });
}

/** `#/boards/<id>`: one board. */
async function drawBoard(main, id) {
  const shell = h('div', { class: 'wiki-board-view' }, h('p', { class: 'muted small' }, 'Loading…'));
  main.replaceChildren(shell);
  let board;
  let others = [];
  try {
    [{ board }, { boards: others }] = await state.guarded(() => Promise.all([api('GET', `${base()}/boards/${id}`), api('GET', `${base()}/boards`)]));
  } catch (err) {
    return report(err);
  }
  if (!shell.isConnected) return;
  const edit = board.mine;
  const build = edit && !phone();
  const items = board.items.map((x) => ({ ...x }));
  let arrows = board.arrows.map((a) => ({ ...a }));
  let version = board.version;
  let selected = null;
  let arrowFrom = null;

  // ---- saving: after a pause, from the version it started from ----
  let timer = null;
  let saving = Promise.resolve();
  const plain = (x) => ({ id: x.id, kind: x.kind, ref: x.ref ?? null, x: x.x, y: x.y, w: x.w, h: x.h, ...(x.size && { size: x.size }), ...(x.kind === 'note' && { text: x.text, color: x.color }) });
  const save = (extra = {}) => {
    clearTimeout(timer);
    saving = saving.then(async () => {
      try {
        // A gone card comes without its ref: the server keeps the one it has for that card.
        const res = await api('PUT', `${base()}/boards/${board.id}`, { version, items: items.map(plain), arrows: arrows.map(({ id: aid, from, to, label }) => ({ id: aid, from, to, label })), ...extra });
        version = res.board.version;
        board = res.board;
        status('Saved.');
      } catch (err) {
        if (err.status === 409) {
          status('Someone changed this board since you opened it: here it is as it is now.', true);
          drawBoard(main, id);
        } else {
          report(err);
        }
      }
    });
    return saving;
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_AFTER_MS);
  };

  // ---- the canvas ----
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'wiki-board-arrows');
  svg.setAttribute('aria-hidden', 'true');
  const canvas = h('div', { class: 'wiki-board-canvas' });
  canvas.append(svg);
  const frame = h('div', { class: 'wiki-board-frame' }, canvas);
  const pz = panZoom(frame, canvas, { min: 0.15, max: 3 });

  const els = new Map();
  const centre = (x) => ({ x: x.x + x.w / 2, y: x.y + x.h / 2 });
  function drawArrows() {
    const NS = 'http://www.w3.org/2000/svg';
    svg.replaceChildren();
    for (const a of arrows) {
      const f = items.find((x) => x.id === a.from);
      const t = items.find((x) => x.id === a.to);
      if (!f || !t) continue;
      const p = centre(f);
      const q = centre(t);
      const line = document.createElementNS(NS, 'line');
      for (const [k, v] of Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, 'marker-end': 'url(#wiki-board-head)' })) line.setAttribute(k, v);
      svg.append(line);
      if (a.label) {
        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', (p.x + q.x) / 2);
        text.setAttribute('y', (p.y + q.y) / 2 - 6);
        text.textContent = a.label;
        svg.append(text);
      }
    }
    const defs = document.createElementNS(NS, 'defs');
    const marker = document.createElementNS(NS, 'marker');
    for (const [k, v] of Object.entries({ id: 'wiki-board-head', viewBox: '0 0 10 10', refX: '10', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse' })) marker.setAttribute(k, v);
    const head = document.createElementNS(NS, 'path');
    head.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    marker.append(head);
    defs.append(marker);
    svg.prepend(defs);
  }

  function cardBody(x) {
    if (x.gone) return [h('span', { class: 'muted small' }, 'Gone: you can\'t see this any more.')];
    if (x.kind === 'note') {
      const text = h('textarea', { class: 'wiki-board-note-text', 'aria-label': 'Note', readonly: !edit, maxlength: 2000 });
      text.value = x.text ?? '';
      text.addEventListener('input', () => { x.text = text.value; later(); });
      return [text];
    }
    if (x.kind === 'picture') return [pictureImg(x.ref, { size: 'thumb', cls: 'wiki-board-pic' })];
    if (x.kind === 'board') return [h('span', { class: 'muted small' }, '▦ Board'), h('strong', {}, x.title)];
    return [
      x.picture && x.size !== 'small' ? pictureImg(x.picture, { size: 'thumb', cls: 'wiki-board-pic' }) : null,
      kindBadge(x.page_kind),
      h('strong', {}, x.title),
      x.size === 'large' && x.opening ? h('span', { class: 'small' }, x.opening) : x.size === 'medium' && x.opening ? h('span', { class: 'small muted' }, `${x.opening.slice(0, 90)}${x.opening.length > 90 ? '…' : ''}`) : null,
    ];
  }

  function place(el, x) {
    Object.assign(el.style, { left: `${x.x}px`, top: `${x.y}px`, width: `${x.w}px`, height: `${x.h}px` });
  }

  function drawCard(x) {
    const el = h('div', {
      class: `wiki-board-card kind-${x.kind}${x.kind === 'page' && !x.gone ? ` fam-${fam(x.page_kind)}` : ''}${x.kind === 'note' ? ` note-${x.color}` : ''}${x.gone ? ' gone' : ''}`,
      'data-no-pan': '', 'data-id': x.id, tabindex: '0',
    }, ...cardBody(x).filter(Boolean));
    if (edit) el.append(h('span', { class: 'wiki-board-resize', 'aria-hidden': 'true' }));
    place(el, x);
    // Drag to move (the owner); a click without a move opens it; a resize from the corner.
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || (e.target.tagName === 'TEXTAREA' && !e.target.readOnly)) return;
      const resizing = e.target.classList.contains('wiki-board-resize');
      const start = { px: e.clientX, py: e.clientY, x: x.x, y: x.y, w: x.w, h: x.h };
      let moved = false;
      el.setPointerCapture?.(e.pointerId);
      const move = (m) => {
        const k = pz.view().k;
        const dx = (m.clientX - start.px) / k;
        const dy = (m.clientY - start.py) / k;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        if (!edit) return;
        if (resizing) {
          x.w = Math.max(60, Math.round(start.w + dx));
          x.h = Math.max(40, Math.round(start.h + dy));
        } else {
          x.x = Math.round(start.x + dx);
          x.y = Math.round(start.y + dy);
        }
        place(el, x);
        drawArrows();
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (moved && edit) return later();
        if (!moved) click(x);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    els.set(x.id, el);
    return el;
  }

  function click(x) {
    if (arrowFrom && arrowFrom !== x.id) {
      const label = window.prompt?.('Label for the arrow (or leave it empty):', '') ?? '';
      arrows.push({ id: hex(), from: arrowFrom, to: x.id, label: label.trim().slice(0, 100) });
      arrowFrom = null;
      frame.classList.remove('drawing-arrow');
      drawArrows();
      return later();
    }
    select(x.id);
    if (x.gone) return;
    if (x.kind === 'page') nav.drawer(x.ref);
    else if (x.kind === 'board') nav.go(`#/boards/${x.ref}`);
  }

  function select(itemId) {
    selected = itemId;
    for (const [k, el] of els) el.classList.toggle('selected', k === itemId);
    drawTools();
  }

  function drawCards() {
    els.clear();
    canvas.replaceChildren(svg, ...items.map(drawCard));
    drawArrows();
  }

  /** A spot for a new card: the middle of what's on screen. */
  const spot = () => {
    const v = pz.view();
    const r = frame.getBoundingClientRect();
    return { x: Math.round((r.width / 2 - v.x) / v.k - 110 + (Math.random() * 40 - 20)), y: Math.round((r.height / 2 - v.y) / v.k - 70 + (Math.random() * 40 - 20)) };
  };
  const add = async (x) => {
    items.push(x);
    drawCards();
    select(x.id);
    await save();
    // The server fills in what a card shows (a page's title, picture and opening words).
    const fresh = board.items.find((y) => y.id === x.id);
    if (fresh && x.kind !== 'note') {
      for (const k of ['title', 'page_kind', 'picture', 'opening', 'gone']) if (k in fresh) x[k] = fresh[k];
      drawCards();
    }
  };

  // ---- the tools ----
  const tools = h('div', { class: 'wiki-board-tools' });
  function drawTools() {
    const sel = items.find((x) => x.id === selected);
    tools.replaceChildren(...[
      h('button', { type: 'button', class: 'ghost small', onclick: () => nav.go('#/boards') }, '← Boards'),
      h('strong', { class: 'wiki-board-title' }, board.title),
      !edit ? h('span', { class: 'muted small' }, `${board.owner_name}'s board, shared with you`) : null,
      build ? h('button', { type: 'button', class: 'ghost small', onclick: async () => {
        const ref = await choosePage();
        if (ref) add({ id: hex(), kind: 'page', ref, ...spot(), w: SIZES.medium[0], h: SIZES.medium[1], size: 'medium' });
      } }, '+ Page') : null,
      build ? h('button', { type: 'button', class: 'ghost small', onclick: () => add({ id: hex(), kind: 'note', text: '', color: 'yellow', ...spot(), w: 200, h: 140 }) }, '+ Note') : null,
      build && state.dm ? h('button', { type: 'button', class: 'ghost small', onclick: async () => {
        const ref = await choosePicture('Put a picture on the board');
        if (ref) add({ id: hex(), kind: 'picture', ref, ...spot(), w: 240, h: 180 });
      } }, '+ Picture') : null,
      build && others.some((b) => b.id !== board.id) ? h('select', { 'aria-label': 'Link another board', onchange: (e) => {
        const ref = e.target.value;
        e.target.value = '';
        if (ref) add({ id: hex(), kind: 'board', ref, ...spot(), w: 200, h: 80 });
      } }, h('option', { value: '' }, '+ Link a board'), ...others.filter((b) => b.id !== board.id).map((b) => h('option', { value: b.id }, b.title))) : null,
      build && sel ? h('button', { type: 'button', class: 'ghost small', title: 'Then click the card it points to', onclick: () => {
        arrowFrom = sel.id;
        frame.classList.add('drawing-arrow');
        status('Now click the card the arrow points to.');
      } }, '→ Arrow from here') : null,
      build && sel?.kind === 'page' && !sel.gone ? h('select', { 'aria-label': 'Card size', onchange: (e) => {
        sel.size = e.target.value;
        [sel.w, sel.h] = SIZES[sel.size];
        drawCards();
        select(sel.id);
        later();
      } }, ...Object.keys(SIZES).map((s) => h('option', { value: s, selected: sel.size === s }, s[0].toUpperCase() + s.slice(1)))) : null,
      build && sel?.kind === 'note' ? h('select', { 'aria-label': 'Note colour', onchange: (e) => {
        sel.color = e.target.value;
        drawCards();
        select(sel.id);
        later();
      } }, ...COLORS.map((c) => h('option', { value: c, selected: sel.color === c }, c[0].toUpperCase() + c.slice(1)))) : null,
      build && sel ? h('button', { type: 'button', class: 'ghost small danger', onclick: () => {
        items.splice(items.findIndex((x) => x.id === sel.id), 1);
        arrows = arrows.filter((a) => a.from !== sel.id && a.to !== sel.id);
        selected = null;
        drawCards();
        drawTools();
        save();
      } }, 'Take off') : null,
      build && arrows.some((a) => a.from === sel?.id || a.to === sel?.id) ? h('button', { type: 'button', class: 'ghost small', onclick: () => {
        arrows = arrows.filter((a) => a.from !== sel.id && a.to !== sel.id);
        drawArrows();
        later();
      } }, 'Remove its arrows') : null,
      edit && !state.dm ? h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: board.shared_with_dm, onchange: (e) => save({ shared_with_dm: e.target.checked }) }), ' Share with the DM') : null,
      build ? h('button', { type: 'button', class: 'ghost small', onclick: () => {
        const t = window.prompt?.('Name the board:', board.title);
        if (t?.trim()) { board.title = t.trim(); drawTools(); save({ title: t.trim() }); }
      } }, 'Rename') : null,
      build ? h('button', { type: 'button', class: 'ghost small danger', onclick: async () => {
        if (!window.confirm(`Delete the board "${board.title}"?`)) return;
        try {
          await state.guarded(() => api('DELETE', `${base()}/boards/${board.id}`));
          nav.go('#/boards');
        } catch (err) {
          report(err);
        }
      } }, 'Delete board') : null,
    ].filter(Boolean));
  }

  frame.addEventListener('click', (e) => {
    if (e.target === frame || e.target === canvas) select(null);
  });
  drawTools();
  drawCards();
  shell.replaceChildren(tools, frame);
  // Fit what's on the board, once it has a size.
  queueMicrotask(() => {
    const r = frame.getBoundingClientRect();
    if (!items.length || !r.width) return;
    const x0 = Math.min(...items.map((x) => x.x));
    const y0 = Math.min(...items.map((x) => x.y));
    pz.fit({ x: x0, y: y0, w: Math.max(...items.map((x) => x.x + x.w)) - x0, h: Math.max(...items.map((x) => x.y + x.h)) - y0 });
  });
}

/** Draw `#/boards` or `#/boards/<id>` into `main`. */
export function drawBoards(main) {
  return state.boardId ? drawBoard(main, state.boardId) : drawList(main);
}
