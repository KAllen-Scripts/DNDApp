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
import { wikiKey, KIND_FAMILIES, isPrepPage } from './shared/wiki.js';
import { state, nav, base, status, report, availableText, playerName, pictureImg, clearPictures, fam, kindBadge, matchesFilter } from './wiki-data.js';
import { pageLink, hidePreview, hero, pageContent, editor } from './wiki-page.js';
import { drawReview } from './wiki-waiting.js';
import { resetSpace } from './wiki-space.js';
import { drawWebView, leaveWeb } from './wiki-web.js';
import { drawTimeline, leaveTimeline } from './wiki-timeline.js';
import { drawTemplates, saveAsTemplate } from './wiki-templates.js';
import { drawQuests } from './wiki-quests.js';
import { drawKnows } from './wiki-knows.js';
import { drawTidy } from './wiki-tidy.js';
import { drawTransfer, printPages } from './wiki-transfer.js';
import { openSaveList } from './wiki-lists.js';
import { linkHints } from './wiki-write.js';
import { drawWheel } from './wiki-wheel.js';
import { drawHub } from './wiki-home.js';
import { pageDiff } from './wiki-diff.js';
import { drawCompass } from './wiki-compass.js';
import { drawOnMap } from './wiki-onmap.js';
import { drawAtlas, leaveAtlas, pickAtlasMap } from './wiki-atlas.js';
import './wiki-handout.js';
import { drawFromSheet } from './wiki-sheet.js';
import { drawLore } from './wiki-lore.js';
import { prepBoard } from './wiki-prep.js';

const $ = (sel) => document.querySelector(sel);

export async function loadWiki({ campaignId, guarded, isDm = true, userId = null }) {
  clearTimeout(state.poll);
  clearPictures();
  resetSpace();
  // A player reads their own version (stage 6a): everything is drawn as them, and the DM's tools are left out.
  Object.assign(state, { campaignId, guarded, dm: isDm, me: userId, pages: [], players: [], filter: '', kindFilter: null, kindKey: null, tagFilter: null, open: null, view: 'page', as: isDm ? null : userId, proposals: 0, aiRun: null, poll: null });
  $('#tab-wiki')?.toggleAttribute('data-player', !isDm);
  for (const id of ['#wiki-new', '#wiki-review', '#wiki-truth']) if ($(id)) $(id).hidden = !isDm;
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
  state.calendar = res.calendar ?? null;
  state.clock = res.clock ?? 0;
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
    list.replaceChildren(h('p', { class: 'muted small' }, state.dm ? 'No pages yet. Pages are yours: players see only the parts you make available to them, here and in Ask.' : 'No pages yet.'));
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
      h('h2', {}, state.dm ? 'Your wiki' : 'The wiki'),
      ...(state.dm ? [
        h('p', {}, 'Write pages about your world: people, places, factions, secrets and plans, with pictures. Players see only the parts you make available to them.'),
        h('p', { class: 'muted small' }, 'Each page and each section says who it\'s available to. When you ask a question, Ask uses all of it. When a player asks, Ask uses only the parts available to them.'),
        h('button', { type: 'button', class: 'primary', onclick: () => newPage() }, 'Make the first page'),
      ] : [h('p', {}, 'Nothing here is available to you yet. As the DM shares pages about the world, they show here.')]),
    ));
    return;
  }
  const hub = h('div', { class: 'wiki-hub' });
  const grid = h('div', { class: 'wiki-home' });
  const redraw = () => grid.replaceChildren(...cardGrid(redraw));
  redraw();
  main.replaceChildren(hub, grid);
  drawHub(hub);
}

/** The Wheel: the families round the party, then the picked family's kinds and pages. */
async function drawWheelView() {
  const main = $('#wiki-main');
  const box = h('div', { class: 'wiki-wheel-view' }, h('p', { class: 'muted small' }, 'Loading…'));
  main.replaceChildren(box);
  let data;
  try {
    data = await state.guarded(() => api('GET', `${base()}/wheel`));
  } catch (err) {
    return report(err);
  }
  if (state.view !== 'wheel' || !box.isConnected) return;
  const redraw = () => {
    const family = data.families.find((f) => f.family === state.kindFilter);
    box.replaceChildren(
      h('div', { class: 'wiki-wheel-box' },
        drawWheel({ campaignId: state.campaignId, families: data.families, party: data.party, selected: state.kindFilter, onPick: (f) => {
          state.kindFilter = f;
          state.kindKey = null;
          nav.routed();
          redraw();
        } }),
        h('div', { class: 'wiki-wheel-side' },
          h('h2', {}, family ? `${family.icon} ${family.label}` : 'What is in your world'),
          h('p', { class: 'muted small' }, family ? `${family.count} page${family.count === 1 ? '' : 's'}` : 'Pick a slice to see its kinds and pages.'),
          family ? h('div', { class: 'wiki-chips', role: 'group', 'aria-label': 'Kinds' },
            ...family.kinds.map((k) => {
              const key = wikiKey(k.kind);
              const on = state.kindKey === key;
              return h('button', { type: 'button', class: `wiki-chip wiki-kind fam-${family.family}${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => { state.kindKey = on ? null : key; redraw(); } }, `${k.kind || 'no kind'} ${k.count}`);
            })) : null,
          // The filter shown, saved as a list on the Home (stage 8a).
          state.dm ? h('button', { type: 'button', class: 'ghost small wiki-save-list', onclick: () => openSaveList({ family: state.kindFilter, kind: family?.kinds.find((k) => wikiKey(k.kind) === state.kindKey)?.kind, tag: state.tagFilter }) }, '☰ Save as a list') : null,
        ),
      ),
      h('div', { class: 'wiki-home' }, ...cardGrid(redraw)),
    );
  };
  redraw();
}

/** Every page as a card, with chips to show one family or one tag (on the Home and under the Wheel). */
function cardGrid(redraw) {
  const families = new Map();
  const tags = new Map();
  for (const p of state.pages) {
    families.set(fam(p.kind), (families.get(fam(p.kind)) ?? 0) + 1);
    for (const t of p.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const shown = state.pages
    .filter((p) => matchesFilter(p) && (!state.kindFilter || fam(p.kind) === state.kindFilter) && (!state.kindKey || wikiKey(p.kind ?? '') === state.kindKey) && (!state.tagFilter || p.tags.some((t) => wikiKey(t) === wikiKey(state.tagFilter))))
    .sort((a, b) => a.title.localeCompare(b.title));
  const chip = (label, on, onclick, cls = '') => h('button', { type: 'button', class: `wiki-chip${on ? ' on' : ''}${cls}`, 'aria-pressed': on ? 'true' : 'false', onclick }, label);
  const pickFamily = (f) => {
    state.kindFilter = f;
    state.kindKey = null;
    nav.routed();
    redraw();
  };
  return [
    h('div', { class: 'wiki-home-head' },
      h('h2', {}, 'Your wiki'),
      h('span', { class: 'muted small' }, `${state.pages.length} page${state.pages.length === 1 ? '' : 's'}`),
    ),
    h('div', { class: 'wiki-chips', role: 'group', 'aria-label': 'Show kinds' },
      chip('All', !state.kindFilter, () => pickFamily(null)),
      ...Object.keys(KIND_FAMILIES).filter((f) => families.has(f)).map((f) =>
        chip(`${KIND_FAMILIES[f].label} ${families.get(f)}`, state.kindFilter === f, () => pickFamily(state.kindFilter === f ? null : f), ` wiki-kind fam-${f}`)),
    ),
    tags.size ? h('div', { class: 'wiki-chips wiki-tags', role: 'group', 'aria-label': 'Show tags' },
      ...[...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16).map(([t]) =>
        chip(`#${t}`, wikiKey(state.tagFilter ?? '') === wikiKey(t), () => { state.tagFilter = wikiKey(state.tagFilter ?? '') === wikiKey(t) ? null : t; redraw(); }))) : null,
    shown.length ? h('div', { class: 'wiki-cards' }, ...shown.map(card)) : h('p', { class: 'muted' }, 'No page matches.'),
  ].filter(Boolean);
}

// ---------- one page ----------

async function openPage(id, { view = 'page' } = {}) {
  hidePreview();
  try {
    await state.guarded(async () => {
      state.open = await api('GET', `${base()}/${id}`);
      state.view = state.dm ? view : 'page';
      state.as = state.dm ? null : state.me;
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
  const reading = !!state.open || state.view === 'review' || state.view === 'wheel' || state.view === 'atlas' || state.view === 'web' || state.view === 'timeline' || state.view === 'templates' || state.view === 'quests' || state.view === 'knows' || state.view === 'tidy' || state.view === 'import';
  $('#wiki-view').classList.toggle('wiki-reading', reading);
  drawReviewButton();
  if (state.view !== 'atlas') leaveAtlas();
  else pickAtlasMap();
  nav.routed();
  if (state.view !== 'web') leaveWeb();
  if (state.view !== 'timeline') leaveTimeline();
  if (state.view === 'atlas') return drawAtlas(main);
  if (state.view === 'web') return drawWebView(main);
  if (state.view === 'timeline') return drawTimeline(main);
  if (state.view === 'templates') return drawTemplates(main);
  if (state.view === 'quests') return drawQuests(main);
  if (state.view === 'knows') return drawKnows(main);
  if (state.view === 'tidy') return drawTidy(main);
  if (state.view === 'import') return drawTransfer(main);
  if (state.view === 'review') return drawReview();
  if (state.view === 'wheel') return drawWheelView();
  if (reading) queueMicrotask(() => main.prepend(phoneBack()));
  if (!state.open) return drawHome();
  if (state.open.page.template) state.view = 'edit'; // a template is only ever edited
  if (!state.dm) state.view = 'page'; // a player only reads
  if (state.view === 'edit') return main.replaceChildren(editor(state.open.page));
  if (state.view === 'history') return drawHistory();
  const article = pageView();
  main.replaceChildren(article);
  if (state.dm) linkHints(article, state.open.page);
}

function pageView() {
  const { page, mentioned_in: mentioned = [], unknown_names: unknown = [], on_maps: onMaps = [], from_sheet: fromSheet = null, embeds = {} } = state.open;
  const parent = page.parent && state.pages.find((p) => p.id === page.parent);
  // A player reads the page as the server gave it to them: no tools, nothing about who else it's for.
  if (!state.dm) {
    return h('article', { class: `wiki-page fam-${fam(page.kind)}` },
      hero(page),
      drawCompass(page, { onMaps: [] }),
      h('div', { class: 'wiki-page-head' }, h('p', { class: 'wiki-meta muted small' }, [page.kind, parent && `in ${parent.title}`].filter(Boolean).join(' · ')),
        h('div', { class: 'wiki-actions' }, h('button', { type: 'button', class: 'ghost', title: 'Print this page, or save it as a PDF', onclick: () => printPages([page.id]) }, 'Print'))),
      drawFromSheet(fromSheet, page),
      drawLore(page),
      h('div', { class: 'wiki-content' }, ...pageContent(page, { dm: false, me: state.me, embeds })),
      mentioned.length ? h('p', { class: 'wiki-mentioned muted small' }, 'Mentioned in: ', ...mentioned.flatMap((m, i) => [i ? ', ' : null, pageLink(m.title, m.title)])) : null,
    );
  }
  const viewAs = h('select', { 'aria-label': 'View as', title: 'See this page as a player would get it in Ask' },
    h('option', { value: '' }, 'As you see it'),
    ...state.players.map((p) => h('option', { value: String(p.id) }, `As ${p.character_name || p.name} would get it`)),
  );
  const content = h('div', { class: 'wiki-content' }, ...[drawFromSheet(fromSheet, page), ...pageContent(page, { dm: true, embeds })].filter(Boolean));
  viewAs.addEventListener('change', async () => {
    const as = viewAs.value ? Number(viewAs.value) : null;
    if (as == null) return content.replaceChildren(...[drawFromSheet(fromSheet, page), ...pageContent(page, { dm: true, embeds })].filter(Boolean));
    try {
      const res = await state.guarded(() => api('GET', `${base()}/${page.id}?as=${as}`));
      content.replaceChildren(...(res.page
        ? [h('p', { class: 'wiki-as muted small' }, `What ${playerName(as)} gets from this page:`), drawFromSheet(res.from_sheet && { ...res.from_sheet, mine: false }, res.page), ...pageContent(res.page, { dm: false, me: as, embeds: res.embeds })].filter(Boolean)
        : [h('p', { class: 'wiki-as muted' }, `Nothing on this page is available to ${playerName(as)}.`)]));
    } catch (err) {
      report(err);
    }
  });
  return h('article', { class: `wiki-page fam-${fam(page.kind)}` },
    hero(page),
    drawCompass(page, { onMaps }),
    h('div', { class: 'wiki-page-head' },
      h('p', { class: 'wiki-meta muted small' },
        [page.kind, parent && `in ${parent.title}`, page.aliases.length && `also called ${page.aliases.join(', ')}`, page.tags.length && `tags: ${page.tags.join(', ')}`].filter(Boolean).join(' · '),
      ),
      h('div', { class: 'wiki-actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => { state.view = 'edit'; drawMain(); } }, 'Edit'),
        h('button', { type: 'button', class: 'ghost', onclick: () => { state.view = 'history'; drawMain(); } }, 'History'),
        viewAs,
        // A prep page (stage 7b): its pages and clues as cards.
        isPrepPage(page) ? h('button', { type: 'button', class: 'ghost', 'aria-pressed': 'false', onclick: (e) => {
          const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
          e.currentTarget.setAttribute('aria-pressed', String(on));
          const article = e.currentTarget.closest('article');
          article.querySelector('.wiki-prep-board')?.remove();
          if (on) article.querySelector('.wiki-content').before(prepBoard(page));
        } }, 'Prep board') : null,
        h('button', { type: 'button', class: 'ghost', title: 'Print this page, or save it as a PDF', onclick: () => printPages([page.id]) }, 'Print'),
        h('button', { type: 'button', class: 'ghost', title: 'Start a template from this page\'s kind, sections and facts', onclick: () => saveAsTemplate(page) }, 'Save as a template'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => removePage(page) }, 'Delete'),
      ),
    ),
    h('p', { class: 'wiki-available small' }, `Available to ${availableText(page.available)}.`),
    unknown.length ? h('p', { class: 'wiki-warn small' }, `No player is called ${unknown.map((n) => `"${n}"`).join(', ')}, so those blocks stay with you.`) : null,
    content,
    drawOnMap(page, onMaps, { reload: () => nav.openPage(page.id) }),
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
    const get = (v) => state.guarded(() => api('GET', `${base()}/${page.id}/history/${v}`)).then((r) => r.page);
    const [old, before] = await Promise.all([get(version), version > 1 ? get(version - 1) : null]);
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
      diffView(pageDiff(before, old), version),
      ...pageContent({ picture: null, banner: null, gallery: [], facts: [], ...old }, { dm: true }),
    );
  } catch (err) {
    report(err);
  }
}

/** What changed in a version, against the one before: sections and facts, with words added and taken out marked. */
function diffView(diff, version) {
  const runs = (list) => list.map((r) => (r.op === 'same' ? r.text : h(r.op === 'add' ? 'ins' : 'del', {}, r.text)));
  const items = [
    diff.title ? h('li', {}, h('strong', {}, 'Title: '), ...runs(diff.title)) : null,
    ...diff.facts.map((f) => h('li', { class: `wiki-diff-${f.state}` }, h('strong', {}, `${f.label || 'Fact'} (${f.state}): `), ...runs(f.runs))),
    ...diff.sections.map((s) => h('li', { class: `wiki-diff-${s.state}` },
      h('strong', {}, ...runs(s.heading_runs.length ? s.heading_runs : [{ op: 'same', text: 'Opening' }]), ` (${s.state})`),
      h('div', { class: 'wiki-diff-text' }, ...runs(s.runs)))),
  ].filter(Boolean);
  return h('details', { class: 'wiki-diff', open: true },
    h('summary', {}, version === 1 ? 'The first version' : `What changed from version ${version - 1}`),
    items.length ? h('ul', {}, ...items) : h('p', { class: 'muted small' }, 'Nothing in the text or facts (pictures or who it\'s available to may have changed).'));
}

// ---------- the AI's changes ----------

$('#wiki-review')?.addEventListener('click', () => {
  state.open = null;
  state.view = 'review';
  drawList();
  drawMain();
});

Object.assign(nav, { openPage, newPage, drawMain, drawList, refreshList, drawReviewButton, phoneBack });
