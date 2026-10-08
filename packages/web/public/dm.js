/**
 * The DM's Archivist tab: the questions the archivist left when sources
 * disagreed, and corrections in plain words. Answers and corrections go to
 * the archivist, which applies them in the background.
 */
import { api, h } from './api.js';

const $ = (sel) => document.querySelector(sel);

const state = { campaignId: null, guarded: (fn) => fn(), questions: [], corrections: [] };
const base = () => `/campaigns/${state.campaignId}`;

/** Enter a campaign. Only the DM gets the tab; players never call this. */
export async function loadArchivist({ campaignId, guarded }) {
  Object.assign(state, { campaignId, guarded });
  await refresh();
}

async function refresh() {
  const [questions, corrections] = await Promise.all([
    api('GET', `${base()}/questions?status=open`),
    api('GET', `${base()}/corrections`),
  ]);
  Object.assign(state, { questions, corrections });
  draw();
}

/** Open questions show as a count on the tab. */
function badge() {
  const tab = $('[data-tab=archivist]');
  tab.querySelector('.tab-badge')?.remove();
  if (state.questions.length) tab.append(h('span', { class: 'tab-badge', 'aria-label': `${state.questions.length} open questions` }, String(state.questions.length)));
}

function draw() {
  badge();
  $('#dm-questions').replaceChildren(
    ...(state.questions.length
      ? state.questions.map(questionCard)
      : [h('p', { class: 'muted' }, 'No questions. When the archivist finds sources that disagree (two names for one NPC, a sum that doesn\'t add up), it asks here.')]),
  );
  $('#dm-corrections').replaceChildren(
    ...(state.corrections.length
      ? [...state.corrections].reverse().map((c) => h('li', { class: 'card correction' },
        h('time', { class: 'muted small', datetime: c.created_at }, new Date(c.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })),
        h('p', {}, c.text)))
      : [h('li', { class: 'muted small' }, 'No corrections yet.')]),
  );
}

function questionCard(q) {
  const answer = h('textarea', { rows: 2, maxLength: 10000, placeholder: 'Your answer, in plain words', 'aria-label': `Answer: ${q.question}` });
  const send = async (path, body, done) => {
    try {
      const res = await state.guarded(() => api('POST', `${base()}/questions/${q.id}/${path}`, body));
      if (!res) return;
      state.questions = state.questions.filter((x) => x.id !== q.id);
      if (res.correction) state.corrections.push(res.correction);
      draw();
      status(done);
    } catch (err) {
      alert(`Couldn't send it: ${err.message}`);
    }
  };
  return h('article', { class: 'card dm-question' },
    h('p', { class: 'dm-q' }, q.question),
    q.context ? h('p', { class: 'muted small' }, q.context) : null,
    answer,
    h('div', { class: 'composer-row' },
      h('button', { type: 'button', class: 'ghost', onclick: () => send('dismiss', {}, 'Dismissed.') }, 'Dismiss'),
      h('button', { type: 'button', class: 'primary', onclick: () => answer.value.trim() ? send('answer', { answer: answer.value.trim() }, 'Sent. The archivist is applying your answer.') : answer.focus() }, 'Answer')),
  );
}

function status(text) {
  $('#dm-status').textContent = text;
}

export function initArchivistActions() {
  $('#correction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const text = form.text.value.trim();
    if (!text) return;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const res = await state.guarded(() => api('POST', `${base()}/corrections`, { text }));
      if (res) {
        form.text.value = '';
        state.corrections.push(res.correction);
        draw();
        status('Sent. The archivist is applying your correction.');
      }
    } catch (err) {
      alert(`Couldn't send the correction: ${err.message}`);
    } finally {
      button.disabled = false;
    }
  });
  // Questions can arrive while the tab is open (after a session is processed): look again when it's opened.
  $('[data-tab=archivist]').addEventListener('click', () => state.campaignId && refresh().catch(() => {}));
}
