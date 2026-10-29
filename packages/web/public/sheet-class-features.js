/**
 * The Class features box on the character sheet: the uses, pools of points
 * and worked-out numbers this character's classes give them (Rage, Second
 * Wind, Ki, Lay on Hands, Sorcery Points...), Wild Shape with its forms
 * (sheet-wild-shape.js) for druids, a Subclass features section under them
 * (Superiority Dice, Portent, Combat Wild Shape...), a Race features section
 * (Breath Weapon, Relentless Endurance, Fey Step, racial feats...), and rows
 * the player adds by hand (a feat like Lucky, homebrew). Rests give them back.
 * The rules (both editions) are in shared/class-features.js,
 * shared/subclass-features.js and shared/race-features.js; sheet.js owns the sheet and passes in what this needs. Every maximum can be typed over: the DM has the
 * last word.
 */
import { h, setChildren } from './api.js';
import { CLASSES, classKey } from './shared/sheet.js';
import {
  RECHARGE_NAMES, SLOT_COST, MAX_CUSTOM, arcaneRecovery, featureRows, healsForm, newCustomFeature, pointsToSlot, regainPactSlots,
  setSpent, slotToPoints, sorcerousRestoration, useRolled,
} from './shared/class-features.js';
import { subclassOf } from './shared/subclass-features.js';
import { knownRace } from './shared/race-features.js';
import { isOpen, setOpen } from './sheet-fold.js';

const RECHARGE_SHORT = { short: 'Short rest', long: 'Long rest', short_one: 'Short rest: one', none: 'By hand' };
const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
const MAX_PIPS = 10; // more than this shows as a number

/**
 * @param {object} ctx
 * @param {object} ctx.state  the sheet's state (sheet, calc, settings, edition, renders)
 * @param {() => void} ctx.changed  something on the sheet changed: save soon
 * @param {() => void} ctx.render  draw the whole sheet again (after slots or hit points change)
 * @param {(row, extra?) => void} ctx.heal  use a feature the server rolls for (healing, a slot's healing with extra = { slot }, Portent)
 * @param {() => HTMLElement} ctx.wildShape  the druid's forms (made once, shown under the Wild Shape row)
 */
export function classFeaturesBox({ state, changed, render, heal, wildShape }) {
  const el = h('section', { class: 'sh-box class-features' });
  const edition = () => state.settings?.edition || state.edition || '2014';
  const forms = wildShape();
  let drawn = null;
  let adding = false;

  const rows = () => featureRows(state.sheet, { edition: edition(), values: state.calc.values });
  const paint = () => {
    // Redrawn only when what it shows changes, so typing elsewhere doesn't lose your place here.
    const list = rows();
    const key = JSON.stringify([list, edition(), adding, state.sheet.spellcasting, state.calc.values.pact_slots, state.sheet.classes, state.sheet.race, healsForm(state.sheet)]);
    if (key === drawn && el.childElementCount) return;
    drawn = key;
    draw(list);
  };
  const cf = () => (state.sheet.class_features ??= { spent: {}, max: {}, custom: [] });
  const update = (next) => {
    state.sheet.class_features = next.class_features;
    state.sheet.spellcasting = next.spellcasting;
    state.sheet.hp = next.hp;
    changed();
    render();
  };
  const tryIt = (fn) => {
    try {
      update(fn());
    } catch (err) {
      alert(err.message);
    }
  };
  const spend = (row, n) => {
    state.sheet.class_features = setSpent(state.sheet, row.id, n).class_features;
    changed();
    paint();
  };

  function draw(list) {
    const multi = new Set(list.filter((r) => r.class).map((r) => r.class)).size > 1;
    const own = list.filter((r) => !r.subclass && !r.race);
    const sub = list.filter((r) => r.subclass);
    const race = list.filter((r) => r.race && r.race !== 'Feat');
    const feats = list.filter((r) => r.race === 'Feat');
    setChildren(el,
      h('h3', {}, 'Class features'),
      own.length
        ? h('div', { class: 'cf-rows' }, own.map((r) => rowView(r, multi)))
        : h('p', { class: 'muted small' }, 'Nothing to track for your class at this level yet. Add your own below.'),
      subclassSection(sub),
      raceSection(race),
      featSection(feats),
      h('p', { class: 'muted small cf-rules' }, `${edition()} rules. Rests give uses back; the DM has the last word on any number here.`),
      addForm(),
    );
  }

  /**
   * Subclass features, under their own heading, with a line for a subclass
   * the list doesn't know (from another book): add its rows by hand.
   */
  function subclassSection(sub) {
    const unknown = (state.sheet.classes ?? [])
      .filter((c) => c.subclass?.trim() && classKey(c.name) && !subclassOf(classKey(c.name), c.subclass))
      .map((c) => c.subclass.trim());
    if (!sub.length && !unknown.length) return null;
    const names = [...new Set(sub.map((r) => r.subclass))];
    return h('div', { class: 'cf-subclass' },
      h('h4', {}, 'Subclass features', names.length ? h('span', { class: 'muted small' }, ` (${names.join(', ')})`) : null),
      sub.length ? h('div', { class: 'cf-rows' }, sub.map((r) => rowView(r, false))) : null,
      unknown.length ? h('p', { class: 'muted small cf-unknown' }, `${unknown.join(', ')}: not in the list yet (it has the Player's Handbook's, Xanathar's, Tasha's, Fizban's, the 2014 DMG's and Glory of the Giants' subclasses). Add its features as your own rows below.`) : null,
    );
  }

  /**
   * Race features (from the race typed on the sheet) and racial feats (named
   * in Features & traits), under their own heading, with a line for a race
   * the list doesn't know.
   */
  function raceSection(rows) {
    const typed = String(state.sheet.race ?? '').trim();
    const unknown = typed && !knownRace(typed);
    if (!rows.length && !unknown) return null;
    const names = [...new Set(rows.map((r) => r.race).filter((n) => n !== 'Racial feat'))];
    return h('div', { class: 'cf-subclass cf-race' },
      h('h4', {}, 'Race features', names.length ? h('span', { class: 'muted small' }, ` (${names.join(', ')})`) : null),
      rows.length ? h('div', { class: 'cf-rows' }, rows.map((r) => rowView(r, false))) : null,
      unknown ? h('p', { class: 'muted small cf-unknown' }, `${typed}: not in the list yet. Add its traits as your own rows below.`) : null,
    );
  }

  /** General feats named in Features & traits (shared/feats.js): their numbers, and Lucky's points. */
  function featSection(rows) {
    if (!rows.length) return null;
    return h('div', { class: 'cf-subclass cf-feats' },
      h('h4', {}, 'Feats', h('span', { class: 'muted small' }, ' (named in Features & traits)')),
      h('div', { class: 'cf-rows' }, rows.map((r) => rowView(r, false))),
    );
  }

  function rowView(r, multi) {
    const text = [r.note, r.page && `(${r.page})`].filter(Boolean).join(' ');
    // What a feature does shows as one line (its worked-out numbers come first) until you click its name or the line.
    const key = `cf-note:${r.id}`;
    const note = text ? h('p', { class: 'muted small cf-note', title: 'Click to show or hide the rest' }, text) : null;
    const name = h('strong', {}, r.name);
    const toggle = note ? h('button', { type: 'button', class: 'cf-name-toggle', title: 'What it does' }, name) : name;
    if (note) {
      const show = (open) => {
        note.classList.toggle('folded', !open);
        toggle.setAttribute('aria-expanded', String(open));
      };
      const flip = () => {
        const open = note.classList.contains('folded');
        setOpen(key, open);
        show(open);
      };
      show(isOpen(key));
      toggle.addEventListener('click', flip);
      note.addEventListener('click', flip);
    }
    const title = h('span', { class: 'cf-name' }, toggle, multi && r.class ? h('span', { class: 'muted small' }, ` (${CLASSES[r.class].name})`) : null);
    const head = h('div', { class: 'cf-head' }, title, h('span', { class: 'spacer' }), r.kind === 'info' ? null : counter(r), r.custom ? removeButton(r) : null);
    return h('div', { class: `cf-row cf-${r.kind}${r.left === 0 ? ' cf-empty' : ''}`, 'data-feature': r.id },
      head,
      note,
      actions(r),
      r.id === 'wild_shape' ? forms : null,
    );
  }

  /** Tick boxes (a few uses) or a number with − and + (a pool, or many uses); its maximum and how it comes back. */
  function counter(r) {
    if (r.max == null) return h('span', { class: 'cf-count' }, h('strong', {}, 'Unlimited'));
    const parts = [];
    if (r.kind === 'uses' && r.max <= MAX_PIPS) {
      parts.push(h('span', { class: 'pips' }, Array.from({ length: r.max }, (_, i) => {
        const b = h('input', { type: 'checkbox', 'aria-label': `${r.name} use ${i + 1} spent` });
        b.checked = i < r.spent;
        b.addEventListener('change', () => spend(r, b.checked ? i + 1 : i));
        return b;
      })));
    } else {
      const left = h('input', { type: 'text', inputMode: 'numeric', class: 'num cf-left', 'aria-label': `${r.name} left`, autocomplete: 'off', value: String(r.left) });
      left.addEventListener('change', () => {
        const n = parseInt(left.value, 10);
        if (!Number.isFinite(n)) return (left.value = r.left);
        spend(r, r.max - Math.max(0, Math.min(r.max, n)));
      });
      parts.push(
        h('button', { type: 'button', class: 'ghost cf-step', title: `Spend one ${r.kind === 'pool' ? 'point' : 'use'}`, 'aria-label': `Spend one ${r.name}`, disabled: !r.left, onclick: () => spend(r, r.spent + 1) }, '−'),
        left,
        h('button', { type: 'button', class: 'ghost cf-step', title: `Get one ${r.kind === 'pool' ? 'point' : 'use'} back`, 'aria-label': `Get one ${r.name} back`, disabled: !r.spent, onclick: () => spend(r, r.spent - 1) }, '+'),
      );
    }
    parts.push(h('span', { class: 'muted small cf-of' }, 'of ', maxInput(r)));
    parts.push(h('span', { class: 'muted small cf-recharge', title: RECHARGE_NAMES[r.recharge] }, RECHARGE_SHORT[r.recharge]));
    return h('span', { class: 'cf-count' }, parts);
  }

  /** The maximum: the rules' number unless the player typed their own (↺ goes back). */
  function maxInput(r) {
    const input = h('input', { type: 'text', inputMode: 'numeric', class: `num cf-max${r.own ? ' own' : ''}`, 'aria-label': `${r.name} maximum`, title: r.own ? `Your own number (the rules say ${r.auto ?? 'unlimited'})` : 'Worked out from your level: type your own if the DM says so', autocomplete: 'off', value: String(r.max) });
    input.addEventListener('change', () => {
      const n = parseInt(input.value, 10);
      if (!Number.isFinite(n) || n < 0) return (input.value = r.max);
      if (r.custom) cf().custom.find((c) => c.id === r.id).max = Math.min(999, n);
      else if (n === r.auto) delete cf().max[r.id];
      else cf().max[r.id] = Math.min(999, n);
      changed();
      paint();
    });
    if (!r.own) return input;
    return h('span', {}, input, h('button', { type: 'button', class: 'reset', title: `Back to the rules' number (${r.auto ?? 'unlimited'})`, 'aria-label': `${r.name}: back to the rules' maximum`, onclick: () => { delete cf().max[r.id]; changed(); paint(); } }, '↺'));
  }

  function removeButton(r) {
    return h('button', { type: 'button', class: 'icon-x', title: `Remove ${r.name}`, 'aria-label': `Remove ${r.name}`, onclick: () => {
      if (!confirm(`Remove ${r.name} from your class features?`)) return;
      const c = cf();
      c.custom = c.custom.filter((x) => x.id !== r.id);
      delete c.spent[r.id];
      changed();
      paint();
    } }, '×');
  }

  /** Buttons for what a feature does: heal (rolled on the server), or change spell slots. */
  function actions(r) {
    const opts = () => ({ edition: edition(), values: state.calc.values });
    if (r.heal) {
      return h('div', { class: 'cf-actions' }, h('button', { type: 'button', class: 'primary small', disabled: r.left === 0, title: `Spend a use and roll ${r.heal} hit points`, onclick: () => heal(r) }, `Use (${r.heal.replace('+', ' + ')})`));
    }
    if (r.action === 'pact_slots') {
      return h('div', { class: 'cf-actions' }, h('button', { type: 'button', class: 'small', disabled: r.left === 0 || !state.sheet.spellcasting.pact_used, title: 'Spend this and get Pact Magic slots back', onclick: () => tryIt(() => regainPactSlots(state.sheet, r.id, opts())) }, 'Get pact slots back'));
    }
    if (r.action === 'sorcerous_restoration') {
      return h('div', { class: 'cf-actions' }, h('button', { type: 'button', class: 'small', disabled: r.left === 0, onclick: () => tryIt(() => sorcerousRestoration(state.sheet, opts())) }, `Get ${Math.floor(r.level / 2)} sorcery points back`));
    }
    if (r.action === 'flexible_casting') return flexibleCasting(r, opts);
    if (r.action === 'arcane_recovery') return recovery(r, opts);
    if (r.action === 'slot_heal') return slotHeal(r);
    if (r.action === 'portent') return portent(r);
    return null;
  }

  /** Circle of the Moon (2014): spend a slot to heal (1d8 a level, rolled on the server), the form's hit points while in one. */
  function slotHeal(r) {
    const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => (state.calc.values[`slots.${n}`] ?? 0) > (state.sheet.spellcasting.slots_used?.[n] ?? 0));
    if (!slots.length) return h('div', { class: 'cf-actions' }, h('span', { class: 'muted small' }, 'No spell slots left to spend.'));
    const pick = h('select', { 'aria-label': 'Slot to spend' }, slots.map((n) => h('option', { value: n }, `${ordinal(n)} level (${n}d${r.dieSize ?? 8})`)));
    return h('div', { class: 'cf-actions' },
      h('span', { class: 'small' }, 'Spend a slot: '), pick,
      h('button', { type: 'button', class: 'primary small', title: healsForm(state.sheet) ? 'Heal your Wild Shape form' : 'You aren\'t in a form with its own hit points: this heals you', onclick: () => heal(r, { slot: Number(pick.value) }) }, healsForm(state.sheet) ? 'Heal form' : 'Heal'),
    );
  }

  /** Divination: the d20s rolled after a long rest, kept until used. */
  function portent(r) {
    const chips = r.rolled.map((n, i) => h('button', { type: 'button', class: 'small cf-portent', title: `Use this ${n} (it's gone once used)`, 'aria-label': `Use Portent roll ${n}`, onclick: () => {
      if (!confirm(`Use your Portent ${n}?`)) return;
      state.sheet.class_features = useRolled(state.sheet, r.id, i).class_features;
      changed();
      paint();
    } }, String(n)));
    return h('div', { class: 'cf-actions' },
      chips.length ? h('span', { class: 'small' }, 'Kept: ') : h('span', { class: 'muted small' }, 'None kept.'),
      chips,
      h('button', { type: 'button', class: 'small', title: `Roll ${r.dice}d20 (after a long rest); replaces any kept`, onclick: () => heal(r) }, chips.length ? `Roll ${r.dice}d20 again` : `Roll ${r.dice}d20`),
    );
  }

  /** Sorcerer: a slot into points, or points into a slot. */
  function flexibleCasting(r, opts) {
    const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => state.calc.values[`slots.${n}`]);
    if (!slots.length) return null;
    const pick = h('select', { 'aria-label': 'Slot level' }, slots.map((n) => h('option', { value: n }, `${ordinal(n)} level`)));
    const level = () => Number(pick.value);
    return h('div', { class: 'cf-actions' },
      h('span', { class: 'small' }, 'Flexible Casting: '), pick,
      h('button', { type: 'button', class: 'small', title: 'Spend a slot of this level for that many points', onclick: () => tryIt(() => slotToPoints(state.sheet, level(), opts())) }, 'Slot → points'),
      h('button', { type: 'button', class: 'small', title: `Spend points to get a spent slot back (${Object.entries(SLOT_COST).map(([n, c]) => `${ordinal(Number(n))} ${c}`).join(', ')})`, onclick: () => tryIt(() => pointsToSlot(state.sheet, level(), opts())) }, 'Points → slot'),
    );
  }

  /** Wizard: pick the spent slots to get back. */
  function recovery(r, opts) {
    const budget = Math.ceil(r.level / 2);
    const spent = [1, 2, 3, 4, 5].filter((n) => state.sheet.spellcasting.slots_used?.[n]);
    if (!r.left || !spent.length) return null;
    const inputs = spent.map((n) => [n, h('input', { type: 'number', min: 0, max: state.sheet.spellcasting.slots_used[n], value: 0, class: 'num', 'aria-label': `${ordinal(n)}-level slots to get back` })]);
    return h('form', { class: 'cf-actions', onsubmit: (e) => {
      e.preventDefault();
      tryIt(() => arcaneRecovery(state.sheet, Object.fromEntries(inputs.map(([n, i]) => [n, i.value])), { ...opts(), id: r.id }));
    } },
      h('span', { class: 'small' }, `Get back up to ${budget} level${budget === 1 ? '' : 's'} of slots: `),
      inputs.map(([n, i]) => h('label', { class: 'small cf-slot' }, `${ordinal(n)} `, i)),
      h('button', { type: 'submit', class: 'small' }, 'Recover'),
    );
  }

  /** Add a row of your own: a name, how many, and when it comes back. */
  function addForm() {
    if (!adding) {
      return h('button', { type: 'button', class: 'ghost small cf-add-open', disabled: cf().custom.length >= MAX_CUSTOM, onclick: () => { adding = true; paint(); } }, '+ Add your own');
    }
    const name = h('input', { type: 'text', placeholder: 'e.g. Lucky', maxLength: 80, 'aria-label': 'Name', required: true });
    const max = h('input', { type: 'number', min: 0, max: 999, value: 1, class: 'num', 'aria-label': 'How many' });
    const kind = h('select', { 'aria-label': 'Kind' }, h('option', { value: 'uses' }, 'uses'), h('option', { value: 'pool' }, 'points'));
    const recharge = h('select', { 'aria-label': 'Comes back on' }, Object.entries(RECHARGE_NAMES).map(([k, v]) => h('option', { value: k, selected: k === 'long' }, v)));
    const note = h('input', { type: 'text', placeholder: 'What it does (optional)', maxLength: 500, 'aria-label': 'What it does' });
    return h('form', { class: 'cf-add', onsubmit: (e) => {
      e.preventDefault();
      if (!name.value.trim()) return;
      cf().custom.push(newCustomFeature({ name: name.value.trim(), max: max.value, kind: kind.value, recharge: recharge.value, note: note.value }));
      adding = false;
      changed();
      paint();
    } },
      name, max, kind, recharge, note,
      h('button', { type: 'submit', class: 'primary' }, 'Add'),
      h('button', { type: 'button', class: 'ghost', onclick: () => { adding = false; paint(); } }, 'Cancel'),
      h('p', { class: 'muted small' }, 'For anything the list doesn\'t have: a feat, a racial trait, a magic gift, homebrew.'),
    );
  }

  paint();
  state.renders.push(paint);
  return el;
}
