/**
 * The wiki space's views, worked out on the server for one viewer (the DM,
 * or a player for View as): plain functions of the pages that viewer may see,
 * so nothing hidden reaches the page, not even in a count.
 */
import { KIND_FAMILIES, kindFamily, wikiKey, wikiPieces, wikiPictures as picturesIn, unlink, unpicture } from '@dndapp/shared/wiki.js';

/** A page as a card: enough for the cards and the preview shown over a link (its picture and its opening words). */
export const summary = (p) => ({
  id: p.id, title: p.title, aliases: p.aliases, kind: p.kind, parent: p.parent, tags: p.tags, available: p.available, updated_at: p.updated_at,
  picture: p.picture?.id ?? p.banner?.id ?? p.gallery[0]?.id ?? p.sections.flatMap((s) => picturesIn(s.text))[0] ?? null,
  excerpt: excerpt(p),
});

function excerpt(p) {
  const plain = (p.sections.map((s) => wikiPieces(s.text).filter((x) => !x.block).map((x) => x.text).join(' ')).find((t) => t.trim()) ?? '');
  const text = unpicture(unlink(plain)).replace(/\[picture[^\]]*\]/g, '').replace(/[#>*_`|~-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 220 ? `${text.slice(0, 217).replace(/\s+\S*$/, '')}…` : text;
}

/**
 * The Wheel: each kind family (in KIND_FAMILIES order, empty ones too, so the
 * wheel keeps its shape) with how many pages it has, and its kinds with
 * theirs, the commonest first ("" for pages with no kind).
 */
export function wheelFamilies(pages) {
  const families = new Map(Object.entries(KIND_FAMILIES).map(([family, f]) => [family, { family, label: f.label, icon: f.icon, count: 0, kinds: new Map() }]));
  for (const p of pages) {
    const f = families.get(kindFamily(p.kind));
    f.count += 1;
    const key = wikiKey(p.kind ?? '');
    const k = f.kinds.get(key) ?? { kind: (p.kind ?? '').trim().toLowerCase(), count: 0 };
    k.count += 1;
    f.kinds.set(key, k);
  }
  return [...families.values()].map((f) => ({ ...f, kinds: [...f.kinds.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)) }));
}

/**
 * The page about the last session played: a session page naming its number
 * ("Session 12"), else the newest session page.
 */
export function lastSessionPage(pages, number) {
  const sessions = pages.filter((p) => kindFamily(p.kind) === 'session');
  if (number != null) {
    const re = new RegExp(`\\bsession\\s*#?${number}\\b`);
    const named = sessions.find((p) => [p.title, ...p.aliases].some((n) => re.test(wikiKey(n))));
    if (named) return named;
  }
  return [...sessions].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}

/** The pages changed most recently, newest first. */
export const recentPages = (pages, n = 8) => [...pages].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, n);

/**
 * The Home's picture: the last session's, else a place page's (the biggest
 * place first: one with the most pages inside it), else none.
 */
export function heroPicture(pages, last) {
  const pic = (p) => (p ? summary(p).picture : null);
  if (pic(last)) return pic(last);
  const inside = new Map();
  for (const p of pages) if (p.parent) inside.set(p.parent, (inside.get(p.parent) ?? 0) + 1);
  const places = pages.filter((p) => kindFamily(p.kind) === 'place' && pic(p)).sort((a, b) => (inside.get(b.id) ?? 0) - (inside.get(a.id) ?? 0));
  return places.length ? pic(places[0]) : null;
}
