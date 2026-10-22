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
 * The AI's changes (after each session, or when the DM asks) wait in a list
 * for the DM: approve, edit then approve, or reject each one.
 */
import { api, h, LoggedOut, note, fileUrl, readBase64 } from './api.js';
import { markdownFragment } from './markdown.js';
import { wikiPieces, wikiKey, LINK_RE, PICTURE_RE, pictureAlt, kindFamily, KIND_FAMILIES } from './shared/wiki.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  pages: [],
  players: [],
  filter: '',
  kindFilter: null, // a kind family shown on the front page, or null for all
  tagFilter: null,
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

// ---------- pictures ----------

// Each picture is fetched once (it needs the login, so it comes as a blob) and kept for the campaign.
const urls = new Map();
const cachedUrl = (path) => {
  if (!urls.has(path)) urls.set(path, fileUrl(path).catch((err) => { urls.delete(path); throw err; }));
  return urls.get(path);
};

/** An <img> of one of the wiki's pictures ('thumb' for cards and galleries). */
function pictureImg(id, { size = 'full', alt = '', cls = '', style = null } = {}) {
  const img = h('img', { alt, class: cls, decoding: 'async', style });
  cachedUrl(`${base()}/pictures/${id}?size=${size}`).then(
    (src) => { img.src = src; },
    (err) => {
      if (err instanceof LoggedOut) return;
      img.replaceWith(h('span', { class: `wiki-pic-missing ${cls}` }, 'Picture missing'));
    },
  );
  return img;
}

/** An <img> of something else in the app with a picture (a creature, a map…), for the chooser. */
function sourceImg(s) {
  const img = h('img', { alt: '', decoding: 'async' });
  cachedUrl(`${base()}/picture-sources/${s.kind}/${s.id}`).then((src) => { img.src = src; }, () => img.remove());
  return img;
}

const SOURCE_LABELS = { creature: 'Creatures', item: 'Items', merchant: 'Merchants', map: 'Maps', handout: 'Handouts', token: "Players' tokens" };
const SOURCE_NOUN = { creature: 'creature', item: 'item', merchant: 'merchant', map: 'map', handout: 'handout', token: 'token' };

/** Show a picture big, with its caption. */
function showPicture(id, caption = '') {
  const dialog = $('#wiki-dialog');
  if (!dialog) return;
  dialog.className = 'wiki-dialog wiki-lightbox';
  dialog.replaceChildren(h('figure', { onclick: () => dialog.close() },
    pictureImg(id, { alt: caption }),
    caption ? h('figcaption', {}, caption) : null,
    h('button', { type: 'button', class: 'ghost wiki-lightbox-close', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕'),
  ));
  dialog.showModal?.();
}

/** Upload picture files (chosen, pasted or dropped); resolves to their ids. */
async function uploadPictures(files) {
  const ids = [];
  for (const file of files) {
    status(`Adding ${file.name || 'the picture'}…`);
    const res = await state.guarded(async () => api('POST', `${base()}/pictures`, { filename: file.name || 'picture', data: await readBase64(file) }));
    ids.push({ id: res.picture.id, name: res.picture.name });
  }
  status(files.length > 1 ? `Added ${files.length} pictures.` : 'Added the picture.');
  return ids;
}

const imageFiles = (list) => [...(list ?? [])].filter((f) => /^image\//.test(f.type));

/**
 * The picture chooser: upload one, take one the wiki already has, or copy
 * one the app has (a creature's, an item's, a map…). Resolves to the picture
 * id, or null when the DM closes it.
 */
function choosePicture(title = 'Choose a picture') {
  const dialog = $('#wiki-dialog');
  return new Promise((resolve) => {
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      dialog.close();
      resolve(id);
    };
    dialog.addEventListener('close', () => finish(null), { once: true });
    const pane = h('div', { class: 'wiki-chooser-pane' }, h('p', { class: 'muted small' }, 'Loading…'));
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', 'aria-label': 'Picture file' });
    const take = async (files) => {
      try {
        const [first] = await uploadPictures(imageFiles(files));
        if (first) finish(first.id);
      } catch (err) {
        report(err);
      }
    };
    file.addEventListener('change', () => take(file.files));
    const drop = h('label', { class: 'wiki-drop' }, h('strong', {}, 'Upload a picture'), h('span', { class: 'muted small' }, 'Choose a file, or drop one here. PNG, JPEG, WebP or GIF, up to 10 MB.'), file);
    dropTarget(drop, take);
    dialog.className = 'map-dialog wiki-dialog wiki-chooser';
    dialog.replaceChildren(h('div', { class: 'map-dialog-inner' },
      h('div', { class: 'wiki-chooser-head' }, h('h2', {}, title), h('button', { type: 'button', class: 'ghost', onclick: () => finish(null) }, 'Cancel')),
      drop,
      pane,
    ));
    dialog.showModal?.();
    state.guarded(() => api('GET', `${base()}/pictures`)).then(({ pictures, sources }) => {
      const groups = [];
      if (pictures.length) {
        groups.push(h('h3', {}, 'Already in the wiki'), h('div', { class: 'wiki-chooser-grid' }, ...pictures.map((p) =>
          h('button', { type: 'button', class: 'wiki-choice', title: p.name || 'A picture', onclick: () => finish(p.id) }, pictureImg(p.id, { size: 'thumb' }), h('span', {}, p.name || (p.from ? p.from.name : 'Picture'))))));
      }
      for (const kind of Object.keys(SOURCE_LABELS)) {
        const list = sources.filter((s) => s.kind === kind);
        if (!list.length) continue;
        groups.push(h('h3', {}, `From your ${SOURCE_LABELS[kind].toLowerCase()}`), h('div', { class: 'wiki-chooser-grid' }, ...list.map((s) =>
          h('button', { type: 'button', class: 'wiki-choice', title: `Use the picture of ${s.name}`, onclick: async () => {
            try {
              const res = await state.guarded(() => api('POST', `${base()}/pictures`, { from: { kind: s.kind, id: s.id } }));
              finish(res.picture.id);
            } catch (err) {
              report(err);
            }
          } }, sourceImg(s), h('span', {}, s.name)))));
      }
      pane.replaceChildren(...(groups.length ? groups : [h('p', { class: 'muted small' }, 'No other pictures yet. Pictures of your creatures, items, maps and handouts show up here too.')]));
    }, (err) => {
      pane.replaceChildren();
      report(err);
    });
  });
}

/** Let picture files be dropped on an element. */
function dropTarget(el, onFiles) {
  el.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    e.preventDefault();
    el.classList.add('dropping');
  });
  el.addEventListener('dragleave', () => el.classList.remove('dropping'));
  el.addEventListener('drop', (e) => {
    el.classList.remove('dropping');
    const files = imageFiles(e.dataTransfer?.files);
    if (!files.length) return;
    e.preventDefault();
    onFiles(files);
  });
}

// ---------- kinds ----------

const fam = (kind) => kindFamily(kind);
/** A page's kind as a little coloured label with its icon (the icon is drawn by the stylesheet). */
const kindBadge = (kind, extra = '') => h('span', { class: `wiki-kind fam-${fam(kind)}${extra}` }, kind || 'page');

// ---------- loading ----------

/** The DM enters a campaign. */
export async function loadWiki({ campaignId, guarded }) {
  clearTimeout(state.poll);
  for (const u of urls.values()) u.then((src) => URL.revokeObjectURL?.(src), () => {});
  urls.clear();
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

const byName = (name) => {
  const key = wikiKey(name);
  return state.pages.find((p) => [p.title, ...p.aliases].some((n) => wikiKey(n) === key));
};

const matchesFilter = (p) => {
  const f = wikiKey(state.filter);
  return !f || [p.title, ...p.aliases, p.kind, ...p.tags].some((n) => wikiKey(n).includes(f));
};

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

/** A picture in the text: ![caption|place](picture:id). */
function figure({ id, caption, place }) {
  return h('span', { class: `wiki-figure${place ? ` place-${place}` : ''}`, role: 'figure', 'aria-label': caption || 'Picture' },
    h('button', { type: 'button', class: 'wiki-figure-open', title: 'Show it bigger', onclick: () => showPicture(id, caption) }, pictureImg(id, { size: place === 'small' ? 'thumb' : 'full', alt: caption })),
    caption ? h('span', { class: 'wiki-figure-caption' }, caption) : null,
  );
}

/** Markdown with [[links]] as buttons that open the page (or offer to make it), and pictures in place. */
function richText(text, cls = 'wiki-text') {
  const targets = [];
  const pictures = [];
  const marked = text
    .replace(PICTURE_RE, (_, alt, id) => {
      pictures.push({ id, ...pictureAlt(alt) });
      return '<span class="wiki-pic-slot"></span>';
    })
    .replace(LINK_RE, (_, name, shown) => {
      targets.push(name.trim());
      return `<span class="wiki-link">${escapeHtml((shown ?? name).trim())}</span>`;
    });
  const box = h('div', { class: cls });
  box.append(markdownFragment(marked));
  box.querySelectorAll('span.wiki-pic-slot').forEach((span, i) => (pictures[i] ? span.replaceWith(figure(pictures[i])) : span.remove()));
  box.querySelectorAll('span.wiki-link').forEach((span, i) => span.replaceWith(pageLink(targets[i], span.textContent)));
  return box;
}

/** A link to a page by name: opens it, shows a preview of it on hover, or offers to make it. */
function pageLink(name, text) {
  const page = name && byName(name);
  const b = h('button', {
    type: 'button',
    class: `link wiki-link${page ? '' : ' missing'}`,
    title: page ? '' : `No page called "${name}" yet: click to make it`,
    onclick: () => (page ? openPage(page.id) : newPage(name)),
  }, text);
  if (page) {
    b.addEventListener('mouseenter', () => showPreview(b, page));
    b.addEventListener('focus', () => showPreview(b, page));
    b.addEventListener('mouseleave', hidePreview);
    b.addEventListener('blur', hidePreview);
  }
  return b;
}

// The card shown over a link: the page's picture, kind and opening words (like Kanka's and World Anvil's tooltips).
let preview = null;
function showPreview(anchor, p) {
  hidePreview();
  preview = h('div', { class: `wiki-preview fam-${fam(p.kind)}`, role: 'tooltip' },
    p.picture ? h('div', { class: 'wiki-preview-art' }, pictureImg(p.picture, { size: 'thumb' })) : null,
    h('div', { class: 'wiki-preview-body' },
      kindBadge(p.kind),
      h('strong', {}, p.title),
      p.excerpt ? h('p', {}, p.excerpt) : null),
  );
  document.body.append(preview);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  preview.style.width = `${w}px`;
  preview.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  const below = r.bottom + 8;
  preview.style.top = `${below + 240 > window.innerHeight && r.top > 260 ? Math.max(8, r.top - 8 - (preview.offsetHeight || 220)) : below}px`;
}
function hidePreview() {
  preview?.remove();
  preview = null;
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

/** The pages above this one, outermost first. */
function ancestors(page) {
  const out = [];
  for (let at = page.parent, steps = 0; at && steps < 50; steps++) {
    const p = state.pages.find((x) => x.id === at);
    if (!p) break;
    out.unshift(p);
    at = p.parent;
  }
  return out;
}

/** The banner across the top: the banner picture (or the kind's colours), where it sits, the kind and the title. */
function hero(page) {
  const chain = ancestors(page);
  return h('header', { class: `wiki-hero fam-${fam(page.kind)}${page.banner ? ' has-banner' : ''}` },
    page.banner ? pictureImg(page.banner.id, { cls: 'wiki-hero-img', alt: page.banner.caption, style: `object-position: 50% ${page.banner.focus ?? 50}%` }) : null,
    h('div', { class: 'wiki-hero-text' },
      chain.length ? h('nav', { class: 'wiki-crumbs small', 'aria-label': 'Inside' }, ...chain.flatMap((p, i) => [i ? h('span', { 'aria-hidden': 'true' }, ' › ') : null, h('button', { type: 'button', class: 'link', onclick: () => openPage(p.id) }, p.title)])) : null,
      kindBadge(page.kind, ' on-hero'),
      h('h2', {}, page.title),
    ),
  );
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

/** Who a picture or fact is available to, for the DM, when it isn't as the page. */
const ownAvailable = (x, dm) => (dm && x.available !== 'all' ? h('span', { class: 'wiki-available small' }, ` (${availableText(x.available)})`) : null);

/** The "at a glance" box: the page's picture, its facts, where it is and what's inside it. */
function infobox(page, { dm }) {
  const children = dm ? state.pages.filter((p) => p.parent === page.id).sort((a, b) => a.title.localeCompare(b.title)) : [];
  const parent = page.parent && state.pages.find((p) => p.id === page.parent);
  if (!page.picture && !page.facts?.length && !children.length && !(dm && parent)) return null;
  return h('aside', { class: `wiki-infobox fam-${fam(page.kind)}`, 'aria-label': 'At a glance' },
    h('div', { class: 'wiki-infobox-title' }, page.title),
    page.picture ? h('figure', { class: 'wiki-infobox-picture' },
      h('button', { type: 'button', class: 'wiki-figure-open', title: 'Show it bigger', onclick: () => showPicture(page.picture.id, page.picture.caption) }, pictureImg(page.picture.id, { alt: page.picture.caption || page.title })),
      page.picture.caption || (dm && page.picture.available !== 'all') ? h('figcaption', {}, page.picture.caption, ownAvailable(page.picture, dm)) : null) : null,
    page.facts?.length || (dm && parent) ? h('dl', { class: 'wiki-facts' },
      ...(page.facts ?? []).flatMap((f) => [h('dt', {}, f.label), h('dd', {}, richText(f.value, 'wiki-fact-value'), ownAvailable(f, dm))]),
      ...(dm && parent ? [h('dt', {}, 'Inside'), h('dd', {}, pageLink(parent.title, parent.title))] : []),
    ) : null,
    children.length ? h('div', { class: 'wiki-children' },
      h('div', { class: 'wiki-children-head small' }, 'Inside it'),
      h('ul', {}, ...children.map((c) => h('li', { class: `fam-${fam(c.kind)}` }, pageLink(c.title, c.title))))) : null,
  );
}

function gallery(page, { dm }) {
  if (!page.gallery?.length) return null;
  return h('section', { class: 'wiki-gallery' },
    h('h3', {}, 'Gallery'),
    h('div', { class: 'wiki-gallery-grid' }, ...page.gallery.map((g) => h('figure', {},
      h('button', { type: 'button', class: 'wiki-figure-open', title: 'Show it bigger', onclick: () => showPicture(g.id, g.caption) }, pictureImg(g.id, { size: 'thumb', alt: g.caption })),
      g.caption || (dm && g.available !== 'all') ? h('figcaption', {}, g.caption, ownAvailable(g, dm)) : null))),
  );
}

/** What's on a page below its banner: the at-a-glance box beside the sections, then the gallery. */
function pageContent(page, { dm }) {
  const box = infobox(page, { dm });
  const body = h('div', { class: 'wiki-body' }, ...sections(page, { dm }), gallery(page, { dm }));
  return [h('div', { class: `wiki-layout${box ? ' with-box' : ''}` }, box, body)];
}

function sections(page, { dm }) {
  if (!page.sections.length) return [h('p', { class: 'muted' }, dm ? 'This page is empty. Press Edit to write it.' : 'No text on this page is available.')];
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

/** Put text into a textarea where the cursor is, on lines of its own. */
function insertAt(area, snippet) {
  const at = area.selectionStart ?? area.value.length;
  const before = area.value.slice(0, at);
  const after = area.value.slice(area.selectionEnd ?? at);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  area.value = `${before}${lead}${snippet}\n${after}`;
  const caret = before.length + lead.length + snippet.length + 1;
  area.setSelectionRange?.(caret, caret);
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * One picture of the page in the editor (the main picture or the banner):
 * Choose…, Remove, its caption and who it's available to. { el, value() }.
 */
function pictureSlot(label, current, { banner = false } = {}) {
  let pic = current ? { ...current } : null;
  const el = h('div', { class: `wiki-slot${banner ? ' banner' : ''}` });
  let caption;
  let picker;
  let focus;
  const draw = () => {
    caption = h('input', { value: pic?.caption ?? '', maxLength: 300, placeholder: 'Caption (optional)', 'aria-label': `${label} caption` });
    picker = availablePicker(pic?.available ?? 'all', { section: true, label: `${label} available to` });
    focus = banner ? h('input', { type: 'range', min: 0, max: 100, value: String(pic?.focus ?? 50), 'aria-label': 'Banner position' }) : null;
    const thumb = pic ? pictureImg(pic.id, { size: 'thumb', alt: '', style: banner ? `object-position: 50% ${pic.focus ?? 50}%` : null }) : h('span', { class: 'wiki-slot-empty' }, 'No picture');
    focus?.addEventListener('input', () => { thumb.style.objectPosition = `50% ${focus.value}%`; });
    el.replaceChildren(
      h('div', { class: 'wiki-slot-head' }, h('strong', { class: 'small' }, label)),
      h('div', { class: 'wiki-slot-thumb' }, thumb),
      h('div', { class: 'wiki-slot-actions' },
        h('button', { type: 'button', class: 'ghost', 'aria-label': `Choose ${label.toLowerCase()}`, onclick: async () => {
          const id = await choosePicture(`Choose ${label.toLowerCase()}`);
          if (!id) return;
          pic = { id, caption: caption.value, available: picker.value(), ...(banner && { focus: 50 }) };
          draw();
        } }, pic ? 'Change…' : 'Choose…'),
        pic ? h('button', { type: 'button', class: 'ghost danger', onclick: () => { pic = null; draw(); } }, 'Remove') : null,
      ),
      pic ? caption : null,
      pic && banner ? h('label', { class: 'small' }, 'Show from top to bottom ', focus) : null,
      pic ? h('label', { class: 'small' }, 'Available to ', picker.el) : null,
    );
  };
  draw();
  dropTarget(el, async (files) => {
    try {
      const [first] = await uploadPictures(files.slice(0, 1));
      pic = { id: first.id, caption: caption?.value ?? '', available: 'all', ...(banner && { focus: 50 }) };
      draw();
    } catch (err) {
      report(err);
    }
  });
  return {
    el,
    value: () => (pic ? { id: pic.id, caption: caption.value.trim(), available: picker.value(), ...(banner && { focus: Number(focus.value) }) } : null),
  };
}

/** The gallery in the editor: pictures with captions, each with who it's available to. { el, value() }. */
function galleryEditor(items) {
  const rows = [];
  const list = h('div', { class: 'wiki-gallery-edit' });
  const add = (g) => {
    const caption = h('input', { value: g.caption ?? '', maxLength: 300, placeholder: 'Caption', 'aria-label': 'Gallery caption' });
    const picker = availablePicker(g.available ?? 'all', { section: true, label: 'Gallery picture available to' });
    const row = { id: g.id, caption, picker };
    row.el = h('div', { class: 'wiki-gallery-item card' },
      pictureImg(g.id, { size: 'thumb' }),
      caption,
      picker.el,
      h('button', { type: 'button', class: 'ghost icon-btn danger', title: 'Take it out of the gallery', 'aria-label': 'Remove from gallery', onclick: () => {
        rows.splice(rows.indexOf(row), 1);
        row.el.remove();
      } }, '✕'),
    );
    rows.push(row);
    list.append(row.el);
  };
  for (const g of items) add(g);
  const el = h('div', { class: 'wiki-edit-gallery' },
    h('div', { class: 'wiki-slot-head' }, h('strong', { class: 'small' }, 'Gallery'), h('span', { class: 'muted small' }, ' more pictures, shown as a grid under the text')),
    list,
    h('button', { type: 'button', class: 'ghost', onclick: async () => {
      const id = await choosePicture('Add to the gallery');
      if (id) add({ id, caption: '', available: 'all' });
    } }, '+ Add to the gallery'),
  );
  dropTarget(el, async (files) => {
    try {
      for (const p of await uploadPictures(files)) add({ id: p.id, caption: '', available: 'all' });
    } catch (err) {
      report(err);
    }
  });
  return { el, value: () => rows.map((r) => ({ id: r.id, caption: r.caption.value.trim(), available: r.picker.value() })) };
}

/** The "at a glance" facts in the editor, with the usual ones for the page's kind a click away. { el, value(), kindChanged() }. */
function factsEditor(facts, kindInput) {
  const rows = [];
  const list = h('div', { class: 'wiki-facts-edit' });
  const add = (f) => {
    const label = h('input', { value: f.label ?? '', maxLength: 60, placeholder: 'Race, Region, Leader…', 'aria-label': 'Fact' });
    const value = h('input', { value: f.value ?? '', maxLength: 500, placeholder: 'What it is. [[Links]] work.', 'aria-label': 'Fact value' });
    const picker = availablePicker(f.available ?? 'all', { section: true, label: 'Fact available to' });
    const row = { label, value, picker };
    row.el = h('div', { class: 'wiki-fact-row' }, label, value, picker.el,
      h('button', { type: 'button', class: 'ghost icon-btn danger', title: 'Remove this fact', 'aria-label': 'Remove fact', onclick: () => {
        rows.splice(rows.indexOf(row), 1);
        row.el.remove();
      } }, '✕'));
    rows.push(row);
    list.append(row.el);
  };
  for (const f of facts) add(f);
  const usual = h('button', { type: 'button', class: 'ghost' });
  const kindChanged = () => {
    const family = KIND_FAMILIES[fam(kindInput.value)];
    usual.hidden = !family.facts.length;
    usual.textContent = `+ The usual for ${family.label.toLowerCase()}`;
  };
  usual.addEventListener('click', () => {
    const have = new Set(rows.map((r) => wikiKey(r.label.value)));
    for (const label of KIND_FAMILIES[fam(kindInput.value)].facts) if (!have.has(wikiKey(label))) add({ label, value: '' });
  });
  kindInput.addEventListener('input', kindChanged);
  kindChanged();
  return {
    el: h('div', { class: 'wiki-edit-facts' },
      h('div', { class: 'wiki-slot-head' }, h('strong', { class: 'small' }, 'At a glance'), h('span', { class: 'muted small' }, ' short facts in the box beside the text')),
      list,
      h('div', { class: 'wiki-edit-foot' }, h('button', { type: 'button', class: 'ghost', onclick: () => add({ label: '', value: '' }) }, '+ Add a fact'), usual),
    ),
    value: () => rows.map((r) => ({ label: r.label.value.trim(), value: r.value.value.trim(), available: r.picker.value() })).filter((f) => f.label || f.value),
  };
}

function editor(page) {
  const isNew = !page.id;
  const title = h('input', { value: page.title, maxLength: 200, required: true, 'aria-label': 'Title' });
  const kinds = [...new Set([...state.pages.map((p) => p.kind).filter(Boolean), 'npc', 'place', 'faction', 'item', 'quest', 'lore'])].sort();
  const kind = h('input', { value: page.kind, maxLength: 60, list: 'wiki-kinds', placeholder: 'npc, place, faction, lore…', 'aria-label': 'Kind' });
  const kindList = h('datalist', { id: 'wiki-kinds' }, ...kinds.map((k) => h('option', { value: k })));
  const aliases = h('input', { value: page.aliases.join(', '), placeholder: 'Other names and spellings, with commas', 'aria-label': 'Other names' });
  const tags = h('input', { value: page.tags.join(', '), placeholder: 'With commas', 'aria-label': 'Tags' });
  const parent = h('select', { 'aria-label': 'Inside' },
    h('option', { value: '' }, '(top level)'),
    ...state.pages.filter((p) => p.id !== page.id).sort((a, b) => a.title.localeCompare(b.title)).map((p) => h('option', { value: p.id, selected: p.id === page.parent }, p.title)),
  );
  const available = availablePicker(page.available, { label: 'Page available to' });
  const mainPicture = pictureSlot('Main picture', page.picture);
  const banner = pictureSlot('Banner', page.banner, { banner: true });
  const galleryEd = galleryEditor(page.gallery ?? []);
  const factsEd = factsEditor(page.facts ?? [], kind);
  const list = h('div', { class: 'wiki-edit-sections' });
  const rows = [];

  const addSection = (s = { heading: '', text: '', available: 'all' }) => {
    const heading = h('input', { value: s.heading, maxLength: 200, placeholder: 'Heading (optional)', 'aria-label': 'Section heading' });
    const text = h('textarea', { rows: 8, 'aria-label': 'Section text', placeholder: 'Markdown. [[Page name]] links a page. A block between ":::for Thorin" and ":::" is only for Thorin; ":::dm" is only for you. Paste or drop a picture to put it here.' });
    text.value = s.text;
    const addPictures = async (files) => {
      try {
        for (const p of await uploadPictures(files)) insertAt(text, `![${p.name}](picture:${p.id})`);
      } catch (err) {
        report(err);
      }
    };
    text.addEventListener('paste', (e) => {
      const files = imageFiles(e.clipboardData?.files);
      if (!files.length) return;
      e.preventDefault();
      addPictures(files);
    });
    dropTarget(text, addPictures);
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
      h('div', { class: 'wiki-text-tools' },
        h('label', { class: 'small' }, 'Available to ', picker.el),
        h('button', { type: 'button', class: 'ghost small', 'aria-label': 'Put a picture in this section', onclick: async () => {
          const id = await choosePicture('Put a picture in the text');
          if (id) insertAt(text, `![](picture:${id})`);
        } }, '+ Picture'),
      ),
      text,
      h('p', { class: 'muted small wiki-hint' }, 'A picture shows where its line is. Write a caption between the brackets; add |right, |left, |small or |wide after it to place it: ![The mill at dusk|right](picture:…). A picture inside a :::dm block stays with you.'),
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
    h('p', { class: 'muted small' }, 'A new page is only yours until you choose otherwise. Each section, fact, picture and block can narrow it further, never widen it. Other names are never shown to players.'),
    h('fieldset', { class: 'wiki-edit-pictures' },
      h('legend', {}, 'Pictures'),
      h('div', { class: 'wiki-slots' }, mainPicture.el, banner.el),
      galleryEd.el,
    ),
    h('fieldset', { class: 'wiki-edit-box' }, h('legend', {}, 'At a glance'), factsEd.el),
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
      picture: mainPicture.value(),
      banner: banner.value(),
      gallery: galleryEd.value(),
      facts: factsEd.value(),
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
  let usePicture = null;
  const draw = (editing) => {
    const parts = [];
    if (p.action === 'reveal') {
      playerBoxes = p.players.map((id) => h('label', {}, h('input', { type: 'checkbox', value: String(id), checked: true }), ` ${playerName(id)}`));
      parts.push(h('p', {}, 'Make this section available to ', ...playerBoxes, '?'));
      parts.push(h('p', { class: 'muted small' }, 'The records say they know it now. Nothing else on the page changes for them.'));
    } else {
      if (p.action === 'new_page') {
        pagePicker = availablePicker(p.page_available, { label: 'Page available to' });
        if (p.picture) {
          usePicture = h('input', { type: 'checkbox', checked: usePicture?.checked ?? true });
          parts.push(h('label', { class: 'wiki-suggested-pic' }, usePicture, sourceImg(p.picture), h('span', {}, `Use the picture of ${p.picture.name} (your ${SOURCE_NOUN[p.picture.kind]}) as its main picture`)));
        }
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
    if (usePicture && !usePicture.checked) out.use_picture = false;
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
