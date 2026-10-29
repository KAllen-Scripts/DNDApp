/**
 * Send part of a wiki page as a handout (DM): a section, a picture or the
 * at-a-glance box, to every player or the ones ticked. The server leaves out
 * every block for the DM or chosen players. Optionally that part is made
 * available to them in the wiki too (POST …/wiki/:pid/handout).
 */
import { api, h } from '../page/api.js';
import { state, nav, base, report, status, playerName } from './data.js';
import { spoilerWords } from './views/waiting.js';

const $ = (sel) => document.querySelector(sel);

function dialogBox() {
  let d = $('#wiki-handout-dialog');
  if (!d) {
    d = h('dialog', { id: 'wiki-handout-dialog', class: 'map-dialog wiki-dialog', 'aria-label': 'Send as a handout' });
    document.body.append(d);
  }
  return d;
}

/** `part`: { section: id } | { picture: id } | { glance: true }; `label` names it in the dialog. */
export function sendHandout(page, part, label) {
  const d = dialogBox();
  const everyone = h('input', { type: 'radio', name: 'wiki-ho-to', value: 'everyone', checked: true });
  const some = h('input', { type: 'radio', name: 'wiki-ho-to', value: 'some' });
  const boxes = state.players.map((p) => h('input', { type: 'checkbox', value: String(p.id) }));
  const list = h('div', { class: 'wiki-ho-players' }, ...boxes.map((b, i) => h('label', { class: 'map-check' }, b, ` ${playerName(state.players[i].id)}`)));
  const share = h('input', { type: 'checkbox' });
  const sync = () => { list.hidden = !some.checked; };
  everyone.addEventListener('change', sync);
  some.addEventListener('change', sync);
  sync();
  const send = async () => {
    const to = everyone.checked ? 'everyone' : boxes.filter((b) => b.checked).map((b) => Number(b.value));
    if (!to.length) return status('Tick who gets it.', true);
    try {
      // The spoiler check (stage 8b): a section that names what they can't see yet asks first.
      if (part.section) {
        const { spoilers } = await state.guarded(() => api('POST', `${base()}/spoilers`, { page_id: page.id, players: to, sections: [part.section] }));
        const words = spoilerWords(spoilers);
        if (words && !confirm(`${words}\n\nSend it anyway? (Links become plain names in a handout.)`)) return;
      }
      const res = await state.guarded(() => api('POST', `${base()}/${page.id}/handout`, { part, to, share: share.checked }));
      d.close();
      status(`Sent "${res.handout.title}" as a handout.${res.page_hidden ? ' The page itself still isn’t shared with them, so they won’t see that part in the wiki until you share the page.' : ''}`);
      if (share.checked) nav.openPage(page.id);
    } catch (err) {
      report(err);
    }
  };
  d.replaceChildren(h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => { e.preventDefault(); send(); } },
    h('h2', {}, 'Send as a handout'),
    h('p', { class: 'muted small' }, `${label} from "${page.title}". Anything in a block for you or for chosen players stays out, and links become plain names.`),
    h('fieldset', { class: 'wiki-ho-to' }, h('legend', {}, 'Who gets it'),
      h('label', { class: 'map-check' }, everyone, ' Every player'),
      h('label', { class: 'map-check' }, some, ' Only the players ticked'),
      list),
    h('label', { class: 'map-check' }, share, ' Also make it available to them in the wiki'),
    h('div', { class: 'map-dialog-actions' },
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'ghost', onclick: () => d.close() }, 'Cancel'),
      h('button', { class: 'primary' }, 'Send')),
  ));
  d.showModal();
}

nav.sendHandout = sendHandout;
