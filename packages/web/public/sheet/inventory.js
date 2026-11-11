/**
 * The Sheet's Inventory tab (moved out of sheet.js): items carried, looked up
 * by name, equipped, attuned, drunk; their pictures, effects and charges.
 */
import { classKey, formatBonus } from '/shared/sheet.js';
import { addButton, announce, attackCtx, base, changed, field, flush, labelled, loadNote, markdownField, refresh, removeButton, state, useSheet } from './sheet.js';
import { attunementLimit, carriedWeight, classProficient, EFFECT_TARGETS, inventoryGroups, MAX_EFFECTS, normalizeGear, normalizeInventory } from '/shared/gear.js';
import { $, cap, h, note, setChildren } from '../page/dom.js';
import { api, fileUrl } from '../page/api.js';
import { effectText, GEAR_KINDS, gearCard } from '../items/item-card.js';
import { WEIGHT_RULES } from '/shared/settings.js';
import { gearRolls } from '/shared/rolls.js';
import { actionSummary } from '/shared/item-actions.js';
import { inventoryMastery } from './attacks.js';
import { roll } from '../dice/dice.js';

// ---------- the Inventory tab (players): items carried, looked up by name, equipped ----------

const firstClassKey = () => classKey(state.sheet.classes.find((c) => c.name.trim())?.name);
/** How many items this character can be attuned to (3; artificers more). */
const attuneLimit = () => attunementLimit(state.sheet.classes.filter((c) => classKey(c.name) === 'artificer').reduce((n, c) => n + (Number(c.level) || 0), 0));
const lb = (n) => `${Math.round(n * 100) / 100} lb`;

/** The inventory changed: clean it (one armour, one shield), update the sheet and save soon. */
function gearChanged(latest = null) {
  const before = new Map(state.sheet.inventory.map((g) => [g.id, g.equipped]));
  state.sheet.inventory = normalizeInventory(state.sheet.inventory, { latest, attuneMax: attuneLimit() });
  const off = state.sheet.inventory.filter((g) => before.get(g.id) && !g.equipped).map((g) => g.name);
  changed();
  for (const d of state.gearDraws) d();
  if (off.length) gearStatus(`Took off ${off.join(' and ')}: you can wear one armour and one shield.`);
}

export function gearStatus(text, error = false) {
  note($('#gear-status'), text, error);
}

/** A new line in the inventory, with Proficient ticked if the character's class is (they can change it). */
export function addGear(item) {
  const g = normalizeGear(item);
  g.proficient = classProficient(firstClassKey(), g) ?? true;
  state.sheet.inventory.push(g);
  gearChanged();
  return g;
}

let previewing = 0;
export const closePreview = () => {
  previewing += 1;
  const box = $('#gear-preview');
  if (box) { box.hidden = true; box.replaceChildren(); }
};

/** Look an item up and show its card under the add form, with Add and Cancel: nothing goes in the inventory until Add. */
export async function previewGear(name) {
  if (!name || !state.sheet) return;
  const box = $('#gear-preview');
  const ask = ++previewing;
  gearStatus(`Looking up ${name}…`);
  try {
    const res = await state.guarded(() => api('GET', `${base()}/gear/lookup?name=${encodeURIComponent(name)}`));
    if (!res || ask !== previewing) return;
    const item = normalizeGear(res.item);
    const have = state.sheet.inventory.filter((g) => g.name.toLowerCase() === item.name.toLowerCase()).reduce((n, g) => n + g.qty, 0);
    const from = res.from === 'ai' ? "From the AI's memory: check it against the book." : res.from === 'book' ? `From ${item.source}.` : res.from === 'srd' ? "From the Player's Handbook tables." : '';
    const add = h('button', { type: 'button', class: 'primary', onclick: () => {
      closePreview();
      const g = addGear(res.item);
      $('#gear-name').value = '';
      gearStatus(`Added ${g.name}${res.from === 'ai' ? " (from the AI's memory: check it)" : res.from === 'book' ? ` (${g.source})` : ''}.`);
    } }, `Add ${item.name}`);
    const cancel = h('button', { type: 'button', class: 'ghost', onclick: () => { closePreview(); gearStatus(''); } }, 'Cancel');
    box.replaceChildren(gearCard(item, { actions: [cancel, add], note: [from, have ? `You have ${have} already.` : ''].filter(Boolean).join(' ') }));
    box.hidden = false;
    gearStatus('');
    add.focus({ preventScroll: true });
  } catch (err) {
    if (ask !== previewing) return;
    gearStatus(err.status === 404 ? `${err.message}` : `Couldn't look up ${name}: ${err.message}`, true);
  }
}

export function inventoryTab() {
  const list = $('#inventory');
  if (!list) return;
  const draw = () => {
    const gear = state.sheet.inventory;
    // Sorted by kind (weapons, armour, magic items, potions...), each under its heading; the saved order stays.
    list.replaceChildren(gear.length
      ? h('div', { class: 'gear-list' }, inventoryGroups(gear).map((grp) => h('section', { class: 'gear-group', 'data-kind': grp.kind },
        h('h4', {}, grp.label, h('span', { class: 'muted small' }, ` · ${grp.items.reduce((n, g) => n + g.qty, 0)}`)),
        grp.items.map(gearRow))))
      : h('p', { class: 'muted' }, 'Nothing here yet. Add what your character carries above: weapons and armour fill in their numbers, and anything bought from a merchant shows up here. Equip weapons to attack with them from your sheet; equip armour and a shield to set your AC.'));
  };
  draw();
  state.gearDraws.push(draw);
  state.renders.push(() => list.querySelectorAll('.gear-sum').forEach((el) => el.__paint?.()));
  // Above the list: weight carried against the campaign's limit, and attunement.
  const summary = h('p', { class: 'gear-summary small' });
  const paint = () => {
    const carried = carriedWeight(state.sheet.inventory, state.sheet.coins);
    const load = state.calc.load;
    const rule = state.settings.weight;
    const weight = !load
      ? `Carrying ${lb(carried)} (${WEIGHT_RULES.ignore.toLowerCase()}: this campaign has none).`
      : rule === 'variant'
        ? `Carrying ${lb(carried)}: encumbered over ${load.encumbered} lb, heavily over ${load.heavy} lb, at most ${load.capacity} lb.`
        : `Carrying ${lb(carried)} of ${load.capacity} lb.`;
    const attuned = state.sheet.inventory.filter((g) => g.attuned).length;
    summary.replaceChildren(h('span', {}, weight), ' ', h('span', {}, `Attuned to ${attuned} of ${attuneLimit()}.`), ' ', h('span', { class: 'muted' }, 'Coins weigh 1 lb per 50.'));
  };
  paint();
  state.renders.push(paint);
  const note = loadNote('gear-warn');
  const old = $('#tab-inventory .gear-top');
  const top = h('div', { class: 'gear-top' }, summary, note);
  if (old) old.replaceWith(top);
  else list.before(top);
}

/** Ask for the pictures of the DM's items in the inventory that haven't been asked for; redraw when there are new ones. */
function loadItemPictures() {
  if (state.itemPicturesLoading) return;
  const cid = state.campaignId;
  const ids = state.sheet.inventory.map((g) => g.item_id).filter((id) => id && !state.itemPictures.has(id));
  if (!ids.length) return;
  state.itemPicturesLoading = state.guarded(() => api('GET', `${base()}/gear/pictures`))
    .then((res) => {
      if (!res || state.campaignId !== cid) return;
      for (const id of ids) state.itemPictures.set(id, res.pictures[id] ?? null);
      for (const [id, key] of Object.entries(res.pictures)) state.itemPictures.set(id, key);
      if (ids.some((id) => state.itemPictures.get(id))) for (const d of state.gearDraws) d();
    })
    .catch(() => { for (const id of ids) state.itemPictures.set(id, null); })
    .finally(() => { if (state.campaignId === cid) state.itemPicturesLoading = null; });
}

/** The picture of one of the DM's items (the merchant's), or nothing. */
function gearPicture(g) {
  if (!g.item_id) return null;
  if (!state.itemPictures.has(g.item_id)) {
    loadItemPictures();
    return null;
  }
  const key = state.itemPictures.get(g.item_id);
  if (!key) return null;
  const img = h('img', { class: 'gear-picture', alt: '' });
  const cache = `item:${g.item_id}:${key}`;
  if (state.pictureUrls.has(cache)) img.src = state.pictureUrls.get(cache);
  else {
    fileUrl(`${base()}/gear/items/${g.item_id}/picture?v=${encodeURIComponent(key)}`).then((u) => {
      state.pictureUrls.set(cache, u);
      img.src = u;
    }).catch(() => img.remove());
  }
  return img;
}

function gearRow(g) {
  const at = () => state.sheet.inventory.indexOf(g);
  const p = () => `inventory.${at()}`;
  const tick = (label, checked, onchange, title = '') => h('label', { class: 'check', title }, h('input', { type: 'checkbox', checked, 'aria-label': `${label}: ${g.name}`, onchange: (e) => onchange(e.target.checked, e.target) }), label);
  const wearable = !!(g.weapon || g.armor || g.attunement || g.kind === 'magic' || g.kind === 'other' || g.kind === 'gear');
  // Weapons: as many equipped as you have (two daggers); armour and the rest: on or off.
  const equip = !wearable ? null : g.weapon && g.qty > 1
    ? labelled('Equipped', (() => {
      const el = h('input', { type: 'number', min: '0', max: String(g.qty), value: String(g.equipped), class: 'num', 'aria-label': `How many equipped: ${g.name}` });
      el.addEventListener('change', () => { g.equipped = Math.max(0, Math.min(g.qty, parseInt(el.value, 10) || 0)); gearChanged(g.id); });
      return el;
    })(), 'inline')
    : tick('Equipped', !!g.equipped, (on) => { g.equipped = on ? 1 : 0; gearChanged(g.id); });
  const sum = h('span', { class: 'muted small gear-sum' });
  sum.__paint = () => {
    if (g.weapon && state.calc) {
      const r = gearRolls(g, state.calc);
      sum.textContent = `${formatBonus(r.bonus)} to hit · ${r.damage ?? r.flat ?? '–'}${r.type ? ` ${r.type}` : ''}${r.damage2 ? ` (${r.damage2} with both hands)` : ''}`;
    } else if (g.armor) {
      sum.textContent = g.armor.type === 'shield' ? `+${g.armor.base + g.magic} AC` : `AC ${g.armor.base + g.magic}${g.armor.type === 'light' ? ' + Dex' : g.armor.type === 'medium' ? ' + Dex (max 2)' : ''}${g.armor.strength ? ` · Str ${g.armor.strength}` : ''}${g.armor.stealth ? ' · Stealth disadvantage' : ''}`;
    } else sum.textContent = '';
    const effects = g.effects.map(effectText).join(', ');
    if (effects) sum.textContent += `${sum.textContent ? ' · ' : ''}${effects}${g.attunement && !g.attuned ? ' (when attuned)' : !g.equipped ? ' (when equipped)' : ''}`;
    if (g.weight != null) sum.textContent += `${sum.textContent ? ' · ' : ''}${lb(g.weight * g.qty)}`;
  };
  sum.__paint();
  const details = h('details', { class: 'gear-details' }, h('summary', {}, 'Details'));
  details.addEventListener('toggle', () => {
    if (!details.open || details.childElementCount > 1) return;
    const select = (label, value, options, set) => {
      const el = h('select', { 'aria-label': `${label}: ${g.name}` }, Object.entries(options).map(([v, n]) => new Option(n, v)));
      el.value = value;
      // Saving redraws the list: keep these details open.
      el.addEventListener('change', () => { set(el.value); gearChanged(); reopen(g); });
      return el;
    };
    details.append(h('div', { class: 'spell-fields' },
      labelled('Name', field(`${p()}.name`, { label: 'Item name', onChange: () => (row.querySelector('.gear-title').textContent = g.name) })),
      labelled('Kind', select('Kind', g.kind, GEAR_KINDS, (v) => {
        Object.assign(g, kindFields(v, g));
      })),
      g.weapon ? labelled('Damage', field(`${p()}.weapon.damage`, { label: 'Weapon damage', placeholder: 'e.g. 1d8 slashing', onChange: () => { sum.__paint(); for (const d of state.attackDraws) d(); } })) : null,
      g.weapon ? labelled('Uses', select('Ability', g.weapon.ability, { str: 'Strength', dex: 'Dexterity', finesse: 'Finesse (Str or Dex)' }, (v) => (g.weapon.ability = v))) : null,
      g.armor ? labelled('Type', select('Armour type', g.armor.type, { light: 'Light (+ Dex)', medium: 'Medium (+ Dex, max 2)', heavy: 'Heavy', shield: 'Shield' }, (v) => (g.armor.type = v))) : null,
      g.armor ? labelled(g.armor.type === 'shield' ? 'AC bonus' : 'Base AC', field(`${p()}.armor.base`, { label: 'Armour class', kind: 'int', onChange: () => sum.__paint() })) : null,
      g.kind === 'potion' || g.heal ? labelled('Heals', field(`${p()}.heal`, { label: 'What it heals', placeholder: 'e.g. 2d4+2', onChange: () => gearChanged() })) : null,
      g.weapon || g.armor ? labelled('Magic bonus', field(`${p()}.magic`, { label: 'Magic bonus', kind: 'int', onChange: () => { sum.__paint(); for (const d of state.attackDraws) d(); } })) : null,
      labelled('Weight (lb, each)', field(`${p()}.weight`, { label: 'Weight in pounds', kind: 'number', nullable: true, onChange: () => { sum.__paint(); refresh(); } })),
      labelled('Charges', (() => {
        const el = h('input', { type: 'number', min: '0', max: '999', class: 'num', value: g.charges ? String(g.charges.max) : '', 'aria-label': `Charges: ${g.name}`, placeholder: 'none' });
        el.addEventListener('change', () => {
          const max = parseInt(el.value, 10);
          g.charges = max > 0 ? { max, used: Math.min(g.charges?.used ?? 0, max), recharge: g.charges?.recharge ?? '', when: g.charges?.when ?? 'dawn' } : null;
          gearChanged();
        });
        return el;
      })()),
      g.charges ? labelled('They come back', field(`${p()}.charges.recharge`, { label: 'Charges regained', placeholder: '1d6+1, 3 or all', onChange: () => gearChanged() })) : null,
      h('div', { class: 'flags' }, tick('Needs attunement', g.attunement, (on) => { g.attunement = on; gearChanged(); })),
    ),
    effectsEditor(g),
    g.actions?.length ? h('div', { class: 'gear-actions-list' },
      h('span', { class: 'lbl' }, 'What it can do (Use it under Item actions)'),
      h('ul', {}, g.actions.map((a) => h('li', {}, h('strong', {}, a.name), ` ${actionSummary(a)}`, a.source === 'ai' ? h('span', { class: 'tag ai-tag' }, 'AI: check it') : null)))) : '',
    labelled('Description', markdownField(`${p()}.text`, { label: 'Item description', rows: 5 }), 'wide'),
    g.source ? h('p', { class: 'muted small' }, `Source: ${g.source}`) : '');
  });
  const qty = field(`${p()}.qty`, { label: `How many: ${g.name}`, kind: 'int', cls: 'num' });
  qty.addEventListener('change', () => gearChanged()); // more than one weapon: choose how many are equipped
  const row = h('div', { class: `gear-row${g.equipped ? ' equipped' : ''}`, 'data-id': g.id },
    h('div', { class: 'gear-head' },
      gearPicture(g),
      h('strong', { class: 'gear-title' }, g.name),
      h('span', { class: 'tag' }, g.armor?.type === 'shield' ? 'Shield' : GEAR_KINDS[g.kind] ?? 'Other'),
      g.rarity ? h('span', { class: 'tag rarity' }, cap(g.rarity)) : null,
      labelled('Qty', qty, 'inline'),
      equip,
      g.weapon || g.armor ? tick('Proficient', g.proficient, (on) => { g.proficient = on; gearChanged(); }, 'Are you proficient with it? Ticked for you when your class is; change it if not.') : null,
      g.attunement ? tick('Attuned', g.attuned, (on, box) => {
        if (on && state.sheet.inventory.filter((x) => x.attuned).length >= attuneLimit()) {
          box.checked = false;
          return gearStatus(`You can be attuned to ${attuneLimit()} items at most. Stop being attuned to one first.`, true);
        }
        g.attuned = on;
        gearChanged(g.id);
      }, 'Needs attunement: its magic only works while you are attuned (at most three items, more for an artificer).') : null,
      g.charges ? chargesControl(g) : null,
      g.heal ? h('button', { type: 'button', class: 'ghost small', 'aria-label': `Drink ${g.name}`, title: `Heals ${g.heal}: the server rolls it and adds the hit points; one ${g.name} is used up`, onclick: () => drink(g) }, 'Drink') : null,
      sum,
      g.weapon ? inventoryMastery(attackCtx(), g) : null,
      removeButton(`Remove ${g.name}`, () => {
        if (!confirm(`Remove ${g.name} from your inventory?`)) return;
        state.sheet.inventory.splice(at(), 1);
        gearChanged();
      }),
    ),
    details,
  );
  return row;
}

/** What a line needs when it becomes a kind: a weapon's numbers, armour's, a potion's healing (the rest go). */
export function kindFields(kind, g = {}) {
  return {
    kind,
    weapon: kind === 'weapon' ? g.weapon ?? { damage: '', ability: 'str', category: 'simple', properties: [] } : null,
    armor: kind === 'armor' ? g.armor ?? { base: 11, type: 'light', strength: 0, stealth: false } : null,
    magic: kind === 'weapon' || kind === 'armor' ? g.magic ?? 0 : 0,
    heal: kind === 'potion' ? g.heal ?? '' : '',
  };
}

/** Open a line's details (after it's redrawn), so the fields for its kind are there to fill in. */
export function reopen(g) {
  const details = $(`#inventory .gear-row[data-id="${String(g.id).replace(/["\\]/g, '\\$&')}"] details`);
  if (details) details.open = true;
}

/** Drink a potion: the server rolls what it heals (the dice show it), adds the hit points and takes one away. */
async function drink(g) {
  await flush();
  await roll('', {
    label: `${g.name}: healing`,
    path: `${base()}/sheet/gear/drink`,
    body: { id: g.id },
    onServer: (res) => {
      useSheet(res.sheet, res.version, res.number);
      announce();
      gearStatus(`Drank ${g.name}: ${res.healed ? `regained ${res.healed} hit point${res.healed === 1 ? '' : 's'}` : 'no hit points regained'}.`);
    },
  });
}

/** What a magic item does to the sheet while equipped (and attuned): read from its description, changeable here. */
function effectsEditor(g) {
  const list = h('div', { class: 'effects' });
  const draw = () => {
    setChildren(list,
      h('span', { class: 'lbl' }, 'What it does to your sheet (while equipped, and attuned if it needs it)'),
      ...g.effects.map((e, i) => {
        const target = h('select', { 'aria-label': `Effect ${i + 1}: ${g.name}` }, Object.entries(EFFECT_TARGETS).map(([v, n]) => new Option(n, v)));
        target.value = e.target;
        target.addEventListener('change', () => { e.target = target.value; gearChanged(); draw(); });
        const value = h('input', { type: 'number', class: 'num', value: String(e.value), 'aria-label': `Effect ${i + 1} amount: ${g.name}` });
        value.addEventListener('change', () => {
          e.value = parseInt(value.value, 10) || 0;
          if (!e.value) g.effects.splice(i, 1);
          gearChanged();
          draw();
        });
        return h('div', { class: 'effect' }, target, value, removeButton(`Remove this effect of ${g.name}`, () => { g.effects.splice(i, 1); gearChanged(); draw(); }));
      }),
      g.effects.length < MAX_EFFECTS ? addButton('Add an effect', () => { g.effects.push({ target: 'ac', value: 1 }); gearChanged(); draw(); }) : null,
    );
  };
  draw();
  return list;
}

/** Charges left, with Use and Recharge (rolled when it's dice, like a wand's 1d6+1). */
function chargesControl(g) {
  const left = () => g.charges.max - g.charges.used;
  const text = h('span', { class: 'charges-left' });
  const paint = () => (text.textContent = `${left()} of ${g.charges.max} charges`);
  paint();
  const use = h('button', { type: 'button', class: 'ghost small', 'aria-label': `Use a charge: ${g.name}`, onclick: () => {
    if (!left()) return gearStatus(`${g.name} has no charges left.`, true);
    g.charges.used += 1;
    gearChanged();
  } }, 'Use 1');
  const back = h('button', { type: 'button', class: 'ghost small', 'aria-label': `Recharge: ${g.name}`, title: g.charges.recharge ? `Regains ${g.charges.recharge}${g.charges.when ? ` at ${g.charges.when}` : ''}` : 'All charges back', onclick: async () => {
    const r = g.charges.recharge;
    if (!r || r === 'all') {
      g.charges.used = 0;
      gearChanged();
      return gearStatus(`${g.name}: all ${g.charges.max} charges back.`);
    }
    if (/^\d+$/.test(r)) {
      g.charges.used = Math.max(0, g.charges.used - Number(r));
      gearChanged();
      return gearStatus(`${g.name}: ${r} charges back.`);
    }
    await roll(r, { label: `${g.name}: charges regained`, onServer: (res) => {
      g.charges.used = Math.max(0, g.charges.used - (Number(res.total) || 0));
      gearChanged();
      gearStatus(`${g.name}: ${res.total} charges back.`);
    } });
  } }, 'Recharge');
  return h('span', { class: 'charges' }, text, use, back);
}
