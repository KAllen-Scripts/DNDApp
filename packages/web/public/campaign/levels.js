/**
 * Levelling up, in the DM's Campaign settings (shared/level-up.js): who starts a level up (the players when
 * they're ready, or only once the DM gives them a level), and the party's characters with their levels,
 * where the DM gives a level to one player or everyone (or takes back one not taken yet). The player hears it
 * live: their sheet shows Level up.
 */
import { api, h } from '../page/api.js';
import { LEVEL_UP_WHO } from '/shared/settings.js';

/** The section: { el }. get: the settings now; save(patch, done) saves settings. */
export function levelsSection({ campaignId, guarded, get, save }) {
  const who = h('select', { id: 'setting-level-up', 'aria-label': 'Who starts a level up' }, Object.entries(LEVEL_UP_WHO).map(([v, n]) => new Option(n, v)));
  who.value = get().level_up;
  const help = h('p', { class: 'muted small' });
  const say = () => {
    help.textContent = who.value === 'dm'
      ? 'Players see Level up on their sheet once you give them a level here.'
      : 'Players see Level up on their sheet whenever they want it. Giving a level here still tells them it’s time.';
  };
  say();
  who.addEventListener('change', () => { say(); save({ level_up: who.value }, 'Saved. Players’ sheets follow it now.'); });
  const list = h('ul', { class: 'level-levels small' });
  const note = h('p', { class: 'muted small', role: 'status' });
  const base = `/campaigns/${campaignId}`;
  const draw = ({ players, skipped = [] }) => {
    const nameOf = (id) => { const p = players.find((x) => x.id === id); return p?.character_name || p?.name || 'someone'; };
    list.replaceChildren(...players.map((p) => h('li', {},
      h('strong', {}, p.character_name || p.name), p.character_name ? h('span', { class: 'muted' }, `(${p.name})`) : null,
      h('span', {}, p.has_sheet ? (p.level ? `Level ${p.level}${p.classes ? `: ${p.classes}` : ''}` : 'No class yet') : 'No sheet yet'),
      p.granted ? h('span', { class: 'level-given' }, `· ${p.granted} given, not taken yet`) : null,
      h('span', { class: 'spacer' }),
      p.granted ? h('button', { type: 'button', class: 'ghost small', onclick: () => give([p.id], true) }, 'Take back') : null,
      h('button', { type: 'button', class: 'ghost small', disabled: !p.has_sheet, onclick: () => give([p.id]) }, 'Give a level'))));
    if (!players.length) list.replaceChildren(h('li', { class: 'muted' }, 'There are no players in this campaign yet.'));
    if (skipped.length) note.textContent = `Left out (no sheet yet): ${skipped.map(nameOf).join(', ')}.`;
  };
  const give = async (to, take = false) => {
    try {
      const res = await guarded(() => api('POST', `${base}/levels/grant`, { to, take }));
      if (!res) return;
      note.textContent = take ? 'Taken back.' : 'Given: they’ll see Level up on their sheet.';
      draw(res);
    } catch (err) {
      note.textContent = `Couldn’t do that: ${err.message}`;
    }
  };
  guarded(() => api('GET', `${base}/levels`)).then((res) => res && draw(res)).catch((err) => { note.textContent = `Couldn’t load the party: ${err.message}`; });
  const el = h('section', { class: 'settings-levels' },
    h('h3', {}, 'Levelling up'),
    h('label', { class: 'fld' }, h('span', {}, 'Who starts a level up'), who),
    help,
    list,
    h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'ghost', onclick: () => give('everyone') }, 'Give everyone a level')),
    note);
  return { el };
}
