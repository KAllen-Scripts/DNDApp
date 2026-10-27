/**
 * Live embeds (wiki space stage 9a): `[[creature:Goblin boss]]`, `[[item:…]]`, `[[merchant:…]]`,
 * `[[handout:…]]` and `[[map:…]]` in a page's text show the thing itself, as it is now: never a copy. Found by
 * name. Per viewer: creatures and items are the DM's; a merchant reaches a player only when they can shop there (they
 * can see one of its tokens); a handout only when they got it; a map only when it's shown to them.
 */
import { APP_EMBED_RE, wikiKey } from '@dndapp/shared/wiki.js';
import { canSeeHandout } from './handouts.js';
import { shownToViewer } from './wiki-maps.js';

export function createWikiEmbeds({ creatures, items, merchants, handouts, maps }) {
  const named = (list, name, field = 'name') => list.find((x) => wikiKey(x[field]) === wikiKey(name)) ?? null;

  /** The thing an embed names, or null. */
  function find(cid, kind, name) {
    if (kind === 'creature') return named(creatures.list(cid), name);
    if (kind === 'item') return named(items.list(cid), name);
    if (kind === 'merchant') return named(merchants.list(cid), name);
    if (kind === 'handout') return named(handouts.list(cid, { role: 'dm' }), name, 'title');
    if (kind === 'map') return named(maps.list(cid), name);
    return null;
  }

  /** May this viewer ({ role, userId }) see it? */
  function visible(cid, kind, thing, viewer) {
    if (!thing) return false;
    if (viewer.role === 'dm') return true;
    if (kind === 'handout') return canSeeHandout(thing, viewer);
    if (kind === 'map') return shownToViewer(thing, viewer.userId, { revealed: 'shown', to: 'shown_to' });
    if (kind === 'merchant') {
      return maps.list(cid).some((m) => m.tokens.some((t) => t.merchant === thing.id) && (maps.view(m, viewer)?.tokens ?? []).some((t) => t.merchant === thing.id));
    }
    return false; // creatures and items are the DM's
  }

  /** The card for one embed, as this viewer gets it. */
  function card(kind, thing, viewer) {
    if (kind === 'creature') {
      const c = creatures.view(thing);
      return { app: kind, id: c.id, name: c.name, picture: c.picture, stats: c.stats ? { name: c.stats.name, ac: c.stats.ac, hp_formula: c.stats.hp_formula, speed: c.stats.speed, challenge: c.stats.challenge, text: c.stats.text } : null };
    }
    if (kind === 'item') {
      const x = items.view(thing);
      return { app: kind, id: x.id, name: x.name, item: x };
    }
    if (kind === 'merchant') return { app: kind, id: thing.id, name: thing.name, description: thing.description, open: thing.open, picture: thing.art ? thing.art.file.replace(/\.[^.]*$/, '') : null, stock: thing.stock.length };
    if (kind === 'handout') return { app: kind, ...handouts.view(thing, viewer), name: thing.title };
    if (kind === 'map') return { app: kind, id: thing.id, name: thing.name, width: thing.image?.width ?? null, height: thing.image?.height ?? null };
    return null;
  }

  return {
    find,
    /** Is the embed of this kind and name one this player may see? (wiki.listFor drops the rest from their text.) */
    visibleTo: (cid, kind, name, userId) => visible(cid, kind, find(cid, kind, name), { role: 'player', userId }),

    /**
     * The live embeds in a page's sections as this viewer gets them, keyed `kind:name` (lower case). The DM also
     * gets `{ app, missing: true }` for a name that matches nothing, so the page can say so.
     */
    forPage(cid, page, viewer) {
      const out = {};
      for (const s of page.sections) {
        for (const m of String(s.text ?? '').matchAll(APP_EMBED_RE)) {
          const kind = m[1].toLowerCase();
          const name = m[2].trim();
          const key = `${kind}:${wikiKey(name)}`;
          if (key in out) continue;
          const thing = find(cid, kind, name);
          if (visible(cid, kind, thing, viewer)) out[key] = card(kind, thing, viewer);
          else if (viewer.role === 'dm') out[key] = { app: kind, name, missing: true };
        }
      }
      return out;
    },

    /** What the editor's "+ Embed" offers (the DM's): [{ kind, name }] of each kind. */
    choices(cid) {
      return [
        ...creatures.list(cid).map((x) => ({ kind: 'creature', name: x.name })),
        ...items.list(cid).map((x) => ({ kind: 'item', name: x.name })),
        ...merchants.list(cid).map((x) => ({ kind: 'merchant', name: x.name })),
        ...handouts.list(cid, { role: 'dm' }).map((x) => ({ kind: 'handout', name: x.title })),
        ...maps.list(cid).filter((m) => !m.removed).map((x) => ({ kind: 'map', name: x.name })),
      ];
    },
  };
}
