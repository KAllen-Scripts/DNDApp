/**
 * Character pages (wiki space stage 6b): the parts of a player's sheet on their character's page, drawn live from
 * the sheet by the server (never copied into the wiki), with the player's choice of what the other players see;
 * and Waiting's offer of a page for each character that has none.
 */
import { api, h } from './api.js';
import { SHEET_PARTS } from './shared/wiki.js';
import { state, nav, base, status, report, playerName } from './wiki-data.js';

/** The page's "From the sheet" box, or null. `fromSheet` is what the server sent; `page` the page. */
export function drawFromSheet(fromSheet, page) {
  if (!fromSheet) return null;
  const { facts, sections, share, mine } = fromSheet;
  const owner = mine ? 'your' : `${playerName(page.player)}'s`;
  const canShare = mine || (state.dm && state.as == null);
  const empty = !facts.length && !sections.length;
  if (empty && !canShare) return null;
  return h('section', { class: 'wiki-from-sheet' },
    h('h3', {}, `From ${owner} sheet`),
    facts.length ? h('dl', { class: 'wiki-sheet-facts' }, ...facts.flatMap((f) => [h('dt', {}, f.label), h('dd', {}, f.value)])) : null,
    ...sections.map((s) => h('div', { class: 'wiki-sheet-part' }, h('h4', {}, s.heading), h('p', { class: 'wiki-sheet-text' }, s.text))),
    empty ? h('p', { class: 'muted small' }, mine ? 'Nothing on your sheet for this yet: race, class, appearance, backstory and allies show here as you fill them in.' : 'Nothing on the sheet for this yet.') : null,
    canShare ? shareBox(page, share, mine) : null,
  );
}

/** Which parts the other players see: ticks, saved at once. */
function shareBox(page, share, mine) {
  const box = h('fieldset', { class: 'wiki-sheet-share' },
    h('legend', { class: 'small' }, mine ? 'The other players see' : `The other players see (${playerName(page.player)} chooses; you can too)`),
    ...SHEET_PARTS.map((p) => {
      const tick = h('input', { type: 'checkbox', value: p.key, checked: share.includes(p.key) });
      return h('label', { class: 'small' }, tick, ` ${p.label}`);
    }));
  box.addEventListener('change', async () => {
    const chosen = [...box.querySelectorAll('input:checked')].map((x) => x.value);
    try {
      await state.guarded(() => api('PUT', `${base()}/${page.id}/sheet-share`, { share: chosen }));
      status(chosen.length ? 'Saved: the other players see what you ticked.' : 'Saved: only you and the DM see your sheet here.');
    } catch (err) {
      report(err);
    }
  });
  return box;
}

/** Waiting's offer: a page for each character that has none, one click each. */
export function characterOffers(characters = []) {
  if (!characters.length) return null;
  return h('section', { class: 'wiki-character-offers' },
    h('h3', {}, 'Character pages'),
    h('p', { class: 'muted small' }, "A page for each player's character, for the whole party. Its race, class, looks and backstory come live from the sheet: you and its player see them, the other players only what the player shares."),
    h('div', { class: 'wiki-actions' }, ...characters.map((c) => h('button', { type: 'button', class: 'ghost', onclick: async (e) => {
      e.currentTarget.disabled = true;
      try {
        const { page } = await state.guarded(() => api('POST', `${base()}/characters`, { player: c.id }));
        await nav.refreshList();
        status(`Made the page for ${page.title}.`);
        await nav.openPage(page.id);
      } catch (err) {
        e.currentTarget.disabled = false;
        report(err);
      }
    } }, `Make ${c.character_name}'s page`))));
}
