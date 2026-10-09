/**
 * Merchants: shops the DM sets up with items, prices and stock, puts on maps as tokens, and restocks
 * (by hand, or every so many long rests). Players open a merchant's token on the map and buy on their own:
 * the coins come off their sheet and the item goes into its inventory (gear.js), ready to equip.
 */
import fs from 'node:fs';
import { MAX_TOKENS, snapToken } from '@dndapp/shared/map.js';
import { payCoins, totalCp, formatPrice } from '@dndapp/shared/coins.js';
import { addToInventory } from '@dndapp/shared/gear.js';
import { classKey } from '@dndapp/shared/sheet.js';
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { MAX_MERCHANT_NOTES, MAX_SALES, MAX_STOCK, newStockId, restocked } from '../merchants.js';
import { itemForPlayers } from '../items.js';
import { MAX_PICTURE_BYTES } from '../images.js';
import { newTokenId } from '../maps/store.js';

export function registerMerchants(app, r) {
  const { access, archive, db, items, maps, merchants, sheets, tokenArt, viewableMap } = r;

  const MERCHANT = z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(2000),
    notes: z.string().max(MAX_MERCHANT_NOTES),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #c9a227'),
    open: z.boolean(),
    restock_every: z.number().int().min(1).max(1000).nullable(),
  });
  const LINE = z.object({
    price: z.number().int().min(0).max(1e9),
    qty: z.number().int().min(0).max(1_000_000).nullable(),
    full: z.number().int().min(0).max(1_000_000).nullable(),
  });
  const PICTURE_UPLOAD = z.object({ filename: z.string().max(200).default(''), data: z.string().min(1) });
  const pictureBody = { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) + 64 * 1024 };
  const key = (art) => (art ? art.file.replace(/\.[^.]*$/, '') : null);

  /** Where a merchant's tokens are: [{ map, token }] on maps this viewer can see ({ role: 'dm' }: all). */
  function tokensOf(cid, id, viewer) {
    const out = [];
    for (const map of maps.list(cid)) {
      if (!map.tokens.some((t) => t.merchant === id)) continue;
      const view = maps.view(map, viewer);
      for (const t of view?.tokens ?? []) if (t.merchant === id) out.push({ map: view, token: t });
    }
    return out;
  }

  /** A merchant this viewer may open: the DM, or a player who can see one of its tokens. 404 otherwise. */
  function shopFor(request) {
    const a = access(request);
    const m = merchants.get(a.cid, request.params.mid);
    if (a.role !== 'dm' && !tokensOf(a.cid, m.id, a).length) throw new NotFoundError('No such merchant');
    return { ...a, merchant: m };
  }

  /** What the DM's page gets: everything, with each line's item and where its tokens are. */
  function dmView(cid, m) {
    const known = items.many(cid, m.stock.map((l) => l.item));
    const { art, created_by: _by, removed: _removed, ...rest } = m;
    return {
      ...rest,
      picture: key(art),
      stock: m.stock.map((l) => ({ ...l, item: known.has(l.item) ? items.view(known.get(l.item)) : null })).filter((l) => l.item),
      on_maps: tokensOf(cid, m.id, { role: 'dm' }).map(({ map, token }) => ({ map_id: map.id, map_name: map.name, token_id: token.id })),
    };
  }

  /** What a player sees in the shop: no notes, no sales, and what they have to spend. */
  function shopView(cid, m, a) {
    if (a.role === 'dm') return { ...dmView(cid, m), can_edit: true };
    const known = items.many(cid, m.stock.map((l) => l.item));
    const { sheet } = sheets.get(cid, a.userId);
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      picture: key(m.art),
      open: m.open,
      stock: m.stock.filter((l) => known.has(l.item)).map((l) => ({ id: l.id, price: l.price, qty: l.qty, item: itemForPlayers(known.get(l.item)) })),
      purse: sheet.coins,
      can_edit: false,
    };
  }

  const change = (cid, id, fn) => {
    const m = merchants.get(cid, id);
    return merchants.write(cid, { ...fn(structuredClone(m)), id: m.id, created_at: m.created_at, updated_at: new Date().toISOString() });
  };
  const lineOf = (m, lid) => {
    const l = m.stock.find((x) => x.id === lid);
    if (!l) throw new NotFoundError('That item is no longer sold here.');
    return l;
  };
  const toFields = ({ restock_every, ...rest }, m) => ({ ...rest, ...(restock_every !== undefined && { restock: { ...(m?.restock ?? {}), every: restock_every } }) });

  /** The DM's merchants, by name, with their stock and where they are on maps. */
  app.get('/campaigns/:cid/merchants', async (request) => {
    const a = access(request, { dm: true });
    return { merchants: merchants.list(a.cid).map((m) => dmView(a.cid, m)) };
  });

  /** Set up a merchant (DM): { name, description?, notes?, color?, open?, restock_every?, picture? }. */
  app.post('/campaigns/:cid/merchants', pictureBody, async (request, reply) => {
    const a = access(request, { dm: true });
    const { picture, ...rest } = z.object({ picture: PICTURE_UPLOAD.optional() }).passthrough().parse(request.body ?? {});
    const fields = MERCHANT.partial().required({ name: true }).parse(rest);
    let m = merchants.create(a.cid, toFields(fields), { by: request.user.id });
    if (picture) m = merchants.update(a.cid, m.id, { art: await merchants.savePicture(a.cid, m.id, Buffer.from(picture.data, 'base64')) });
    reply.status(201);
    return dmView(a.cid, m);
  });

  /** Change a merchant (DM): any of the fields above. Its tokens keep their name and picture. */
  app.patch('/campaigns/:cid/merchants/:mid', async (request) => {
    const a = access(request, { dm: true });
    const m = merchants.get(a.cid, request.params.mid);
    const body = MERCHANT.partial().parse(request.body ?? {});
    return dmView(a.cid, merchants.update(a.cid, m.id, toFields(body, m)));
  });

  /** Close a merchant down (DM). Its tokens stay on the maps as plain NPCs; the archive keeps it. */
  app.delete('/campaigns/:cid/merchants/:mid', async (request) => {
    const a = access(request, { dm: true });
    merchants.remove(a.cid, request.params.mid);
    return { ok: true };
  });

  app.put('/campaigns/:cid/merchants/:mid/picture', pictureBody, async (request) => {
    const a = access(request, { dm: true });
    const m = merchants.get(a.cid, request.params.mid);
    const body = PICTURE_UPLOAD.parse(request.body ?? {});
    return dmView(a.cid, merchants.update(a.cid, m.id, { art: await merchants.savePicture(a.cid, m.id, Buffer.from(body.data, 'base64')) }));
  });

  app.delete('/campaigns/:cid/merchants/:mid/picture', async (request) => {
    const a = access(request, { dm: true });
    return dmView(a.cid, merchants.update(a.cid, request.params.mid, { art: null }));
  });

  /** A merchant's picture, square (the DM, or a player who can see it). ?v= is its key. */
  app.get('/campaigns/:cid/merchants/:mid/picture', async (request, reply) => {
    const { cid, merchant: m } = shopFor(request);
    if (!m.art) throw new NotFoundError('No picture');
    return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(await tokenArt.square(merchants.picturePath(cid, m)));
  });

  /** The picture of an item the merchant sells (the DM, or a player who can see the merchant). */
  app.get('/campaigns/:cid/merchants/:mid/items/:iid/picture', async (request, reply) => {
    const { cid, merchant: m } = shopFor(request);
    if (!m.stock.some((l) => l.item === request.params.iid)) throw new NotFoundError('No such item');
    const x = items.get(cid, request.params.iid, { removed: true });
    if (!x.art) throw new NotFoundError('No picture');
    return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(await tokenArt.square(items.picturePath(cid, x)));
  });

  /**
   * Stock an item (DM): { item (id), price? (copper; default the item's usual
   * price), qty? (null: no limit; default 1), full? (restock to; default qty) }.
   */
  app.post('/campaigns/:cid/merchants/:mid/stock', async (request, reply) => {
    const a = access(request, { dm: true });
    const body = LINE.partial().extend({ item: z.string() }).parse(request.body ?? {});
    const x = items.get(a.cid, body.item);
    if (x.finding) throw new BadRequestError(x.finding.status === 'pending' ? 'The AI is still looking for that one.' : "The AI didn't find that one.");
    const m = merchants.get(a.cid, request.params.mid);
    if (m.stock.length >= MAX_STOCK) throw new BadRequestError(`A merchant can sell at most ${MAX_STOCK} different items.`);
    const qty = body.qty === undefined ? 1 : body.qty;
    const line = { id: newStockId(), item: x.id, price: body.price ?? x.price ?? 0, qty, full: body.full === undefined ? qty : body.full };
    const saved = change(a.cid, m.id, (next) => ({ ...next, stock: [...next.stock, line] }));
    reply.status(201);
    return dmView(a.cid, saved);
  });

  /** Change a line of stock (DM): { price?, qty?, full? }. */
  app.patch('/campaigns/:cid/merchants/:mid/stock/:lid', async (request) => {
    const a = access(request, { dm: true });
    const body = LINE.partial().parse(request.body ?? {});
    lineOf(merchants.get(a.cid, request.params.mid), request.params.lid);
    return dmView(a.cid, change(a.cid, request.params.mid, (m) => ({ ...m, stock: m.stock.map((l) => (l.id === request.params.lid ? { ...l, ...body } : l)) })));
  });

  /** Stop selling an item (DM). */
  app.delete('/campaigns/:cid/merchants/:mid/stock/:lid', async (request) => {
    const a = access(request, { dm: true });
    lineOf(merchants.get(a.cid, request.params.mid), request.params.lid);
    return dmView(a.cid, change(a.cid, request.params.mid, (m) => ({ ...m, stock: m.stock.filter((l) => l.id !== request.params.lid) })));
  });

  /** Restock now (DM): every line back up to its restock level, and the count of long rests starts again. */
  app.post('/campaigns/:cid/merchants/:mid/restock', async (request) => {
    const a = access(request, { dm: true });
    return dmView(a.cid, change(a.cid, request.params.mid, (m) => restocked(m, new Date().toISOString())));
  });

  /**
   * Put a merchant on a map (DM): { x?, y?, hidden? }. The token is an NPC
   * with the merchant's name, colour and picture; players open its shop from it.
   */
  app.post('/campaigns/:cid/maps/:mid/merchants/:mrid', async (request, reply) => {
    const a = access(request, { dm: true });
    const { map } = viewableMap(request);
    const m = merchants.get(a.cid, request.params.mrid);
    const body = z.object({ x: z.number().optional(), y: z.number().optional(), hidden: z.boolean().default(false) }).parse(request.body ?? {});
    if (map.tokens.length >= MAX_TOKENS) throw new BadRequestError(`A map can have at most ${MAX_TOKENS} tokens.`);
    // The picture goes with the map's own token pictures, so the map stays whole on its own.
    if (m.art) {
      const dest = archive.tokenImagePath(a.campaign.slug, map.id, m.art.file);
      if (!fs.existsSync(dest)) archive.saveTokenImage(a.campaign.slug, map.id, m.art.file, fs.readFileSync(merchants.picturePath(a.cid, m)));
    }
    const id = newTokenId();
    const saved = maps.change(a.cid, map.id, (next) => {
      const token = {
        id, kind: 'npc', name: m.name, user_id: null, color: m.color, size: 1, hp: null, conditions: [], hidden: body.hidden,
        record: null, stats: null, light: null, darkvision: 0, speed: null, art: m.art ? { ...m.art } : null, merchant: m.id,
      };
      Object.assign(token, snapToken(next, token, body.x ?? next.image.width / 2, body.y ?? next.image.height / 2));
      next.tokens.push(token);
    }, { by: request.user.id, reason: 'token added' });
    reply.status(201);
    const view = maps.view(saved, a);
    return { map: view, token: view.tokens.find((t) => t.id === id) };
  });

  /** A merchant's shop: what it sells, at what price, how many are left, and (players) the coins on your sheet. */
  app.get('/campaigns/:cid/merchants/:mid/shop', async (request) => {
    const a = shopFor(request);
    return shopView(a.cid, a.merchant, a);
  });

  /**
   * Buy (players): { line (a stock line's id), qty? (default 1) }. The price
   * comes off the coins on your sheet (big coins first, with change) and the
   * item goes into its inventory; the merchant's stock goes down. Returns
   * { shop, sheet_version, bought: { name, qty, paid } }.
   */
  app.post('/campaigns/:cid/merchants/:mid/buy', async (request) => {
    const a = shopFor(request);
    if (a.role === 'dm') throw new AuthError("The DM doesn't buy: players buy for their characters.", 403);
    const { line: lid, qty } = z.object({ line: z.string(), qty: z.number().int().min(1).max(100).default(1) }).parse(request.body ?? {});
    const m = a.merchant;
    if (!m.open) throw new BadRequestError(`${m.name} isn't selling right now.`);
    const line = lineOf(m, lid);
    const x = items.get(a.cid, line.item, { removed: true });
    if (line.qty != null && line.qty < qty) throw new BadRequestError(line.qty ? `${m.name} only has ${line.qty} left.` : `${m.name} has sold out of ${x.name}.`);
    const cost = line.price * qty;
    const current = sheets.get(a.cid, a.userId);
    const purse = payCoins(current.sheet.coins, cost);
    if (!purse) throw new BadRequestError(`You can't afford that: it costs ${formatPrice(cost)} and you have ${formatPrice(totalCp(current.sheet.coins))}.`);
    // Both changes happen together (no waiting in between), so two buyers can't take the last one.
    const who = db.prepare('SELECT u.name, m.character_name FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.campaign_id = ? WHERE u.id = ?').get(a.cid, a.userId);
    const saved = sheets.save(a.cid, a.userId, { ...current.sheet, coins: purse, inventory: addToInventory(current.sheet.inventory, x, qty, { classKey: classKey(current.sheet.classes.find((c) => c.name.trim())?.name) }) }, {
      by: a.userId, reason: `bought ${qty > 1 ? `${qty} × ` : ''}${x.name} from ${m.name} for ${formatPrice(cost)}`,
    });
    const sale = { at: new Date().toISOString(), user_id: a.userId, who: current.sheet.name || who?.character_name || who?.name || '', item: x.id, name: x.name, qty, paid: cost };
    const after = change(a.cid, m.id, (next) => ({
      ...next,
      stock: next.stock.map((l) => (l.id === line.id && l.qty != null ? { ...l, qty: l.qty - qty } : l)),
      sales: [...next.sales, sale].slice(-MAX_SALES),
    }));
    return { shop: shopView(a.cid, after, a), sheet_version: saved.version, bought: { name: x.name, qty, paid: cost } };
  });
}
