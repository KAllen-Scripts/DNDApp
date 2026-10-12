/**
 * The DM's own assets for the map creator: pictures (a cart, a throne, a
 * whole ship seen from above) placed on maps made in the app like the
 * built-in ones (shared/map-design.js), as `u:<id>`. Each keeps its name, its
 * picture exactly as uploaded, its size (to keep its shape when placed) and
 * what it blocks by default. Archived like items (library.js); removing one
 * only takes it off the list: maps already made with it keep drawing it.
 * The DM's alone: players only ever see the map's finished picture.
 */
import { createLibrary, normalizeArt } from './library.js';
import { BLOCKS } from '@dndapp/shared/map-design.js';

export const MAX_MAP_ASSETS = 300;

/** An asset read from the database or the archive, with anything unknown dropped. */
export function normalizeMapAsset(x = {}) {
  const dim = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 1);
  return {
    id: String(x.id),
    name: String(x.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Asset',
    art: normalizeArt(x.art),
    // The picture's size in pixels, for its shape on the map.
    width: dim(x.width),
    height: dim(x.height),
    // What it blocks when placed (the DM can change it on each one placed): nothing, movement (an obstacle), or sight and movement (a wall).
    blocks: BLOCKS.includes(x.blocks) ? x.blocks : 'none',
    created_by: x.created_by ?? null,
    created_at: String(x.created_at ?? ''),
    updated_at: String(x.updated_at ?? x.created_at ?? ''),
    removed: !!x.removed,
  };
}

export function createMapAssets({ db, archive, store }) {
  const lib = createLibrary({ db, archive, store, folder: 'map_assets', normalize: normalizeMapAsset, noun: 'asset', max: MAX_MAP_ASSETS });
  return {
    ...lib,

    /** What the DM's page gets: the picture as a key, never its file name. */
    view: ({ art, created_by: _by, removed: _removed, ...x }) => ({ ...x, picture: art ? art.file.replace(/\.[^.]*$/, '') : null }),

    /** Where an asset's picture is (removed ones too, since maps made with them still draw them), or null. */
    file(cid, id) {
      try {
        const x = lib.get(cid, id, { removed: true });
        return x.art ? lib.picturePath(cid, x) : null;
      } catch {
        return null;
      }
    },
  };
}
