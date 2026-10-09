/**
 * The table: what everyone in the campaign shares live (GET /campaigns/:cid/live).
 *
 *   - Rolls: others' rolls you may see go to the dice tray (dice.js).
 *   - Handouts: pictures and text the DM gives to everyone or chosen players.
 *     The Handouts tab lists the ones given to you; the DM gives, changes who
 *     gets them, and takes them back. A new one marks the tab until it's opened.
 *   - Rests: a short or long rest the DM called that includes you (rests.js).
 */
import { api, listen, fileUrl, h, readBase64, LoggedOut } from './api.js';
import { tableRoll } from './dice.js';
import { merchantChanged } from './merchants.js';
import { restHeard } from './rests.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  campaignId: null,
  guarded: (fn) => fn(),
  canEdit: false,
  handouts: [],
  members: [], // the DM's list of players, to choose who gets a handout
  images: new Map(), // handout id:key -> object URL
  live: null,
  unseen: 0,
};

const base = () => `/campaigns/${state.campaignId}`;

/** Enter a campaign: load the handouts and start listening. */
export async function loadTable({ campaignId, guarded }) {
  stopTable();
  Object.assign(state, { campaignId, guarded, handouts: [], members: [], unseen: 0 });
  for (const url of state.images.values()) URL.revokeObjectURL(url);
  state.images.clear();
  const res = await api('GET', `${base()}/handouts`);
  state.canEdit = res.can_edit;
  state.handouts = res.handouts;
  if (state.canEdit) state.members = (await api('GET', `${base()}/members`)).filter((m) => m.role === 'player' && !m.revoked_at);
  $('#tab-handouts').classList.toggle('can-edit', state.canEdit);
  drawForm();
  drawHandouts();
  markUnseen(0);
  startLive();
}

export function stopTable() {
  state.live?.abort();
  state.live = null;
}

/** Listen for rolls and handouts; reconnect after a dropped connection and catch up. */
function startLive() {
  const controller = new AbortController();
  state.live = controller;
  const cid = state.campaignId;
  (async () => {
    let wait = 1000;
    while (!controller.signal.aborted) {
      try {
        await listen(`/campaigns/${cid}/live`, (event, data) => {
          wait = 1000;
          if (event === 'roll') tableRoll(data);
          else if (event === 'handout') onHandout(data);
          else if (event === 'handout-gone') onGone(data.id);
          else if (event === 'merchant') merchantChanged(data.id);
          else if (event === 'rest') restHeard(data);
        }, { signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof LoggedOut) return state.guarded(() => { throw err; });
      }
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 30_000);
      if (!controller.signal.aborted) {
        try {
          const res = await api('GET', `${base()}/handouts`);
          for (const handout of res.handouts) if (!state.handouts.some((x) => x.id === handout.id)) markUnseen(state.unseen + 1);
          state.handouts = res.handouts;
          drawHandouts();
        } catch { /* try again on the next round */ }
      }
    }
  })();
}

function onHandout(handout) {
  const i = state.handouts.findIndex((x) => x.id === handout.id);
  if (i >= 0) state.handouts[i] = handout;
  else {
    state.handouts.unshift(handout);
    if (!state.canEdit && $('#tab-handouts').hidden) markUnseen(state.unseen + 1);
  }
  drawHandouts();
}

function onGone(id) {
  state.handouts = state.handouts.filter((x) => x.id !== id);
  drawHandouts();
}

/** New handouts show as a count on the tab until it's opened. */
function markUnseen(n) {
  state.unseen = n;
  const tab = $('[data-tab=handouts]');
  tab.querySelector('.tab-badge')?.remove();
  if (n) tab.append(h('span', { class: 'tab-badge', 'aria-label': `${n} new` }, String(n)));
}

export function handoutsOpened() {
  markUnseen(0);
}

// ---------- the list ----------

function recipients(to) {
  if (to === 'everyone') return 'Everyone';
  const names = to.map((id) => state.members.find((m) => m.id === id)).filter(Boolean).map((m) => m.character_name || m.name);
  return names.length ? names.join(', ') : 'Nobody yet';
}

function picture(handout) {
  const img = h('img', { class: 'handout-picture', alt: handout.title });
  const key = `${handout.id}:${handout.image.key}`;
  if (state.images.has(key)) img.src = state.images.get(key);
  else {
    const cid = state.campaignId;
    fileUrl(`${base()}/handouts/${handout.id}/image?v=${encodeURIComponent(handout.image.key)}`)
      .then((url) => {
        if (state.campaignId !== cid) return URL.revokeObjectURL(url);
        state.images.set(key, url);
        img.src = url;
      })
      .catch(() => img.replaceWith(h('p', { class: 'muted small' }, "The picture couldn't be loaded.")));
  }
  // Click to see it bigger.
  return h('button', { type: 'button', class: 'handout-picture-link', title: 'Bigger or smaller', onclick: (e) => e.currentTarget.classList.toggle('zoomed') }, img);
}

function drawHandouts() {
  const box = $('#handouts');
  if (!state.handouts.length) {
    box.replaceChildren(h('p', { class: 'muted' }, state.canEdit ? 'No handouts yet. Give the players a letter, a poster or a picture above.' : 'No handouts yet. Anything the DM gives you shows up here.'));
    return;
  }
  box.replaceChildren(...state.handouts.map((x) => h('article', { class: 'handout card', 'data-id': x.id },
    h('header', { class: 'handout-head' },
      h('h3', {}, x.title),
      h('time', { class: 'muted small', datetime: x.created_at }, new Date(x.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))),
    x.image ? picture(x) : null,
    x.text ? h('p', { class: 'handout-text' }, x.text) : null,
    state.canEdit ? dmControls(x) : null,
  )));
}

/** The DM's controls on a handout: who gets it, and taking it back. */
function dmControls(x) {
  const pick = recipientPicker(x.to);
  return h('div', { class: 'handout-dm' },
    h('span', { class: 'muted small' }, `Given to: ${recipients(x.to)}`),
    h('details', {},
      h('summary', {}, 'Change who gets it'),
      pick.el,
      h('button', { type: 'button', class: 'ghost', onclick: () => change(x, { to: pick.value() }) }, 'Save')),
    h('button', { type: 'button', class: 'ghost danger', onclick: () => takeBack(x) }, 'Take back'),
  );
}

async function change(x, fields) {
  try {
    const res = await state.guarded(() => api('PATCH', `${base()}/handouts/${x.id}`, fields));
    if (res) onHandout(res);
  } catch (err) {
    alert(`Couldn't change the handout: ${err.message}`);
  }
}

async function takeBack(x) {
  if (!confirm(`Take back "${x.title}"? The players stop seeing it.`)) return;
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/handouts/${x.id}`));
    if (res) onGone(x.id);
  } catch (err) {
    alert(`Couldn't take it back: ${err.message}`);
  }
}

// ---------- giving one (DM) ----------

/** Everyone, or ticked players. */
function recipientPicker(to = 'everyone') {
  const everyone = h('input', { type: 'checkbox', checked: to === 'everyone', 'data-everyone': '' });
  const boxes = state.members.map((m) => h('input', { type: 'checkbox', value: String(m.id), checked: to !== 'everyone' && to.includes(m.id) }));
  const sync = () => boxes.forEach((b) => (b.disabled = everyone.checked));
  everyone.addEventListener('change', sync);
  sync();
  const el = h('div', { class: 'handout-to' },
    h('label', { class: 'check' }, everyone, 'Everyone'),
    ...state.members.map((m, i) => h('label', { class: 'check' }, boxes[i], m.character_name ? `${m.character_name} (${m.name})` : m.name)));
  return { el, value: () => (everyone.checked ? 'everyone' : boxes.filter((b) => b.checked).map((b) => Number(b.value))) };
}

function drawForm() {
  const box = $('#handout-form-box');
  if (!state.canEdit) return box.replaceChildren();
  const title = h('input', { name: 'title', placeholder: 'Title, e.g. Letter from the Baron', maxLength: 200, required: true, autocomplete: 'off' });
  const text = h('textarea', { name: 'text', rows: 4, maxLength: 20000, placeholder: 'What it says (optional if you add a picture)' });
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', 'aria-label': 'Picture' });
  const pick = recipientPicker('everyone');
  const error = h('p', { class: 'error small', hidden: true, role: 'alert' });
  const form = h('form', { id: 'handout-form', class: 'card handout-form', onsubmit: async (e) => {
    e.preventDefault();
    error.hidden = true;
    const to = pick.value();
    if (Array.isArray(to) && !to.length) return Object.assign(error, { hidden: false, textContent: 'Choose who gets it.' });
    const f = file.files[0];
    if (!text.value.trim() && !f) return Object.assign(error, { hidden: false, textContent: 'Add some text or a picture.' });
    if (f && f.size > 10 * 1024 * 1024) return Object.assign(error, { hidden: false, textContent: 'That picture is too big (10 MB at most).' });
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const picture = f ? { filename: f.name, data: await readBase64(f) } : undefined;
      const res = await state.guarded(() => api('POST', `${base()}/handouts`, { title: title.value.trim(), text: text.value, to, picture }));
      if (res) {
        onHandout(res);
        form.reset();
        pick.el.querySelector('[data-everyone]').dispatchEvent(new Event('change'));
      }
    } catch (err) {
      Object.assign(error, { hidden: false, textContent: err.message });
    } finally {
      button.disabled = false;
    }
  } },
    h('h2', {}, 'Give a handout'),
    title, text,
    h('label', { class: 'small' }, 'Picture ', file),
    h('div', {}, h('span', { class: 'muted small' }, 'Who gets it'), pick.el),
    error,
    h('div', { class: 'composer-row' }, h('span', { class: 'muted small' }, 'It shows up for them straight away.'), h('button', { type: 'submit', class: 'primary' }, 'Give')),
  );
  box.replaceChildren(form);
}
