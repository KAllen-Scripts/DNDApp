/**
 * The wiki's Home (sketch 1 in the research): a hub to go anywhere from, by
 * pictures. The campaign's picture, "Last time" (the last session's page), the
 * Wheel, small, a tile for each view (the Atlas, the Web, the
 * Timeline), the pages changed most recently, the party, and what waits for
 * the DM. Its numbers come from the server (GET …/wiki/home). Below it,
 * wiki.js draws every page as a card.
 */
import { api, h, fileUrl } from '../../page/api.js';
import { atlasOrder } from '/shared/map.js';
import { state as mapState } from '../../map/state.js';
import { state, nav, base, report, pictureImg, fam, kindBadge } from '../data.js';
import { drawWheel } from './wheel.js';
import { miniRibbon } from '../../page/mini-views.js';
import { openMakeUp } from '../write.js';
import { newFromTemplate } from '../templates.js';
import { drawLists } from './lists.js';
import { drawInsights } from './insights.js';
import { STARTER_TEMPLATES } from '/shared/wiki-templates.js';

/** Draw the hub into `box` (it fills in when the server answers). */
export async function drawHub(box) {
  let data;
  try {
    data = await state.guarded(() => api('GET', `${base()}/home`));
  } catch (err) {
    return report(err);
  }
  if (!box.isConnected) return;
  const campaign = document.querySelector('#campaign-name')?.textContent || 'Your world';
  const open = (p) => nav.go(`#/page/${p.id}`);
  const mini = (p) => h('button', { type: 'button', class: `wiki-mini-card fam-${fam(p.kind)}`, title: p.title, onclick: () => open(p) },
    h('span', { class: `wiki-mini-art${p.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, p.picture ? pictureImg(p.picture, { size: 'thumb' }) : null),
    h('span', { class: 'wiki-mini-title' }, p.title));
  const tile = (icon, title, text, to = null) => h(to ? 'button' : 'div', to ? { type: 'button', class: 'wiki-tile', onclick: () => nav.go(to) } : { class: 'wiki-tile soon', title: `${title}: coming soon` },
    h('span', { class: 'wiki-tile-art', 'aria-hidden': 'true' }, icon),
    h('strong', {}, title),
    h('span', { class: 'muted small' }, text));
  // The Atlas tile shows the map at the top of the world, small.
  const atlasTile = (el) => {
    const top = atlasOrder(mapState.maps)[0]?.map;
    if (!top) return el;
    const { width: w, height: hh } = top.image;
    fileUrl(`/campaigns/${state.campaignId}/maps/${top.id}/image?crop=0,0,${w},${hh}&size=200`).then((src) => {
      el.querySelector('.wiki-tile-art')?.replaceWith(h('img', { class: 'wiki-tile-map', src, alt: '' }));
    }, () => {});
    return el;
  };
  // The Timeline tile shows the latest moments as a ribbon.
  const timelineTile = (el) => {
    if (data.moments?.length) el.querySelector('.wiki-tile-art')?.replaceChildren(miniRibbon({ events: data.moments, width: 96, height: 32, label: 'The latest moments' }));
    return el;
  };
  const last = data.last_session;
  const waiting = data.waiting?.proposals ?? 0;
  box.replaceChildren(...[
    h('section', { class: `wiki-hub-hero${data.hero ? ' has-picture' : ''}` },
      data.hero ? pictureImg(data.hero, { cls: 'wiki-hub-hero-img' }) : null,
      h('div', { class: 'wiki-hub-hero-text' },
        h('h2', {}, campaign),
        h('p', {}, `${data.count} page${data.count === 1 ? '' : 's'} about your world`),
      ),
    ),
    // What the AI noticed after the sessions (stage 8d), the DM's.
    drawInsights(data.insights),
    h('div', { class: 'wiki-hub-grid' },
      h('section', { class: 'wiki-hub-last' },
        h('h3', {}, 'Last time'),
        last
          ? h('button', { type: 'button', class: `wiki-last fam-${fam(last.kind)}`, onclick: () => open(last) },
            h('span', { class: `wiki-last-art${last.picture ? ' has-picture' : ''}`, 'aria-hidden': 'true' }, last.picture ? pictureImg(last.picture, { size: 'thumb' }) : null),
            h('span', { class: 'wiki-last-body' }, kindBadge(last.kind), h('strong', {}, last.title), last.excerpt ? h('span', { class: 'small' }, last.excerpt) : null))
          : h('p', { class: 'muted small' }, 'No session page yet. After a session, the AI offers one under Waiting.'),
      ),
      h('section', { class: 'wiki-hub-wheel' },
        h('h3', {}, 'What is in it'),
        drawWheel({ campaignId: state.campaignId, families: data.families, party: data.party, small: true, onPick: (f) => nav.go(f ? `#/wheel/${f}` : '#/wheel') }),
      ),
      h('section', { class: 'wiki-hub-tiles' },
        h('h3', {}, 'Ways in'),
        h('div', { class: 'wiki-tiles' },
          atlasTile(tile('⌖', 'Atlas', 'Where: your maps, with their pages', '#/atlas')),
          tile('⁂', 'Web', 'Who: people and how they are tied', '#/web'),
          timelineTile(tile('⟿', 'Timeline', 'When: what happened, in order', '#/timeline')),
          tile('✦', 'Quests', 'What the party is doing, by status', '#/quests'),
          // Session prep (stage 7b): the prep page being prepared, or a new one from the Session plan template.
          data.waiting ? h('button', { type: 'button', class: 'wiki-tile wiki-tile-prep', onclick: () => (data.prep ? nav.go(`#/page/${data.prep.id}`) : newFromTemplate(STARTER_TEMPLATES.find((t) => t.id === 'starter-session-plan'))) },
            h('span', { class: 'wiki-tile-art', 'aria-hidden': 'true' }, '☾'),
            h('strong', {}, 'Next session'),
            h('span', { class: 'muted small' }, data.prep ? data.prep.title : 'Plan it: a strong start, scenes, clues')) : null,
          data.waiting ? h('button', { type: 'button', class: 'wiki-tile', onclick: () => openMakeUp() },
            h('span', { class: 'wiki-tile-art', 'aria-hidden': 'true' }, '✦'),
            h('strong', {}, 'Make up…'),
            h('span', { class: 'muted small' }, 'An NPC, a tavern, a rumour, a name: fitting your world')) : null,
        ),
      ),
      h('section', { class: 'wiki-hub-party' },
        h('h3', {}, 'The party'),
        data.party.length
          ? h('ul', { class: 'wiki-party' }, ...data.party.map((p) => h('li', {},
            p.page ? h('button', { type: 'button', class: 'link', onclick: () => nav.go(`#/page/${p.page}`) }, p.character_name || p.name) : p.character_name || p.name,
            p.character_name ? h('span', { class: 'muted small' }, ` (${p.name})`) : null)))
          : h('p', { class: 'muted small' }, 'No players yet.'),
        data.waiting ? h('button', { type: 'button', class: `ghost wiki-hub-waiting${waiting ? ' waiting' : ''}`, onclick: () => nav.go('#/waiting') },
          waiting ? `${waiting} change${waiting === 1 ? '' : 's'} from the AI wait for you` : 'Nothing waits for you') : null,
      ),
    ),
    // The DM's lists (stage 8a), filled in when the server answers.
    data.waiting ? (() => { const lists = h('section', { class: 'wiki-hub-lists' }); drawLists(lists); return lists; })() : null,
    data.recent.length ? h('section', { class: 'wiki-hub-recent' },
      h('h3', {}, 'Changed lately'),
      h('div', { class: 'wiki-minis' }, ...data.recent.map(mini))) : null,
  ].filter(Boolean));
}
