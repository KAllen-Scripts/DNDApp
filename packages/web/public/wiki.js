/**
 * The Wiki tab (the DM's): pages about the campaign's world that only the DM
 * writes. Each page, section and block says who it's available to; players
 * never see the tab, but Ask answers them from the parts available to them
 * (the server filters it). View as… shows a page the way a player would get it.
 *
 * Text is Markdown, plus [[Page name]] links and `:::for Thorin` / `:::dm`
 * blocks (shared/wiki.js, which the server uses too).
 *
 * The AI's changes (after each session, or when the DM asks) wait in a list
 * for the DM: approve, edit then approve, or reject each one.
 */
import { api, h, LoggedOut, note } from './api.js';
import { markdownFragment } from './markdown.js';
import { wikiPieces, wikiKey, LINK_RE } from './shared/wiki.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  pages: [],
  players: [],
  filter: '',
  open: null, // { page, mentioned_in, unknown_names } of the page shown
  view: 'page', // 'page' | 'edit' | 'history' | 'review'
  as: null, // a player's id while viewing as them
  proposals: 0, // how many of the AI's changes wait for the DM
  aiRun: null, // the AI's last run for the wiki: { status, message, finished_at }
  poll: null,
};

const base = () => `/campaigns/${state.campaignId}/wiki`;
const status = (text, error = false) => note($('#wiki-status'), text, error);
const report = (err) => {
  if (err instanceof LoggedOut) throw err;
  status(err.message, true);
};
const playerName = (id) => {
  const p = state.players.find((x) => x.id === id);
  return p ? p.character_name || p.name : `player ${id}`;
};

/** Who something is available to, in words. */
function availableText(a, { section = false } = {}) {
  if (a === 'all') return section ? 'as the page' : 'everyone';
  if (a === 'dm' || !a.length) return 'only you';
  return a.map(playerName).join(', ');
}

/** The DM enters a campaign. */
export async function loadWiki({ campaignId, guarded }) {
  clearTimeout(state.poll);
  Object.assign(state, { campaignId, guarded, pages: [], players: [], filter: '', open: null, view: 'page', as: null, proposals: 0, aiRun: null, poll: null });
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

const byName = (name) => {
  const key = wikiKey(name);
  return state.pages.find((p) => [p.title, ...p.aliases].some((n) => wikiKey(n) === key));
};

// ---------- the list ----------

function drawList() {
  const f = wikiKey(state.filter);
  const shown = state.pages.filter((p) => !f || [p.title, ...p.aliases, p.kind, ...p.tags].some((n) => wikiKey(n).includes(f)));
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
        h('h3', {}, k),
        h('ul', {}, ...kinds.get(k).map((p) =>
          h('li', {}, h('button', {
            type: 'button',
            class: `wiki-row${state.open?.page.id === p.id ? ' current' : ''}`,
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
});

// ---------- one page ----------

async function openPage(id, { view = 'page' } = {}) {
  try {
    await state.guarded(async () => {
      state.open = await api('GET', `${base()}/${id}`);
      state.view = view;
      state.as = null;
      drawList();
      drawMain();
    });
  } catch (err) {
    report(err);
  }
}

/** Markdown with [[links]] as buttons that open the page (or offer to make it). */
function richText(text) {
  const targets = [];
  const marked = text.replace(LINK_RE, (_, name, shown) => {
    targets.push(name.trim());
    return `<span class="wiki-link">${escapeHtml((shown ?? name).trim())}</span>`;
  });
  const box = h('div', { class: 'wiki-text' });
  box.append(markdownFragment(marked));
  box.querySelectorAll('span.wiki-link').forEach((span, i) => {
    const name = targets[i];
    const page = name && byName(name);
    span.replaceWith(h('button', {
      type: 'button',
      class: `link wiki-link${page ? '' : ' missing'}`,
      title: page ? `Open ${page.title}` : `No page called "${name}" yet: click to make it`,
      onclick: () => (page ? openPage(page.id) : newPage(name)),
    }, span.textContent));
  });
  return box;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A section's text: plain parts as they are, blocks in a box that says who they're for. */
function sectionBody(text) {
  return wikiPieces(text).map((p) => {
    if (!p.block) return richText(p.text);
    const who = p.block.dm ? 'Only you' : `Only for ${p.block.names.join(', ') || 'nobody yet'}`;
    return h('div', { class: 'wiki-block' }, h('div', { class: 'wiki-block-label muted small' }, who), richText(p.text));
  });
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
  const reading = !!state.open || state.view === 'review';
  $('#tab-wiki').classList.toggle('wiki-reading', reading);
  drawReviewButton();
  if (state.view === 'review') return drawReview();
  if (reading) queueMicrotask(() => main.prepend(phoneBack()));
  if (!state.open) {
    main.replaceChildren(h('div', { class: 'wiki-empty' },
      h('h2', {}, 'Your wiki'),
      h('p', {}, 'Write pages about your world: people, places, factions, secrets and plans. Only you see this tab.'),
      h('p', { class: 'muted small' }, 'Each page and each section says who it\'s available to. When you ask a question, Ask uses all of it. When a player asks, Ask uses only the parts available to them.'),
    ));
    return;
  }
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
  const body = h('div', { class: 'wiki-body' }, ...sections(page, { dm: true }));
  viewAs.addEventListener('change', async () => {
    const as = viewAs.value ? Number(viewAs.value) : null;
    if (as == null) return body.replaceChildren(...sections(page, { dm: true }));
    try {
      const res = await state.guarded(() => api('GET', `${base()}/${page.id}?as=${as}`));
      body.replaceChildren(...(res.page
        ? [h('p', { class: 'wiki-as muted small' }, `What Ask can tell ${playerName(as)} from this page:`), ...sections(res.page, { dm: false })]
        : [h('p', { class: 'wiki-as muted' }, `Nothing on this page is available to ${playerName(as)}.`)]));
    } catch (err) {
      report(err);
    }
  });
  return h('article', { class: 'wiki-page' },
    h('div', { class: 'wiki-page-head' },
      h('h2', {}, page.title),
      h('div', { class: 'wiki-actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => { state.view = 'edit'; drawMain(); } }, 'Edit'),
        h('button', { type: 'button', class: 'ghost', onclick: () => { state.view = 'history'; drawMain(); } }, 'History'),
        viewAs,
        h('button', { type: 'button', class: 'ghost danger', onclick: () => removePage(page) }, 'Delete'),
      ),
    ),
    h('p', { class: 'wiki-meta muted small' },
      [page.kind, parent && `in ${parent.title}`, page.aliases.length && `also called ${page.aliases.join(', ')}`, page.tags.length && `tags: ${page.tags.join(', ')}`].filter(Boolean).join(' · '),
    ),
    h('p', { class: 'wiki-available small' }, `Available to ${availableText(page.available)}.`),
    unknown.length ? h('p', { class: 'wiki-warn small' }, `No player is called ${unknown.map((n) => `"${n}"`).join(', ')}, so those blocks stay with you.`) : null,
    body,
    mentioned.length ? h('p', { class: 'wiki-mentioned muted small' }, 'Mentioned in: ', ...mentioned.flatMap((m, i) => [i ? ', ' : null, h('button', { type: 'button', class: 'link', onclick: () => openPage(m.id) }, m.title)])) : null,
  );
}

function sections(page, { dm }) {
  if (!page.sections.length) return [h('p', { class: 'muted' }, 'This page is empty. Press Edit to write it.')];
  return page.sections.map((s) => h('section', { class: 'wiki-section' },
    s.heading ? h('h3', {}, s.heading) : null,
    dm && s.by === 'ai' ? h('p', { class: 'wiki-by-ai muted small' }, 'Written by the AI. It keeps this section up to date (with your approval) until you change it.') : null,
    dm && s.available !== 'all' ? h('p', { class: 'wiki-available small' }, `Available to ${availableText(s.available, { section: true })}.`) : null,
    ...(dm ? sectionBody(s.text) : [richText(s.text)]),
  ));
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

// ---------- making and editing ----------

/** A "who is it available to" picker: { el, value() }. */
function availablePicker(value, { section = false, label }) {
  const mode = h('select', { 'aria-label': label },
    section ? h('option', { value: 'all' }, 'Same as the page') : h('option', { value: 'dm' }, 'Only me'),
    section ? h('option', { value: 'dm' }, 'Only me') : h('option', { value: 'all' }, 'Everyone'),
    h('option', { value: 'some' }, 'Chosen players'),
  );
  mode.value = Array.isArray(value) ? 'some' : value;
  const boxes = state.players.map((p) => h('label', {}, h('input', { type: 'checkbox', value: String(p.id), checked: Array.isArray(value) && value.includes(p.id) }), ` ${p.character_name || p.name}`));
  const who = h('span', { class: 'wiki-who', hidden: mode.value !== 'some' }, ...(boxes.length ? boxes : [h('span', { class: 'muted small' }, 'No players in this campaign yet.')]));
  mode.addEventListener('change', () => { who.hidden = mode.value !== 'some'; });
  return {
    el: h('span', { class: 'wiki-picker' }, mode, who),
    value: () => (mode.value === 'some' ? boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => Number(i.value)) : mode.value),
  };
}

const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

function editor(page) {
  const isNew = !page.id;
  const title = h('input', { value: page.title, maxLength: 200, required: true, 'aria-label': 'Title' });
  const kinds = [...new Set(state.pages.map((p) => p.kind).filter(Boolean))].sort();
  const kind = h('input', { value: page.kind, maxLength: 60, list: 'wiki-kinds', placeholder: 'npc, place, faction, lore…', 'aria-label': 'Kind' });
  const kindList = h('datalist', { id: 'wiki-kinds' }, ...kinds.map((k) => h('option', { value: k })));
  const aliases = h('input', { value: page.aliases.join(', '), placeholder: 'Other names and spellings, with commas', 'aria-label': 'Other names' });
  const tags = h('input', { value: page.tags.join(', '), placeholder: 'With commas', 'aria-label': 'Tags' });
  const parent = h('select', { 'aria-label': 'Inside' },
    h('option', { value: '' }, '(top level)'),
    ...state.pages.filter((p) => p.id !== page.id).sort((a, b) => a.title.localeCompare(b.title)).map((p) => h('option', { value: p.id, selected: p.id === page.parent }, p.title)),
  );
  const available = availablePicker(page.available, { label: 'Page available to' });
  const list = h('div', { class: 'wiki-edit-sections' });
  const rows = [];

  const addSection = (s = { heading: '', text: '', available: 'all' }) => {
    const heading = h('input', { value: s.heading, maxLength: 200, placeholder: 'Heading (optional)', 'aria-label': 'Section heading' });
    const text = h('textarea', { rows: 8, 'aria-label': 'Section text', placeholder: 'Markdown. [[Page name]] links a page. A block between ":::for Thorin" and ":::" is only for Thorin; ":::dm" is only for you.' });
    text.value = s.text;
    const picker = availablePicker(s.available, { section: true, label: 'Section available to' });
    const row = { id: s.id, heading, text, picker };
    const move = (d) => {
      const i = rows.indexOf(row);
      const j = i + d;
      if (j < 0 || j >= rows.length) return;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      list.replaceChildren(...rows.map((r) => r.el));
    };
    row.el = h('div', { class: 'wiki-edit-section card' },
      h('div', { class: 'wiki-edit-row' }, heading,
        h('button', { type: 'button', class: 'ghost icon-btn', title: 'Move up', 'aria-label': 'Move section up', onclick: () => move(-1) }, '↑'),
        h('button', { type: 'button', class: 'ghost icon-btn', title: 'Move down', 'aria-label': 'Move section down', onclick: () => move(1) }, '↓'),
        h('button', { type: 'button', class: 'ghost icon-btn danger', title: 'Remove this section', 'aria-label': 'Remove section', onclick: () => {
          if ((text.value.trim() || heading.value.trim()) && !confirm('Remove this section? (Earlier versions stay in the history.)')) return;
          rows.splice(rows.indexOf(row), 1);
          row.el.remove();
        } }, '✕'),
      ),
      h('label', { class: 'small' }, 'Available to ', picker.el),
      text,
    );
    rows.push(row);
    list.append(row.el);
  };
  for (const s of page.sections) addSection(s);
  if (!page.sections.length) addSection();

  const save = h('button', { type: 'submit', class: 'primary' }, isNew ? 'Make page' : 'Save');
  const form = h('form', { class: 'wiki-editor' },
    h('h2', {}, isNew ? 'New page' : `Editing ${page.title}`),
    h('div', { class: 'wiki-edit-grid' },
      h('label', {}, 'Title', title),
      h('label', {}, 'Kind', kind, kindList),
      h('label', {}, 'Other names', aliases),
      h('label', {}, 'Inside', parent),
      h('label', {}, 'Tags', tags),
      h('label', {}, 'Page available to', available.el),
    ),
    h('p', { class: 'muted small' }, 'A new page is only yours until you choose otherwise. Each section and block can narrow it further, never widen it. Other names are never shown to players.'),
    list,
    h('div', { class: 'wiki-edit-foot' },
      h('button', { type: 'button', class: 'ghost', onclick: () => addSection() }, '+ Add section'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'ghost', onclick: () => {
        if (isNew) state.open = null;
        state.view = 'page';
        drawMain();
      } }, 'Cancel'),
      save,
    ),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: title.value.trim(),
      kind: kind.value.trim(),
      aliases: splitList(aliases.value),
      tags: splitList(tags.value),
      parent: parent.value || null,
      available: available.value(),
      sections: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), heading: r.heading.value.trim(), text: r.text.value, available: r.picker.value() })),
    };
    save.disabled = true;
    try {
      await state.guarded(async () => {
        const res = isNew ? await api('POST', base(), body) : await api('PUT', `${base()}/${page.id}`, { ...body, version: page.version });
        await refreshList();
        state.open = isNew ? await api('GET', `${base()}/${res.page.id}`) : res;
        state.view = 'page';
        drawList();
        drawMain();
        status(isNew ? `Made "${res.page.title}".` : 'Saved.');
      });
    } catch (err) {
      report(err);
    } finally {
      save.disabled = false;
    }
  });
  queueMicrotask(() => title.focus());
  return form;
}

function newPage(title = '') {
  state.open = { page: { id: null, title, aliases: [], kind: '', parent: null, tags: [], available: 'dm', sections: [] } };
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
      ...sections(old, { dm: true }),
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

const busy = (run) => run && (run.status === 'queued' || run.status === 'running');

/** While the AI is reading, look again every few seconds (only while the list is open). */
function pollWhileBusy() {
  clearTimeout(state.poll);
  if (!busy(state.aiRun)) return;
  state.poll = setTimeout(async () => {
    if (state.view !== 'review') return;
    try {
      await state.guarded(() => refreshList());
      drawReview();
    } catch (err) {
      report(err);
    }
  }, 3000);
}

function runLine() {
  const run = state.aiRun;
  if (!run) return "The AI hasn't read the records for the wiki yet.";
  if (busy(run)) return `The AI is reading the records… ${run.message ?? ''}`.trim();
  if (run.status === 'failed') return `The AI's last read failed: ${run.error ?? 'unknown error'}`;
  const when = run.finished_at ? new Date(`${run.finished_at.replace(' ', 'T')}${run.finished_at.endsWith('Z') ? '' : 'Z'}`).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `Last read ${when}: ${run.message ?? 'done'}.`;
}

async function drawReview() {
  const main = $('#wiki-main');
  const head = h('div', { class: 'wiki-page-head' },
    h('h2', {}, "The AI's changes"),
    h('div', { class: 'wiki-actions' },
      h('button', { type: 'button', class: 'ghost', disabled: busy(state.aiRun), onclick: runAI }, 'Read the records now'),
    ),
  );
  main.replaceChildren(h('article', { class: 'wiki-page wiki-review' }, head,
    h('p', { class: 'muted small' }, 'After each session the AI reads what the archivist recorded and suggests changes here. Nothing reaches a page until you approve it. Each part is offered only to the players who know it; you can change that before approving.'),
    h('p', { class: 'wiki-run small' }, runLine()),
    h('p', { class: 'muted small' }, 'Loading…'),
  ));
  main.prepend(phoneBack());
  try {
    const { proposals, ai_run: run } = await state.guarded(() => api('GET', `${base()}/proposals`));
    if (state.view !== 'review') return;
    state.aiRun = run;
    state.proposals = proposals.length;
    drawReviewButton();
    main.querySelector('.wiki-run').textContent = runLine();
    main.querySelector('.wiki-run + p').replaceWith(proposals.length
      ? h('div', { class: 'wiki-proposals' },
          h('div', { class: 'wiki-actions' }, h('button', { type: 'button', class: 'primary', onclick: approveAll }, `Approve all ${proposals.length}`)),
          ...proposals.map(proposalCard))
      : h('p', { class: 'muted' }, 'Nothing waiting for you.'));
    pollWhileBusy();
  } catch (err) {
    report(err);
  }
}

async function runAI() {
  try {
    await state.guarded(async () => {
      const res = await api('POST', `${base()}/proposals/run`, {});
      state.aiRun = res.ai_run;
      status('The AI is reading the records.');
      drawReview();
    });
  } catch (err) {
    report(err);
  }
}

async function approveAll() {
  if (!confirm('Approve every change as it is?')) return;
  try {
    await state.guarded(async () => {
      const res = await api('POST', `${base()}/proposals/approve-all`, {});
      await refreshList();
      status(`Approved ${res.approved}.${res.failed.length ? ` ${res.failed.length} couldn't be: ${res.failed.map((f) => f.error).join(' ')}` : ''}`, !!res.failed.length);
      drawReview();
    });
  } catch (err) {
    report(err);
  }
}

/** Who a proposed or current section is available to, in a line. */
const sectionAvailable = (a) => h('p', { class: 'wiki-available small' }, a === 'all' ? 'Available as the page.' : `Available to ${availableText(a)}.`);

const TAGS = { new_page: 'New page', update_section: 'Change', add_section: 'New section', reveal: 'Reveal' };

/** One of the AI's changes: what's there now beside what it proposes, and Approve, Edit, Reject. */
function proposalCard(p) {
  const card = h('div', { class: 'wiki-proposal card' });
  const tag = p.dm_section ? 'Suggestion for your section' : TAGS[p.action];
  const where = p.action === 'new_page' ? p.title : `${p.page_title}${p.action === 'reveal' ? ` › ${p.section_heading || '(opening section)'}` : p.action === 'update_section' && p.current?.heading ? ` › ${p.current.heading}` : ''}`;
  const edits = { sections: p.sections.map(() => null) };
  const done = async (path, body, message) => {
    try {
      await state.guarded(async () => {
        const res = await api('POST', `${base()}/proposals/${p.id}/${path}`, body);
        await refreshList();
        status(message(res));
        drawReview();
      });
    } catch (err) {
      report(err);
    }
  };

  const body = h('div', { class: 'wiki-proposal-body' });
  let pagePicker = null;
  let playerBoxes = [];
  const draw = (editing) => {
    const parts = [];
    if (p.action === 'reveal') {
      playerBoxes = p.players.map((id) => h('label', {}, h('input', { type: 'checkbox', value: String(id), checked: true }), ` ${playerName(id)}`));
      parts.push(h('p', {}, 'Make this section available to ', ...playerBoxes, '?'));
      parts.push(h('p', { class: 'muted small' }, 'The records say they know it now. Nothing else on the page changes for them.'));
    } else {
      if (p.action === 'new_page') {
        pagePicker = availablePicker(p.page_available, { label: 'Page available to' });
        parts.push(h('p', { class: 'muted small' }, [p.kind, p.aliases?.length && `also called ${p.aliases.join(', ')}`, p.parent && `inside ${state.pages.find((x) => x.id === p.parent)?.title ?? 'another page'}`].filter(Boolean).join(' · ')));
        parts.push(h('label', { class: 'small' }, 'Page available to ', pagePicker.el));
      }
      p.sections.forEach((s, i) => {
        const now = p.action === 'update_section' ? p.current : null;
        const heading = h('input', { value: s.heading, maxLength: 200, placeholder: 'Heading (optional)', 'aria-label': 'Proposed heading' });
        const text = h('textarea', { rows: 8, 'aria-label': 'Proposed text' });
        text.value = s.text;
        const picker = availablePicker(s.available, { section: true, label: 'Proposed section available to' });
        edits.sections[i] = editing ? { heading, text, picker } : null;
        const proposed = editing
          ? h('div', { class: 'wiki-proposed' }, heading, h('label', { class: 'small' }, 'Available to ', picker.el), text)
          : h('div', { class: 'wiki-proposed' },
              s.heading ? h('h3', {}, s.heading) : null,
              sectionAvailable(s.available),
              ...sectionBody(s.text));
        parts.push(now
          ? h('div', { class: 'wiki-compare' },
              h('div', { class: 'wiki-now' }, h('div', { class: 'muted small' }, 'Now'), now.heading ? h('h3', {}, now.heading) : null, sectionAvailable(now.available), ...sectionBody(now.text)),
              h('div', {}, h('div', { class: 'muted small' }, 'Proposed'), proposed))
          : proposed);
      });
    }
    body.replaceChildren(...parts);
  };
  draw(false);

  const approve = h('button', { type: 'button', class: 'primary', disabled: p.gone, onclick: () => {
    const out = {};
    if (pagePicker) out.page_available = pagePicker.value();
    if (edits.sections.some(Boolean)) out.sections = edits.sections.map((e) => (e ? { heading: e.heading.value.trim(), text: e.text.value, available: e.picker.value() } : {}));
    if (p.action === 'reveal') {
      out.players = playerBoxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => Number(i.value));
      if (!out.players.length) return status('Tick at least one player, or reject it.', true);
    }
    done('approve', out, (res) => `Approved: ${res.page.title}.`);
  } }, 'Approve');
  const edit = h('button', { type: 'button', class: 'ghost', hidden: p.action === 'reveal' || p.gone, onclick: () => {
    draw(true);
    edit.hidden = true;
    approve.textContent = 'Approve with my changes';
  } }, 'Edit');
  const reject = h('button', { type: 'button', class: 'ghost danger', onclick: () => done('reject', {}, () => 'Rejected. The AI won\'t suggest it again.') }, 'Reject');

  card.append(...[
    h('div', { class: 'wiki-proposal-head' }, h('span', { class: 'wiki-tag small' }, tag), h('strong', {}, where)),
    p.reason ? h('p', { class: 'muted small' }, p.reason) : null,
    p.gone ? h('p', { class: 'wiki-warn small' }, 'That page or section is gone, so this can only be rejected.') : null,
    p.dm_section ? h('p', { class: 'muted small' }, 'You wrote this section. The AI thinks the records disagree with it.') : null,
    body,
    h('div', { class: 'wiki-actions' }, approve, edit, reject),
  ].filter(Boolean));
  return card;
}
