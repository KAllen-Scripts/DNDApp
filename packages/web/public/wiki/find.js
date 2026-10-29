/**
 * Find (Ctrl K or Cmd K, the DM's, in either space): type and the wiki's
 * pages come back as picture cards: titles and other names that match first,
 * then pages whose text means something like it (GET …/wiki/find), so "the
 * guy with the eyepatch" finds Rennick. In the wiki a card opens its page; at
 * the table, the drawer.
 */
import { api, h } from '../page/api.js';
import { state, nav, base, pictureImg, fam, kindBadge } from './data.js';
import { openDrawer } from './drawer.js';
import { openMakeUp } from './write.js';

const $ = (sel) => document.querySelector(sel);
let timer = null;
let asked = 0;

// Anyone with the wiki (the DM's, or a player's own version since stage 6a).
const isDm = () => state.campaignId != null && !$('[data-tab=wiki]')?.hidden;

function dialog() {
  let d = $('#wiki-find');
  if (d) return d;
  const input = h('input', { type: 'search', placeholder: 'Find a page: a name, or what it\'s about…', 'aria-label': 'Find a page', autocomplete: 'off' });
  const results = h('div', { class: 'wiki-find-results', role: 'list' });
  d = h('dialog', { id: 'wiki-find', class: 'map-dialog wiki-find', 'aria-label': 'Find a page' },
    h('div', { class: 'wiki-find-bar' }, input,
      state.dm && h('button', { type: 'button', class: 'ghost small wiki-ai-btn', title: 'The AI makes up an NPC, a tavern, a shop, a rumour or a name that fits the wiki', onclick: () => {
        d.close();
        openMakeUp(input.value.trim());
      } }, '✦ Make up…'),
      h('button', { type: 'button', class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
    results);
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => find(input.value, results), 180);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      results.querySelector('.wiki-find-card')?.click();
    }
  });
  $('#app-view').append(d);
  return d;
}

async function find(q, results) {
  const n = ++asked;
  if (!q.trim()) return results.replaceChildren();
  let pages;
  try {
    ({ pages } = await api('GET', `${base()}/find?q=${encodeURIComponent(q)}`));
  } catch {
    return;
  }
  if (n !== asked) return;
  results.replaceChildren(...(pages.length ? pages.map((p) => h('button', {
    type: 'button',
    role: 'listitem',
    class: `wiki-find-card fam-${fam(p.kind)}`,
    onclick: () => choose(p),
  },
  h('span', { class: `wiki-find-art${p.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, p.picture ? pictureImg(p.picture, { size: 'thumb' }) : null),
  h('span', { class: 'wiki-find-body' },
    kindBadge(p.kind),
    h('strong', {}, p.title),
    p.excerpt ? h('span', { class: 'small' }, p.excerpt) : null,
    p.found_by === 'text' ? h('span', { class: 'muted small' }, 'found in its text') : null),
  )) : [h('p', { class: 'muted' }, 'No page matches.')]));
}

function choose(p) {
  $('#wiki-find').close();
  if (document.documentElement.dataset.space === 'wiki') nav.go(`#/page/${p.id}`);
  else openDrawer(p.id);
}

/** Open Find. */
export function openFind() {
  if (!isDm()) return;
  const d = dialog();
  const input = d.querySelector('input');
  input.value = '';
  d.querySelector('.wiki-find-results').replaceChildren();
  d.showModal();
  input.focus();
}

/** Ctrl K or Cmd K anywhere opens Find (for the DM). */
export function initFind() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k' && isDm()) {
      e.preventDefault();
      openFind();
    }
  });
}
