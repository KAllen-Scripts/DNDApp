/**
 * Companions kept on a player's character sheet (shared/companions.js):
 * putting one on the map, taking it off, and where each one is. The sheet
 * holds the companion (its stat block and hit points); its token is tied to
 * the entry (`companion` on the token), so it follows the character between
 * maps and its hit points stay the sheet's (maps/store.js).
 */
import { z } from 'zod';
import { companionTokenStats, tokenSize } from '@dndapp/shared/companions.js';
import { MAX_TOKENS, TOKEN_SIZES, characterMap, snapToken, stepTurn, tokenPx } from '@dndapp/shared/map.js';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { newTokenId } from '../maps/store.js';

/** "darkvision 60 ft., passive Perception 12" → 60. */
const darkvisionOf = (senses) => Number(/darkvision\s+(\d+)/i.exec(senses ?? '')?.[1] ?? 0);

/**
 * Put a sheet companion on a map as a token tied to it: next to the
 * character's token there (following it), else in the middle of a map with
 * no fog. It's on one map at a time: a token of it anywhere else goes.
 * Returns { map, token } (the map as saved), or throws when it can't go there.
 */
export function placeCompanion({ maps }, cid, userId, companion, map, { by, at = null } = {}) {
  if (map.tokens.length >= MAX_TOKENS) throw new BadRequestError(`${map.name} is full.`);
  const own = map.tokens.find((t) => t.kind === 'pc' && t.user_id === userId);
  const here = map.tokens.find((t) => t.kind === 'companion' && t.user_id === userId && t.companion === companion.id);
  let spot = at;
  if (!spot && here) spot = { x: here.x, y: here.y };
  if (!spot && own) spot = { x: own.x + tokenPx(map, own), y: own.y };
  if (!spot && !map.fog.enabled) spot = { x: map.image.width / 2, y: map.image.height / 2 };
  if (!spot) throw new BadRequestError('Ask the DM to put your character on this map first: your companion appears next to them.');
  removeCompanionTokens({ maps }, cid, userId, companion.id, { by, except: map.id });
  const id = here?.id ?? newTokenId();
  const size = tokenSize(companion.form.size);
  const saved = maps.change(cid, map.id, (m) => {
    m.tokens = m.tokens.filter((t) => t.id !== id);
    const token = {
      kind: 'companion', user_id: userId, companion: companion.id, id, hidden: false, name: companion.name,
      size: TOKEN_SIZES.includes(size) ? size : 1, hp: { current: companion.hp.current, max: companion.hp.max },
      stats: companionTokenStats(companion), darkvision: darkvisionOf(companion.form.senses), follows: own && !at ? own.id : here?.follows ?? null,
    };
    Object.assign(token, snapToken(m, token, spot.x, spot.y));
    m.tokens.push(token);
  }, { by, reason: here ? 'companion changed' : 'companion added' });
  return { map: saved, token: saved.tokens.find((t) => t.id === id) };
}

/** Take a sheet companion's tokens off every map (but `except`). */
export function removeCompanionTokens({ maps }, cid, userId, companionId, { by, except = null } = {}) {
  const mine = (t) => t.kind === 'companion' && t.user_id === userId && t.companion === companionId;
  for (const m of maps.list(cid)) {
    if (m.id === except || !m.tokens.some(mine)) continue;
    maps.change(cid, m.id, (doc) => {
      const gone = new Set(doc.tokens.filter(mine).map((t) => t.id));
      if (doc.combat?.turn && gone.has(doc.combat.turn)) Object.assign(doc.combat, stepTurn(doc.combat, 1));
      doc.tokens = doc.tokens.filter((t) => !gone.has(t.id));
    }, { by, reason: 'companion off the map' });
  }
}

/** The map a player's character is on, else null. */
export const mapOfCharacter = (maps, cid, userId) => characterMap(maps.list(cid), userId);

export function registerCompanions(app, r) {
  const { access, maps, sheets } = r;

  function player(request) {
    const a = access(request);
    if (a.membership?.role !== 'player') throw new AuthError('Only players have companions on a sheet', 403);
    return a;
  }

  function companionOf(cid, userId, id) {
    const { sheet, version } = sheets.get(cid, userId);
    const c = version ? sheet.companions.find((x) => x.id === id) : null;
    if (!c) throw new NotFoundError('That companion isn\'t on your sheet (save the sheet first if you just added it).');
    return c;
  }

  /**
   * Where your sheet's companions are: { where: { [companion id]: { map_id, map_name, token_id } } }.
   * Only maps you're shown.
   */
  app.get('/campaigns/:cid/sheet/companions/where', async (request) => {
    const a = player(request);
    const where = {};
    for (const m of maps.list(a.cid)) {
      if (!maps.view(m, { role: 'player', userId: a.userId })) continue;
      for (const t of m.tokens) if (t.kind === 'companion' && t.user_id === a.userId && t.companion) where[t.companion] = { map_id: m.id, map_name: m.name, token_id: t.id };
    }
    return { where };
  });

  /**
   * Put one of your sheet's companions on the map: { map_id? } (default: the
   * map your character is on). It appears next to your character and follows
   * them. Returns { map (as you see it), token }.
   */
  app.post('/campaigns/:cid/sheet/companions/:id/map', async (request) => {
    const a = player(request);
    const { map_id } = z.object({ map_id: z.string().max(40).optional() }).parse(request.body ?? {});
    const c = companionOf(a.cid, a.userId, request.params.id);
    let map = map_id ? maps.list(a.cid).find((m) => m.id === map_id) : mapOfCharacter(maps, a.cid, a.userId);
    if (map && !maps.view(map, { role: 'player', userId: a.userId })) map = null;
    if (!map) throw new BadRequestError(map_id ? 'No such map.' : "Your character isn't on a map yet. Ask the DM to put them on one, or open the map first.");
    const res = placeCompanion(r, a.cid, a.userId, c, map, { by: a.userId });
    const view = maps.view(res.map, { role: 'player', userId: a.userId });
    return { map: view, token: view.tokens.find((t) => t.id === res.token.id) ?? null };
  });

  /** Take one of your sheet's companions off the map (it stays on your sheet). */
  app.delete('/campaigns/:cid/sheet/companions/:id/map', async (request) => {
    const a = player(request);
    removeCompanionTokens(r, a.cid, a.userId, request.params.id, { by: a.userId });
    return { ok: true };
  });
}
