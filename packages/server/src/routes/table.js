/**
 * At the table: dice rolls shared live (party, the DM, or only you), handouts the DM gives players, and the
 * live stream that carries them (and the rests the DM calls, routes/rests.js).
 */
import { ROLL_MODES } from '@dndapp/shared/dice.js';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';
import { MAX_HANDOUT_TEXT, canSeeHandout } from '../handouts.js';
import { MAX_PICTURE_BYTES } from '../images.js';
import { ROLL_VISIBILITY, canSeeRoll } from '../rolls.js';
import { canHearRest } from '../rests.js';

export function registerTable(app, r) {
  const { access, auth, db, handouts, merchants, openLiveStream, rolls, rests } = r;

  // ---------- dice ----------

  const ROLL_LOG = 50;

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
    return rolls.roll(a.cid, request.user.id, { notation, mode, label, visibility });
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
    return { rolls: recent.map((r) => rolls.view(a.cid, r)) };
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
   * when one is taken back or no longer for you; rest {rest} when the DM calls
   * a short or long rest that includes you (the DM hears every one); merchant
   * {id} when a merchant's stock, prices or shop changed (the page looks again
   * if it has that shop open; the shop itself checks who may see it).
   */
  app.get('/campaigns/:cid/live', async (request, reply) => {
    const { cid } = access(request);
    const { sse, current } = openLiveStream(request, reply, { cid, userId: request.user.id });
    const onRoll = (r) => {
      if (r.campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      if (canSeeRoll(r, a)) sse.send('roll', rolls.view(cid, r));
    };
    const onHandout = ({ campaign_id, handout }) => {
      if (campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      if (canSeeHandout(handout, a)) sse.send('handout', handouts.view(handout, a));
      else sse.send('handout-gone', { id: handout.id });
    };
    const onRest = (rest) => {
      if (rest.campaign_id !== cid) return;
      const a = current();
      if (!a) return sse.end();
      if (canHearRest(rest, a)) sse.send('rest', rests.view(rest, a));
    };
    const onMerchant = ({ campaign_id, merchant }) => {
      if (campaign_id !== cid) return;
      if (!current()) return sse.end();
      sse.send('merchant', { id: merchant.id });
    };
    rolls.events.on('roll', onRoll);
    handouts.events.on('update', onHandout);
    rests.events.on('rest', onRest);
    merchants.events.on('update', onMerchant);
    sse.onClose(() => {
      rolls.events.off('roll', onRoll);
      handouts.events.off('update', onHandout);
      merchants.events.off('update', onMerchant);
      rests.events.off('rest', onRest);
    });
  });
}
