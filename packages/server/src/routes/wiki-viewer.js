import { z } from 'zod';
import { BadRequestError } from '../store.js';

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
