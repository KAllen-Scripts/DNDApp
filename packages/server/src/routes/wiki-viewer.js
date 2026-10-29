import { z } from 'zod';
import { BadRequestError } from '../store.js';
import { spoilers } from '../wiki/views.js';

/**
 * The viewer of a wiki view and the pages they may see (a hidden parent left out): the DM, or the DM `?as=<player
 * id>`, or a player (stage 6a: always as themselves, whatever `?as=` says).
 */
export function viewerPagesFor({ access, auth, wiki }) {
  return function viewerPages(request) {
    const a = access(request);
    const { cid } = a;
    const { as } = a.role === 'dm' ? z.object({ as: z.coerce.number().int().optional() }).parse(request.query ?? {}) : { as: a.userId };
    if (as == null) return { cid, as: null, pages: wiki.list(cid) };
    if (auth.membership(cid, as)?.role !== 'player') throw new BadRequestError("That isn't a player in this campaign.");
    return { cid, as, pages: wiki.listFor(cid, { userId: as, seesAll: false }) };
  };
}

/**
 * The spoiler check (stage 8b) for routes: what `text` names that each of `players` (user ids) can't see yet,
 * leaving out `except` (pages the change itself shows them). [{ player, name, names: [{ id, title }] }].
 */
export function spoilerCheckFor({ wiki, store }) {
  return function spoilerCheck(cid, text, players, except = []) {
    if (!players.length || !String(text ?? '').trim()) return [];
    const roster = store.roster(cid);
    const visible = new Map(players.map((uid) => [uid, new Set(wiki.listFor(cid, { userId: uid, seesAll: false }).map((p) => p.id))]));
    return spoilers(text, wiki.list(cid), visible, except).map((s) => {
      const m = roster.find((x) => x.user_id === s.player);
      return { ...s, name: m?.character_name || m?.name || `player ${s.player}` };
    });
  };
}

/** The players of a campaign an "available to" setting reaches ('all': every one). */
export const playersOf = (store, cid, available) => {
  const all = store.roster(cid).filter((m) => m.role === 'player').map((m) => m.user_id);
  return available === 'all' ? all : Array.isArray(available) ? available.map(Number).filter((id) => all.includes(id)) : [];
};
