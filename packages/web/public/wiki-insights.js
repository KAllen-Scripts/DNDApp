/**
 * A Home that thinks (wiki space stage 8d): what the AI noticed after the sessions, as cards on the DM's Home:
 * "Previously on…" to read aloud, loose threads and contradictions, each with Open, Dismiss and, for a
 * contradiction, Propose the fix (it then waits under Waiting).
 */
import { api, h } from './api.js';
import { state, nav, base, report, status } from './wiki-data.js';

const LABELS = { previously: 'Previously on…', loose_thread: 'Loose thread', contradiction: 'The records disagree' };
const ICONS = { previously: '☾', loose_thread: '⧖', contradiction: '⚠' };

/** The insights as a section of the Home, or null with none. */
export function drawInsights(insights) {
  if (!insights?.length) return null;
  const box = h('section', { class: 'wiki-hub-insights', 'aria-label': 'Since last time' });
  const draw = (list) => {
    if (!list.length) return box.remove();
    box.replaceChildren(h('h3', {}, 'Since last time'), h('div', { class: 'wiki-insights' }, ...list.map(card)));
  };
  const act = (path, done) => async (e) => {
    e.target.disabled = true;
    try {
      const res = await state.guarded(() => api('POST', `${base()}/insights/${path}`, {}));
      if (res.proposals != null) state.proposals = res.proposals;
      nav.drawReviewButton();
      if (done) status(done);
      draw(res.insights);
    } catch (err) {
      e.target.disabled = false;
      report(err);
    }
  };
  const card = (x) => h('div', { class: `wiki-insight insight-${x.type}`, 'data-insight': x.id },
    h('div', { class: 'wiki-insight-head' }, h('span', { 'aria-hidden': 'true' }, ICONS[x.type] ?? '✦'), ' ', h('strong', {}, LABELS[x.type] ?? 'Noticed'), x.page_title ? h('span', { class: 'muted small' }, ` · ${x.page_title}`) : null),
    h('p', { class: x.type === 'previously' ? 'wiki-insight-recap' : 'small' }, x.text),
    h('div', { class: 'wiki-actions' },
      x.page_id ? h('button', { type: 'button', class: 'ghost small', onclick: () => nav.go(`#/page/${x.page_id}`) }, 'Open') : null,
      x.can_fix ? h('button', { type: 'button', class: 'ghost small', onclick: act(`${x.id}/fix`, 'The fix waits for you under Waiting.') }, 'Propose the fix') : null,
      h('button', { type: 'button', class: 'ghost small', onclick: act(`${x.id}/dismiss`) }, 'Dismiss')));
  draw(insights);
  return box;
}
