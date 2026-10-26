/**
 * A player's companions, familiars and summons on the map: adding one (it's
 * theirs to move, hurt and heal), rolling from its stat block, and
 * dismissing it. The server decides where it goes and who sees it.
 */
import { onMap, select, toImage } from './map.js';
import { TOKEN_SIZES, TOKEN_SIZE_NAMES, statBlockRolls } from './shared/map.js';
import { api, h } from './api.js';
import { base, report, state, status } from './map-state.js';
import { field, fillStats } from './map-dm.js';
import { roll, rollModeFromEvent } from './dice.js';

const $ = (sel) => document.querySelector(sel);
const signed = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
const plus = (n) => (n < 0 ? `-${Math.abs(n)}` : `+${n}`);

/** Is this token a companion or summon this person controls? */
export const myCompanion = (token) => token?.kind === 'companion' && token.user_id != null && token.user_id === state.userId;

/** Add a companion or summon of your own (a player). It appears in the middle of what you can see, or next to your character. */
export function companionDialog() {
  const map = state.current;
  if (!map) return;
  const dialog = $('#map-dialog');
  const name = h('input', { maxLength: 80, placeholder: 'Wolf, Owl familiar, Spiritual weapon', required: true });
  const size = h('select', {}, ...TOKEN_SIZES.map((s) => new Option(TOKEN_SIZE_NAMES[s], s)));
  size.value = '1';
  const hpMax = h('input', { type: 'number', min: '1', step: '1', placeholder: 'from the stat block' });
  const darkvision = h('input', { type: 'number', min: '0', step: '5', placeholder: 'none' });
  const lookUp = h('input', { type: 'checkbox', checked: true });
  const save = async () => {
    const box = $('#map-view').getBoundingClientRect();
    const body = { name: name.value.trim(), size: Number(size.value), ...toImage(box.left + box.width / 2, box.top + box.height / 2) };
    const max = Number(hpMax.value) > 0 ? Math.round(Number(hpMax.value)) : null;
    if (max) body.hp = { current: max, max };
    if (Number(darkvision.value) > 0) body.darkvision = Number(darkvision.value);
    const res = await api('POST', `${base()}/${map.id}/tokens`, body);
    onMap(res.map);
    select(res.token.id);
    if (lookUp.checked) fillStats(res.token);
    else status(`${res.token.name} is on the map. Drag it where it should be.`);
  };
  // The companions kept on your character sheet come first: they go on this map tied to the sheet (hit points and all).
  const fromSheet = h('div', { class: 'companion-sheet-list' });
  state.guarded(() => api('GET', `/campaigns/${state.campaignId}/sheet`)).then((res) => {
    if (!fromSheet.isConnected) return; // closed meanwhile
    const list = res?.sheet?.companions ?? [];
    fromSheet.replaceChildren(...(list.length ? [
      h('h3', {}, 'From your sheet'),
      ...list.map((c) => {
        const here = map.tokens.some((t) => t.kind === 'companion' && t.companion === c.id);
        return h('div', { class: 'map-row companion-roll' },
          h('strong', {}, c.name), h('span', { class: 'muted small' }, `${c.hp.current} of ${c.hp.max} HP`),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'primary', disabled: here, onclick: () => state.guarded(async () => {
            const out = await api('POST', `/campaigns/${state.campaignId}/sheet/companions/${encodeURIComponent(c.id)}/map`, { map_id: map.id });
            onMap(out.map);
            if (out.token) select(out.token.id);
            dialog.close();
          }).catch(report) }, here ? 'On this map' : 'Put on the map'));
      }),
      h('h3', {}, 'Or one for this map only'),
    ] : [h('p', { class: 'muted small' }, 'Companions you keep (a familiar, a mount, an animal companion) are best added in the Companions box on your sheet: they keep their hit points and follow you between maps.')]));
  }).catch(() => {});
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      if (!name.value.trim()) return;
      state.guarded(save).then(() => dialog.close()).catch(report);
    } },
      h('h2', {}, 'Add a companion or summon'),
      fromSheet,
      h('p', { class: 'muted small' }, 'A familiar, an animal companion, a steed or something you conjured. You move it, track its hit points and roll for it.'),
      field('Name', name),
      h('div', { class: 'map-row' }, field('Size', size), field('Max HP', hpMax), field(`Darkvision (${map.scale?.unit ?? 'ft'})`, darkvision)),
      h('label', { class: 'map-check' }, lookUp, ' Look up its stat block (hit points, attacks) with the AI'),
      h('p', { class: 'muted small' }, 'It appears in the middle of what you can see (or next to your character); drag it into place.'),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Add'),
      ),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
  name.focus();
}

/** Rolls from a companion's stat block: its attacks (to hit, then damage) and ability checks. */
export function companionRolls(token) {
  const dialog = $('#map-dialog');
  const { abilities, attacks } = statBlockRolls(token.stats?.text);
  const go = (notation, label, e, then = null) => {
    dialog.close();
    roll(notation, { label: `${token.name}: ${label}`, mode: rollModeFromEvent(e), then });
  };
  const attackRows = attacks.map((a) => h('div', { class: 'map-row companion-roll' },
    h('strong', {}, a.name),
    h('button', { type: 'button', class: 'ghost', onclick: (e) => go(`1d20${plus(a.hit)}`, `${a.name} to hit`, e, a.damage[0] ? { label: `${token.name}: ${a.name} damage`, notation: a.damage[0] } : null) }, `To hit ${signed(a.hit)}`),
    ...a.damage.map((d) => h('button', { type: 'button', class: 'ghost', onclick: (e) => go(d, `${a.name} damage`, e) }, `Damage ${d}`)),
  ));
  const checks = abilities.map((a) => h('button', { type: 'button', class: 'ghost', onclick: (e) => go(`1d20${plus(a.mod)}`, `${a.ability} check`, e) }, `${a.ability} ${signed(a.mod)}`));
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner' },
      h('h2', {}, `Roll for ${token.name}`),
      attackRows.length ? h('h3', {}, 'Attacks') : null,
      ...attackRows,
      checks.length ? h('h3', {}, 'Ability checks') : null,
      checks.length ? h('div', { class: 'map-row companion-roll' }, ...checks) : null,
      !attackRows.length && !checks.length ? h('p', { class: 'muted' }, 'Its stat block has no attacks or ability scores to roll from. Use the dice as usual.') : null,
      h('p', { class: 'muted small' }, 'Shift-click rolls with advantage, Alt-click with disadvantage.'),
      h('div', { class: 'map-dialog-actions' }, h('span', { class: 'spacer' }), h('button', { class: 'primary' }, 'Close')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

/** Dismiss one of your companions or summons (it leaves the map). */
export async function dismissCompanion(token) {
  if (!confirm(token.companion ? `Take ${token.name} off the map? It stays on your character sheet.` : `Dismiss ${token.name}? It leaves the map.`)) return;
  try {
    const res = await state.guarded(() => api('DELETE', `${base()}/${state.current.id}/tokens/${token.id}`));
    if (res) onMap(res.map);
    select(null);
  } catch (err) {
    report(err);
  }
}
