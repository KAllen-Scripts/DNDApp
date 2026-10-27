/**
 * Live embeds on a page (wiki space stage 9a): `[[creature:…]]`, `[[item:…]]`, `[[merchant:…]]`, `[[handout:…]]`
 * and `[[map:…]]` drawn as the thing itself, from what the server sent with the page for this viewer (`embeds`,
 * keyed `kind:name`): a stat block with its rolls, an item's card, a shop to open, a handout, a map's picture.
 */
import { h, api, fileUrl } from './api.js';
import { markdownBox } from './markdown.js';
import { wikiKey } from './shared/wiki.js';
import { statBlockRolls } from './shared/map.js';
import { gearCard } from './gear-card.js';
import { roll, rollModeFromEvent } from './dice.js';
import { state, nav, base, report } from './wiki-data.js';

const NOUNS = { creature: 'creature', item: 'item', merchant: 'merchant', handout: 'handout', map: 'map' };
const signed = (n) => (n >= 0 ? `+${n}` : String(n));

const picture = (path, alt = '') => {
  const img = h('img', { alt, decoding: 'async', class: 'wiki-app-pic' });
  fileUrl(path).then((src) => { img.src = src; }, () => img.remove());
  return img;
};

/** A creature's stat block, with buttons to roll its attacks and checks. */
function creatureCard(c) {
  const st = c.stats;
  const rolls = st ? statBlockRolls(st.text) : { attacks: [], abilities: [] };
  const go = (notation, label, e) => roll(notation, { label: `${c.name}: ${label}`, mode: rollModeFromEvent(e) });
  return [
    h('div', { class: 'wiki-app-head' }, c.picture ? picture(`/campaigns/${state.campaignId}/creatures/${c.id}/picture?v=${encodeURIComponent(c.picture)}`) : null, h('strong', {}, c.name),
      st ? h('span', { class: 'muted small' }, ` ${[st.ac != null ? `AC ${st.ac}` : '', st.hp_formula ? `HP ${st.hp_formula}` : '', st.challenge ? `CR ${st.challenge}` : ''].filter(Boolean).join(' · ')}`) : null),
    st?.text ? markdownBox(st.text, { class: 'a stat-text stat-block' }) : h('p', { class: 'muted small' }, 'No stat block yet.'),
    rolls.attacks.length || rolls.abilities.length ? h('div', { class: 'wiki-app-rolls' },
      ...rolls.attacks.flatMap((a) => [
        h('button', { type: 'button', class: 'ghost small', onclick: (e) => go(`1d20${signed(a.hit)}`, `${a.name} to hit`, e) }, `${a.name} ${signed(a.hit)}`),
        ...a.damage.map((d) => h('button', { type: 'button', class: 'ghost small', onclick: (e) => go(d, `${a.name} damage`, e) }, d)),
      ]),
      ...rolls.abilities.map((a) => h('button', { type: 'button', class: 'ghost small', onclick: (e) => go(`1d20${signed(a.mod)}`, `${a.ability} check`, e) }, `${a.ability} ${signed(a.mod)}`))) : null,
  ];
}

function cardFor(e) {
  if (e.app === 'creature') return creatureCard(e);
  if (e.app === 'item') return [gearCard(e.item)];
  if (e.app === 'merchant') {
    return [
      h('div', { class: 'wiki-app-head' }, e.picture ? picture(`/campaigns/${state.campaignId}/merchants/${e.id}/picture?v=${encodeURIComponent(e.picture)}`) : null, h('strong', {}, e.name), h('span', { class: 'muted small' }, e.open ? ` · ${e.stock} for sale` : ' · closed')),
      e.description ? h('p', { class: 'small' }, e.description) : null,
      nav.openShop ? h('button', { type: 'button', class: 'ghost small', onclick: () => nav.openShop(e.id) }, 'Open the shop') : null,
    ];
  }
  if (e.app === 'handout') {
    return [
      h('div', { class: 'wiki-app-head' }, h('strong', {}, e.title)),
      e.image ? picture(`/campaigns/${state.campaignId}/handouts/${e.id}/image?v=${encodeURIComponent(e.image.key)}`, e.title) : null,
      e.text ? markdownBox(e.text, { class: 'md small' }) : null,
    ];
  }
  if (e.app === 'map') {
    return [
      h('div', { class: 'wiki-app-head' }, h('strong', {}, e.name)),
      h('button', { type: 'button', class: 'wiki-app-map', title: `Open ${e.name}`, onclick: () => (nav.showMap ? nav.showMap(e.id) : nav.go(`#/atlas/${e.id}`)) }, picture(`/campaigns/${state.campaignId}/maps/${e.id}/image`, e.name)),
    ];
  }
  return [];
}

/** The box for one live embed, or null when this viewer gets nothing (the DM is told when nothing has that name). */
export function appEmbedBox(kind, name, embeds, dm) {
  const e = embeds?.[`${kind}:${wikiKey(name)}`];
  if (!e) return null;
  if (e.missing) return dm ? h('span', { class: 'wiki-embed missing muted small' }, `No ${NOUNS[kind]} called "${name}" to show here.`) : null;
  return h('span', { class: `wiki-app-embed app-${kind}`, 'data-app': kind }, ...cardFor(e).filter(Boolean));
}

const KIND_LABELS = { creature: 'Creatures', item: 'Items', merchant: 'Merchants', handout: 'Handouts', map: 'Maps' };

/** The editor's "+ Embed" chooser: resolves { kind, name }, or null when cancelled. */
export function chooseEmbed() {
  const dialog = document.querySelector('#wiki-dialog');
  return new Promise((resolve) => {
    let done = false;
    const finish = (pick) => {
      if (done) return;
      done = true;
      dialog.close();
      resolve(pick);
    };
    dialog.addEventListener('close', () => finish(null), { once: true });
    const pane = h('div', { class: 'wiki-chooser-pane' }, h('p', { class: 'muted small' }, 'Loading…'));
    dialog.className = 'map-dialog wiki-dialog wiki-chooser';
    dialog.replaceChildren(h('div', { class: 'map-dialog-inner' },
      h('div', { class: 'wiki-chooser-head' }, h('h2', {}, 'Embed something live'), h('button', { type: 'button', class: 'ghost', onclick: () => finish(null) }, 'Cancel')),
      h('p', { class: 'muted small' }, 'It shows as it is now, and players see it only when they could anyway.'),
      pane));
    dialog.showModal?.();
    state.guarded(() => api('GET', `${base()}/embeds`)).then(({ choices }) => {
      const groups = [];
      for (const kind of Object.keys(KIND_LABELS)) {
        const list = choices.filter((c) => c.kind === kind);
        if (!list.length) continue;
        groups.push(h('h3', {}, KIND_LABELS[kind]), h('div', { class: 'wiki-embed-choices' }, ...list.map((c) =>
          h('button', { type: 'button', class: 'ghost small', onclick: () => finish(c) }, c.name))));
      }
      pane.replaceChildren(...(groups.length ? groups : [h('p', { class: 'muted small' }, 'Nothing to embed yet: make a creature, item, merchant, handout or map first.')]));
    }, (err) => {
      pane.replaceChildren();
      report(err);
    });
  });
}
