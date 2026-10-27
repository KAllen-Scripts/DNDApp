/**
 * Names as links: page titles and other names in text the DM reads (Ask's
 * answers) become coloured links that open the page in the drawer. The names
 * come from the DM's page list, which only the DM gets, so a player's answers
 * are left as they are.
 */
import { h } from './api.js';
import { state, fam } from './wiki-data.js';
import { openDrawer } from './wiki-drawer.js';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let cache = { pages: null, re: null, byKey: null };

/** One regular expression for every name (the longest first, whole words only, any case). */
function matcher() {
  if (cache.pages === state.pages) return cache;
  const byKey = new Map();
  for (const p of state.pages) for (const n of [p.title, ...(p.aliases ?? [])]) if (n.trim().length >= 3 && !byKey.has(n.toLowerCase())) byKey.set(n.toLowerCase(), p);
  const names = [...byKey.keys()].sort((a, b) => b.length - a.length);
  cache = { pages: state.pages, byKey, re: names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null };
  return cache;
}

/** Make the names of pages in `root`'s text into links (not inside links, buttons or code). */
export function markNames(root) {
  // Only in a campaign where this person is the DM (the list stays loaded after switching to another campaign).
  if (!state.pages?.length || !root || document.querySelector('[data-tab=wiki]')?.hidden) return;
  const { re, byKey } = matcher();
  if (!re) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('a, button, code, pre, .wiki-name') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    re.lastIndex = 0;
    if (!re.test(node.data)) continue;
    re.lastIndex = 0;
    const out = [];
    let at = 0;
    for (const m of node.data.matchAll(re)) {
      const page = byKey.get(m[1].toLowerCase());
      if (m.index > at) out.push(node.data.slice(at, m.index));
      out.push(h('button', { type: 'button', class: `link wiki-name fam-${fam(page.kind)}`, title: `${page.title} in the wiki`, onclick: () => openDrawer(page.id) }, m[1]));
      at = m.index + m[1].length;
    }
    if (at < node.data.length) out.push(node.data.slice(at));
    node.replaceWith(...out);
  }
}
