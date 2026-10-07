/**
 * Players' pictures of their characters, one set per player per campaign:
 *
 *   - a token: the picture that stands for them on maps. Everyone in the
 *     campaign may get it (it's shown on every map their token is on).
 *   - a full picture: private to the player, like their sheet. The AI can
 *     describe it for the Appearance part of the sheet.
 *
 * Source data, archive first: each upload is kept exactly as uploaded under
 * characters/<user id>/, and characters/<user id>/pictures.jsonl gets the
 * whole current record on each change, so restore takes the last line.
 * Removing a picture only clears the record; the file stays in the archive.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../store.js';

export const PICTURE_KINDS = ['token', 'picture'];
const FORMATS = { png: { ext: 'png', type: 'image/png' }, jpeg: { ext: 'jpg', type: 'image/jpeg' }, webp: { ext: 'webp', type: 'image/webp' }, gif: { ext: 'gif', type: 'image/gif' } };
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
const TOKEN_PX = 256; // tokens are drawn small; this is sharp on a zoomed-in map
const PICTURE_PX = 1600; // the full picture as shown on the sheet
const AI_PX = 1568;
const CACHE_SIZE = 32;

const fileShape = z.object({ file: z.string(), type: z.string(), width: z.number(), height: z.number(), uploaded_at: z.string() });

/** A record read from the database or the archive, with anything unknown dropped. */
export function normalizePictures(p = {}) {
  const one = (v) => (fileShape.safeParse(v).success ? { file: v.file, type: v.type, width: v.width, height: v.height, uploaded_at: v.uploaded_at } : null);
  return { token: one(p.token), picture: one(p.picture) };
}

/** Changes whenever the image does, so browsers fetch the new one. */
export const pictureKey = (entry) => (entry ? entry.file.replace(/\.[^.]*$/, '') : null);

/**
 * Check an uploaded picture.
 * @returns {Promise<{ ext, type, width, height }>}
 */
export async function inspectPicture(buf) {
  if (!buf.length) throw new BadRequestError('The file is empty.');
  if (buf.length > MAX_PICTURE_BYTES) throw new BadRequestError('That picture is too big. Use one under 10 MB.');
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new BadRequestError("That file isn't a picture that can be read. Use a PNG, JPEG, WebP or GIF.");
  }
  const format = FORMATS[meta.format];
  if (!format) throw new BadRequestError('Use a PNG, JPEG, WebP or GIF picture.');
  const turned = (meta.orientation ?? 1) >= 5;
  return { ...format, width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height };
}

export function createPictures({ db, archive, store }) {
  const cache = new Map(); // `${path}:${kind}` -> Buffer

  const read = (campaignId, userId) => {
    const r = db.prepare('SELECT data FROM character_pictures WHERE campaign_id = ? AND user_id = ?').get(campaignId, userId);
    return normalizePictures(r ? JSON.parse(r.data) : {});
  };

  function write(campaignId, userId, record) {
    const saved_at = new Date().toISOString();
    archive.appendCharacterPictures(store.getCampaign(campaignId).slug, userId, { saved_at, ...record });
    db.prepare(
      `INSERT INTO character_pictures (campaign_id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (campaign_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(campaignId, userId, JSON.stringify(record), saved_at);
    return record;
  }

  const pictures = {
    /** A player's pictures: { token, picture }, each null or { file, type, width, height, uploaded_at }. */
    get: read,

    /** What the page gets about someone's pictures: { token, picture }, each null or { key, width, height }. */
    view(campaignId, userId) {
      const p = read(campaignId, userId);
      const v = (e) => (e ? { key: pictureKey(e), width: e.width, height: e.height } : null);
      return { token: v(p.token), picture: v(p.picture) };
    },

    /** The key of someone's token picture (for maps), or null. */
    tokenKey: (campaignId, userId) => (userId == null ? null : pictureKey(read(campaignId, userId).token)),

    /** Save a new token or full picture. The file is archived as uploaded first. */
    async save(campaignId, userId, kind, buf) {
      const image = await inspectPicture(buf);
      const slug = store.getCampaign(campaignId).slug;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = `${kind}-${stamp}-${crypto.randomBytes(3).toString('hex')}.${image.ext}`;
      archive.saveCharacterImage(slug, userId, file, buf);
      const record = read(campaignId, userId);
      record[kind] = { file, type: image.type, width: image.width, height: image.height, uploaded_at: new Date().toISOString() };
      return write(campaignId, userId, record);
    },

    /** Stop using a token or full picture (the archive keeps the file). */
    remove(campaignId, userId, kind) {
      const record = read(campaignId, userId);
      if (!record[kind]) return record;
      record[kind] = null;
      return write(campaignId, userId, record);
    },

    /** The original file, for the AI. */
    original(campaignId, userId, kind) {
      const entry = read(campaignId, userId)[kind];
      if (!entry) throw new NotFoundError(kind === 'token' ? 'No token picture' : 'No picture');
      return fs.readFileSync(archive.characterImagePath(store.getCampaign(campaignId).slug, userId, entry.file));
    },

    /**
     * The image to show: a token is a square (cropped around what stands out,
     * usually the face), a full picture is made smaller if it's huge.
     * @returns {Promise<{ buf: Buffer, type: string }>}
     */
    async image(campaignId, userId, kind) {
      const entry = read(campaignId, userId)[kind];
      if (!entry) throw new NotFoundError(kind === 'token' ? 'No token picture' : 'No picture');
      const file = archive.characterImagePath(store.getCampaign(campaignId).slug, userId, entry.file);
      const key = `${file}:${kind}`;
      if (!cache.has(key)) {
        let img = sharp(file).rotate();
        img = kind === 'token'
          ? img.resize({ width: TOKEN_PX, height: TOKEN_PX, fit: 'cover', position: sharp.strategy.attention })
          : img.resize({ width: PICTURE_PX, height: PICTURE_PX, fit: 'inside', withoutEnlargement: true });
        cache.set(key, await img.webp({ quality: 88 }).toBuffer());
        if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
      }
      return { buf: cache.get(key), type: 'image/webp' };
    },
  };
  return pictures;
}

const DescribeOut = z.object({
  is_character: z.boolean().describe('false if the picture shows no character at all (a landscape, a document, a blank image)'),
  appearance: z.string().describe('The description for the sheet: three to six sentences. Empty if is_character is false.'),
  eyes: z.string().describe('Eye colour if it can be seen, e.g. "Green"; empty if not'),
  hair: z.string().describe('Hair, e.g. "Long, silver, braided"; empty if not visible or bald is not certain'),
  skin: z.string().describe('Skin, e.g. "Pale", "Deep brown", "Green scales"; empty if not visible'),
  notes: z.string().describe("Anything the player should know (several people in the picture, can't see the face...). Empty if nothing."),
});

const DESCRIBE_SYSTEM = `You describe a player's picture of their own D&D character for the "Character appearance" part of their character sheet.
- Describe what can be seen: build and stance, face, hair, eyes, skin, apparent race (say "looks like" unless it's unmistakable), clothing, armour, weapons, gear, and anything distinctive (scars, tattoos, jewellery, a familiar).
- Write it like the appearance section of a sheet: third person, present tense, plain words, three to six sentences. No name, no backstory, no personality, no game statistics, nothing that isn't in the picture.
- If several figures are shown, describe the one in front or in the centre and say so in the notes.`;

export function createPictureDescriber({ llm }) {
  return {
    /** @returns {Promise<{ appearance, eyes, hair, skin, notes }>} */
    async describe(buf, { campaignId, userId }) {
      const small = await sharp(buf)
        .rotate()
        .resize({ width: AI_PX, height: AI_PX, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85 })
        .toBuffer();
      const out = await llm.structured({
        task: 'import',
        purpose: 'sheet:picture',
        campaignId,
        userId,
        system: DESCRIBE_SYSTEM,
        attachments: [{ type: 'image', media_type: 'image/jpeg', data: small.toString('base64') }],
        prompt: 'Describe this character for their sheet.',
        schema: DescribeOut,
      });
      if (!out.is_character || !out.appearance.trim()) {
        return { appearance: '', eyes: '', hair: '', skin: '', notes: out.notes || "The AI couldn't see a character in that picture." };
      }
      return { appearance: out.appearance.trim(), eyes: out.eyes.trim(), hair: out.hair.trim(), skin: out.skin.trim(), notes: out.notes.trim() };
    },
  };
}
