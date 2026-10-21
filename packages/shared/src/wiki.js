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
