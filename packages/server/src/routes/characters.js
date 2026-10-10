/**
 * Players' character sheets (private to their player; the DM has Creatures instead) and pictures of
 * their characters (the token is seen by the campaign; the full picture is private).
 */
import { SHEET_FORMAT, computeSheet, normalizeSheet } from '@dndapp/shared/sheet.js';
import { ARMOR, WEAPONS, carriedWeight, itemStats, magicName, newUnownedWeaponAttacks } from '@dndapp/shared/gear.js';
import { gearRolls } from '@dndapp/shared/rolls.js';
import { z } from 'zod';
import { AuthError } from '../auth.js';
import { BadRequestError, NotFoundError } from '../store.js';
import { MAX_PICTURE_BYTES } from '../images.js';
import { PICTURE_KINDS } from '../characters/pictures.js';
import { RateLimitError } from '../qa/agent.js';
import { SheetConflictError } from '../sheets/store.js';
import { SpendingCapError } from '../llm/index.js';

export function registerCharacters(app, r) {
  const { access, archive, auth, config, db, itemFinder, maps, pictureDescriber, pictures, publicMessage, sheetImport, sheets, spells, store, upload } = r;

  // ---------- character sheets (private to their player) ----------

  // AI calls for sheets (uploads, spell lookups outside the SRD) per player per hour.
  const sheetAiCalls = new Map();
  const sheetAiAllowed = (userId) => () => {
    const hourAgo = Date.now() - 3600_000;
    const recent = (sheetAiCalls.get(userId) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= config.sheets.aiPerHour) {
      throw new RateLimitError("That's a lot of sheet lookups in the last hour. Please wait a bit, or type the details in yourself.");
    }
    recent.push(Date.now());
    sheetAiCalls.set(userId, recent);
  };

  /**
   * Sheets (and character pictures) belong to the players in the campaign: not the admin login, which only
   * manages, and not the DM, who has Creatures instead.
   */
  function sheetOwner(request) {
    const a = access(request);
    if (!a.membership) throw new AuthError('Only people in this campaign have character sheets', 403);
    if (a.membership.role === 'dm') throw new AuthError('The DM has Creatures instead of a character sheet', 403);
    return a;
  }

  /** Your sheet in this campaign (a blank one, version 0, if you haven't saved one). */
  app.get('/campaigns/:cid/sheet', async (request) => sheets.get(sheetOwner(request).cid, request.user.id));

  /**
   * Save your whole sheet: { sheet, version } where version is the one you
   * loaded. 409 { error, current } if it was saved elsewhere since.
   */
  app.put('/campaigns/:cid/sheet', { bodyLimit: 5 * 1024 * 1024 }, async (request) => {
    const { cid } = sheetOwner(request);
    const body = z.object({ sheet: z.record(z.string(), z.unknown()), version: z.number().int().min(0) }).parse(request.body);
    // Weapon attacks come from the Inventory: a typed attack can't use a weapon the character doesn't have
    // (one the saved sheet already had stays, so old and uploaded sheets still save).
    const current = sheets.get(cid, request.user.id);
    if (current.version === body.version) {
      const missing = [...new Set(newUnownedWeaponAttacks(normalizeSheet(body.sheet), current.sheet).map((a) => a.weapon))];
      if (missing.length) throw new BadRequestError(`You don't have ${missing.length > 1 ? `these weapons: ${missing.join(', ')}` : `a ${missing[0]}`} in your Inventory. Add ${missing.length > 1 ? 'them' : 'it'} there (equipped weapons show in Attacks by themselves), or rename or remove the attack.`);
    }
    return sheets.save(cid, request.user.id, body.sheet, { baseVersion: body.version });
  });

  /**
   * Upload an existing sheet: { filename, data (base64) }. A PDF, photo, text
   * file or a sheet downloaded from here. The file is archived as uploaded,
   * read (by the AI unless it's one of ours) and saved as your sheet.
   */
  app.post('/campaigns/:cid/sheet/import', upload, async (request) => {
    const { cid, campaign } = sheetOwner(request);
    const { filename, data, version } = z
      .object({ filename: z.string().max(200).default('sheet'), data: z.string().min(1), version: z.number().int().min(0).optional() })
      .parse(request.body);
    const buf = Buffer.from(data, 'base64');
    if (!buf.length) throw new BadRequestError('The file is empty.');
    const current = sheets.get(cid, request.user.id);
    if (version != null && version !== current.version) throw new SheetConflictError(current);
    archive.saveSheetUpload(campaign.slug, request.user.id, filename, buf);
    const { sheet, notes } = await sheetImport.read({
      filename,
      buf,
      base: { name: current.sheet.name, player_name: current.sheet.player_name },
      campaignId: cid,
      userId: request.user.id,
      beforeAi: sheetAiAllowed(request.user.id),
    });
    const saved = sheets.save(cid, request.user.id, sheet, { reason: `uploaded ${filename}` });
    return { ...saved, notes };
  });

  /** The sheet as a file to keep or upload again later. */
  app.get('/campaigns/:cid/sheet/download', async (request, reply) => {
    const { sheet, version, updated_at } = sheets.get(sheetOwner(request).cid, request.user.id);
    const name = (sheet.name || 'character').replace(/[^\w -]+/g, '').trim() || 'character';
    reply.header('Content-Disposition', `attachment; filename="${name}.json"`);
    return { format: SHEET_FORMAT, version, saved_at: updated_at, sheet };
  });

  /** Spell names for suggestions while typing (SRD, plus spells found in the books). */
  app.get('/campaigns/:cid/spells', async (request) => {
    access(request);
    const { q } = z.object({ q: z.string().max(100).default('') }).parse(request.query);
    return spells.search(q);
  });

  /** A spell's details by name: the SRD, else the group's books, else the AI's memory. 404 if nobody knows it. */
  app.get('/campaigns/:cid/spells/lookup', async (request) => {
    const { cid } = access(request);
    const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(request.query);
    const spell = await spells.lookup(name, { campaignId: cid, userId: request.user.id, beforeAi: sheetAiAllowed(request.user.id) });
    if (!spell) throw new NotFoundError(`No spell called "${name}" was found in the SRD, your books, or the AI's memory.`);
    return spell;
  });

  // ---------- gear (the sheet's inventory: carried and equipped) ----------

  /** A table weapon or armour in words, for its description. */
  const tableText = (stats) => stats.weapon
    ? `${stats.weapon.category === 'martial' ? 'Martial' : 'Simple'} weapon. ${stats.weapon.damage || 'No damage'}.${stats.weapon.properties.length ? ` ${stats.weapon.properties.map((p) => p[0].toUpperCase() + p.slice(1)).join(', ')}.` : ''}`
    : stats.armor.type === 'shield' ? `Shield: +${stats.armor.base} AC.` : `${stats.armor.type[0].toUpperCase() + stats.armor.type.slice(1)} armour: AC ${stats.armor.base}${stats.armor.type === 'light' ? ' + Dex modifier' : stats.armor.type === 'medium' ? ' + Dex modifier (max 2)' : ''}.`;

  /**
   * Look up an item for your inventory (players): ?name=. Weapons and armour
   * from the PHB tables at once (a "+1" in the name is its magic bonus); else
   * the group's books, then the AI's knowledge (not the DM's own items, which
   * players only meet at merchants). Returns { item: an inventory line, not
   * saved: the page adds it to the sheet }, 404 if nobody knows it.
   */
  app.get('/campaigns/:cid/gear/lookup', async (request) => {
    const a = sheetOwner(request);
    const { name } = z.object({ name: z.string().trim().min(2).max(100) }).parse(request.query ?? {});
    const { base } = magicName(name);
    const table = WEAPONS[base] ?? ARMOR[base] ?? ARMOR[`${base} armor`];
    if (table) {
      const stats = itemStats({ name });
      const magic = stats.magic ? `+${stats.magic} ` : '';
      return { item: { name: `${magic}${table.name}`, kind: stats.kind, qty: 1, ...stats, text: tableText(stats), source: "Player's Handbook (SRD)" }, from: 'srd' };
    }
    const found = await itemFinder.lookup(name, { campaignId: a.cid, userId: request.user.id, own: false, beforeAi: sheetAiAllowed(request.user.id) });
    if (!found) throw new NotFoundError(`Neither the books nor the AI know an item called "${name}". Add it by hand instead.`);
    const f = found.fields;
    const stats = itemStats({ name: f.name || name, kind: f.kind, text: f.text });
    return {
      item: { name: f.name || name, kind: stats.kind, qty: 1, attunement: !!f.attunement, weight: f.weight ?? stats.weight, text: f.text, weapon: stats.weapon, armor: stats.armor, magic: stats.magic, charges: stats.charges, effects: stats.effects, source: f.source?.from || (found.from === 'ai' ? "the AI's memory: check it" : '') },
      from: found.from,
    };
  });

  /**
   * What each player has equipped (DM), so the DM can check it: { players:
   * [{ user_id, name, character, ac, gear: [{ name, kind, equipped, qty,
   * proficient, magic, attuned, attunement, armor, effects, to_hit, damage }],
   * carried, capacity, load, attuned }] }. Only equipped gear, the AC worked
   * out from it, the attacks it makes, the total weight carried against the
   * campaign's limit and how many items they're attuned to; the rest of the
   * sheet (and what's only carried) stays private.
   */
  app.get('/campaigns/:cid/gear/equipped', async (request) => {
    const a = access(request, { dm: true });
    const members = db.prepare("SELECT u.id, u.name, m.character_name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.campaign_id = ? AND m.role != 'dm' ORDER BY u.name").all(a.cid);
    return {
      players: members.map((m) => {
        const { sheet, version } = sheets.get(a.cid, m.id);
        if (!version) return { user_id: m.id, name: m.name, character: m.character_name ?? '', ac: null, gear: [] };
        const calc = computeSheet(sheet, store.getSettings(a.cid));
        return {
          user_id: m.id,
          name: m.name,
          character: sheet.name || m.character_name || '',
          ac: calc.values.ac,
          ac_own: 'ac' in sheet.overrides,
          carried: carriedWeight(sheet.inventory, sheet.coins),
          capacity: calc.load?.capacity ?? null,
          load: calc.load?.level ?? null,
          attuned: sheet.inventory.filter((g) => g.attuned).length,
          gear: sheet.inventory.filter((g) => g.equipped).map((g) => {
            const rolls = g.weapon ? gearRolls(g, calc) : null;
            return { name: g.name, kind: g.kind, equipped: g.equipped, qty: g.qty, proficient: g.proficient, magic: g.magic, attuned: g.attuned, attunement: g.attunement, armor: g.armor, effects: g.effects, to_hit: rolls?.bonus ?? null, damage: rolls?.damage ? `${rolls.damage}${rolls.type ? ` ${rolls.type}` : ''}` : null };
          }),
        };
      }),
    };
  });

  // ---------- pictures of characters (the token is seen by the campaign; the full picture is private) ----------

  /** Maps with this player's token on them get sent again, so everyone sees the new picture. */
  const resendMapsWithToken = (cid, userId) => {
    for (const map of maps.list(cid)) if (map.tokens.some((t) => t.kind === 'pc' && t.user_id === userId)) maps.events.emit('update', map);
  };

  const pictureKind = (request) => {
    if (!PICTURE_KINDS.includes(request.params.kind)) throw new NotFoundError('No such picture');
    return request.params.kind;
  };

  /**
   * Describe your full picture with the AI and put it on your sheet: the
   * Appearance box, and eyes, hair and skin where they're empty. Appearance
   * text you already have is only replaced if `replace` is set.
   */
  async function describePicture(cid, userId, replace) {
    sheetAiAllowed(userId)();
    const found = await pictureDescriber.describe(pictures.original(cid, userId, 'picture'), { campaignId: cid, userId });
    if (!found.appearance) return { description: found, applied: false };
    const current = sheets.get(cid, userId);
    const sheet = structuredClone(current.sheet);
    const applied = replace || !sheet.appearance.trim();
    if (applied) sheet.appearance = found.appearance;
    for (const k of ['eyes', 'hair', 'skin']) if (found[k] && !sheet[k].trim()) sheet[k] = found[k];
    const saved = sheets.save(cid, userId, sheet, { reason: 'described from their picture' });
    return { description: found, applied, sheet: saved };
  }

  /** Your pictures in this campaign: { token, picture }, each null or { key, width, height }. */
  app.get('/campaigns/:cid/character/pictures', async (request) => pictures.view(sheetOwner(request).cid, request.user.id));

  /**
   * Upload your token (the picture on your token on maps) or a full picture
   * of your character: { filename, data (base64) }. A full picture is
   * described by the AI for your sheet unless `describe` is false; the sheet's
   * Appearance is only replaced if it's empty or `replace` is set.
   * Returns { pictures, description?, applied?, sheet? }.
   */
  app.put('/campaigns/:cid/character/:kind', { bodyLimit: Math.ceil(MAX_PICTURE_BYTES * 1.4) }, async (request) => {
    const { cid } = sheetOwner(request);
    const kind = pictureKind(request);
    const body = z.object({ filename: z.string().max(200).default(''), data: z.string().min(1), describe: z.boolean().default(true), replace: z.boolean().default(false) }).parse(request.body);
    await pictures.save(cid, request.user.id, kind, Buffer.from(body.data, 'base64'));
    if (kind === 'token') {
      resendMapsWithToken(cid, request.user.id);
      return { pictures: pictures.view(cid, request.user.id) };
    }
    let described = {};
    if (body.describe) {
      try {
        described = await describePicture(cid, request.user.id, body.replace);
      } catch (err) {
        // The picture is saved either way; say why there's no description.
        if (!(err instanceof RateLimitError || err instanceof SpendingCapError)) request.log.warn(err);
        described = { error: `Your picture is saved, but the AI couldn't describe it: ${publicMessage(err)}` };
      }
    }
    return { pictures: pictures.view(cid, request.user.id), ...described };
  });

  /** Describe your full picture again: { replace? }. Returns { description, applied, sheet? }. */
  app.post('/campaigns/:cid/character/picture/describe', async (request) => {
    const { cid } = sheetOwner(request);
    const { replace } = z.object({ replace: z.boolean().default(false) }).parse(request.body ?? {});
    return describePicture(cid, request.user.id, replace);
  });

  /** Stop using your token or full picture (the archive keeps it). */
  app.delete('/campaigns/:cid/character/:kind', async (request) => {
    const { cid } = sheetOwner(request);
    const kind = pictureKind(request);
    pictures.remove(cid, request.user.id, kind);
    if (kind === 'token') resendMapsWithToken(cid, request.user.id);
    return { pictures: pictures.view(cid, request.user.id) };
  });

  const sendPicture = async (reply, cid, userId, kind) => {
    const { buf, type } = await pictures.image(cid, userId, kind);
    return reply.type(type).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=31536000, immutable').send(buf);
  };

  /** Your full picture (only ever yours). ?v= is its key, so a new picture is a new address. */
  app.get('/campaigns/:cid/character/picture/image', async (request, reply) => {
    const { cid } = sheetOwner(request);
    return sendPicture(reply, cid, request.user.id, 'picture');
  });

  /** Someone's token picture, for anyone in the campaign (it's on the maps they're on). */
  app.get('/campaigns/:cid/members/:uid/token', async (request, reply) => {
    const { cid } = access(request);
    const uid = Number(request.params.uid);
    if (!Number.isInteger(uid) || !auth.membership(cid, uid)) throw new NotFoundError('No token picture');
    return sendPicture(reply, cid, uid, 'token');
  });
}
