/**
 * Session prep (wiki space stage 7b): the Prep board on a prep page (a "session plan"): every page it names, as
 * cards, its clues first, then by family. Until the boards of stage 10 land, it's a grid of cards that open the pages.
 */
import { h } from './api.js';
import { wikiKey, wikiLinks, embedNames, kindFamily, KIND_FAMILIES } from './shared/wiki.js';
import { state, nav, pictureImg, fam, kindBadge } from './wiki-data.js';
import { makeBoard } from './wiki-boards.js';

export function prepBoard(page) {
  const find = (name) => state.pages.find((p) => [p.title, ...(p.aliases ?? [])].some((n) => wikiKey(n) === wikiKey(name)));
  const texts = [...page.sections.map((s) => s.text), ...page.facts.map((f) => f.value)];
  const clueIds = new Set(texts.flatMap(embedNames).map(find).filter(Boolean).map((p) => p.id));
  const named = [...new Map(texts.flatMap(wikiLinks).map(find).filter((p) => p && p.id !== page.id).map((p) => [p.id, p])).values()];
  const groups = [
    ['Clues', named.filter((p) => clueIds.has(p.id))],
    ...Object.entries(KIND_FAMILIES).map(([f, x]) => [x.label, named.filter((p) => !clueIds.has(p.id) && kindFamily(p.kind) === f)]),
  ].filter(([, list]) => list.length);
  const card = (p) => h('button', { type: 'button', class: `wiki-prep-card fam-${fam(p.kind)}`, onclick: () => nav.openPage(p.id) },
    h('span', { class: `wiki-prep-art${p.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, p.picture ? pictureImg(p.picture, { size: 'thumb' }) : null),
    kindBadge(p.kind), h('strong', {}, p.title), p.excerpt ? h('span', { class: 'muted small' }, p.excerpt) : null);
  // A real board (stage 10): the same groups as columns of cards, to move round and draw arrows on.
  const asBoard = () => makeBoard({
    title: `${page.title}: prep`,
    items: groups.flatMap(([label, list], col) => [
      { kind: 'note', text: label, color: col === 0 && clueIds.size ? 'pink' : 'yellow', x: col * 260, y: 0, w: 220, h: 50 },
      ...list.slice(0, 40).map((p, i) => ({ kind: 'page', ref: p.id, size: 'medium', x: col * 260, y: 70 + i * 170, w: 220, h: 150 })),
    ]),
  });
  return h('section', { class: 'wiki-prep-board' },
    h('h3', {}, 'Prep board'),
    state.dm && groups.length ? h('button', { type: 'button', class: 'ghost small', onclick: asBoard }, 'Lay it out as a board') : null,
    groups.length
      ? h('div', {}, ...groups.map(([label, list]) => h('div', { class: 'wiki-prep-group' }, h('h4', { class: 'small' }, `${label} (${list.length})`), h('div', { class: 'wiki-prep-cards' }, ...list.map(card)))))
      : h('p', { class: 'muted small' }, 'Link the pages this session needs ([[People]], [[Places]], [[!Clues]]) and they show here as cards.'));
}
