/**
 * The DM's stamps for the map creator: pieces of map they saved to put down
 * again (a furnished bedroom, a campsite, a stretch of road with its trees):
 * the floor, walls, assets, paths and labels of a rectangle of squares
 * (shared/map-design.js copyArea). Archived like items (library.js); removing
 * one only takes it off the list. The DM's alone.
 */
import { createLibrary } from '../library.js';
import { normalizeClip } from '@dndapp/shared/map-design.js';

export const MAX_MAP_STAMPS = 200;

/** A stamp read from the database or the archive, with anything unknown dropped. */
export function normalizeMapStamp(x = {}) {
  return {
    id: String(x.id),
    name: String(x.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Stamp',
    clip: normalizeClip(x.clip),
    created_by: x.created_by ?? null,
    created_at: String(x.created_at ?? ''),
    updated_at: String(x.updated_at ?? x.created_at ?? ''),
    removed: !!x.removed,
  };
}

export function createMapStamps({ db, archive, store }) {
  const lib = createLibrary({ db, archive, store, folder: 'map_stamps', normalize: normalizeMapStamp, noun: 'stamp', max: MAX_MAP_STAMPS });
  return {
    ...lib,
    /** What the DM's page gets. */
    view: ({ created_by: _by, removed: _removed, ...x }) => x,
  };
}
