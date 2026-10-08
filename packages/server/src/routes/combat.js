/**
 * On a map in play: the fight (initiative and turns) and spell templates (areas of effect anyone can place).
 */
import crypto from 'node:crypto';
import { MAX_TEMPLATES, MAX_TOKENS, TEMPLATE_SHAPES, dexModifier, stepTurn } from '@dndapp/shared/map.js';
import { computeSheet } from '@dndapp/shared/sheet.js';
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { newTokenId } from '../maps/store.js';

export function registerCombat(app, r) {
  const { access, maps, sheets, viewableMap } = r;

  // ---------- initiative (a fight on a map) ----------

  /**
   * A token's initiative modifier: a player character's from their player's
   * sheet (their own number if they typed one), anyone else's Dexterity
   * modifier from their stat block (0 without one).
   */
  const initiativeMod = (cid, token) => {
    if (token.kind === 'pc' && token.user_id != null) {
      const { sheet, version } = sheets.get(cid, token.user_id);
      return version ? (Number(computeSheet(sheet).values.initiative) || 0) : 0;
    }
    return dexModifier(token.stats?.text) ?? 0;
  };
  const d20 = () => crypto.randomInt(1, 21);

  /**
   * The fight on a map: { action, ids?, id?, init? }.
   * DM: start (ids: who's in it, default every token; NPCs and enemies roll
   * straight away), end, next, prev, add (ids), remove (id), roll (id, or
   * every NPC and enemy not rolled yet), set (id, init: a number rolled at
   * the table). A player: roll or set their own token's initiative, and
   * next when it's their own turn (ending it).
   * Rolls are d20 + the token's initiative modifier, by the server.
   * Returns { map, rolls: [{ id, name, d20, mod, total }] }.
   */
  app.post('/campaigns/:cid/maps/:mid/combat', async (request) => {
    const a = access(request);
    const { map, view } = viewableMap(request);
    const body = z
      .object({
        action: z.enum(['start', 'end', 'next', 'prev', 'add', 'remove', 'roll', 'set']),
        ids: z.array(z.string().max(20)).max(MAX_TOKENS).optional(),
        id: z.string().max(20).optional(),
        init: z.number().int().min(-20).max(99).optional(),
      })
      .parse(request.body ?? {});
    const dm = a.role === 'dm';
    const combat = map.combat;
    const token = body.id !== undefined ? (dm ? map.tokens : view.tokens).find((t) => t.id === body.id) : null;
    if (body.id !== undefined && !token) throw new NotFoundError('No such token');
    if (body.action !== 'start' && !combat) throw new BadRequestError("There's no fight on this map. Start one first.");
    if (!dm) {
      const own = token && token.user_id === request.user.id;
      const ownTurn = body.action === 'next' && combat.turn != null && map.tokens.find((t) => t.id === combat.turn)?.user_id === request.user.id;
      if (!((body.action === 'roll' || body.action === 'set') && own) && !ownTurn) {
        throw new AuthError(body.action === 'next' ? "It isn't your turn." : 'Only the DM can do that', 403);
      }
    }
    if ((body.action === 'set' || body.action === 'remove') && !token) throw new BadRequestError('Which token?');
    if (body.action === 'set' && body.init === undefined) throw new BadRequestError('What did they roll?');
    if (token && ['roll', 'set', 'remove'].includes(body.action) && !combat.entries.some((e) => e.id === token.id)) {
      throw new BadRequestError(`${token.name} isn't in the fight.`);
    }
    if ((body.action === 'next' || body.action === 'prev') && !stepTurn(combat, 1)) throw new BadRequestError('Roll initiative first.');
    // Players roll once; the DM can roll again.
    if (!dm && body.action === 'roll' && combat.entries.find((e) => e.id === token.id)?.init != null) throw new BadRequestError('You already rolled initiative.');

    const rolls = [];
    const roll = (m, entry) => {
      const t = m.tokens.find((x) => x.id === entry.id);
      const mod = initiativeMod(a.cid, t);
      const die = d20();
      Object.assign(entry, { init: die + mod, mod });
      rolls.push({ id: t.id, name: t.name, d20: die, mod, total: die + mod });
    };
    const reasons = { start: 'fight started', end: 'fight ended', next: 'next turn', prev: 'previous turn' };
    const saved = maps.change(a.cid, map.id, (m) => {
      if (body.action === 'start') {
        const ids = new Set(body.ids ?? m.tokens.map((t) => t.id));
        m.combat = { round: 1, turn: null, entries: m.tokens.filter((t) => ids.has(t.id)).map((t) => ({ id: t.id, init: null, mod: null })) };
        for (const e of m.combat.entries) if (m.tokens.find((t) => t.id === e.id).kind !== 'pc') roll(m, e);
      } else if (body.action === 'end') {
        m.combat = null;
      } else if (body.action === 'next' || body.action === 'prev') {
        Object.assign(m.combat, stepTurn(m.combat, body.action === 'next' ? 1 : -1));
        // A new turn: its token hasn't moved yet.
        if (body.action === 'next') for (const e of m.combat.entries) if (e.id === m.combat.turn) e.moved = 0;
      } else if (body.action === 'add') {
        for (const id of body.ids ?? []) {
          if (m.tokens.some((t) => t.id === id) && !m.combat.entries.some((e) => e.id === id)) m.combat.entries.push({ id, init: null, mod: null });
        }
      } else if (body.action === 'remove') {
        if (m.combat.turn === token.id) Object.assign(m.combat, stepTurn(m.combat, 1));
        m.combat.entries = m.combat.entries.filter((e) => e.id !== token.id);
      } else if (body.action === 'roll') {
        const kindOf = (e) => m.tokens.find((t) => t.id === e.id)?.kind;
        const which = token ? m.combat.entries.filter((e) => e.id === token.id) : m.combat.entries.filter((e) => e.init == null && kindOf(e) !== 'pc');
        for (const e of which) roll(m, e);
      } else if (body.action === 'set') {
        Object.assign(m.combat.entries.find((e) => e.id === token.id), { init: body.init, mod: initiativeMod(a.cid, token) });
      }
    }, { by: request.user.id, reason: reasons[body.action] ?? 'initiative' });
    return { map: maps.view(saved, a), rolls };
  });

  // ---------- spell templates (areas of effect anyone can place) ----------

  const TEMPLATE = z.object({
    shape: z.enum(TEMPLATE_SHAPES),
    x: z.number(),
    y: z.number(),
    angle: z.number().min(-1e6).max(1e6),
    size: z.number().positive().max(10_000),
    width: z.number().positive().max(10_000).nullable(),
    label: z.string().trim().max(80),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #e8743b'),
  });

  /** A template this viewer may change: their own, or any (DM). */
  const ownTemplate = (request, a) => {
    const { map, view } = viewableMap(request);
    const tpl = view.templates.find((t) => t.id === request.params.tid);
    if (!tpl) throw new NotFoundError('No such template');
    if (a.role !== 'dm' && tpl.user_id !== request.user.id) throw new AuthError('Only whoever placed it (or the DM) can change that', 403);
    return { map, tpl };
  };

  /** Place an area of effect (anyone who can see the map): { shape, x, y, angle?, size, width?, label?, color? }. */
  app.post('/campaigns/:cid/maps/:mid/templates', async (request, reply) => {
    const a = access(request);
    const { map } = viewableMap(request);
    const body = TEMPLATE.partial().required({ shape: true, x: true, y: true, size: true }).parse(request.body ?? {});
    if (map.templates.length >= MAX_TEMPLATES) throw new BadRequestError(`A map can have at most ${MAX_TEMPLATES} templates. Remove some first.`);
    const id = newTokenId();
    const saved = maps.change(a.cid, map.id, (m) => {
      m.templates.push({ ...body, id, user_id: request.user.id });
    }, { by: request.user.id, reason: 'template' });
    reply.status(201);
    return { map: maps.view(saved, a), template: saved.templates.find((t) => t.id === id) };
  });

  /** Move, turn, resize or relabel a template (whoever placed it, or the DM). */
  app.patch('/campaigns/:cid/maps/:mid/templates/:tid', async (request) => {
    const a = access(request);
    const { map, tpl } = ownTemplate(request, a);
    const body = TEMPLATE.partial().parse(request.body ?? {});
    const saved = maps.change(a.cid, map.id, (m) => {
      Object.assign(m.templates.find((t) => t.id === tpl.id) ?? {}, body);
    }, { by: request.user.id, reason: 'template' });
    return { map: maps.view(saved, a), template: saved.templates.find((t) => t.id === tpl.id) };
  });

  /** Remove a template (whoever placed it, or the DM). */
  app.delete('/campaigns/:cid/maps/:mid/templates/:tid', async (request) => {
    const a = access(request);
    const { map, tpl } = ownTemplate(request, a);
    const saved = maps.change(a.cid, map.id, (m) => {
      m.templates = m.templates.filter((t) => t.id !== tpl.id);
    }, { by: request.user.id, reason: 'template removed' });
    return { map: maps.view(saved, a) };
  });
}
