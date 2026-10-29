/**
 * Scrubbing through time (wiki space stage 11): a slider for the Atlas and the Web, from now back to the end of each
 * session played (GET …/wiki/moments). `onChange(at)` gets the moment (an ISO time), or null for now.
 */
import { api } from '../page/api.js';
import { state, base } from './data.js';
import { h } from '../page/dom.js';

let moments = null; // the campaign's, fetched once a visit to the space

/** Forget the moments (a new campaign, or a session added). */
export function clearMoments() {
  moments = null;
}

/** The slider: `at` the moment shown now (or null). Hidden until there's a session to go back to. */
export function timeSlider(at, onChange) {
  const range = h('input', { type: 'range', min: '0', max: '0', step: '1', value: '0', 'aria-label': 'As of', disabled: true });
  const text = h('span', { class: 'small wiki-asof-text' }, 'Now');
  const box = h('label', { class: 'wiki-asof', hidden: true, title: 'See it as it was at the end of a session' }, h('span', { class: 'small muted' }, 'As of '), range, text);
  const list = () => moments ?? [];
  const show = () => {
    const i = Number(range.value);
    const m = list()[i];
    text.textContent = m ? `session ${m.number}${m.title ? `: ${m.title}` : ''} (${m.played_on})` : 'Now';
    box.classList.toggle('past', !!m);
  };
  const ready = () => {
    const ms = list();
    if (!ms.length) return;
    range.max = String(ms.length);
    const i = at ? ms.findIndex((m) => m.at === at) : -1;
    range.value = String(i >= 0 ? i : ms.length);
    range.disabled = false;
    box.hidden = false;
    show();
  };
  range.addEventListener('input', show);
  range.addEventListener('change', () => onChange(list()[Number(range.value)]?.at ?? null));
  if (moments) ready();
  else {
    state.guarded(() => api('GET', `${base()}/moments`)).then((res) => {
      moments = res.moments;
      ready();
    }, () => {});
  }
  return box;
}
