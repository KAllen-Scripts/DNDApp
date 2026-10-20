/**
 * The world on the map (owner, 2026-10-18: "We want to be able to make an entire world. Connected maps,
 * a world map"): places on a map (a town on the region map, a tavern in the town), some opening a
 * smaller map; the breadcrumb from the top of the world down to the map on screen; the groups of places
 * a viewer can hide (Cities, Roads); and who the DM shows a map or a place to (everyone, or chosen players).
 *
 * The DM adds places with Place in Fog & walls (a click for a pin, a drag for an area). The server
 * decides what each player gets; the page only draws it.
 */
import { api, h, storage } from './api.js';
import { atlasOrder, mapTrail } from './shared/map.js';
import { base, report, state, status } from './map-state.js';
import { campaignPlayers, field, recordDialog } from './map-dm.js';
import { onMap, show, svgEl } from './map.js';

const $ = (sel) => document.querySelector(sel);
const HIDDEN_GROUPS_KEY = () => `dndapp.map.hiddenGroups.${state.campaignId}`;

/** The groups of places this viewer hid (kept in this browser). */
function hiddenGroups() {
  try {
    const list = JSON.parse(storage.get(HIDDEN_GROUPS_KEY()) ?? '[]');
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

/** The places on the map on screen that aren't in a hidden group. */
const shownPlaces = (map) => {
  const hidden = hiddenGroups();
  return (map.places ?? []).filter((p) => !p.group || !hidden.has(p.group));
};

/** The maps in world order for the map list: each map after the one it's a place on, indented. */
export function mapOptions(note = () => '') {
  return atlasOrder(state.maps).map(({ map, depth }) => new Option(`${'   '.repeat(depth)}${depth ? '↳ ' : ''}${map.name}${note(map)}`, map.id));
}

/** The DM's note on a map in the list: who sees it, when not everyone. */
export function shownNote(map) {
  if (!state.canEdit) return '';
  if (!map.shown) return ' (hidden)';
  if (map.shown_to) return ` (shown to ${map.shown_to.length})`;
  return '';
}

// ---------- drawing ----------

/** Places on the map: areas outlined, and a pin with the name for each. */
export function renderPlaces() {
  const map = state.current;
  const areas = $('#map-place-areas');
  const layer = $('#map-places');
  if (!map) {
    areas.replaceChildren();
    layer.replaceChildren();
    renderTrail();
    return;
  }
  areas.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  const places = shownPlaces(map);
  areas.replaceChildren(
    ...places.filter((p) => p.points).map((p) => svgEl('polygon', { points: p.points.map((q) => q.join(',')).join(' '), class: `place-area${p.to ? ' opens' : ''}${state.canEdit && !p.revealed ? ' unrevealed' : ''}`, 'data-place': p.id })),
  );
  if (state.placeDraw) {
    const { a, b } = state.placeDraw;
    areas.append(svgEl('rect', { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), class: 'place-area drawing' }));
  }
  layer.replaceChildren(
    ...places.map((p) => {
      const dragging = state.placeDrag?.id === p.id;
      const where = p.to ? (p.to_name ? `Opens ${p.to_name}` : 'Its map is gone') : '';
      const who = state.canEdit ? (!p.revealed ? 'hidden from players' : p.revealed_to ? `revealed to ${p.revealed_to.length}` : '') : '';
      const title = [p.name, where, who].filter(Boolean).join(' · ');
      const el = h('button', {
        type: 'button',
        class: `map-place${p.points ? ' area' : ''}${p.to ? ' opens' : ''}${state.canEdit && !p.revealed ? ' unrevealed' : ''}${dragging ? ' dragging' : ''}`,
        title,
        'aria-label': title,
        'data-place': p.id,
      }, h('span', { class: 'map-place-dot', 'aria-hidden': 'true' }), h('span', { class: 'map-place-label' }, p.name));
      el.style.cssText = `left:${dragging ? state.placeDrag.x : p.x}px;top:${dragging ? state.placeDrag.y : p.y}px`;
      el.addEventListener('pointerdown', (e) => placeDown(e, p));
      el.addEventListener('click', () => {
        if (!(state.canEdit && state.wallMode === 'place')) openPlace(p);
      });
      return el;
    }),
  );
  renderTrail();
  renderGroupsButton();
}

/** The breadcrumb: the maps around the one on screen, from the top of the world down (only when it's inside another). */
export function renderTrail() {
  const nav = $('#map-trail');
  const map = state.current;
  const trail = map ? mapTrail(state.maps, map.id) : [];
  nav.hidden = trail.length < 2;
  if (nav.hidden) return nav.replaceChildren();
  nav.replaceChildren(
    ...trail.flatMap((m, i) => [
      i ? h('span', { class: 'map-trail-sep', 'aria-hidden': 'true' }, '›') : null,
      i === trail.length - 1
        ? h('span', { class: 'map-trail-here', 'aria-current': 'page' }, m.name)
        : h('button', { type: 'button', class: 'link', onclick: () => show(m) }, m.name),
    ].filter(Boolean)),
  );
}

/** The Places button (shown when the map has groups of places): which groups to show. */
function renderGroupsButton() {
  const button = $('#map-place-groups');
  const groups = [...new Set((state.current?.places ?? []).map((p) => p.group).filter(Boolean))];
  button.hidden = !groups.length;
  const hidden = hiddenGroups();
  const off = groups.filter((g) => hidden.has(g)).length;
  button.textContent = off ? `Places (${groups.length - off}/${groups.length})` : 'Places';
}

/** Which groups of places to show on the maps (this browser only). */
export function groupsDialog() {
  const map = state.current;
  if (!map) return;
  const groups = [...new Set((map.places ?? []).map((p) => p.group).filter(Boolean))].sort();
  const hidden = hiddenGroups();
  const dialog = $('#map-dialog');
  const boxes = groups.map((g) => {
    const box = h('input', { type: 'checkbox', checked: !hidden.has(g) });
    box.checked = !hidden.has(g);
    box.addEventListener('change', () => {
      const now = hiddenGroups();
      if (box.checked) now.delete(g);
      else now.add(g);
      storage.set(HIDDEN_GROUPS_KEY(), JSON.stringify([...now]));
      renderPlaces();
    });
    return h('label', { class: 'map-check' }, box, ` ${g}`);
  });
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner' },
      h('h2', {}, 'Places to show'),
      h('p', { class: 'muted small' }, 'Groups of places on this map. Untick one to hide its places on your screen (only yours).'),
      ...boxes,
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'primary' }, 'Done')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

// ---------- using places ----------

/** A press on a place: with Place on, the DM drags it to move it (a click opens its settings). Clicks are openPlace's. */
function placeDown(e, place) {
  e.stopPropagation();
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (!(state.canEdit && state.wallMode === 'place')) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  state.placeDrag = { id: place.id, pointer: e.pointerId, x: place.x, y: place.y, sx: e.clientX, sy: e.clientY, moved: false };
  const el = e.currentTarget;
  const move = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    const d = state.placeDrag;
    if (!d) return;
    if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 4) return;
    d.moved = true;
    const k = state.view.k;
    const r = state.view.r ?? 0;
    const dx = ev.clientX - d.sx;
    const dy = ev.clientY - d.sy;
    d.x = place.x + (dx * Math.cos(r) + dy * Math.sin(r)) / k;
    d.y = place.y + (dy * Math.cos(r) - dx * Math.sin(r)) / k;
    el.style.left = `${d.x}px`;
    el.style.top = `${d.y}px`;
  };
  const up = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    const d = state.placeDrag;
    state.placeDrag = null;
    if (!d || ev.type === 'pointercancel') return renderPlaces();
    if (d.moved) return places({ move: { id: place.id, x: d.x, y: d.y } });
    placeDialog({ place });
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/** Open what a place leads to (or, for the DM, its settings when it leads nowhere). */
function openPlace(place) {
  if (state.canEdit && state.wallMode === 'erase') return places({ remove: place.id });
  const target = place.to && state.maps.find((m) => m.id === place.to);
  if (target) return show(target);
  if (state.canEdit) return placeDialog({ place });
  status(place.name);
}

export async function places(body) {
  try {
    const saved = await state.guarded(() => api('PATCH', `${base()}/${state.current.id}/places`, body));
    if (saved) onMap(saved);
    return saved;
  } catch (err) {
    report(err);
    return null;
  }
}

// ---------- the DM's settings for a place, and who sees what ----------

/**
 * Who sees a map or a place: nobody (hidden), every player, or the players ticked (the campaign's
 * players, fetched while the dialog opens). Returns the field and `read()`: { shown, to } (to: null
 * for everyone, else the ids ticked).
 */
export function whoField({ shown, to }, { hiddenLabel = 'Nobody (hidden from players)' } = {}) {
  const pick = h('select', { 'aria-label': 'Who can see it' }, new Option(hiddenLabel, 'none'), new Option('Every player', 'all'), new Option('Only the players ticked', 'some'));
  pick.value = !shown ? 'none' : to ? 'some' : 'all';
  const list = h('div', { class: 'map-who-list' }, h('span', { class: 'muted small' }, 'Finding the players…'));
  let boxes = [];
  const sync = () => (list.hidden = pick.value !== 'some');
  pick.addEventListener('change', sync);
  sync();
  campaignPlayers()
    .then((players) => {
      boxes = (players ?? []).map((p) => {
        const box = h('input', { type: 'checkbox', value: String(p.id) });
        box.checked = !!to?.includes(p.id);
        return box;
      });
      list.replaceChildren(...(boxes.length
        ? boxes.map((box, i) => h('label', { class: 'map-check' }, box, ` ${players[i].character_name || players[i].name}`))
        : [h('span', { class: 'muted small' }, 'No players in this campaign yet.')]));
    })
    .catch(report);
  const read = () => ({
    shown: pick.value !== 'none',
    // Before the list arrives, keep whoever it was shown to.
    to: pick.value !== 'some' ? null : boxes.length ? boxes.filter((b) => b.checked).map((b) => Number(b.value)) : to ?? [],
  });
  return { el: h('div', { class: 'map-who' }, pick, list), read };
}

/** Add a place (`at`: { x, y, points? }) or change one (`place`), DM. */
export function placeDialog({ at = null, place = null }) {
  const map = state.current;
  if (!map) return;
  const dialog = $('#map-dialog');
  const name = h('input', { value: place?.name ?? '', maxLength: 80, required: true, placeholder: 'Millbrook' });
  const groups = [...new Set(state.maps.flatMap((m) => (m.places ?? []).map((p) => p.group)).filter(Boolean))].sort();
  const group = h('input', { value: place?.group ?? '', maxLength: 40, placeholder: 'Towns', list: 'map-place-group-list' });
  const groupList = h('datalist', { id: 'map-place-group-list' }, ...groups.map((g) => new Option(g, g)));
  // The map it opens: any map not already a place somewhere else, and not one this map is inside.
  const around = new Set(mapTrail(state.maps, map.id).map((m) => m.id));
  const taken = new Map(state.maps.flatMap((m) => (m.places ?? []).filter((p) => p.to && p.id !== place?.id).map((p) => [p.to, m.name])));
  const opens = h('select', {}, new Option('Nothing (just a place)', ''),
    ...atlasOrder(state.maps).filter(({ map: m }) => !around.has(m.id)).map(({ map: m }) => {
      const o = new Option(`${m.name}${taken.has(m.id) ? ` (a place on ${taken.get(m.id)})` : ''}`, m.id);
      o.disabled = taken.has(m.id);
      return o;
    }));
  opens.value = place?.to ?? '';
  const who = whoField({ shown: !!place?.revealed, to: place?.revealed_to ?? null }, { hiddenLabel: 'Nobody yet (hidden)' });
  const record = place?.record
    ? h('p', { class: 'small' }, 'About it in the records: ', h('button', { type: 'button', class: 'link', onclick: () => recordDialog(place) }, place.record.title))
    : null;
  const save = async () => {
    const r = who.read();
    const body = { name: name.value.trim(), group: group.value.trim(), to: opens.value || null, revealed: r.shown, revealed_to: r.to };
    const saved = place ? await places({ set: { id: place.id, ...body } }) : await places({ add: { ...at, ...body } });
    if (saved) status(`${body.name}: ${!r.shown ? 'hidden from the players' : r.to ? `revealed to ${r.to.length} player${r.to.length === 1 ? '' : 's'}` : 'revealed to every player'}.`);
    return saved;
  };
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      save().then((saved) => saved && dialog.close());
    } },
      h('h2', {}, place ? place.name : at?.points ? 'New area' : 'New place'),
      h('p', { class: 'muted small' }, 'A town on a region map, a tavern in a town, a cave in the hills. If it has a map of its own, it opens it, and that map shows where it sits above its picture.'),
      field('Name', name),
      field('Group (for showing and hiding together)', group),
      groupList,
      field('Opens the map', opens),
      h('h3', {}, 'Who can see it'),
      who.el,
      h('p', { class: 'muted small' }, 'Players also need to be shown the map it opens to go in. Under fog, they see it only where they can see its spot.'),
      record,
      h('div', { class: 'map-dialog-actions' },
        place ? h('button', { type: 'button', class: 'ghost danger', onclick: () => places({ remove: place.id }).then((s) => s && dialog.close()) }, 'Remove') : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, place ? 'Save' : 'Add'),
      ),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
  if (!place) name.focus();
}

/** The DM pressed on the map with Place on: remember where (a click makes a pin, a drag an area). */
export function placeStart(e, at) {
  state.placeDraw = { pointer: e.pointerId, a: at, b: at, sx: e.clientX, sy: e.clientY };
}

/** The DM dragging out a new area. */
export function placeMove(at) {
  state.placeDraw.b = at;
  renderPlaces();
}

/** The DM let go: a click makes a pin there, a drag an area. */
export function placeEnd(e) {
  const d = state.placeDraw;
  state.placeDraw = null;
  renderPlaces();
  if (e.type !== 'pointerup') return;
  const click = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4;
  if (click) return placeDialog({ at: { x: d.a.x, y: d.a.y } });
  const x1 = Math.min(d.a.x, d.b.x);
  const y1 = Math.min(d.a.y, d.b.y);
  const x2 = Math.max(d.a.x, d.b.x);
  const y2 = Math.max(d.a.y, d.b.y);
  if (x2 - x1 < 1 || y2 - y1 < 1) return;
  placeDialog({ at: { x: (x1 + x2) / 2, y: (y1 + y2) / 2, points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] } });
}
