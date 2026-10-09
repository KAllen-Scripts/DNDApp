/**
 * Rests and hit dice: players spend hit dice and take short rests on their own sheet; the DM calls short and
 * long rests for the party. The rules are in shared/sheet.js, the work in rests.js.
 */
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { HIT_DIE_SIZES } from '@dndapp/shared/sheet.js';
import { ROLL_VISIBILITY } from '../rolls.js';
import { REST_KINDS } from '../rests.js';

export function registerRests(app, r) {
  const { access, rests } = r;

  /** Players only: the DM has no sheet. */
  function player(request) {
    const a = access(request);
    if (a.membership?.role !== 'player') throw new AuthError('Only players have hit dice to spend', 403);
    return a;
  }

  /**
   * Spend one of your hit dice: { die: 8, visibility? }. The server rolls the
   * die plus your Constitution modifier (shared like any roll, so the page
   * shows the dice), adds the hit points (up to your maximum) and marks the
   * die spent. Returns the roll as POST /roll does, plus { healed, sheet,
   * version, updated_at }.
   */
  app.post('/campaigns/:cid/sheet/hit-dice', async (request) => {
    const { cid } = player(request);
    const { die, visibility } = z
      .object({ die: z.number().int().refine((d) => HIT_DIE_SIZES.includes(d), 'not a hit die size'), visibility: z.enum(ROLL_VISIBILITY).default('party') })
      .parse(request.body);
    return rests.spendHitDie(cid, request.user.id, die, { visibility });
  });

  /** Take a short rest on your own sheet (Pact Magic slots come back). Returns { sheet, version, updated_at }. */
  app.post('/campaigns/:cid/sheet/short-rest', async (request) => {
    const { cid } = player(request);
    return rests.shortRest(cid, request.user.id);
  });

  /** The rests the DM called (newest first) and which rules long rests follow (2014 or 2024). */
  app.get('/campaigns/:cid/rests', async (request) => {
    const a = access(request);
    return { edition: await rests.edition(), rests: rests.list(a.cid).map((rest) => rests.view(rest, a)) };
  });

  /**
   * Call a rest for the party (DM): { kind: short | long, to?: "everyone" | [player ids] }.
   * Every sheet in it is changed, and the players hear about it live.
   */
  app.post('/campaigns/:cid/rests', async (request, reply) => {
    const a = access(request, { dm: true });
    const { kind, to } = z
      .object({ kind: z.enum(REST_KINDS), to: z.union([z.literal('everyone'), z.array(z.number().int()).min(1).max(100)]).default('everyone') })
      .parse(request.body);
    reply.status(201);
    return rests.view(await rests.call(a.cid, { kind, to, by: request.user.id }), a);
  });
}
