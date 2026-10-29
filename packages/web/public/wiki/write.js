/**
 * The AI as a writing partner (wiki space stage 5b), on the DM's buttons: Draft from the records, Expand and
 * Tidy in the editor, and Make up… (in Find and on the Home). Each is one AI call on the server; what it writes
 * waits under Waiting for you. Also the link suggestions on a page: names that match another page, underlined
 * with Link it (worked out on the server, no AI).
 */
import { api } from '../page/api.js';
import { state, nav, base, status, report } from './data.js';
import { $, h } from '../page/dom.js';

/** Ask the AI (POST …/wiki/draft); the result waits under Waiting. `button` shows it's working. */
export async function askWriter(body, button = null) {
  const label = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Writing…';
  }
  status('The AI is writing. It takes a little while.');
  try {
    const res = await state.guarded(() => api('POST', `${base()}/draft`, body));
    state.proposals = res.proposals;
    nav.drawReviewButton();
    status(res.made ? `The AI's ${res.made === 1 ? 'draft waits' : `${res.made} changes wait`} for you under Waiting.` : 'The AI had nothing to add from the records.');
    return res;
  } catch (err) {
    report(err);
    return null;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = label;
    }
  }
}

const KINDS = [['an NPC', 'An NPC'], ['a tavern', 'A tavern'], ['a shop', 'A shop'], ['a rumour', 'A rumour'], ['a name', 'A name'], ['', 'Something else']];

/** Make up… : what, and a few words; the AI makes a planned page, only yours, fitting the wiki. */
export function openMakeUp(start = '') {
  $('#wiki-make-up')?.remove();
  const what = h('select', { 'aria-label': 'What to make up' }, ...KINDS.map(([v, n]) => h('option', { value: v }, n)));
  const notes = h('textarea', { rows: 3, maxLength: 2000, 'aria-label': 'What it should be like', placeholder: 'A few words: "a nervous fence near the docks", "something to do with the mill"…' });
  notes.value = start;
  const go = h('button', { type: 'submit', class: 'primary' }, 'Make it up');
  const d = h('dialog', { id: 'wiki-make-up', class: 'map-dialog wiki-make-up', 'aria-label': 'Make up' },
    h('form', { method: 'dialog' },
      h('h3', {}, '✦ Make up…'),
      h('p', { class: 'muted small' }, 'The AI reads the pages it would touch first, so it fits your world. It becomes a page only you see, marked planned, waiting for you to approve.'),
      h('label', { class: 'fld' }, h('span', {}, 'What'), what),
      h('label', { class: 'fld' }, h('span', {}, 'Like'), notes),
      h('div', { class: 'map-dialog-actions' }, h('button', { type: 'button', class: 'ghost', onclick: () => d.close() }, 'Cancel'), h('span', { class: 'spacer' }), go)));
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!what.value && !notes.value.trim()) return status('Say what to make up.', true);
    const res = await askWriter({ mode: 'make_up', what: what.value, notes: notes.value.trim() }, go);
    if (!res) return;
    d.close();
    if (res.made && document.documentElement.dataset.space === 'wiki') nav.go('#/waiting');
  });
  ($('#app-view') ?? document.body).append(d);
  d.showModal();
  notes.focus();
}

/** Link suggestions on a page: each name underlined in its section, with Link it. */
export async function linkHints(article, page) {
  let suggestions;
  try {
    ({ suggestions } = await api('GET', `${base()}/${page.id}/links`));
  } catch {
    return;
  }
  for (const s of suggestions) {
    const el = article.querySelector(`.wiki-section[data-section="${s.section_id}"] .wiki-canon-text`);
    if (el) underline(el, s, page);
  }
}

function underline(el, s, page) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('a, button, code, .wiki-link-hint') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const key = s.name.toLowerCase();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.data.toLowerCase().indexOf(key);
    if (i < 0) continue;
    const word = n.splitText(i);
    word.splitText(s.name.length);
    const hint = h('span', { class: 'wiki-link-hint', title: `A page: ${s.title}` }, word.data,
      h('button', { type: 'button', class: 'wiki-link-it small', onclick: async () => {
        try {
          await state.guarded(() => api('POST', `${base()}/${page.id}/links`, { section_id: s.section_id, page_id: s.page_id, version: page.version }));
          status(`Linked ${s.title}.`);
          await nav.openPage(page.id);
        } catch (err) {
          report(err);
        }
      } }, 'Link it'));
    word.replaceWith(hint);
    return;
  }
}
