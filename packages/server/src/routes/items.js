/**
 * The DM's items: weapons, armour, potions, gear and magic items kept once and stocked by merchants.
 * Made by hand, looked up (the DM's own, then the books, then the AI), or found online by the AI.
 */
import { z } from 'zod';
import { NotFoundError } from '../store.js';
import { ITEM_KINDS, RARITIES, MAX_ITEM_TEXT, MAX_ITEM_NOTES } from '../items.js';
import { MAX_PICTURE_BYTES } from '../images.js';

export function registerItems(app, r) {
  const { access, itemFinder, items, mapAiAllowed, tokenArt } = r;

  const ITEM = z.object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(ITEM_KINDS),
    rarity: z.enum(RARITIES),
    attunement: z.boolean(),
    price: z.number().int().min(0).max(1e9).nullable(),
    weight: z.number().min(0).max(100_000).nullable(),
    text: z.string().max(MAX_ITEM_TEXT),
    notes: z.string().max(MAX_ITEM_NOTES),
  });
  const PICTURE_UPLOAD = z.object({ filename: z.string().max(200).default(''), data: z.string().min(1) });
  const pictureBody = { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 };
  // A description the DM typed is the DM's own.
  const own = (body) => {
    if (body.text !== undefined) body.source = body.text.trim() ? { kind: 'dm', from: '' } : null;
  };

  /** The DM's items, by name. Players never get the list (they see items at merchants). */
  app.get('/campaigns/:cid/items', async (request) => {
    const a = access(request, { dm: true });
    return { items: items.list(a.cid).map(items.view) };
  });

  /**
   * Save an item (DM): { name, kind?, rarity?, attunement?, price? (copper),
   * weight?, text?, notes?, picture?: { filename, data (base64) } }.
   */
  app.post('/campaigns/:cid/items', pictureBody, async (request, reply) => {
    const a = access(request, { dm: true });
    const { picture, ...rest } = z.object({ picture: PICTURE_UPLOAD.optional() }).passthrough().parse(request.body ?? {});
    const fields = ITEM.partial().required({ name: true }).parse(rest);
    own(fields);
    let x = items.create(a.cid, fields, { by: request.user.id });
    if (picture) x = items.update(a.cid, x.id, { art: await items.savePicture(a.cid, x.id, Buffer.from(picture.data, 'base64')) });
    reply.status(201);
    return items.view(x);
  });

  /** Change an item (DM). Merchants that stock it show the change. */
  app.patch('/campaigns/:cid/items/:iid', async (request) => {
    const a = access(request, { dm: true });
    items.get(a.cid, request.params.iid);
    const body = ITEM.partial().parse(request.body ?? {});
    own(body);
    return items.view(items.update(a.cid, request.params.iid, body));
  });

  /** Take an item out of the list (DM). Merchants that stock it keep selling it; the archive keeps it. */
  app.delete('/campaigns/:cid/items/:iid', async (request) => {
    const a = access(request, { dm: true });
    items.remove(a.cid, request.params.iid);
    return { ok: true };
  });

  /** Give an item a picture (DM): { filename, data (base64) }. Kept as uploaded. */
  app.put('/campaigns/:cid/items/:iid/picture', pictureBody, async (request) => {
    const a = access(request, { dm: true });
    const x = items.get(a.cid, request.params.iid);
    const body = PICTURE_UPLOAD.parse(request.body ?? {});
    return items.view(items.update(a.cid, x.id, { art: await items.savePicture(a.cid, x.id, Buffer.from(body.data, 'base64')) }));
  });

  /** No picture (DM). The archive keeps the file. */
  app.delete('/campaigns/:cid/items/:iid/picture', async (request) => {
    const a = access(request, { dm: true });
    return items.view(items.update(a.cid, request.params.iid, { art: null }));
  });

  /** An item's picture, cut to a square (DM). ?v= is its key. Players get it through a merchant. */
  app.get('/campaigns/:cid/items/:iid/picture', async (request, reply) => {
    const a = access(request, { dm: true });
    const x = items.get(a.cid, request.params.iid, { removed: true });
    if (!x.art) throw new NotFoundError('No picture');
    return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(await tokenArt.square(items.picturePath(a.cid, x)));
  });

  /**
   * Look an item up (DM): { name }. Your own items first, then the books,
   * then the AI's knowledge; saved as a new item. 404 if no one knows it.
   */
  app.post('/campaigns/:cid/items/lookup', async (request, reply) => {
    const a = access(request, { dm: true });
    const { name } = z.object({ name: z.string().trim().min(2).max(100) }).parse(request.body ?? {});
    const already = items.named(a.cid, name);
    if (already) return { item: items.view(already), from: 'yours' };
    mapAiAllowed(request.user.id);
    const found = await itemFinder.lookup(name, { campaignId: a.cid, userId: request.user.id });
    if (!found) throw new NotFoundError(`Neither the books nor the AI know an item called "${name}". Try its proper name, like "Potion of Healing", use Find online, or make it yourself.`);
    reply.status(201);
    return { item: items.view(items.create(a.cid, { ...found.fields, name: found.fields.name || name }, { by: request.user.id })), from: found.from };
  });

  /**
   * Fill in an item that's already saved (DM): { name? } (default: its name).
   * Replaces its description, kind, rarity and weight, and its price unless
   * the DM set one. 404 if no one knows it.
   */
  app.post('/campaigns/:cid/items/:iid/fill', async (request) => {
    const a = access(request, { dm: true });
    const x = items.get(a.cid, request.params.iid);
    const { name } = z.object({ name: z.string().trim().min(1).max(100).optional() }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const found = await itemFinder.lookup(name ?? x.name, { campaignId: a.cid, userId: request.user.id, exclude: x.id });
    if (!found) throw new NotFoundError(`Neither the books nor the AI know an item called "${name ?? x.name}". Try its proper name, or use Find online.`);
    const { name: _n, price, ...fields } = found.fields;
    if (x.price == null) fields.price = price;
    return { item: items.view(items.update(a.cid, x.id, fields)), from: found.from };
  });

  /**
   * Have the AI find an item online (DM): { query }. Official or not, with a
   * picture. Runs in the background: the item is listed at once with
   * finding.status 'pending', then filled in (or 'failed', with an error). 202.
   */
  app.post('/campaigns/:cid/items/find', async (request, reply) => {
    const a = access(request, { dm: true });
    const { query } = z.object({ query: z.string().trim().min(2).max(200) }).parse(request.body ?? {});
    mapAiAllowed(request.user.id);
    const x = items.create(a.cid, { name: query.slice(0, 80), finding: { query, status: 'pending' } }, { by: request.user.id });
    const fail = (error) => {
      try {
        items.update(a.cid, x.id, { finding: { query, status: 'failed', error } });
      } catch { /* removed meanwhile */ }
    };
    (async () => {
      try {
        const found = await itemFinder.find(query, { campaignId: a.cid, userId: request.user.id });
        if (!found) return fail(`The AI couldn't find "${query}" anywhere. Try another name, or add where it's from.`);
        items.get(a.cid, x.id); // still wanted?
        const art = found.picture ? await items.savePicture(a.cid, x.id, found.picture) : null;
        items.update(a.cid, x.id, { ...found.fields, art, finding: null });
      } catch (err) {
        if (err instanceof NotFoundError) return;
        request.log.error(err);
        fail(`The search went wrong: ${err.message}`);
      }
    })();
    reply.status(202);
    return items.view(x);
  });
}
