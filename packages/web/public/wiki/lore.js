/**
 * Players' lore (wiki space stage 6c): on their own character's page, a player adds to their story (a section, a
 * page about their past, a relationship or an event), each for whoever they choose; it waits for the DM, who
 * approves it. Once approved, they can change their own parts; it applies at once.
 */
import { api } from '../page/api.js';
import { state, nav, base, status, report } from './data.js';
import { $, h } from '../page/dom.js';

const TYPES = [
  ['section', 'A part of your story', 'Something about your character: where they come from, what they want, what happened to them.'],
  ['relationship', 'Someone in their life', 'A sister, a rival, an old master: who they are to your character.'],
  ['event', 'Something that happened', 'A day that mattered, with when it was if you know.'],
  ['page', 'A page of its own', 'A place, a person or a thing from your past, with a page inside your character\'s.'],
];
const STATUS = { pending: 'waiting for the DM', approved: 'on the wiki', rejected: 'not used', replaced: 'replaced' };

/** Who it's for, from a player's side: only the DM, everyone, or chosen players (not themselves). */
function forPicker() {
  const mode = h('select', { 'aria-label': "Who it's for" }, h('option', { value: 'dm' }, 'Only the DM'), h('option', { value: 'all' }, 'Everyone'), h('option', { value: 'some' }, 'The DM and chosen players'));
  const others = state.players.filter((p) => p.id !== state.me);
  const boxes = others.map((p) => h('label', { class: 'small' }, h('input', { type: 'checkbox', value: String(p.id) }), ` ${p.character_name || p.name}`));
  const who = h('span', { class: 'wiki-who', hidden: true }, ...boxes);
  mode.addEventListener('change', () => { who.hidden = mode.value !== 'some'; });
  return {
    el: h('span', { class: 'wiki-picker' }, mode, who),
    value: () => (mode.value === 'some' ? [state.me, ...boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => Number(i.value))] : mode.value),
  };
}

/** "Your story" on the player's own character page: Add to your story, and what they've sent. */
export function drawLore(page) {
  if (state.dm || page.player !== state.me) return null;
  const list = h('ul', { class: 'wiki-lore-list small' });
  const box = h('section', { class: 'wiki-lore' },
    h('div', { class: 'wiki-lore-head' }, h('h3', {}, 'Your story'), h('button', { type: 'button', class: 'primary small', onclick: () => openAdd(page, refresh) }, '✚ Add to your story')),
    h('p', { class: 'muted small' }, 'What you add waits for the DM, then shows here for whoever you chose. You can change your own parts afterwards.'),
    list);
  const refresh = async () => {
    try {
      const { lore } = await api('GET', `${base()}/lore`);
      list.replaceChildren(...lore.slice(0, 12).map((l) => h('li', { class: `wiki-lore-${l.status}` }, h('strong', {}, l.title || '(untitled)'), ` · ${STATUS[l.status] ?? l.status}`)));
    } catch {}
  };
  refresh();
  return box;
}

function openAdd(page, done) {
  $('#wiki-lore-add')?.remove();
  const type = h('select', { 'aria-label': 'What to add' }, ...TYPES.map(([v, n]) => h('option', { value: v }, n)));
  const hint = h('p', { class: 'muted small' });
  const title = h('input', { maxLength: 200, 'aria-label': 'Title', placeholder: 'The Iron Hills' });
  const heading = h('input', { maxLength: 200, 'aria-label': 'Heading', placeholder: 'Heading (optional)' });
  const label = h('input', { maxLength: 60, 'aria-label': 'Who they are to you', placeholder: 'Sister, rival, old master…' });
  const value = h('input', { maxLength: 500, 'aria-label': 'Who', placeholder: 'Their name' });
  const when = h('input', { maxLength: 200, 'aria-label': 'When', placeholder: 'When (optional): "ten years ago", "Day 3"' });
  const text = h('textarea', { rows: 6, maxLength: 20000, 'aria-label': 'Your words' });
  const who = forPicker();
  const fld = (name, el) => h('label', { class: 'fld' }, h('span', {}, name), el);
  const rows = { title: fld('Title', title), heading: fld('Heading', heading), label: fld('Who they are', label), value: fld('Name', value), when: fld('When', when), text: fld('Your words', text) };
  const show = () => {
    const t = type.value;
    hint.textContent = TYPES.find(([v]) => v === t)[2];
    const on = { section: ['heading', 'text'], relationship: ['label', 'value'], event: ['when', 'text'], page: ['title', 'text'] }[t];
    for (const [k, el] of Object.entries(rows)) el.hidden = !on.includes(k);
  };
  type.addEventListener('change', show);
  const send = h('button', { type: 'submit', class: 'primary' }, 'Send to the DM');
  const d = h('dialog', { id: 'wiki-lore-add', class: 'map-dialog wiki-lore-dialog', 'aria-label': 'Add to your story' },
    h('form', { method: 'dialog' },
      h('h3', {}, `Add to ${page.title}'s story`),
      fld('What', type), hint, ...Object.values(rows),
      fld("Who it's for", who.el),
      h('div', { class: 'map-dialog-actions' }, h('button', { type: 'button', class: 'ghost', onclick: () => d.close() }, 'Cancel'), h('span', { class: 'spacer' }), send)));
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { type: type.value, available: who.value(), title: title.value, heading: heading.value, label: label.value, value: value.value, when: when.value, text: text.value };
    send.disabled = true;
    try {
      await state.guarded(() => api('POST', `${base()}/lore`, body));
      d.close();
      status('Sent. It waits for the DM.');
      done();
    } catch (err) {
      report(err);
    } finally {
      send.disabled = false;
    }
  });
  show();
  ($('#app-view') ?? document.body).append(d);
  d.showModal?.();
  text.focus();
}

/** Change one of your own sections in place (once the DM approved it). */
export function editLoreSection(page, s, el) {
  const heading = h('input', { value: s.heading, maxLength: 200, 'aria-label': 'Heading' });
  const text = h('textarea', { rows: 6, maxLength: 200000, 'aria-label': 'Your words' });
  text.value = s.text;
  const save = h('button', { type: 'button', class: 'primary small', onclick: async () => {
    try {
      await state.guarded(() => api('PUT', `${base()}/${page.id}/lore`, { section_id: s.id, heading: heading.value, text: text.value }));
      status('Saved.');
      await nav.openPage(page.id);
    } catch (err) {
      report(err);
    }
  } }, 'Save');
  el.replaceChildren(h('div', { class: 'wiki-lore-edit' }, heading, text, h('div', { class: 'wiki-actions' }, save, h('button', { type: 'button', class: 'ghost small', onclick: () => nav.openPage(page.id) }, 'Cancel'))));
  text.focus();
}

nav.editLore = editLoreSection;
