/**
 * The DM's lists (wiki space stage 8a): a Wheel filter saved as a list (a family, a kind, a tag, a canon, a fact's
 * value), or a list the AI picks from plain words (Make a list: "hostile NPCs in Millbrook"). They show on the Home
 * as rows of cards. The server keeps them (never in the settings players get) and says which pages each shows.
 */
import { api, h } from '../../page/api.js';
import { KIND_FAMILIES } from '/shared/wiki.js';
import { state, nav, base, report, status, pictureImg, fam } from '../data.js';

const $ = (sel) => document.querySelector(sel);
const CANON_NAMES = { true: 'True', rumour: 'A rumour', false: 'False', planned: 'Planned', told: 'An account' };

const mini = (p) => h('button', { type: 'button', class: `wiki-mini-card fam-${fam(p.kind)}`, title: p.title, onclick: () => nav.go(`#/page/${p.id}`) },
  h('span', { class: `wiki-mini-art${p.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, p.picture ? pictureImg(p.picture, { size: 'thumb' }) : null),
  h('span', { class: 'wiki-mini-title' }, p.title));

/** Save a list: its name and filter, starting from `start` (the Wheel's family, kind and tag). `done()` after. */
export function openSaveList(start = {}, done = () => {}) {
  $('#wiki-list-save')?.remove();
  const name = h('input', { type: 'text', maxLength: 80, 'aria-label': 'Name of the list', placeholder: 'Villains, Millbrook folk…' });
  const family = h('select', { 'aria-label': 'Family' }, h('option', { value: '' }, 'Any'), ...Object.entries(KIND_FAMILIES).map(([k, f]) => h('option', { value: k }, f.label)));
  const kind = h('input', { type: 'text', maxLength: 60, 'aria-label': 'Kind', placeholder: 'Any' });
  const tag = h('input', { type: 'text', maxLength: 40, 'aria-label': 'Tag', placeholder: 'Any' });
  const canon = h('select', { 'aria-label': 'With a part that is' }, h('option', { value: '' }, 'Anything'), ...Object.entries(CANON_NAMES).map(([k, n]) => h('option', { value: k }, n)));
  const label = h('input', { type: 'text', maxLength: 60, 'aria-label': 'Fact', placeholder: 'Status, Allegiance…' });
  const value = h('input', { type: 'text', maxLength: 200, 'aria-label': 'Fact says', placeholder: 'hostile' });
  family.value = start.family ?? '';
  kind.value = start.kind ?? '';
  tag.value = start.tag ?? '';
  const go = h('button', { type: 'submit', class: 'primary' }, 'Save the list');
  const d = h('dialog', { id: 'wiki-list-save', class: 'map-dialog wiki-make-up', 'aria-label': 'Save as a list' },
    h('form', { method: 'dialog' },
      h('h3', {}, '☰ Save as a list'),
      h('p', { class: 'muted small' }, 'It shows on the Home as a row of cards, kept up to date. Only you see your lists.'),
      h('label', { class: 'fld' }, h('span', {}, 'Name'), name),
      h('label', { class: 'fld' }, h('span', {}, 'Family'), family),
      h('label', { class: 'fld' }, h('span', {}, 'Kind'), kind),
      h('label', { class: 'fld' }, h('span', {}, 'Tag'), tag),
      h('label', { class: 'fld' }, h('span', {}, 'With a part that is'), canon),
      h('div', { class: 'wiki-list-fact' }, h('label', { class: 'fld' }, h('span', {}, 'A fact'), label), h('label', { class: 'fld' }, h('span', {}, 'that says'), value)),
      h('div', { class: 'map-dialog-actions' }, h('button', { type: 'button', class: 'ghost', onclick: () => d.close() }, 'Cancel'), h('span', { class: 'spacer' }), go)));
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!name.value.trim()) return status('Give the list a name.', true);
    const filter = Object.fromEntries([['family', family.value], ['kind', kind.value.trim()], ['tag', tag.value.trim()], ['canon', canon.value]].filter(([, v]) => v));
    if (label.value.trim()) filter.fact = { label: label.value.trim(), value: value.value.trim() };
    try {
      await state.guarded(() => api('POST', `${base()}/lists`, { name: name.value.trim(), filter }));
      d.close();
      status(`Saved "${name.value.trim()}": it's on the Home.`);
      done();
    } catch (err) {
      report(err);
    }
  });
  ($('#app-view') ?? document.body).append(d);
  d.showModal?.();
  name.focus();
}

/** The DM's lists on the Home, each a row of cards, and Make a list. Fills `box` when the server answers. */
export async function drawLists(box) {
  let lists;
  try {
    ({ lists } = await state.guarded(() => api('GET', `${base()}/lists`)));
  } catch (err) {
    return report(err);
  }
  if (!box.isConnected) return;
  const redraw = () => drawLists(box);
  const row = (l) => h('div', { class: 'wiki-list-row', 'data-list': l.id },
    h('div', { class: 'wiki-list-head' },
      h('strong', {}, l.name), h('span', { class: 'muted small' }, ` ${l.pages.length}`),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'ghost small', 'aria-label': `Remove the list ${l.name}`, onclick: async () => {
        try {
          await state.guarded(() => api('DELETE', `${base()}/lists/${l.id}`));
          redraw();
        } catch (err) {
          report(err);
        }
      } }, '✕')),
    l.pages.length ? h('div', { class: 'wiki-minis' }, ...l.pages.map(mini)) : h('p', { class: 'muted small' }, 'No page fits it now.'));
  // Make a list: the AI picks the pages; shown here first, saved with a click.
  const words = h('input', { type: 'text', maxLength: 300, 'aria-label': 'Make a list of', placeholder: 'Make a list: "hostile NPCs in Millbrook"' });
  const made = h('div', { class: 'wiki-list-made' });
  const ask = h('button', { type: 'submit', class: 'ghost' }, 'Make a list');
  const form = h('form', { class: 'wiki-list-make' }, words, ask);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!words.value.trim()) return;
    ask.disabled = true;
    ask.textContent = 'Looking…';
    try {
      const res = await state.guarded(() => api('POST', `${base()}/lists/make`, { words: words.value.trim() }));
      made.replaceChildren(row({ id: 'new', name: res.name, pages: res.pages }));
      made.querySelector('[aria-label^="Remove"]')?.remove();
      made.querySelector('.wiki-list-head').append(h('button', { type: 'button', class: 'primary small', onclick: async () => {
        try {
          await state.guarded(() => api('POST', `${base()}/lists`, { name: res.name, filter: res.filter }));
          redraw();
        } catch (err) {
          report(err);
        }
      } }, 'Save it'));
    } catch (err) {
      report(err);
    } finally {
      ask.disabled = false;
      ask.textContent = 'Make a list';
    }
  });
  box.replaceChildren(...[h('h3', {}, 'Your lists'), ...lists.map(row), made, form,
    lists.length ? null : h('p', { class: 'muted small' }, 'Save a filter from the Wheel as a list, or describe one here.')].filter(Boolean));
}
