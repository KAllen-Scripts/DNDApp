/**
 * How we know it (wiki space stage 3b): the "From session 12, 1:02:03" chips
 * under a section or a fact, which open the transcript lines the way Ask's
 * citations do (`GET …/wiki/evidence`, filtered by who is viewing), and the
 * editor's list of a part's sources, where one can be taken off.
 */
import { api, h } from '../page/api.js';
import { sourceLabel } from '/shared/citations.js';
import { base, report } from './data.js';

/** The chips for a part's sources (null when it has none). `as` is the player a page is viewed as. */
export function sourceChips(sources, { as = null } = {}) {
  if (!sources?.length) return null;
  const shown = h('div', { class: 'wiki-evidence' });
  const open = async (source, chip) => {
    const was = chip.getAttribute('aria-expanded') === 'true';
    for (const c of box.querySelectorAll('.wiki-source')) c.setAttribute('aria-expanded', 'false');
    if (was) return shown.replaceChildren();
    chip.setAttribute('aria-expanded', 'true');
    try {
      const { evidence } = await api('GET', `${base()}/evidence?s=${encodeURIComponent(source)}${as != null ? `&as=${as}` : ''}`);
      const e = evidence[0];
      shown.replaceChildren(e
        ? h('figure', {}, h('figcaption', { class: 'small' }, e.source.replace(/^S(\d+)/, 'Session $1')), h('pre', {}, e.excerpt))
        : h('p', { class: 'muted small' }, as != null ? 'Not from a session this player was at.' : 'That part of the transcript isn\'t there.'));
    } catch (err) {
      report(err);
    }
  };
  const box = h('div', { class: 'wiki-sources' },
    ...sources.map((s) => {
      const chip = h('button', { type: 'button', class: 'wiki-source small', 'aria-expanded': 'false', title: 'Show what was said' }, sourceLabel(s));
      chip.addEventListener('click', () => open(s, chip));
      return chip;
    }),
    shown);
  return box;
}

/** The editor's sources for a part: its chips, each with ✕. { el, value() }. */
export function sourcesEditor(sources = []) {
  let list = [...(sources ?? [])];
  const el = h('span', { class: 'wiki-sources-edit' });
  const draw = () => el.replaceChildren(...list.map((s) => h('span', { class: 'wiki-source small' }, sourceLabel(s),
    h('button', { type: 'button', class: 'ghost icon-btn', title: 'Take this source off', 'aria-label': `Take off ${sourceLabel(s)}`, onclick: () => { list = list.filter((x) => x !== s); draw(); } }, '✕'))));
  draw();
  return { el, value: () => (list.length ? { sources: list } : {}) };
}
