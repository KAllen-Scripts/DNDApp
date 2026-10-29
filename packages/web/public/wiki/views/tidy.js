/**
 * Tidy up (wiki space stage 8c, `#/tidy`, the DM's): what in the wiki needs a hand, by rule (GET …/wiki/tidy), each
 * with a button that fixes it or opens the page where it's fixed: make a missing page, link the names written out,
 * put a place on a map, make a page for a place, choose a person's picture, or edit.
 */
import { api, h } from '../../page/api.js';
import { state, nav, base, report, status, choosePicture, kindBadge } from '../data.js';

/** Draw Tidy up into `main` (it fills in when the server answers). */
export async function drawTidy(main) {
  const box = h('div', { class: 'wiki-tidy' }, h('p', { class: 'muted small' }, 'Loading…'));
  main.replaceChildren(box);
  let data;
  try {
    data = await state.guarded(() => api('GET', `${base()}/tidy`));
  } catch (err) {
    return report(err);
  }
  if (state.view !== 'tidy' || !box.isConnected) return;
  const again = () => drawTidy(main);
  const run = (fn, done) => async (e) => {
    e.target.disabled = true;
    try {
      await state.guarded(fn);
      status(done);
      await nav.refreshList();
      again();
    } catch (err) {
      e.target.disabled = false;
      report(err);
    }
  };
  const fixes = {
    make_page: (i) => ['Make the page', run(() => api('POST', base(), { title: i.name, available: 'dm' }), `Made "${i.name}", only for you so far.`)],
    link: (i) => ['Link them', run(async () => {
      const { suggestions } = await api('GET', `${base()}/${i.page.id}/links`);
      for (const s of suggestions) {
        try {
          await api('POST', `${base()}/${i.page.id}/links`, { section_id: s.section_id, page_id: s.page_id });
        } catch {}
      }
    }, `Linked the names on ${i.page.title}.`)],
    map: (i) => (nav.putOnMap ? ['Put it on a map', () => nav.putOnMap(i.page)] : ['Open', () => nav.go(`#/page/${i.page.id}`)]),
    make_place: (i) => ['Make a page', run(() => api('POST', `${base()}/from-map`, { map_id: i.map_id, kind: 'place', id: i.place_id }), `Made a page for ${i.name}.`)],
    picture: (i) => ['Choose a picture', async (e) => {
      const id = await choosePicture(`A picture of ${i.page.title}`);
      if (!id) return;
      await run(async () => {
        const { page } = await api('GET', `${base()}/${i.page.id}`);
        await api('PUT', `${base()}/${page.id}`, { version: page.version, picture: { id } });
      }, `${i.page.title} has a picture.`)(e);
    }],
    edit: (i) => ['Edit', () => nav.go(`#/page/${i.page.id}/edit`)],
    open: (i) => ['Open', () => nav.go(`#/page/${i.page.id}`)],
  };
  const total = data.items.length;
  box.replaceChildren(...[
    h('div', { class: 'wiki-home-head' }, h('h2', {}, '✧ Tidy up'), h('span', { class: 'muted small' }, total ? `${total} thing${total === 1 ? '' : 's'} to look at` : 'All tidy')),
    total ? null : h('p', { class: 'muted' }, 'Nothing needs a hand: every link has a page, every place is on a map, and every person has a picture.'),
    ...data.rules.filter((r) => r.count).map((r) => h('section', { class: 'wiki-tidy-rule', 'data-rule': r.rule },
      h('h3', {}, r.label, h('span', { class: 'muted small' }, ` ${r.count}`)),
      h('ul', {}, ...data.items.filter((i) => i.rule === r.rule).map((i) => {
        const [label, onclick] = fixes[r.fix](i);
        return h('li', { class: 'wiki-tidy-item' },
          i.page ? kindBadge(i.page.kind, ' small') : null,
          h('span', { class: 'wiki-tidy-text' }, i.text),
          h('button', { type: 'button', class: 'ghost small', onclick }, label));
      })))),
  ].filter(Boolean));
}
