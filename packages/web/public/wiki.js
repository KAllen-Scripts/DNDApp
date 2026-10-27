/**
 * The Wiki tab (the DM's): pages about the campaign's world that only the DM
 * writes. Each page, section and block says who it's available to; players
 * never see the tab, but Ask answers them from the parts available to them
 * (the server filters it). View as… shows a page the way a player would get it.
 *
 * Text is Markdown, plus [[Page name]] links, `:::for Thorin` / `:::dm`
 * blocks and ![caption](picture:<id>) pictures (shared/wiki.js, which the
 * server uses too).
 *
 * It's meant to look like a campaign wiki (owner, 2026-10-21: "I really want
 * the wiki to be more visual"; ideas from World Anvil, Kanka, LegendKeeper
 * and Obsidian Portal): the front page is a grid of picture cards to filter
 * by kind and tag; a page has a banner across the top, an "at a glance" box
 * with its picture and facts, pictures in the text, a gallery, and links that
 * show a preview of the page they go to.
 *
 * This module runs the tab (the list, the front page, which view is shown);
 * a page is drawn by wiki-page.js and the AI's changes by wiki-waiting.js.
 */
import { api, h } from './api.js';
import { wikiKey, KIND_FAMILIES } from './shared/wiki.js';
import { state, nav, base, status, report, availableText, playerName, pictureImg, clearPictures, fam, kindBadge, matchesFilter } from './wiki-data.js';
import { pageLink, hidePreview, hero, pageContent, editor } from './wiki-page.js';
import { drawReview } from './wiki-waiting.js';

const $ = (sel) => document.querySelector(sel);

export async function loadWiki({ campaignId, guarded }) {
  clearTimeout(state.poll);
  clearPictures();
  Object.assign(state, { campaignId, guarded, pages: [], players: [], filter: '', kindFilter: null, tagFilter: null, open: null, view: 'page', as: null, proposals: 0, aiRun: null, poll: null });
  $('#wiki-filter').value = '';
  status('');
  await refreshList();
  drawMain();
}

async function refreshList() {
  const res = await api('GET', base());
  state.pages = res.pages;
  state.players = res.players;
  state.proposals = res.proposals ?? 0;
  state.aiRun = res.ai_run ?? null;
  drawReviewButton();
  drawList();
}

function drawReviewButton() {
  const b = $('#wiki-review');
  if (!b) return;
  b.textContent = state.proposals ? `The AI's changes (${state.proposals})` : "The AI's changes";
  b.classList.toggle('waiting', !!state.proposals);
  b.classList.toggle('current', state.view === 'review');
}

// ---------- the list ----------

function drawList() {
  const shown = state.pages.filter(matchesFilter);
  const kinds = new Map();
  for (const p of [...shown].sort((a, b) => a.title.localeCompare(b.title))) {
    const k = p.kind || 'Other';
    if (!kinds.has(k)) kinds.set(k, []);
    kinds.get(k).push(p);
  }
  const list = $('#wiki-list');
  if (!state.pages.length) {
    list.replaceChildren(h('p', { class: 'muted small' }, 'No pages yet. Pages are yours: players never see this tab, but Ask answers them from the parts you make available to them.'));
    return;
  }
  list.replaceChildren(...[
    ...[...kinds.keys()].sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b)).map((k) =>
      h('div', { class: 'wiki-group' },
        h('h3', { class: `fam-${fam(k === 'Other' ? '' : k)}` }, k),
        h('ul', {}, ...kinds.get(k).map((p) =>
          h('li', {}, h('button', {
            type: 'button',
            class: `wiki-row fam-${fam(p.kind)}${state.open?.page.id === p.id ? ' current' : ''}`,
            onclick: () => openPage(p.id),
          }, p.title, p.available === 'dm' ? null : h('span', { class: 'wiki-shared muted small', title: `Available to ${availableText(p.available)}` }, ' shared'))),
        )),
      ),
    ),
    shown.length ? null : h('p', { class: 'muted small' }, 'No page matches.'),
  ].filter(Boolean));
}

$('#wiki-filter')?.addEventListener('input', (e) => {
  state.filter = e.target.value;
  drawList();
  if (!state.open && state.view !== 'review') drawMain();
});

// ---------- the front page: every page as a card ----------

function card(p) {
  return h('button', { type: 'button', class: `wiki-card fam-${fam(p.kind)}`, onclick: () => openPage(p.id) },
    h('span', { class: `wiki-card-art${p.picture ? ' has-picture' : ''}` }, p.picture ? pictureImg(p.picture, { size: 'thumb' }) : null),
    h('span', { class: 'wiki-card-body' },
      kindBadge(p.kind),
      h('strong', { class: 'wiki-card-title' }, p.title),
      p.excerpt ? h('span', { class: 'wiki-card-excerpt' }, p.excerpt) : null,
      p.available === 'dm' ? null : h('span', { class: 'wiki-card-shared small' }, `Shared with ${availableText(p.available)}`),
    ),
  );
}

function drawHome() {
  const main = $('#wiki-main');
  if (!state.pages.length) {
    main.replaceChildren(h('div', { class: 'wiki-empty' },
      h('div', { class: 'wiki-empty-art', 'aria-hidden': 'true' }, '❦'),
      h('h2', {}, 'Your wiki'),
      h('p', {}, 'Write pages about your world: people, places, factions, secrets and plans, with pictures. Only you see this tab.'),
      h('p', { class: 'muted small' }, 'Each page and each section says who it\'s available to. When you ask a question, Ask uses all of it. When a player asks, Ask uses only the parts available to them.'),
      h('button', { type: 'button', class: 'primary', onclick: () => newPage() }, 'Make the first page'),
    ));
    return;
  }
  const families = new Map();
  const tags = new Map();
  for (const p of state.pages) {
    families.set(fam(p.kind), (families.get(fam(p.kind)) ?? 0) + 1);
    for (const t of p.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const shown = state.pages
    .filter((p) => matchesFilter(p) && (!state.kindFilter || fam(p.kind) === state.kindFilter) && (!state.tagFilter || p.tags.some((t) => wikiKey(t) === wikiKey(state.tagFilter))))
    .sort((a, b) => a.title.localeCompare(b.title));
  const chip = (label, on, onclick, cls = '') => h('button', { type: 'button', class: `wiki-chip${on ? ' on' : ''}${cls}`, 'aria-pressed': on ? 'true' : 'false', onclick }, label);
  const redraw = () => drawHome();
  main.replaceChildren(h('div', { class: 'wiki-home' },
    h('div', { class: 'wiki-home-head' },
      h('h2', {}, 'Your wiki'),
      h('span', { class: 'muted small' }, `${state.pages.length} page${state.pages.length === 1 ? '' : 's'}`),
    ),
    h('div', { class: 'wiki-chips', role: 'group', 'aria-label': 'Show kinds' },
      chip('All', !state.kindFilter, () => { state.kindFilter = null; redraw(); }),
      ...Object.keys(KIND_FAMILIES).filter((f) => families.has(f)).map((f) =>
        chip(`${KIND_FAMILIES[f].label} ${families.get(f)}`, state.kindFilter === f, () => { state.kindFilter = state.kindFilter === f ? null : f; redraw(); }, ` wiki-kind fam-${f}`)),
    ),
    tags.size ? h('div', { class: 'wiki-chips wiki-tags', role: 'group', 'aria-label': 'Show tags' },
      ...[...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16).map(([t]) =>
        chip(`#${t}`, wikiKey(state.tagFilter ?? '') === wikiKey(t), () => { state.tagFilter = wikiKey(state.tagFilter ?? '') === wikiKey(t) ? null : t; redraw(); }))) : null,
    shown.length ? h('div', { class: 'wiki-cards' }, ...shown.map(card)) : h('p', { class: 'muted' }, 'No page matches.'),
  ));
}

// ---------- one page ----------

async function openPage(id, { view = 'page' } = {}) {
  hidePreview();
  try {
    await state.guarded(async () => {
      state.open = await api('GET', `${base()}/${id}`);
      state.view = view;
      state.as = null;
      drawList();
      drawMain();
      $('#wiki-main')?.scrollIntoView?.({ block: 'start' });
    });
  } catch (err) {
    report(err);
  }
}

/** On a phone the list and the page take turns: a page open hides the list, and "Pages" brings it back. */
function phoneBack() {
  return h('button', { type: 'button', class: 'ghost wiki-back', onclick: () => {
    state.open = null;
    state.view = 'page';
    drawList();
    drawMain();
  } }, '← Pages');
}

function drawMain() {
  const main = $('#wiki-main');
  hidePreview();
  const reading = !!state.open || state.view === 'review';
  $('#tab-wiki').classList.toggle('wiki-reading', reading);
  drawReviewButton();
  if (state.view === 'review') return drawReview();
  if (reading) queueMicrotask(() => main.prepend(phoneBack()));
  if (!state.open) return drawHome();
  if (state.view === 'edit') return main.replaceChildren(editor(state.open.page));
  if (state.view === 'history') return drawHistory();
  main.replaceChildren(pageView());
}

function pageView() {
  const { page, mentioned_in: mentioned = [], unknown_names: unknown = [] } = state.open;
  const parent = page.parent && state.pages.find((p) => p.id === page.parent);
  const viewAs = h('select', { 'aria-label': 'View as', title: 'See this page as a player would get it in Ask' },
    h('option', { value: '' }, 'As you see it'),
    ...state.players.map((p) => h('option', { value: String(p.id) }, `As ${p.character_name || p.name} would get it`)),
  );
  const content = h('div', { class: 'wiki-content' }, ...pageContent(page, { dm: true }));
  viewAs.addEventListener('change', async () => {
    const as = viewAs.value ? Number(viewAs.value) : null;
    if (as == null) return content.replaceChildren(...pageContent(page, { dm: true }));
    try {
      const res = await state.guarded(() => api('GET', `${base()}/${page.id}?as=${as}`));
      content.replaceChildren(...(res.page
        ? [h('p', { class: 'wiki-as muted small' }, `What Ask can tell ${playerName(as)} from this page:`), ...pageContent(res.page, { dm: false })]
        : [h('p', { class: 'wiki-as muted' }, `Nothing on this page is available to ${playerName(as)}.`)]));
    } catch (err) {
      report(err);
    }
  });
  return h('article', { class: `wiki-page fam-${fam(page.kind)}` },
    hero(page),
    h('div', { class: 'wiki-page-head' },
      h('p', { class: 'wiki-meta muted small' },
        [page.kind, parent && `in ${parent.title}`, page.aliases.length && `also called ${page.aliases.join(', ')}`, page.tags.length && `tags: ${page.tags.join(', ')}`].filter(Boolean).join(' · '),
      ),
      h('div', { class: 'wiki-actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => { state.view = 'edit'; drawMain(); } }, 'Edit'),
        h('button', { type: 'button', class: 'ghost', onclick: () => { state.view = 'history'; drawMain(); } }, 'History'),
        viewAs,
        h('button', { type: 'button', class: 'ghost danger', onclick: () => removePage(page) }, 'Delete'),
      ),
    ),
    h('p', { class: 'wiki-available small' }, `Available to ${availableText(page.available)}.`),
    unknown.length ? h('p', { class: 'wiki-warn small' }, `No player is called ${unknown.map((n) => `"${n}"`).join(', ')}, so those blocks stay with you.`) : null,
    content,
    mentioned.length ? h('p', { class: 'wiki-mentioned muted small' }, 'Mentioned in: ', ...mentioned.flatMap((m, i) => [i ? ', ' : null, pageLink(m.title, m.title)])) : null,
  );
}

async function removePage(page) {
  if (!confirm(`Delete "${page.title}"? Pages inside it move up a level. Every version stays in the archive.`)) return;
  try {
    await state.guarded(() => api('DELETE', `${base()}/${page.id}`));
    state.open = null;
    await refreshList();
    drawMain();
    status(`Deleted "${page.title}".`);
  } catch (err) {
    report(err);
  }
}

function newPage(title = '') {
  state.open = { page: { id: null, title, aliases: [], kind: '', parent: null, tags: [], available: 'dm', sections: [], picture: null, banner: null, gallery: [], facts: [] } };
  state.view = 'edit';
  drawList();
  drawMain();
}

$('#wiki-new')?.addEventListener('click', () => newPage());

// ---------- history ----------

async function drawHistory() {
  const { page } = state.open;
  const main = $('#wiki-main');
  const back = h('button', { type: 'button', class: 'ghost', onclick: () => { state.view = 'page'; drawMain(); } }, 'Back to the page');
  const preview = h('div', { class: 'wiki-body' });
  main.replaceChildren(h('article', { class: 'wiki-page' },
    h('div', { class: 'wiki-page-head' }, h('h2', {}, `History of ${page.title}`), h('div', { class: 'wiki-actions' }, back)),
    h('p', { class: 'muted small' }, 'Loading…'),
    preview,
  ));
  try {
    const { versions } = await state.guarded(() => api('GET', `${base()}/${page.id}/history`));
    const when = (v) => new Date(v.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    main.querySelector('p').replaceWith(h('ol', { class: 'wiki-history' }, ...versions.map((v) =>
      h('li', {},
        h('button', { type: 'button', class: 'link', onclick: () => showVersion(v.version, preview) }, `Version ${v.version}`),
        h('span', { class: 'muted small' }, ` ${when(v)}${v.title !== page.title ? ` (called "${v.title}")` : ''}${v.version === page.version ? ' · current' : ''}`),
      ))));
  } catch (err) {
    report(err);
  }
}

async function showVersion(version, box) {
  const { page } = state.open;
  try {
    const old = (await state.guarded(() => api('GET', `${base()}/${page.id}/history/${version}`))).page;
    box.replaceChildren(
      h('div', { class: 'wiki-page-head' },
        h('h3', {}, `Version ${version}: ${old.title}`),
        version === page.version ? null : h('button', { type: 'button', class: 'primary', onclick: async () => {
          try {
            await state.guarded(async () => {
              state.open = await api('POST', `${base()}/${page.id}/restore`, { version });
              state.view = 'page';
              await refreshList();
              drawMain();
              status(`Brought back version ${version}.`);
            });
          } catch (err) {
            report(err);
          }
        } }, 'Bring this version back'),
      ),
      ...pageContent({ picture: null, banner: null, gallery: [], facts: [], ...old }, { dm: true }),
    );
  } catch (err) {
    report(err);
  }
}

// ---------- the AI's changes ----------

$('#wiki-review')?.addEventListener('click', () => {
  state.open = null;
  state.view = 'review';
  drawList();
  drawMain();
});

Object.assign(nav, { openPage, newPage, drawMain, drawList, refreshList, drawReviewButton, phoneBack });
