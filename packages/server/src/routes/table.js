/**
 * At the table: dice rolls shared live (party, the DM, or only you) and handouts the DM gives players.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ROLL_MODES, d20Plus, parseRoll, rollDice } from '@dndapp/shared/dice.js';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';
import { MAX_HANDOUT_TEXT, canSeeHandout } from '../handouts.js';
import { MAX_PICTURE_BYTES } from '../images.js';
import { sheetInitiative } from './combat.js';

export function registerTable(app, r) {
  const { access, auth, db, handouts, maps, sheets, openLiveStream } = r;

  // ---------- dice ----------

  // Shared rolls go out live (GET /campaigns/:cid/live).
  const rollEvents = new EventEmitter();
  rollEvents.setMaxListeners(0);
  const ROLL_VISIBILITY = ['party', 'dm', 'self'];
  const ROLL_LOG = 50;

  /** Who sees a roll: party = everyone in the campaign; dm = the DM (and whoever rolled); self = only whoever rolled. */
  const canSeeRoll = (r, a) => r.user_id === a.userId || r.visibility === 'party' || (r.visibility === 'dm' && a.role === 'dm');

  const rollName = (cid, userId) =>
    db.prepare('SELECT COALESCE(m.character_name, u.name) AS name, m.role FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.campaign_id = ? WHERE u.id = ?').get(cid, userId) ?? {};

  const rollView = (cid, r) => {
    const who = rollName(cid, r.user_id);
    return { id: r.id, user_id: r.user_id, name: who.name ?? '?', from_dm: who.role === 'dm', visibility: r.visibility, label: r.label, result: typeof r.result === 'string' ? JSON.parse(r.result) : r.result, rolled_at: r.rolled_at };
  };

  /**
   * Your character's turn order in every fight waiting for it: the player
   * character tokens of yours, on maps you can see, that are in a fight and
   * haven't rolled initiative yet, get this total. Returns where it went.
   */
  function joinFights(cid, a, total, mod, by) {
    const joined = [];
    for (const map of maps.list(cid)) {
      if (!map.combat) continue;
      const view = maps.view(map, a);
      if (!view) continue;
      const waiting = (e) => e.init == null && view.tokens.some((t) => t.id === e.id && t.kind === 'pc' && t.user_id === a.userId);
      const ids = map.combat.entries.filter(waiting).map((e) => e.id);
      if (!ids.length) continue;
      maps.change(cid, map.id, (m) => {
        for (const e of m.combat?.entries ?? []) if (ids.includes(e.id)) Object.assign(e, { init: total, mod });
      }, { by, reason: 'initiative' });
      for (const id of ids) joined.push({ map_id: map.id, map: view.name, token_id: id, name: view.tokens.find((t) => t.id === id).name });
    }
    return joined;
  }

  /**
   * Roll dice: { notation: "1d20+5", mode: normal | advantage | disadvantage,
   * label?: "Stealth", visibility?: party | dm | self, initiative?: true }.
   * The server decides every roll (a secure random number); the page only
   * animates the dice landing on these numbers. The roll is kept in the
   * campaign's roll log and sent live to whoever may see it: the party
   * (default), only the DM (a secret roll, when the DM makes it), or only you.
   * An initiative roll (notation may be left out: d20 + the initiative on
   * your sheet) also goes into every fight on a map waiting for your
   * character to roll (`initiative: [{ map_id, map, token_id, name }]`).
   */
  app.post('/campaigns/:cid/roll', async (request) => {
    const a = access(request);
    const { notation, mode, label, visibility, initiative } = z
      .object({
        notation: z.string().max(100).optional(),
        mode: z.enum(ROLL_MODES).default('normal'),
        label: z.string().max(120).default(''),
        visibility: z.enum(ROLL_VISIBILITY).default('party'),
        initiative: z.boolean().default(false),
      })
      .parse(request.body);
    if (notation === undefined && !initiative) throw new BadRequestError('Type some dice, like 1d20+5 or 2d6.');
    let parsed;
    try {
      parsed = parseRoll(notation ?? d20Plus(sheetInitiative(sheets, a.cid, a.userId)));
    } catch (err) {
      throw new BadRequestError(err.message);
    }
    const result = rollDice(parsed, { mode, random: (sides) => crypto.randomInt(1, sides + 1) });
    const rolled_at = new Date().toISOString();
    const text = label.trim() || (initiative ? 'Initiative' : '');
    const id = Number(
      db.prepare('INSERT INTO rolls (campaign_id, user_id, visibility, label, result, rolled_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(a.cid, request.user.id, visibility, text, JSON.stringify(result), rolled_at).lastInsertRowid,
    );
    const roll = { id, campaign_id: a.cid, user_id: request.user.id, visibility, label: text, result, rolled_at };
    rollEvents.emit('roll', roll);
    // Only a plain d20 roll counts as initiative (the modifier is what's added to the die).
    const joined = initiative && result.natural != null && result.terms.length <= 2 ? joinFights(a.cid, a, result.total, result.total - result.natural, request.user.id) : undefined;
    return { ...result, roll: rollView(a.cid, roll), ...(joined && { initiative: joined }) };
  });

  /** The latest rolls you may see in this campaign (newest first). */
  app.get('/campaigns/:cid/rolls', async (request) => {
    const a = access(request);
    const recent = db
      .prepare(
        `SELECT * FROM rolls WHERE campaign_id = @cid AND (user_id = @uid OR visibility = 'party' OR (visibility = 'dm' AND @dm = 1))
         ORDER BY id DESC LIMIT ${ROLL_LOG}`,
      )
      .all({ cid: a.cid, uid: a.userId, dm: a.role === 'dm' ? 1 : 0 });
    return { rolls: recent.map((r) => rollView(a.cid, r)) };
  });

  // ---------- handouts (the DM gives pictures and text to everyone or chosen players) ----------

  const handoutTo = z.union([z.literal('everyone'), z.array(z.number().int()).max(100)]);

  /** Handout recipients must be people in the campaign. */
  function checkRecipients(cid, to) {
    if (to === 'everyone') return to;
    for (const id of to) if (!auth.membership(cid, id)) throw new BadRequestError(`User ${id} isn't in this campaign.`);
    return [...new Set(to)];
  }

  /** The handouts given to you (the DM: every handout), newest first. */
  app.get('/campaigns/:cid/handouts', async (request) => {
    const a = access(request);
    return { can_edit: a.role === 'dm', handouts: handouts.list(a.cid, a).map((h) => handouts.view(h, a)) };
  });

  /**
   * Give a handout (DM): { title, text?, to: "everyone" | [user ids],
   * picture?: { filename, data (base64) } }. It shows up live for them.
   */
  app.post('/campaigns/:cid/handouts', { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 }, async (request, reply) => {
    const a = access(request, { dm: true });
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        text: z.string().max(MAX_HANDOUT_TEXT).default(''),
        to: handoutTo,
        picture: z.object({ filename: z.string().max(200).default(''), data: z.string().min(1) }).optional(),
      })
      .parse(request.body);
    if (!body.text.trim() && !body.picture) throw new BadRequestError('A handout needs some text or a picture.');
    const h = await handouts.create(a.cid, { title: body.title, text: body.text.trim(), to: checkRecipients(a.cid, body.to), picture: body.picture && Buffer.from(body.picture.data, 'base64') }, { by: request.user.id });
    reply.status(201);
    return handouts.view(h, a);
  });

  /** Change a handout (DM): { title?, text?, to? }. Giving it to more players shows it to them live. */
  app.patch('/campaigns/:cid/handouts/:hid', async (request) => {
    const a = access(request, { dm: true });
    const body = z.object({ title: z.string().trim().min(1).max(200).optional(), text: z.string().max(MAX_HANDOUT_TEXT).optional(), to: handoutTo.optional() }).parse(request.body ?? {});
    if (body.to) body.to = checkRecipients(a.cid, body.to);
    if (body.text != null) body.text = body.text.trim();
    return handouts.view(handouts.update(a.cid, request.params.hid, body), a);
  });

  /** Take a handout back (DM): nobody sees it any more; the archive keeps it. */
  app.delete('/campaigns/:cid/handouts/:hid', async (request) => {
    const a = access(request, { dm: true });
    handouts.remove(a.cid, request.params.hid);
    return { removed: request.params.hid };
  });

  /** A handout's picture, for whoever may see the handout. */
  app.get('/campaigns/:cid/handouts/:hid/image', async (request, reply) => {
    const a = access(request);
    const h = handouts.get(a.cid, request.params.hid);
    if (!canSeeHandout(h, a)) throw new NotFoundError('No such handout');
    const { buf, type } = await handouts.image(a.cid, h);
    return reply.type(type).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(buf);
  });

  /**
   * Live news for the whole campaign (SSE): roll {roll} for rolls you may see;
   * handout {handout} when one is given to you or changed; handout-gone {id}
   * when one is taken back or no longer for you.
   */
  app.get('/campaigns/:cid/live', async (request, reply) => {
    const { cid } = access(request);
    const { sse, current } = openLiveStream(request, reply, { cid, userId: request.user.id });
    const onRoll = (r) => {
      if (r.campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      if (canSeeRoll(r, a)) sse.send('roll', rollView(cid, r));
    };
    const onHandout = ({ campaign_id, handout }) => {
      if (campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      if (canSeeHandout(handout, a)) sse.send('handout', handouts.view(handout, a));
      else sse.send('handout-gone', { id: handout.id });
    };
    rollEvents.on('roll', onRoll);
    handouts.events.on('update', onHandout);
    sse.onClose(() => {
      rollEvents.off('roll', onRoll);
      handouts.events.off('update', onHandout);
    });
  });
}
