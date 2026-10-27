/**
 * The wiki space's views, worked out on the server for one viewer (the DM,
 * or a player for View as): plain functions of the pages that viewer may see,
 * so nothing hidden reaches the page, not even in a count.
 */
import { KIND_FAMILIES, kindFamily, wikiKey, wikiPieces, wikiLinks, wikiPictures as picturesIn, unlink, unpicture, embedNames, unembed, isPrepPage, isArcPage, prepPlayed } from '@dndapp/shared/wiki.js';

/** A page as a card: enough for the cards and the preview shown over a link (its picture and its opening words). */
export const summary = (p) => ({
  id: p.id, title: p.title, aliases: p.aliases, kind: p.kind, parent: p.parent, tags: p.tags, available: p.available, updated_at: p.updated_at,
  picture: p.picture?.id ?? p.banner?.id ?? p.gallery[0]?.id ?? p.sections.flatMap((s) => picturesIn(s.text))[0] ?? null,
  excerpt: excerpt(p),
  ...(p.player && { player: p.player }),
});

/**
 * The pages a page embeds (`[[!Clue]]`, stage 7a), from the pages this viewer may see, by name (lower case):
 * { id, title, kind, available, section, text, canon }. An embed is the page's opening section (a clue's "what the
 * players find"; `opening` maps each page id to its first section's id, from the DM's pages), and reaches a player
 * only when they may see that section. Embeds inside it aren't followed (no clue inside a clue).
 */
export function embedsIn(page, pages, opening) {
  const names = new Set(page.sections.flatMap((s) => embedNames(s.text)).map(wikiKey));
  if (!names.size) return {};
  const out = {};
  for (const p of pages) {
    const key = [p.title, ...(p.aliases ?? [])].map(wikiKey).find((k) => names.has(k));
    if (!key || p.id === page.id) continue;
    const first = p.sections.find((s) => s.id === opening.get(p.id));
    if (!first?.text.trim()) continue;
    for (const k of [p.title, ...(p.aliases ?? [])].map(wikiKey).filter((x) => names.has(x))) {
      out[k] = { id: p.id, title: p.title, kind: p.kind, available: p.available, section: first.id, section_available: first.available, text: unembed(first.text), canon: first.canon ?? 'true' };
    }
  }
  return out;
}

/**
 * On a prep page (stage 7c), each embedded clue's outcome for the DM: `found` (its Found fact, "Session 12: Thorin,
 * Mira"), and `status`: 'found', 'carried' (a later prep page embeds it, `carried_to` its title) or 'missed' (the
 * session was played and it didn't come out). Changes `embeds` in place.
 */
export function prepMarks(page, embeds, pages) {
  if (!isPrepPage(page)) return embeds;
  const later = pages.filter((p) => isPrepPage(p) && p.id !== page.id && String(p.created_at) > String(page.created_at));
  for (const e of Object.values(embeds)) {
    const clue = pages.find((p) => p.id === e.id);
    const found = clue?.facts.find((f) => wikiKey(f.label) === 'found')?.value?.trim() ?? '';
    const next = later.find((p) => p.sections.some((s) => embedNames(s.text).some((n) => [e.title, ...(clue?.aliases ?? [])].some((x) => wikiKey(x) === wikiKey(n)))));
    if (found && !/^not yet/i.test(found)) Object.assign(e, { status: 'found', found });
    else if (next) Object.assign(e, { status: 'carried', carried_to: next.title });
    else if (prepPlayed(page)) e.status = 'missed';
  }
  return embeds;
}

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
  // A prep page (stage 7b) is a plan, not a session that happened.
  const sessions = pages.filter((p) => kindFamily(p.kind) === 'session' && !isPrepPage(p));
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

/** The names a page's text and facts link to. */
const linksOf = (p) => [...p.sections.map((s) => s.text), ...p.facts.map((f) => f.value)].flatMap(wikiLinks);

/**
 * A page's compass (the strip under its banner): its family, the pages it's
 * inside (the top first), the pages inside it, the pages it links to and the
 * pages that link to it. `pages` are the ones the viewer may see, `page` as
 * they see it, so a link inside a part they can't see leads nowhere.
 */
export function compass(page, pages) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const byName = new Map();
  for (const p of pages) for (const n of [p.title, ...p.aliases]) if (!byName.has(wikiKey(n))) byName.set(wikiKey(n), p);
  const chain = [];
  const seen = new Set([page.id]);
  for (let p = byId.get(page.parent); p && !seen.has(p.id); p = byId.get(p.parent)) {
    seen.add(p.id);
    chain.unshift(p);
  }
  const unique = (list) => [...new Map(list.filter((p) => p && p.id !== page.id).map((p) => [p.id, p])).values()];
  const names = new Set([page.title, ...page.aliases].map(wikiKey));
  return {
    family: kindFamily(page.kind),
    chain: chain.map(summary),
    children: pages.filter((p) => p.parent === page.id).sort((a, b) => a.title.localeCompare(b.title)).map(summary),
    links_to: unique(linksOf(page).map((n) => byName.get(wikiKey(n)))).map(summary),
    linked_from: unique(pages.filter((p) => linksOf(p).some((n) => names.has(wikiKey(n))))).map(summary),
  };
}


/**
 * The quest board's columns (stage 8a), in order: a quest's Status fact read loosely ("Under way" is active), others
 * kept as written, and quests with no status last.
 */
export const QUEST_COLUMNS = [
  { key: 'rumoured', label: 'Rumoured', re: /rumou?r|hook|heard|offered|not started/ },
  { key: 'active', label: 'Active', re: /active|open|under ?way|in progress|ongoing|started|taken|accepted/ },
  { key: 'done', label: 'Done', re: /done|complete|finish|succe|solved|closed/ },
  { key: 'failed', label: 'Failed', re: /fail|lost|abandon|refused|dropped/ },
];

const factOf = (p, label) => p.facts.find((f) => wikiKey(f.label) === wikiKey(label)) ?? null;
const plain = (text) => unpicture(unlink(String(text ?? ''))).trim();

/** Which column a Status value goes in: a QUEST_COLUMNS key, its own words (lower case), or '' with none. */
export function questColumn(status) {
  const s = wikiKey(status ?? '');
  if (!s) return '';
  return QUEST_COLUMNS.find((c) => c.re.test(s))?.key ?? s;
}

/** The arc a quest belongs to: the arc page it's inside, else the arc its Arc fact links to. */
function arcOf(page, byId, byName) {
  const seen = new Set();
  for (let p = byId.get(page.parent); p && !seen.has(p.id); p = byId.get(p.parent)) {
    seen.add(p.id);
    if (isArcPage(p)) return p;
  }
  const fact = factOf(page, 'arc');
  for (const n of fact ? wikiLinks(fact.value) : []) if (isArcPage(byName.get(wikiKey(n)))) return byName.get(wikiKey(n));
  return null;
}

/**
 * The quest board (stage 8a), from the pages a viewer may see: the quests (pages in the quest family, not clues,
 * arcs or plans) as cards with their status, Given by and Reward, in columns, and the arcs they're grouped by (the
 * arc-less last). A column for each status nobody expected, kept as the DM wrote it.
 */
export function questBoard(pages) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const byName = new Map();
  for (const p of pages) for (const n of [p.title, ...p.aliases]) if (!byName.has(wikiKey(n))) byName.set(wikiKey(n), p);
  const quests = pages.filter((p) => kindFamily(p.kind) === 'quest' && !isArcPage(p) && !['clue', 'clues'].includes(wikiKey(p.kind)) && !p.template);
  const cards = quests.map((p) => {
    const status = factOf(p, 'status')?.value ?? '';
    const arc = arcOf(p, byId, byName);
    return { ...summary(p), status: plain(status), column: questColumn(plain(status)), given_by: plain(factOf(p, 'given by')?.value), reward: plain(factOf(p, 'reward')?.value), arc: arc?.id ?? null };
  }).sort((a, b) => a.title.localeCompare(b.title));
  const others = [...new Set(cards.map((c) => c.column).filter((k) => k && !QUEST_COLUMNS.some((x) => x.key === k)))].sort();
  const columns = [
    ...QUEST_COLUMNS.map(({ key, label }) => ({ key, label })),
    ...others.map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) })),
    ...(cards.some((c) => !c.column) ? [{ key: '', label: 'No status' }] : []),
  ];
  const arcs = [...new Map(cards.filter((c) => c.arc).map((c) => [c.arc, byId.get(c.arc)])).values()].sort((a, b) => a.title.localeCompare(b.title)).map(summary);
  return { columns, arcs, quests: cards };
}

/**
 * The pages a saved list shows (stage 8a), of the pages a viewer may see: a filter is { family, kind, tag, canon,
 * fact: { label, value } } (all that are given must match; `value` is found in the fact's words), or { ids } for a
 * list the AI picked.
 */
export function listPages(pages, filter = {}) {
  if (Array.isArray(filter.ids)) {
    const byId = new Map(pages.map((p) => [p.id, p]));
    return filter.ids.map((id) => byId.get(id)).filter(Boolean);
  }
  const has = (p) => (filter.family ? kindFamily(p.kind) === filter.family : true)
    && (filter.kind ? wikiKey(p.kind ?? '') === wikiKey(filter.kind) : true)
    && (filter.tag ? p.tags.some((t) => wikiKey(t) === wikiKey(filter.tag)) : true)
    && (filter.canon ? [...p.sections, ...p.facts, ...(p.events ?? [])].some((x) => (x.canon ?? 'true') === filter.canon) : true)
    && (filter.fact?.label ? (() => {
      const f = factOf(p, filter.fact.label);
      return !!f && (!filter.fact.value || wikiKey(plain(f.value)).includes(wikiKey(filter.fact.value)));
    })() : true);
  return pages.filter((p) => !p.template && has(p)).sort((a, b) => a.title.localeCompare(b.title));
}
