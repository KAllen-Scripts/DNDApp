/**
 * The Sheet's Spells box (moved out of sheet.js): spells by level, adding and
 * looking one up, each spell's card, its rolls, and casting with a slot.
 */
import { cap, h } from '../page/dom.js';
import { announce, auto, base, changed, check, field, flush, labelled, markdownField, pips, refresh, stat, state, status } from './sheet.js';
import { ABILITIES, ABILITY_NAMES, normalizeSheet, normalizeSpell } from '/shared/sheet.js';
import { fold, isOpen, setOpen } from './fold.js';
import { api } from '../page/api.js';
import { castLevels } from '/shared/spell-slots.js';
import { spellPlan } from './attacks.js';
import { D20_ICON, roll, rollModeFromEvent } from '../dice/dice.js';

const LEVEL_NAMES = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level'];
const SPELL_DETAILS = ['name', 'level', 'school', 'casting_time', 'range', 'components', 'material', 'duration', 'concentration', 'ritual', 'description', 'higher_levels', 'attack', 'save', 'damage', 'damage_mod', 'higher_damage', 'source', 'source_note'];
const SOURCE_LABELS = { srd: 'SRD', book: 'Your book', ai: 'AI memory', import: 'Your sheet', manual: 'Typed in', custom: 'Your own' };

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export function spells() {
  const classPick = h('select', { 'aria-label': 'Spellcasting class' });
  const paintClassPick = () => {
    const names = [...new Set(state.sheet.classes.map((c) => c.name.trim()).filter(Boolean))];
    const current = state.sheet.spellcasting.class;
    const first = state.calc.casters[0]?.name;
    classPick.replaceChildren(
      new Option(first ? `Automatic (${first})` : 'Automatic', ''),
      ...names.map((n) => new Option(n, n)),
      ...(current && !names.includes(current) ? [new Option(current, current)] : []),
    );
    classPick.value = current;
  };
  classPick.addEventListener('change', () => { state.sheet.spellcasting.class = classPick.value; changed(); });
  state.renders.push(() => document.activeElement !== classPick && paintClassPick());

  const abilityPick = h('select', { 'aria-label': 'Spellcasting ability' }, new Option('', ''), ABILITIES.map((a) => new Option(ABILITY_NAMES[a], a)));
  const abilityReset = h('button', { type: 'button', class: 'reset', hidden: true, onclick: () => { delete state.sheet.overrides.spell_ability; changed(); } }, '↺');
  abilityPick.addEventListener('change', () => { state.sheet.overrides.spell_ability = abilityPick.value; changed(); });
  const abilityWrap = h('span', { class: 'auto-select' }, abilityPick, abilityReset);
  state.renders.push(() => {
    const mine = 'spell_ability' in state.sheet.overrides;
    abilityPick.value = state.calc.values.spell_ability ?? '';
    abilityWrap.classList.toggle('mine', mine);
    abilityReset.hidden = !mine;
    abilityReset.title = 'You chose this yourself. Click to use the automatic one.';
  });

  const slotTile = (n) => {
    const tile = h('div', { class: 'slot' },
      h('span', { class: 'slot-level' }, ORDINALS[n]),
      auto(`slots.${n}`, { label: `${LEVEL_NAMES[n]} slots` }),
      pips(`spellcasting.slots_used.${n}`, `${LEVEL_NAMES[n]} slot used`, () => state.calc.values[`slots.${n}`]),
    );
    state.renders.push(() => tile.classList.toggle('none', !state.calc.values[`slots.${n}`]));
    return tile;
  };
  const pact = h('div', { class: 'slot pact' },
    h('span', { class: 'slot-level' }, 'Pact magic'),
    h('div', { class: 'pact-nums' }, stat(auto('pact_slots', { label: 'Pact Magic slots' }), 'Slots'), stat(auto('pact_level', { label: 'Pact slot level' }), 'Slot level')),
    pips('spellcasting.pact_used', 'Pact slot used', () => state.calc.values.pact_slots, 10),
  );
  state.renders.push(() => (pact.hidden = !state.calc.values.pact_slots && !('pact_slots' in state.sheet.overrides)));

  // Levels with no slots are hidden until asked for (to type a number in one the rules don't give).
  const slots = h('div', { class: 'slots' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(slotTile), pact);
  const slotHelp = h('span', {}, 'Slots per long rest are worked out for you (type a number to change one). Tick a circle when you use a slot. ');
  const allLevels = h('button', { type: 'button', class: 'link slot-levels', onclick: () => {
    setOpen('slot-levels', !isOpen('slot-levels'));
    paintLevels();
  } });
  const paintLevels = () => {
    const all = isOpen('slot-levels');
    const none = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !state.calc.values[`slots.${n}`]).length;
    slots.classList.toggle('only-used', !all);
    allLevels.hidden = !none;
    // A sheet with no slots at all (no spellcasting class yet) needs only the button.
    slotHelp.hidden = none === 9 && slots.querySelector('.pact').hidden && !all;
    allLevels.textContent = all ? 'Hide levels with no slots' : `Show all levels (${none} with no slots)`;
  };
  state.renders.push(paintLevels);

  const list = h('div', { class: 'spell-list' });
  const drawList = () => list.replaceChildren(...spellGroups(drawList));
  drawList();

  return h('div', { class: 'sh-spells' },
    h('div', { class: 'spell-head' },
      stat(classPick, 'Spellcasting class', 'pick'),
      stat(abilityWrap, 'Spellcasting ability', 'pick'),
      stat(auto('spell_dc', { label: 'Spell save DC' }), 'Spell save DC', 'big'),
      stat(auto('spell_attack', { kind: 'bonus', label: 'Spell attack bonus' }), 'Spell attack bonus', 'big', check('spell_attack', 'Spell attack')),
    ),
    slots,
    h('p', { class: 'muted small slot-help' }, slotHelp, allLevels),
    addSpell(drawList, list),
    list,
  );
}

function addSpell(drawList, list) {
  const input = h('input', { type: 'text', placeholder: 'Spell name, e.g. Shield', list: 'dl-spells', autocomplete: 'off', 'aria-label': 'Spell to add' });
  const suggestions = h('datalist', { id: 'dl-spells' });
  const note = h('span', { class: 'muted small' });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) return;
      const names = await state.guarded(() => api('GET', `${base()}/spells?q=${encodeURIComponent(q)}`)).catch(() => []);
      suggestions.replaceChildren(...(names ?? []).map((s) => h('option', { value: s.name }, s.source === 'book' ? `${s.name} (${s.book})` : s.name)));
    }, 200);
  });
  const add = async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const spell = normalizeSpell({ name, source: 'manual' });
    state.sheet.spells.push(spell);
    input.value = '';
    changed();
    drawList();
    note.textContent = `Looking up ${name}…`;
    note.textContent = (await lookupInto(spell)) ? '' : `Couldn't find details for ${name}. Type them in below.`;
    drawList();
  };
  // A spell of the player's own (homebrew, or one the books and the AI don't know): never looked up, opened to fill in.
  const custom = () => {
    const name = input.value.trim();
    if (!name) {
      note.textContent = 'Type the name of your spell first, then press Make my own.';
      return input.focus();
    }
    const spell = normalizeSpell({ name, source: 'custom', attack: '' });
    state.sheet.spells.push(spell);
    input.value = '';
    note.textContent = `Added ${name}: fill in its level, details and how it rolls below.`;
    changed();
    drawList();
    const card = [...list.querySelectorAll('details.spell')].find((c) => c.__spell === spell);
    if (card) {
      card.open = true;
      card.dispatchEvent(new Event('toggle'));
      card.querySelector('[aria-label="Spell level"]')?.focus();
    }
  };
  // Custom spells are never looked up, so they're never "missing details".
  const unfilled = () => state.sheet.spells.filter((s) => !s.description.trim() && s.source !== 'custom');
  const fill = h('button', { type: 'button', class: 'ghost fill-missing', onclick: async () => {
    const todo = unfilled();
    for (const [i, s] of todo.entries()) {
      note.textContent = `Looking up ${s.name} (${i + 1} of ${todo.length})…`;
      await lookupInto(s);
      drawList();
    }
    note.textContent = unfilled().length ? `Couldn't find: ${unfilled().map((s) => s.name).join(', ')}.` : 'Done.';
  } }, 'Fill in missing details');
  state.renders.push(() => {
    const n = unfilled().length;
    fill.hidden = !n;
    fill.textContent = `Fill in missing details (${n})`;
  });
  const form = h('form', { class: 'add-spell', onsubmit: add }, suggestions, input,
    h('button', { type: 'submit', class: 'primary', title: 'Add it with its details from the SRD, your books or the AI' }, 'Add spell'),
    h('button', { type: 'button', class: 'ghost', title: 'Your own spell (homebrew, or one nobody knows): typed in by you, never looked up', onclick: custom }, 'Make my own'));
  // Adding a spell opens when asked (open to start with on a sheet with none); filling in and messages stay in view.
  return h('div', { class: 'add-spell-wrap' },
    fold('spell-add', '+ Add a spell', form, { open: !state.sheet.spells.length, cls: 'spell-fold' }),
    h('div', { class: 'add-spell-foot' }, fill, note));
}

/**
 * Fill a spell's details from the server (SRD, the group's books, or the AI).
 * Only called when the player asks (adding a spell, "Look up", "Fill in"),
 * so typed details are never replaced without them knowing.
 */
async function lookupInto(spell) {
  try {
    const found = await state.guarded(() => api('GET', `${base()}/spells/lookup?name=${encodeURIComponent(spell.name)}`));
    if (!found) return false;
    for (const k of SPELL_DETAILS) spell[k] = found[k];
    changed();
    return true;
  } catch (err) {
    if (err.status !== 404) alert(`Couldn't look up ${spell.name}: ${err.message}`);
    return false;
  }
}

function spellGroups(drawList) {
  const spells = state.sheet.spells;
  if (!spells.length) return [h('p', { class: 'muted' }, 'No spells yet. Add one above: its details are filled in from the SRD, your books, or the AI, and you can change anything. For a spell of your own, type its name and press Make my own.')];
  const groups = new Map();
  for (const s of [...spells].sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || a.name.localeCompare(b.name))) {
    const key = s.level ?? 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups].map(([level, list]) =>
    h('section', { class: 'spell-group' },
      h('h4', {}, level === 'unknown' ? 'Level not set' : LEVEL_NAMES[level], level !== 0 && level !== 'unknown' ? h('span', { class: 'muted small' }, ` · ${list.filter((s) => s.prepared).length} prepared`) : null),
      list.map((s) => spellCard(s, drawList)),
    ),
  );
}

function spellCard(spell, drawList) {
  const path = () => `spells.${state.sheet.spells.indexOf(spell)}`;
  const meta = [spell.casting_time, spell.range, spell.duration].filter(Boolean).join(' · ');
  const tags = [spell.concentration && 'C', spell.ritual && 'R'].filter(Boolean);
  const prepared = h('input', { type: 'checkbox', checked: spell.prepared, title: 'Prepared', 'aria-label': `${spell.name} prepared`, onclick: (e) => e.stopPropagation() });
  prepared.addEventListener('change', () => { spell.prepared = prepared.checked; changed(); });
  const body = h('div', { class: 'spell-body' });
  const card = h('details', { class: 'spell' },
    h('summary', {},
      spell.level ? prepared : h('span', { class: 'prep-space' }),
      h('strong', {}, spell.name),
      tags.length ? h('span', { class: 'tags' }, tags.map((t) => h('span', { class: 'tag', title: t === 'C' ? 'Concentration' : 'Ritual' }, t))) : null,
      h('span', { class: 'muted small spell-meta' }, meta),
      spellRollButtons(spell),
      h('span', { class: `source source-${spell.source}`, title: spell.source_note }, SOURCE_LABELS[spell.source] ?? ''),
    ),
    body,
  );
  card.__spell = spell;
  // Fields are built when opened, so a long list stays light.
  card.addEventListener('toggle', () => {
    if (!card.open || body.childElementCount) return;
    const p = path();
    const levelPick = h('select', { 'aria-label': 'Spell level' }, new Option('Not set', ''), LEVEL_NAMES.map((n, i) => new Option(i === 0 ? 'Cantrip' : n, i)));
    levelPick.value = spell.level ?? '';
    levelPick.addEventListener('change', () => { spell.level = levelPick.value === '' ? null : Number(levelPick.value); changed(); drawList(); });
    const flag = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: spell[k], onchange: (e) => { spell[k] = e.target.checked; changed(); } }), label);
    body.append(
      h('div', { class: 'spell-fields' },
        labelled('Name', field(`${p}.name`, { label: 'Spell name' })),
        labelled('Level', levelPick),
        labelled('School', field(`${p}.school`, { label: 'School', list: 'dl-schools' })),
        labelled('Casting time', field(`${p}.casting_time`, { label: 'Casting time' })),
        labelled('Range', field(`${p}.range`, { label: 'Range' })),
        labelled('Components', field(`${p}.components`, { label: 'Components' })),
        labelled('Duration', field(`${p}.duration`, { label: 'Duration' })),
        labelled('Material', field(`${p}.material`, { label: 'Material component' }), 'wide'),
        h('div', { class: 'flags' }, flag('concentration', 'Concentration'), flag('ritual', 'Ritual')),
      ),
      labelled('Description', markdownField(`${p}.description`, { label: 'Description', rows: 8 }), 'wide'),
      labelled('At higher levels', markdownField(`${p}.higher_levels`, { label: 'At higher levels', rows: 2 }), 'wide'),
      spellRollFields(spell, p),
      h('p', { class: 'muted small' }, spell.source_note ? `Source: ${spell.source_note}` : ''),
      h('div', { class: 'spell-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: async (e) => {
          if (spell.description.trim() && !confirm(`Replace the details of ${spell.name} with the looked-up ones? What's written now will be lost.`)) return;
          e.target.disabled = true;
          e.target.textContent = 'Looking up…';
          if (!(await lookupInto(spell))) alert(`Couldn't find details for "${spell.name}".`);
          drawList();
        } }, 'Look up details'),
        h('button', { type: 'button', class: 'ghost danger', onclick: () => {
          if (!confirm(`Remove ${spell.name} from your sheet?`)) return;
          state.sheet.spells.splice(state.sheet.spells.indexOf(spell), 1);
          changed();
          drawList();
        } }, 'Remove spell'),
      ),
    );
    // Typing in these fields only changes the sheet; the summary refreshes when the list is redrawn.
    body.addEventListener('focusout', () => setTimeout(() => !card.contains(document.activeElement) && refreshSummary(card, spell)));
  });
  return card;
}

/**
 * A spell's buttons in its row: to hit (a spell attack, then its damage
 * offered), damage (or healing), and Cast for a spell with nothing to roll
 * (Entangle). A spell of 1st level or higher has a slot list (with how many
 * are left) and casting it spends that slot through the server: the to-hit
 * roll for an attack, the damage roll for anything else, or Cast. With no
 * slot left the player can still roll (a scroll, an item, a free casting).
 */
function spellRollButtons(spell) {
  const wrap = h('span', { class: 'spell-rolls' });
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  let slot = null;
  const paintSlots = () => {
    if (!slot) return;
    const { levels, first } = castLevels(state.sheet, state.calc, spell.level);
    const keep = slot.value ? Number(slot.value) : null;
    slot.replaceChildren(...levels.map((l) => new Option(`${ORDINALS[l.level]} (${l.left} left${l.pact ? ', pact' : ''})`, l.level)));
    // The level the player picked stays picked (with none left, casting asks); at first, the lowest with one left.
    slot.value = String(keep && levels.some((l) => l.level === keep) ? keep : first);
  };
  state.renders.push(paintSlots);
  const draw = () => {
    wrap.replaceChildren();
    const leveled = spell.level >= 1;
    if (!spell.attack && !spell.damage.trim() && !leveled) return;
    slot = leveled ? h('select', { 'aria-label': `${spell.name} slot level`, title: 'Cast with a slot of this level', onclick: (e) => e.stopPropagation() }) : null;
    const rolls = () => spellPlan(state, spell, slot ? Number(slot.value) : spell.level, `spell:${spell.id}`);
    const at = () => (slot && Number(slot.value) > spell.level ? ` at ${ORDINALS[slot.value]} level` : '');
    const cast = () => castSpell(spell, slot ? Number(slot.value) : null);
    const heal = /heal/i.test(spell.damage);
    if (slot) {
      wrap.append(slot);
      paintSlots();
    }
    if (spell.attack === 'attack') {
      const hit = h('button', { type: 'button', class: 'icon-roll', title: `Spell attack${leveled ? ': spends the slot' : ''} (Shift: advantage, Alt: disadvantage)`, 'aria-label': `Roll ${spell.name} to hit` });
      hit.innerHTML = D20_ICON;
      hit.addEventListener('click', async (e) => {
        stop(e);
        const mode = rollModeFromEvent(e);
        const r = rolls();
        if (!(await cast())) return;
        roll(r.hit, { label: `${spell.name}: to hit${at()}`, mode, then: r.damage && { label: `${spell.name}: damage${at()}${withExtras(r)}`, notation: r.damage, crit: r.crit, notes: r.notes } });
      });
      wrap.append(hit);
    } else if (spell.attack === 'save') {
      const r = rolls();
      wrap.append(h('span', { class: 'muted small spell-dc', title: 'Targets make this saving throw' }, `DC ${r.dc ?? '?'}${r.save ? ` ${cap(r.save)}` : ''}`));
    }
    if (spell.damage.trim()) {
      // An attack's damage follows its to-hit roll, which already spent the slot.
      const casts = spell.attack !== 'attack';
      wrap.append(h('button', { type: 'button', class: 'icon-roll dmg-roll', title: `${heal ? 'Roll healing' : 'Roll damage'}${casts && leveled ? ': spends the slot' : ''}`, 'aria-label': `Roll ${spell.name} ${heal ? 'healing' : 'damage'}`, onclick: async (e) => {
        stop(e);
        const r = rolls();
        if (!r.damage) return alert(`Type the dice for ${spell.name} first, like 8d6 fire.`);
        if (casts && !(await cast())) return;
        const dc = r.kind === 'save' ? ` (DC ${r.dc}${r.save ? ` ${cap(r.save)}` : ''} save)` : '';
        roll(r.damage, { label: `${spell.name}: ${heal ? 'healing' : 'damage'}${at()}${dc}${withExtras(r)}` });
      } }, heal ? 'Heal' : 'Dmg'));
    } else if (leveled && spell.attack !== 'attack') {
      wrap.append(h('button', { type: 'button', class: 'small cast-spell', title: 'Cast it: spends the slot', 'aria-label': `Cast ${spell.name}`, onclick: async (e) => {
        stop(e);
        if (await cast()) status(`Cast ${spell.name}${at()}.`);
      } }, 'Cast'));
    }
  };
  draw();
  wrap.redraw = draw;
  return wrap;
}

/**
 * Cast a spell of 1st level or higher: the server spends a slot of `slot`
 * (shared/attacks.js castWithSlot) and the slot boxes follow. With none left
 * the player can go on without one (a scroll, an item, a free casting).
 * Cantrips need nothing. Returns false when the player stops.
 */
async function castSpell(spell, slot) {
  if (!(spell.level >= 1)) return true;
  await flush();
  try {
    const res = await state.guarded(() => api('POST', `${base()}/sheet/spells/cast`, { id: spell.id, ...(slot && { slot }) }));
    if (!res) return false;
    // Only the slots changed on the server: take them, and leave anything typed since alone.
    const sc = normalizeSheet(res.sheet).spellcasting;
    for (const s of [state.sheet, state.savedSheet]) {
      if (!s) continue;
      s.spellcasting.slots_used = structuredClone(sc.slots_used);
      s.spellcasting.pact_used = sc.pact_used;
    }
    state.version = res.version;
    refresh();
    announce();
    return true;
  } catch (err) {
    return confirm(`${err.message}\n\nRoll anyway without spending a slot (a scroll, an item, a free casting)?`);
  }
}

/** " (with Agonizing Blast +3)": a spell's class feature extras, for its roll's label. */
const withExtras = (r) => {
  const on = (r.extras ?? []).filter((x) => x.on);
  return on.length ? ` (with ${on.map((x) => `${x.name} ${x.detail}`).join(', ')})` : '';
};

/** How a spell rolls, in its details: read from its description, and the player can change it. */
function spellRollFields(spell, p) {
  const select = (key, label, options) => {
    const el = h('select', { 'aria-label': label }, Object.entries(options).map(([v, n]) => new Option(n, v)));
    el.value = spell[key];
    el.addEventListener('change', () => { spell[key] = el.value; changed(); paintSave(); redrawRolls(spell); });
    return el;
  };
  const saveBox = labelled('Save', select('save', 'Spell saving throw', { '': '–', ...ABILITY_NAMES }));
  const paintSave = () => (saveBox.hidden = spell.attack !== 'save');
  paintSave();
  return h('div', { class: 'spell-fields spell-roll-fields' },
    labelled('Roll', select('attack', 'Spell roll', { '': 'No attack or save', attack: 'Spell attack', save: 'Saving throw' })),
    saveBox,
    labelled('Damage / healing', field(`${p}.damage`, { label: 'Spell damage', placeholder: 'e.g. 8d6 fire', onChange: () => redrawRolls(spell) })),
    labelled(spell.level === 0 ? 'More at 5th/11th/17th' : 'More per slot level', field(`${p}.higher_damage`, { label: 'More damage when cast higher', placeholder: 'e.g. 1d6', onChange: () => redrawRolls(spell) })),
    h('div', { class: 'flags' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: spell.damage_mod, 'aria-label': 'Add spellcasting modifier', onchange: (e) => { spell.damage_mod = e.target.checked; changed(); } }), `+ spellcasting modifier`)),
  );
}

/** Redraw a spell's roll buttons after its damage changed (without closing its details). */
function redrawRolls(spell) {
  for (const card of document.querySelectorAll('#sheet details.spell')) {
    if (card.__spell === spell) card.querySelector('.spell-rolls')?.redraw();
  }
}

function refreshSummary(card, spell) {
  card.querySelector('summary strong').textContent = spell.name;
  card.querySelector('.spell-meta').textContent = [spell.casting_time, spell.range, spell.duration].filter(Boolean).join(' · ');
}
