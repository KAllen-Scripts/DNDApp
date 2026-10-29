/**
 * The quest board (wiki space stage 8a, `#/quests`): the quests the viewer may see, as cards in columns by their
 * Status (Rumoured, Active, Done, Failed, any others the DM wrote, and none), a row for each arc. The DM drags a
 * card to another column, or picks its status, and the page's Status fact changes (PUT …/:pid/status).
 */
import { api, h } from '../../page/api.js';
import { state, nav, base, report, status, pictureImg, fam } from '../data.js';

/** Draw the board into `main` (it fills in when the server answers). */
export async function drawQuests(main) {
  const box = h('div', { class: 'wiki-quests' }, h('p', { class: 'muted small' }, 'Loading…'));
  main.replaceChildren(box);
  let data;
  try {
    data = await state.guarded(() => api('GET', `${base()}/quests`));
  } catch (err) {
    return report(err);
  }
  if (state.view !== 'quests' || !box.isConnected) return;
  const move = async (q, to) => {
    if (to === q.column) return;
    try {
      await state.guarded(() => api('PUT', `${base()}/${q.id}/status`, { status: to }));
      status(`${q.title}: ${data.columns.find((c) => c.key === to)?.label ?? 'no status'}.`);
      drawQuests(main);
    } catch (err) {
      report(err);
    }
  };
  const byId = new Map(data.quests.map((q) => [q.id, q]));
  const card = (q) => {
    const el = h('div', { class: `wiki-quest-card fam-${fam(q.kind)}`, 'data-page': q.id, draggable: state.dm ? 'true' : null },
      h('button', { type: 'button', class: 'wiki-quest-open', title: q.title, onclick: () => nav.go(`#/page/${q.id}`) },
        h('span', { class: `wiki-quest-art${q.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, q.picture ? pictureImg(q.picture, { size: 'thumb' }) : '✦'),
        h('strong', {}, q.title)),
      q.given_by ? h('span', { class: 'small' }, h('span', { class: 'muted' }, 'Given by '), q.given_by) : null,
      q.reward ? h('span', { class: 'small' }, h('span', { class: 'muted' }, 'Reward '), q.reward) : null,
      // Without dragging (a phone, a keyboard): pick the status.
      state.dm ? h('select', { class: 'wiki-quest-status', 'aria-label': `Status of ${q.title}`, onchange: (e) => move(q, e.target.value) },
        ...data.columns.map((c) => h('option', { value: c.key, selected: c.key === q.column ? '' : null }, c.label))) : null);
    if (state.dm) el.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', q.id));
    return el;
  };
  const column = (c, quests) => {
    const col = h('section', { class: `wiki-quest-col col-${c.key ? c.key.replace(/\W+/g, '-') : 'none'}`, 'data-column': c.key, 'aria-label': c.label },
      h('h3', {}, c.label, h('span', { class: 'muted small' }, ` ${quests.length}`)),
      ...quests.map(card));
    if (state.dm) {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('dropping'); });
      col.addEventListener('dragleave', () => col.classList.remove('dropping'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('dropping');
        const q = byId.get(e.dataTransfer?.getData('text/plain'));
        if (q) move(q, c.key);
      });
    }
    return col;
  };
  // A row for each arc (and the quests in none); with no arcs, one row.
  const groups = [...data.arcs.map((a) => ({ arc: a, quests: data.quests.filter((q) => q.arc === a.id) })), { arc: null, quests: data.quests.filter((q) => !q.arc) }]
    .filter((g) => g.quests.length || (!data.arcs.length && !g.arc));
  box.replaceChildren(...[
    h('div', { class: 'wiki-home-head' }, h('h2', {}, '✦ Quests'), h('span', { class: 'muted small' }, `${data.quests.length} quest${data.quests.length === 1 ? '' : 's'}`)),
    data.quests.length ? null : h('p', { class: 'muted' }, state.dm ? 'No quests yet. A page of kind quest, job or mission shows here, by its Status fact.' : 'No quests yet.'),
    ...groups.map((g) => h('div', { class: 'wiki-quest-row' },
      data.arcs.length ? h('h3', { class: 'wiki-quest-arc' }, g.arc ? h('button', { type: 'button', class: 'link', onclick: () => nav.go(`#/page/${g.arc.id}`) }, g.arc.title) : 'Not in an arc') : null,
      h('div', { class: 'wiki-quest-cols' }, ...data.columns.map((c) => column(c, g.quests.filter((q) => q.column === c.key)))))),
  ].filter(Boolean));
}
