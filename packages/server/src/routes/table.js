/**
 * At the table: dice rolls shared live (party, the DM, or only you) and handouts the DM gives players.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ROLL_MODES, parseRoll, rollDice } from '@dndapp/shared/dice.js';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';
import { MAX_HANDOUT_TEXT, canSeeHandout } from '../handouts.js';
import { MAX_PICTURE_BYTES } from '../images.js';

export function registerTable(app, r) {
  const { access, auth, db, handouts, openLiveStream } = r;

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
   * Roll dice: { notation: "1d20+5", mode: normal | advantage | disadvantage,
   * label?: "Stealth", visibility?: party | dm | self }. The server decides
   * every roll (a secure random number); the page only animates the dice
   * landing on these numbers. The roll is kept in the campaign's roll log and
   * sent live to whoever may see it: the party (default), only the DM (a
   * secret roll, when the DM makes it), or only you.
   */
  app.post('/campaigns/:cid/roll', async (request) => {
    const a = access(request);
    const { notation, mode, label, visibility } = z
      .object({
        notation: z.string().max(100),
        mode: z.enum(ROLL_MODES).default('normal'),
        label: z.string().max(120).default(''),
        visibility: z.enum(ROLL_VISIBILITY).default('party'),
      })
      .parse(request.body);
    let parsed;
    try {
      parsed = parseRoll(notation);
    } catch (err) {
      throw new BadRequestError(err.message);
    }
    const result = rollDice(parsed, { mode, random: (sides) => crypto.randomInt(1, sides + 1) });
    const rolled_at = new Date().toISOString();
    const id = Number(
      db.prepare('INSERT INTO rolls (campaign_id, user_id, visibility, label, result, rolled_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(a.cid, request.user.id, visibility, label.trim(), JSON.stringify(result), rolled_at).lastInsertRowid,
    );
    const roll = { id, campaign_id: a.cid, user_id: request.user.id, visibility, label: label.trim(), result, rolled_at };
    rollEvents.emit('roll', roll);
    return { ...result, roll: rollView(a.cid, roll) };
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
