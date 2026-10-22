/**
 * The DM's wiki text, read the same way on the server (which filters it for
 * each person) and on the page (which draws it for the DM).
 *
 * A section's text is Markdown with two additions:
 *   [[Page name]] or [[Page name|shown text]]   a link to another page, by its title or one of its aliases
 *   :::for Thorin, Mira   ...   :::           only for those players (character or account names)
 *   :::dm                 ...   :::           only for the DM
 * A block runs from its opening line to a line that is only ":::" (or to the
 * end of the section, if it's never closed). Blocks don't nest.
 *
 * Who something is available to is an audience: null (everyone in the
 * campaign), or a list of user ids ([] = only the DM, who sees everything).
 * The narrowest one wins: a block in a section of a page is available to
 * the players all three allow.
 */

export const LINK_RE = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

const OPEN_RE = /^\s*:::\s*(for|dm)\b(.*)$/i;
const CLOSE_RE = /^\s*:::\s*$/;

/**
 * A section's text as pieces: { text, block: null | { dm: true } | { names: [..] } }.
 * Plain text between blocks has block null.
 */
export function wikiPieces(text) {
  const out = [];
  let cur = { block: null, lines: [] };
  const push = () => {
    if (cur.lines.length || cur.block) out.push({ text: cur.lines.join('\n'), block: cur.block });
  };
  for (const line of String(text ?? '').split('\n')) {
    const open = cur.block ? null : OPEN_RE.exec(line);
    if (open) {
      push();
      const block = open[1].toLowerCase() === 'dm'
        ? { dm: true }
        : { names: open[2].split(',').map((n) => n.trim()).filter(Boolean) };
      cur = { block, lines: [] };
    } else if (cur.block && CLOSE_RE.test(line)) {
      push();
      cur = { block: null, lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  push();
  // Blank plain pieces (the space between two blocks) add nothing.
  return out.filter((p) => p.block || p.text.trim());
}

/** The narrowest of two audiences (null = everyone). */
export function narrowest(a, b) {
  if (a == null) return b == null ? null : [...b];
  if (b == null) return [...a];
  return a.filter((id) => b.includes(id));
}

/** Can this viewer see something with this audience? A viewer with seesAll (the DM) sees everything. */
export const canSeeAudience = (viewer, audience) => !viewer || !!viewer.seesAll || audience == null || audience.includes(viewer.userId);

/**
 * An "available to" setting as an audience: 'all' -> null (everyone, or the
 * same as the page for a section), 'dm' -> [], a list of user ids -> itself.
 */
export const audienceOf = (available) => (available === 'all' ? null : available === 'dm' ? [] : Array.isArray(available) ? available.map(Number) : []);

/**
 * The user ids a block's names stand for: players whose character name or
 * account name matches (any case). A name nobody has matches nobody, so the
 * block stays with the DM rather than reaching the wrong person.
 * @param {Array<{ user_id: number, name: string, character_name?: string|null, role: string }>} roster
 */
export function blockAudience(block, roster) {
  if (!block) return null;
  if (block.dm) return [];
  const key = (s) => String(s ?? '').trim().toLowerCase();
  const ids = new Set();
  for (const n of block.names) {
    for (const m of roster) if (m.role !== 'dm' && (key(m.character_name) === key(n) || key(m.name) === key(n))) ids.add(m.user_id);
  }
  return [...ids];
}

/** The names in a page's blocks that match nobody in the roster (so the DM can be told). */
export function unknownBlockNames(texts, roster) {
  const out = new Set();
  for (const text of texts) {
    for (const p of wikiPieces(text)) {
      for (const n of p.block?.names ?? []) if (!blockAudience({ names: [n] }, roster).length) out.add(n);
    }
  }
  return [...out];
}

/** The page names a text links to, as written (no duplicates). */
export function wikiLinks(text) {
  return [...new Set([...String(text ?? '').matchAll(LINK_RE)].map((m) => m[1].trim()))];
}

/** A text with its [[links]] as plain words (for the AI and for search). */
export const unlink = (text) => String(text ?? '').replace(LINK_RE, (_, name, shown) => (shown ?? name).trim());

/** Lower case with spaces squeezed, for matching page titles and aliases. */
export const wikiKey = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// ---------- pictures ----------

/**
 * A picture in a section's text: ![caption](picture:<id>), where the id is
 * one of the wiki's pictures (src/wiki-pictures.js). After the caption, "|"
 * and a place says where it goes: ![The mill at dusk|right](picture:…).
 * A picture inside a `:::dm` or `:::for` block, or in a section only some
 * players get, goes only where the text around it goes.
 */
export const PICTURE_RE = /!\[([^\]\n]*)\]\(picture:([a-f0-9]{10})\)/g;
export const PICTURE_PLACES = ['left', 'right', 'wide', 'small'];
export const isPictureId = (id) => /^[a-f0-9]{10}$/.test(String(id ?? ''));

/** A picture's alt text as { caption, place } ("Mill|right" -> { caption: 'Mill', place: 'right' }). */
export function pictureAlt(alt) {
  const m = /^(.*)\|\s*(left|right|wide|small)\s*$/i.exec(String(alt ?? ''));
  return m ? { caption: m[1].trim(), place: m[2].toLowerCase() } : { caption: String(alt ?? '').trim(), place: '' };
}

/** The picture ids a text shows (no duplicates). */
export function wikiPictures(text) {
  return [...new Set([...String(text ?? '').matchAll(PICTURE_RE)].map((m) => m[2]))];
}

/** A text with its pictures as words (for the AI and for search): "[picture: The mill at dusk]". */
export const unpicture = (text) => String(text ?? '').replace(PICTURE_RE, (_, alt) => {
  const { caption } = pictureAlt(alt);
  return caption ? `[picture: ${caption}]` : '[picture]';
});

/** Every picture a page uses: its main picture, banner, gallery and the pictures in its text. */
export function pagePictureIds(page) {
  const ids = new Set();
  for (const p of [page?.picture, page?.banner, ...(page?.gallery ?? [])]) if (p?.id) ids.add(p.id);
  for (const s of page?.sections ?? []) for (const id of wikiPictures(s.text)) ids.add(id);
  return [...ids];
}

// ---------- kinds ----------

/**
 * Kinds are free text; these families give a page its icon, colour and the
 * usual "at a glance" facts (an infobox), like World Anvil's and Kanka's
 * article templates. Anything else is "other".
 */
export const KIND_FAMILIES = {
  person: { label: 'People', icon: '☺', words: ['npc', 'pc', 'character', 'person', 'people', 'villain', 'ally', 'hero', 'noble', 'merchant'], facts: ['Race', 'Role', 'Where they are', 'Allegiance', 'Status'] },
  place: { label: 'Places', icon: '⌂', words: ['place', 'location', 'city', 'town', 'village', 'region', 'country', 'kingdom', 'dungeon', 'tavern', 'inn', 'building', 'landmark', 'realm', 'plane'], facts: ['Type', 'Region', 'Ruler', 'Population'] },
  faction: { label: 'Factions', icon: '⚑', words: ['faction', 'organisation', 'organization', 'guild', 'cult', 'order', 'house', 'family', 'clan', 'church'], facts: ['Leader', 'Base', 'Goals', 'Allies', 'Enemies'] },
  item: { label: 'Items', icon: '⚱', words: ['item', 'artifact', 'artefact', 'weapon', 'relic', 'treasure', 'object'], facts: ['Type', 'Rarity', 'Owner', 'Where it is'] },
  creature: { label: 'Creatures', icon: '☠', words: ['creature', 'monster', 'beast', 'race', 'species'], facts: ['Type', 'Habitat', 'Danger'] },
  quest: { label: 'Quests', icon: '✦', words: ['quest', 'mission', 'job', 'plot', 'hook', 'mystery', 'clue'], facts: ['Given by', 'Status', 'Reward'] },
  session: { label: 'Sessions', icon: '☾', words: ['session', 'recap', 'log', 'adventure'], facts: ['Played on', 'Where', 'Who was there'] },
  lore: { label: 'Lore', icon: '❧', words: ['lore', 'history', 'legend', 'myth', 'religion', 'deity', 'god', 'magic', 'event', 'era'], facts: ['When', 'Related to'] },
  other: { label: 'Other', icon: '❦', words: [], facts: [] },
};

/** The family of a page's kind ("Tavern" -> 'place'). */
export function kindFamily(kind) {
  const k = wikiKey(kind);
  if (!k) return 'other';
  for (const [family, f] of Object.entries(KIND_FAMILIES)) if (f.words.includes(k) || f.words.includes(k.replace(/s$/, ''))) return family;
  for (const [family, f] of Object.entries(KIND_FAMILIES)) if (f.words.some((w) => k.split(/[\s/-]+/).includes(w))) return family;
  return 'other';
}
