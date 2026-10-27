/**
 * Who knows what (wiki space stage 8b, `#/knows`, the DM's): the pages as rows against the players, each cell all,
 * some or none, coloured. A click on a cell shows that player's version of the page beside the parts of it, to tick
 * and **Reveal to** them in one go; the spoiler check asks first when the parts name a page they can't see yet.
 */
import { api, h } from './api.js';
import { state, nav, base, report, status, fam, kindBadge } from './wiki-data.js';
import { pageContent } from './wiki-page.js';
import { spoilerWords } from './wiki-waiting.js';

const WORDS = { all: 'All of it', some: 'Some of it', none: 'Nothing' };
let filter = '';

/** Draw the grid into `main` (it fills in when the server answers). */
export async function drawKnows(main) {
  const box = h('div', { class: 'wiki-knows' }, h('p', { class: 'muted small' }, 'Loading…'));
  main.replaceChildren(box);
  let data;
  try {
    data = await state.guarded(() => api('GET', `${base()}/knows`));
  } catch (err) {
    return report(err);
  }
  if (state.view !== 'knows' || !box.isConnected) return;
  const side = h('aside', { class: 'wiki-knows-side' }, h('p', { class: 'muted small' }, 'Click a square to see that player\'s version of the page, and reveal more of it.'));
  const name = (p) => p.character_name || p.name;
  const search = h('input', { type: 'search', 'aria-label': 'Find a page', placeholder: 'Find a page…', value: filter });
  const rows = h('tbody');
  const drawRows = () => rows.replaceChildren(...data.pages.filter((p) => !filter || p.title.toLowerCase().includes(filter.toLowerCase())).map((p) => h('tr', { 'data-page': p.id },
    h('th', { scope: 'row' }, h('button', { type: 'button', class: `link wiki-knows-title fam-${fam(p.kind)}`, onclick: () => nav.go(`#/page/${p.id}`) }, p.title), ' ', kindBadge(p.kind, ' small')),
    ...data.players.map((pl) => h('td', {}, h('button', {
      type: 'button', class: `wiki-knows-cell knows-${p.cells[pl.id]}`, 'data-player': pl.id, title: `${name(pl)}: ${WORDS[p.cells[pl.id]]}`, 'aria-label': `${p.title}, ${name(pl)}: ${WORDS[p.cells[pl.id]]}`,
      onclick: () => showCell(side, p, pl, () => drawKnows(main)),
    }, p.cells[pl.id] === 'all' ? '●' : p.cells[pl.id] === 'some' ? '◐' : '○'))))));
  search.addEventListener('input', () => { filter = search.value; drawRows(); });
  drawRows();
  box.replaceChildren(
    h('div', { class: 'wiki-home-head' }, h('h2', {}, '◐ Who knows what'), h('span', { class: 'muted small' }, '● all of it · ◐ some · ○ nothing'), search),
    data.players.length ? h('div', { class: 'wiki-knows-body' },
      h('div', { class: 'wiki-knows-grid' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Page'), ...data.players.map((pl) => h('th', { scope: 'col' }, name(pl))))),
        rows)),
      side) : h('p', { class: 'muted' }, 'No players yet.'),
  );
}

/** A cell clicked: the player's version, and the DM's parts to tick and reveal. */
async function showCell(side, row, player, redraw) {
  side.replaceChildren(h('p', { class: 'muted small' }, 'Loading…'));
  let mine;
  let theirs;
  try {
    [mine, theirs] = await state.guarded(() => Promise.all([api('GET', `${base()}/${row.id}`), api('GET', `${base()}/${row.id}?as=${player.id}`).catch(() => null)]));
  } catch (err) {
    return report(err);
  }
  const page = mine.page;
  const who = player.character_name || player.name;
  const tick = (kind, value, label) => h('label', { class: 'map-check' }, h('input', { type: 'checkbox', 'data-kind': kind, value }), ` ${label}`);
  const parts = h('fieldset', { class: 'wiki-knows-parts' }, h('legend', {}, 'Parts to reveal (none ticked: all of it)'),
    ...page.sections.map((s, i) => tick('sections', s.id, s.heading || (i ? `Section ${i + 1}` : 'The opening'))),
    ...page.facts.map((f) => tick('facts', f.label, f.label)),
    ...page.events.map((e) => tick('events', e.id, e.text.slice(0, 60))));
  const reveal = h('button', { type: 'button', class: 'primary', onclick: async () => {
    const chosen = { sections: [], facts: [], events: [] };
    for (const b of parts.querySelectorAll('input:checked')) chosen[b.dataset.kind].push(b.value);
    try {
      const { spoilers } = await state.guarded(() => api('POST', `${base()}/spoilers`, { page_id: page.id, players: [player.id], ...chosen }));
      const words = spoilerWords(spoilers);
      if (words && !confirm(`${words}\n\nReveal it anyway?`)) return;
      await state.guarded(() => api('POST', `${base()}/${page.id}/reveal`, { players: [player.id], version: page.version, ...chosen }));
      status(`Revealed to ${who}.`);
      await nav.refreshList();
      redraw();
    } catch (err) {
      report(err);
    }
  } }, `Reveal to ${who}`);
  side.replaceChildren(
    h('h3', {}, `${page.title}, as ${who} has it`),
    theirs ? h('div', { class: 'wiki-knows-version wiki-content' }, ...pageContent(theirs.page, { dm: false, me: player.id, embeds: theirs.embeds ?? {} })) : h('p', { class: 'muted' }, `${who} can't see this page.`),
    parts,
    h('div', { class: 'wiki-actions' }, reveal),
  );
}
