/**
 * The DM's wiki: what every part of its page shares (wiki.js runs the Wiki
 * tab; wiki/page.js draws and edits a page; wiki/views/waiting.js is the AI's
 * changes). The state of the wiki on screen, the pictures (fetched once,
 * with the login), kinds, and `nav`: the moves between views, which wiki.js
 * fills in, so a page drawn anywhere can open another page.
 */
import { api, h, LoggedOut, note, fileUrl, readBase64 } from '../page/api.js';
import { wikiKey, kindFamily } from '/shared/wiki.js';

const $ = (sel) => document.querySelector(sel);

export const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  pages: [],
  players: [],
  filter: '',
  kindFilter: null, // a kind family shown on the front page, or null for all
  kindKey: null, // one kind in that family (wikiKey), or null for all of them
  tagFilter: null,
  open: null, // { page, mentioned_in, unknown_names } of the page shown
  view: 'page', // 'page' | 'edit' | 'history' | 'review' | 'wheel' | 'atlas' | 'web' | 'timeline' | 'templates' | 'quests' | 'knows' | 'tidy' | 'import' | 'boards'
  atlasMap: null, // the map the Atlas shows (wiki/views/atlas.js)
  webAround: null, // the page in the middle of the Web (wiki-web.js), or null for the whole web
  timelineFocus: null, // the page whose times the Timeline shows first (wiki-timeline.js), or null
  boardId: null, // the board shown (wiki-boards.js), or null for the list of boards
  as: null, // a player's id while viewing as them (a player's own, always, when the reader is a player)
  dm: true, // the DM's wiki; false: a player reading their own version (stage 6a)
  me: null, // the reader's user id
  proposals: 0, // how many of the AI's changes wait for the DM
  aiRun: null, // the AI's last run for the wiki: { status, message, finished_at }
  poll: null,
  calendar: null, // the campaign's calendar (shared/calendar.js), for times on pages
  clock: 0, // the in-game clock now (minutes), for "300 years ago" in the editor's preview
};

/** Moving between views: set by wiki.js. */
export const nav = {
  openPage: async () => {},
  newPage: () => {},
  drawMain: () => {},
  drawList: () => {},
  refreshList: async () => {},
  drawReviewButton: () => {},
  phoneBack: () => null,
  routed: () => {}, // after each draw: the address and the trail follow (wiki/space.js)
  go: async () => {}, // to a route of the space (wiki/space.js)
  enter: () => {}, // into the wiki's space from the table (app.js)
  closeDrawer: null, // close the drawer (wiki/drawer.js)
  drawer: async () => {}, // show a page in the drawer, over either space (wiki/drawer.js)
  sendHandout: null, // send part of a page as a handout (wiki/handout.js)
  putOnMap: null, // choose a map and put the page on it in the Atlas (wiki/views/atlas.js)
  showMap: null, // open a map at a point on the Map tab (app.js; none in a popped-out window)
  openShop: null, // open a merchant's shop (app.js; none in a popped-out window)
};

/** Forget the pictures fetched for the last campaign. */
export function clearPictures() {
  for (const u of urls.values()) u.then((src) => URL.revokeObjectURL?.(src), () => {});
  urls.clear();
}

export const base = () => `/campaigns/${state.campaignId}/wiki`;
export const status = (text, error = false) => note($('#wiki-status'), text, error);
export const report = (err) => {
  if (err instanceof LoggedOut) throw err;
  status(err.message, true);
};
export const playerName = (id) => {
  const p = state.players.find((x) => x.id === id);
  return p ? p.character_name || p.name : `player ${id}`;
};

/** Who something is available to, in words. */
export function availableText(a, { section = false } = {}) {
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
export function pictureImg(id, { size = 'full', alt = '', cls = '', style = null } = {}) {
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
export function sourceImg(s) {
  const img = h('img', { alt: '', decoding: 'async' });
  cachedUrl(`${base()}/picture-sources/${s.kind}/${s.id}`).then((src) => { img.src = src; }, () => img.remove());
  return img;
}

const SOURCE_LABELS = { creature: 'Creatures', item: 'Items', merchant: 'Merchants', map: 'Maps', handout: 'Handouts', token: "Players' tokens" };
export const SOURCE_NOUN = { creature: 'creature', item: 'item', merchant: 'merchant', map: 'map', handout: 'handout', token: 'token' };

/** Show a picture big, with its caption. */
export function showPicture(id, caption = '') {
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
export async function uploadPictures(files) {
  const ids = [];
  for (const file of files) {
    status(`Adding ${file.name || 'the picture'}…`);
    const res = await state.guarded(async () => api('POST', `${base()}/pictures`, { filename: file.name || 'picture', data: await readBase64(file) }));
    ids.push({ id: res.picture.id, name: res.picture.name });
  }
  status(files.length > 1 ? `Added ${files.length} pictures.` : 'Added the picture.');
  return ids;
}

export const imageFiles = (list) => [...(list ?? [])].filter((f) => /^image\//.test(f.type));

/**
 * The picture chooser: upload one, take one the wiki already has, or copy
 * one the app has (a creature's, an item's, a map…). Resolves to the picture
 * id, or null when the DM closes it.
 */
export function choosePicture(title = 'Choose a picture') {
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
export function dropTarget(el, onFiles) {
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

export const fam = (kind) => kindFamily(kind);
/** A page's kind as a little coloured label with its icon (the icon is drawn by the stylesheet). */
export const kindBadge = (kind, extra = '') => h('span', { class: `wiki-kind fam-${fam(kind)}${extra}` }, kind || 'page');

export const byName = (name) => {
  const key = wikiKey(name);
  return state.pages.find((p) => [p.title, ...p.aliases].some((n) => wikiKey(n) === key));
};

export const matchesFilter = (p) => {
  const f = wikiKey(state.filter);
  return !f || [p.title, ...p.aliases, p.kind, ...p.tags].some((n) => wikiKey(n).includes(f));
};
