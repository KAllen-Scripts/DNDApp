/**
 * Where everyone is in the world (owner, 2026-10-18: "We don't want one token for the whole party, because
 * they won't always all travel as one"): each character is on one map at a time; a token can follow another
 * and goes where it goes; a token goes into a place and back out; on world and region maps tokens are pins
 * of one size that fan out where they meet; a player's page goes where their character goes; and the DM's
 * party panel says where everyone is, with Bring here.
 *
 * The server moves the tokens; the page only shows them and sends what people do.
 */
import { api, h } from './api.js';
import { characterMap, isPinMap, nearLink, nearPlace, parentOf } from './shared/map.js';
import { base, report, state, status } from './map-state.js';
import { campaignPlayers } from './map-dm.js';
import { journeyText } from './map-travel.js';
import { noteOnMap, onMap, patchToken, select, show, toImage } from './map.js';

const $ = (sel) => document.querySelector(sel);
/** A pin's size on screen (px), and how far apart pins that meet fan out. */
export const PIN_PX = 40;

/**
 * Where to draw each token on a world or region map: pins that would overlap on screen at this zoom fan
 * out round where they stand. Returns Map(id → { dx, dy }) in screen pixels (empty on other maps).
 */
export function pinFan(map, k) {
  const out = new Map();
  if (!isPinMap(map)) return out;
  const reach = PIN_PX / k;
  const stacks = [];
  for (const t of map.tokens) {
    const stack = stacks.find((s) => Math.hypot(s.x - t.x, s.y - t.y) < reach);
    if (stack) stack.tokens.push(t);
    else stacks.push({ x: t.x, y: t.y, tokens: [t] });
  }
  for (const s of stacks) {
    const n = s.tokens.length;
    s.tokens.forEach((t, i) => {
      if (n === 1) return out.set(t.id, { dx: (s.x - t.x) * k, dy: (s.y - t.y) * k });
      // Round the spot, close enough to touch: a ring that grows with the stack.
      const r = Math.max(PIN_PX * 0.85, (PIN_PX * 1.15 * n) / (2 * Math.PI));
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      out.set(t.id, { dx: (s.x - t.x) * k + Math.cos(a) * r, dy: (s.y - t.y) * k + Math.sin(a) * r });
    });
  }
  return out;
}

/** The map this player's character is on, among the maps they have. */
export const myCharacterMap = () => (state.canEdit ? null : characterMap(state.maps, state.userId));

/**
 * Players: when their character turns up on another map (through a link, into a place, brought there by
 * the DM), their page goes with them. Once per move; they can look elsewhere meanwhile.
 */
export function followMyCharacter() {
  if (state.canEdit) return;
  const map = myCharacterMap();
  const id = map?.id ?? null;
  if (id === state.characterSeen) return;
  state.characterSeen = id;
  if (!map || state.current?.id === map.id) return;
  show(map);
  const me = map.tokens.find((t) => t.kind === 'pc' && t.user_id === state.userId);
  noteOnMap(`${me?.name ?? 'Your character'} is here now`);
}

/** The place a token is standing at that opens a map, if any. */
const placeAt = (map, token) => (map.places ?? []).find((p) => p.to && nearPlace(map, p, token.x, token.y));

/** The map around this one, and this map's place on it ({ map, place }), if this viewer has it. */
const around = (map) => parentOf(state.maps, map.id);

/**
 * The picked token's travel controls: who it follows, going into the place it stands at, and leaving
 * for the map around this one (the DM, or a player for their own).
 */
export function travelControls(token) {
  const map = state.current;
  const mine = state.canEdit || (token.user_id != null && token.user_id === state.userId);
  if (!map || !mine) return [];
  const parts = [];
  const others = map.tokens.filter((t) => t.id !== token.id && t.follows !== token.id);
  if (others.length || token.follows) {
    const follow = h('select', { class: 'map-follow', 'aria-label': 'Follow', title: 'Walk behind someone, and go where they go (through doors, into places). Moving it yourself stops it following.' },
      new Option('Follows nobody', ''),
      ...others.map((t) => new Option(`Follows ${t.name}`, t.id)));
    follow.value = token.follows ?? '';
    follow.addEventListener('change', () => patchToken(token, { follows: follow.value || null }));
    parts.push(follow);
  }
  const place = placeAt(map, token);
  if (place) parts.push(h('button', { class: 'primary map-enter', title: `Take ${token.name}${followers(map, token) ? ' and whoever follows' : ''} into ${place.name}`, onclick: () => travel(token, `places/${place.id}/enter`) }, `Go into ${place.name}`));
  const up = around(map);
  if (up && (state.canEdit || canLeave(map, token, up.map))) {
    parts.push(h('button', { class: 'ghost map-leave', title: `Take ${token.name}${followers(map, token) ? ' and whoever follows' : ''} out to ${up.map.name}`, onclick: () => travel(token, 'leave') }, `Out to ${up.map.name}`));
  }
  return parts;
}

const followers = (map, token) => map.tokens.filter((t) => t.follows === token.id).length;

/** Players leave where they can see a way out (a link to the map around), standing at it; anywhere if there's none. */
function canLeave(map, token, up) {
  const ways = (map.links ?? []).filter((l) => l.to === up.id);
  return !ways.length || ways.some((l) => nearLink(map, l, token.x, token.y));
}

/** Go into a place or out to the map around; the view goes along. */
async function travel(token, path) {
  try {
    const res = await state.guarded(() => api('POST', `${base()}/${state.current.id}/${path}`, { token: token.id }));
    if (!res) return;
    onMap(res.map);
    if (!state.canEdit) state.characterSeen = myCharacterMap()?.id ?? null;
    await show(state.maps.find((m) => m.id === res.map.id) ?? res.map);
    select(res.token);
    status(`${token.name} went to ${res.map.name}.`);
  } catch (err) {
    report(err);
  }
}

/** Where every player character is: [{ player, map, token }] (map null: on no map). */
export async function party() {
  const players = (await campaignPlayers()) ?? [];
  return players.map((p) => {
    const map = characterMap(state.maps, p.id);
    const token = map?.tokens.find((t) => t.kind === 'pc' && t.user_id === p.id) ?? null;
    return { player: p, map: map ?? null, token, also: state.maps.filter((m) => m !== map && m.tokens.some((t) => t.kind === 'pc' && t.user_id === p.id)) };
  });
}

/**
 * The DM's party panel: every character, the map they're on and who they follow, with Go there (look at
 * that map) and Bring here (their token, and whoever follows them, comes to the middle of the map on screen).
 */
export async function partyDialog() {
  const dialog = $('#map-dialog');
  const rows = h('div', { class: 'map-party' });
  const draw = async () => {
    const list = await party();
    const here = state.current;
    rows.replaceChildren(...(list.length ? list.map(({ player, map, token, also }) => {
      const name = token?.name || player.character_name || player.name;
      const lead = token?.follows && map.tokens.find((t) => t.id === token.follows);
      const where = map ? `${map.name}${token?.journey ? `, ${journeyText(token.journey).toLowerCase()}` : ''}${lead ? `, following ${lead.name}` : ''}${also.length ? ` (also on ${also.map((m) => m.name).join(', ')})` : ''}` : 'Not on a map';
      return h('div', { class: 'map-party-row', 'data-user': String(player.id) },
        h('strong', {}, name),
        h('span', { class: 'muted small' }, `${player.name} · ${where}`),
        h('span', { class: 'spacer' }),
        map && map.id !== here?.id ? h('button', { type: 'button', class: 'ghost', onclick: () => { dialog.close(); show(map); } }, 'Go there') : null,
        here && (map?.id !== here.id || also.length) ? h('button', { type: 'button', class: 'ghost', title: `Put ${name} (and whoever follows them) in the middle of this map`, onclick: () => bringHere(player, name).then(draw) }, 'Bring here') : null);
    }) : [h('p', { class: 'muted' }, 'No players in this campaign yet.')]));
  };
  dialog.replaceChildren(h('div', { class: 'map-dialog-inner' },
    h('h2', {}, 'Where everyone is'),
    h('p', { class: 'muted small' }, 'Each character is on one map at a time. Bring here moves them, and whoever follows them, to the map on screen.'),
    rows,
    h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Close'))));
  if (!dialog.open) dialog.showModal();
  await draw();
}

/** Bring a player's character to the middle of what's on screen (or put them there if they're on no map). */
async function bringHere(player, name) {
  const map = state.current;
  if (!map) return;
  try {
    const box = $('#map-view').getBoundingClientRect();
    const middle = box.width ? toImage(box.left + box.width / 2, box.top + box.height / 2) : { x: map.image.width / 2, y: map.image.height / 2 };
    const res = await state.guarded(() => api('POST', `${base()}/${map.id}/tokens`, { kind: 'pc', user_id: player.id, name, ...middle }));
    if (!res) return;
    // The map they left changed too: catch up.
    const { maps } = await api('GET', base());
    state.maps = maps;
    onMap(res.map);
    noteOnMap(`${name} is here now`);
  } catch (err) {
    report(err);
  }
}
