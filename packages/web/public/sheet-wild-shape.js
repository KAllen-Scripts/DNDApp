/**
 * The druid's Wild Shape box on the character sheet (shown only on sheets
 * with a druid class): the beast forms they can take, looked up by name (the
 * SRD, the group's books, then the AI), uses left, and, while they're in a
 * form, its hit points, scores, saves, skills and attacks to roll. The rules
 * (both editions) are in shared/wild-shape.js; sheet.js owns the sheet and
 * passes in what this needs.
 */
import { api, h } from './api.js';
import { ABILITIES, ABILITY_NAMES, SKILLS, formatBonus } from './shared/sheet.js';
import { d20Plus } from './shared/dice.js';
import { activeForm, druidOf, endWildShape, formCost, formProblem, formStats, setFormHp, speedText, startWildShape, usesLeft, wildShapeRules } from './shared/wild-shape.js';
import { roll, rollModeFromEvent, D20_ICON } from './dice.js';

const SOURCE_NOTES = { srd: 'SRD', book: 'Your book', ai: 'AI memory (check it)', manual: 'Typed in' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A name you click to roll a d20 plus a bonus. */
function rollName(content, bonus, label, cls = '') {
  const b = h('button', { type: 'button', class: `roll-name ${cls}`, title: 'Click to roll (Shift: advantage, Alt: disadvantage)' }, content);
  b.addEventListener('click', (e) => roll(d20Plus(bonus()), { label: label(), mode: rollModeFromEvent(e) }));
  return b;
}

/**
 * @param {object} ctx
 * @param {object} ctx.state  the sheet's state (sheet, calc, settings, edition, campaignId, guarded, renders)
 * @param {() => void} ctx.changed  something on the sheet changed: save soon
 * @param {() => void} ctx.render  draw the whole sheet again (after hit points change)
 */
export function wildShapeBox({ state, changed, render }) {
  const el = h('section', { class: 'sh-box wild-shape' });
  const edition = () => state.settings?.edition || state.edition || '2014';
  let drawn = null;
  const paint = () => {
    const { level, moon } = druidOf(state.sheet);
    el.hidden = !level;
    if (!level) return;
    // Redrawn only when what it shows changes, so typing elsewhere doesn't lose your place here.
    const key = JSON.stringify([level, moon, edition(), state.sheet.wild_shape, state.sheet.abilities.wis, state.calc.values.proficiency_bonus]);
    if (key === drawn && el.childElementCount) return;
    drawn = key;
    draw();
  };

  const turnInto = (form) => {
    try {
      const next = startWildShape(state.sheet, form.id, edition());
      state.sheet.wild_shape = next.wild_shape;
      state.sheet.hp = next.hp;
      changed();
      render();
    } catch (err) {
      alert(err.message);
    }
  };
  const changeBack = () => {
    state.sheet.wild_shape = endWildShape(state.sheet).wild_shape;
    changed();
    render();
  };

  function draw() {
    const rules = wildShapeRules(state.sheet, edition());
    const w = state.sheet.wild_shape;
    const left = usesLeft(state.sheet, rules);
    const crText = (n) => (n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n));
    const limits = rules.available
      ? [
          `Up to challenge ${crText(rules.max_cr)}`,
          rules.no_fly && rules.no_swim ? 'no flying or swimming speed' : rules.no_fly ? 'no flying speed' : '',
          rules.elementals ? 'elementals for two uses' : '',
          `for up to ${rules.hours} hour${rules.hours === 1 ? '' : 's'}`,
        ].filter(Boolean).join(', ')
      : 'Wild Shape starts at druid level 2.';
    const rest = rules.edition === '2024' ? 'A short rest gives one use back, a long rest all of them.' : 'A short or long rest gives them all back.';

    const uses = rules.available
      ? h('div', { class: 'ws-uses' },
          h('span', { class: 'lbl' }, 'Uses left'),
          left == null
            ? h('strong', {}, 'Unlimited')
            : [
                h('span', { class: 'pips' }, Array.from({ length: rules.uses }, (_, i) => {
                  const b = h('input', { type: 'checkbox', 'aria-label': `Wild Shape use ${i + 1} spent` });
                  b.checked = i < w.uses_spent;
                  b.addEventListener('change', () => { w.uses_spent = b.checked ? i + 1 : i; changed(); paint(); });
                  return b;
                })),
                h('strong', { class: 'ws-left' }, `${left} of ${rules.uses}`),
              ],
          h('span', { class: 'muted small' }, rest),
        )
      : null;

    const form = activeForm(state.sheet);
    el.replaceChildren(...[
      h('h3', {}, 'Wild Shape'),
      h('p', { class: 'muted small ws-rules' }, `Druid ${rules.level}${rules.moon ? ' (Circle of the Moon)' : ''}, ${rules.edition} rules. ${limits}${rules.available ? '.' : ''}`),
      uses,
      form ? activePanel(form, rules) : null,
      formList(rules, left),
      rules.known && w.forms.length > rules.known
        ? h('p', { class: 'sheet-warn small' }, `At this level you know ${rules.known} forms; there are ${w.forms.length} here. You can swap one for another when you finish a long rest.`)
        : null,
      addForm(),
    ].filter(Boolean));
  }

  /** The form they're in now: hit points, scores, saves, skills, attacks and traits. */
  function activePanel(form, rules) {
    const s = formStats(state.sheet, form, state.calc, rules.edition);
    const name = form.name;
    let hp;
    if (s.hp) {
      const input = h('input', { type: 'text', inputMode: 'numeric', class: 'num', 'aria-label': `${name} hit points`, autocomplete: 'off' });
      input.value = s.hp.current;
      input.addEventListener('change', () => {
        const n = parseInt(input.value, 10);
        if (!Number.isFinite(n)) return (input.value = state.sheet.wild_shape.active.hp);
        const res = setFormHp(state.sheet, n, state.calc.values.hp_max);
        state.sheet.wild_shape = res.sheet.wild_shape;
        state.sheet.hp = res.sheet.hp;
        changed();
        render();
        if (res.reverted) alert(`${name} dropped to 0 hit points: you change back${res.carried ? ` and take the other ${res.carried} damage yourself` : ''}.`);
      });
      hp = h('label', { class: 'stat ws-hp' }, h('span', { class: 'ws-hp-val' }, input, h('span', { class: 'muted' }, ` / ${s.hp.max}`)), h('span', { class: 'lbl' }, `${name}'s hit points`));
    } else {
      const own = state.sheet.hp.current ?? state.calc.values.hp_max ?? '?';
      hp = h('div', { class: 'stat ws-hp' }, h('span', { class: 'ws-hp-val' }, `${own}${state.sheet.hp.temp ? ` + ${state.sheet.hp.temp}` : ''}`), h('span', { class: 'lbl' }, 'Your hit points (+ temporary)'));
    }
    const tile = (value, label, cls = '') => h('div', { class: `stat ${cls}` }, h('span', { class: 'ws-val' }, value), h('span', { class: 'lbl' }, label));
    const scores = h('div', { class: 'ws-scores' }, ABILITIES.map((a) =>
      h('div', { class: 'ws-score' },
        rollName(a.toUpperCase(), () => s.mod[a], () => `${name}: ${ABILITY_NAMES[a]} check`, 'ws-ab'),
        h('span', { class: 'ws-mod' }, formatBonus(s.mod[a])),
        h('span', { class: 'muted small' }, String(s.scores[a])),
        rollName(`Save ${formatBonus(s.saves[a])}`, () => s.saves[a], () => `${name}: ${ABILITY_NAMES[a]} save`, 'small ws-save'),
      )));
    // Skills worth showing: the ones you or the beast are proficient in (the rest are just the ability).
    const skillKeys = Object.keys(SKILLS).filter((k) => state.sheet.skills[k] || form.skills[k] != null);
    const skills = skillKeys.length
      ? h('p', { class: 'ws-skills' }, h('span', { class: 'lbl' }, 'Skills '), skillKeys.map((k) => rollName(`${SKILLS[k].name} ${formatBonus(s.skills[k])}`, () => s.skills[k], () => `${name}: ${SKILLS[k].name}`, 'small')))
      : null;
    return h('div', { class: 'ws-active' },
      h('div', { class: 'ws-active-head' },
        h('h4', {}, `You're in Wild Shape as ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`),
        h('button', { type: 'button', class: 'ghost', onclick: changeBack }, 'Change back'),
      ),
      h('div', { class: 'ws-vitals' },
        hp,
        tile(String(s.ac), 'Armour class'),
        h('div', { class: 'stat' }, h('span', { class: 'ws-val' }, formatBonus(s.initiative)), rollName('Initiative', () => s.initiative, () => `${name}: initiative`, 'lbl')),
        tile(speedText(s.speed), 'Speed', 'ws-speed'),
        tile(String(s.passive_perception), 'Passive Perception'),
      ),
      scores,
      skills,
      attackList(form, true),
      traitList(form),
      h('p', { class: 'muted small' }, `You keep your Intelligence, Wisdom and Charisma, and your proficiencies; Strength, Dexterity, Constitution, armour class, speed and attacks are the ${name}'s. ${rules.level >= 18 ? 'Beast Spells (druid 18): you can cast your spells in this form.' : 'By the rules you can\'t cast spells in this form until druid level 18 (your spells stay open on the sheet; the DM has the last word).'}${s.hp ? ` At 0 hit points you change back, and any damage left over comes off your own hit points.` : ''}`),
    );
  }

  /** A form's actions: attacks roll to hit, then damage; anything else is its text. */
  function attackList(form, rollable) {
    if (!form.attacks.length) return null;
    return h('div', { class: 'ws-attacks' }, form.attacks.map((a) => {
      const title = `${form.name}: ${a.name}`;
      const hit = a.bonus != null && rollable
        ? (() => {
            const b = h('button', { type: 'button', class: 'icon-roll', title: 'Roll to hit (Shift: advantage, Alt: disadvantage)', 'aria-label': `Roll ${a.name} to hit` });
            b.innerHTML = D20_ICON;
            b.addEventListener('click', (e) => roll(d20Plus(a.bonus), { label: `${title}: to hit`, mode: rollModeFromEvent(e), then: dice(a) && { label: `${title}: damage`, notation: dice(a) } }));
            return b;
          })()
        : null;
      const dmg = dice(a) && rollable ? h('button', { type: 'button', class: 'icon-roll dmg-roll', title: 'Roll damage', 'aria-label': `Roll ${a.name} damage`, onclick: () => roll(dice(a), { label: `${title}: damage${a.dc ? ` (DC ${a.dc}${a.save ? ` ${cap(a.save)}` : ''} save)` : ''}` }) }, 'Dmg') : null;
      const summary = [a.bonus != null ? `${formatBonus(a.bonus)} to hit` : '', a.dc ? `DC ${a.dc}${a.save ? ` ${cap(a.save)}` : ''}` : '', a.damage].filter(Boolean).join(' · ');
      return h('div', { class: 'ws-attack' },
        h('div', { class: 'ws-attack-head' }, h('strong', {}, a.name), summary ? h('span', { class: 'muted small' }, ` ${summary}`) : null, h('span', { class: 'spacer' }), hit, dmg),
        a.notes ? h('p', { class: 'small ws-text' }, a.notes) : null,
      );
    }));
  }

  const traitList = (form) => (form.traits.length
    ? h('div', { class: 'ws-traits' }, form.traits.map((t) => h('p', { class: 'small ws-text' }, h('strong', {}, `${t.name}. `), t.text)))
    : null);

  /** The forms on the sheet, each with Turn into (or why not yet) and its details. */
  function formList(rules, left) {
    const w = state.sheet.wild_shape;
    if (!w.forms.length) return h('p', { class: 'muted small' }, 'No forms yet. Add the beasts you have seen and can turn into, by name.');
    return h('div', { class: 'ws-forms' }, w.forms.map((f, i) => {
      const problem = formProblem(f, rules);
      const now = w.active?.form === f.id;
      const short = left != null && left < formCost(f);
      const go = h('button', { type: 'button', class: 'primary small', disabled: !!problem || short || now, title: problem || (short ? 'No Wild Shape uses left' : ''), onclick: (e) => { e.preventDefault(); turnInto(f); } }, now ? 'Now' : 'Turn into');
      const facts = [`CR ${f.cr}`, cap(f.size), `AC ${f.ac}`, `HP ${f.hp_max}`, speedText(f.speed)].join(' · ');
      return h('details', { class: `ws-form${now ? ' now' : ''}${problem ? ' not-yet' : ''}` },
        h('summary', {},
          h('span', { class: 'ws-form-name' }, f.name), h('span', { class: 'muted small ws-facts' }, facts),
          h('span', { class: 'spacer' }), go,
          h('button', { type: 'button', class: 'icon-x', title: `Remove ${f.name}`, 'aria-label': `Remove ${f.name}`, disabled: now, onclick: (e) => {
            e.preventDefault();
            w.forms.splice(i, 1);
            changed();
            paint();
          } }, '×'),
        ),
        problem ? h('p', { class: 'small sheet-warn' }, `Not yet: ${problem}`) : null,
        h('p', { class: 'muted small' }, `${['str', 'dex', 'con'].map((a) => `${a.toUpperCase()} ${f.abilities[a]}`).join(', ')}${f.senses ? `. ${f.senses}` : ''}. From: ${SOURCE_NOTES[f.source] ?? f.source}${f.source_note && f.source !== 'srd' ? ` (${f.source_note})` : ''}.`),
        attackList(f, false),
        traitList(f),
      );
    }));
  }

  /** Add a form by name: the SRD's beasts are suggested while typing. */
  function addForm() {
    const input = h('input', { type: 'text', placeholder: 'A beast, e.g. Wolf', list: 'dl-forms', autocomplete: 'off', 'aria-label': 'Form to add' });
    const list = h('datalist', { id: 'dl-forms' });
    const note = h('span', { class: 'muted small' });
    state.guarded(() => api('GET', `/campaigns/${state.campaignId}/forms`)).then((forms) => {
      list.replaceChildren(...(forms ?? []).map((f) => h('option', { value: f.name }, `${f.name} (CR ${f.cr}${f.type === 'beast' ? '' : `, ${f.type}`})`)));
    }).catch(() => {});
    const add = async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      if (state.sheet.wild_shape.forms.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
        note.textContent = `${name} is already here.`;
        return;
      }
      note.textContent = `Looking up ${name}…`;
      try {
        const form = await state.guarded(() => api('GET', `/campaigns/${state.campaignId}/forms/lookup?name=${encodeURIComponent(name)}`));
        if (!form) return;
        state.sheet.wild_shape.forms.push(form);
        input.value = '';
        changed();
        paint();
      } catch (err) {
        note.textContent = err.message;
      }
    };
    return h('form', { class: 'add-form ws-add', onsubmit: add }, list, input, h('button', { type: 'submit', class: 'primary', title: 'Look it up in the SRD, your books or the AI' }, 'Add form'), note);
  }

  paint();
  state.renders.push(paint);
  return el;
}

/** The dice notation for an action's damage ("2d4+2 piercing" → "2d4+2"), or ''. */
function dice(a) {
  const m = /^\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)/i.exec(a.damage ?? '');
  return m ? m[1].replace(/\s+/g, '') : '';
}

/** A line under the character's name while they're in a form: "Wild Shape: Wolf, 8 of 11 hit points". */
export function wildShapeBanner({ state }) {
  const el = h('p', { class: 'ws-banner small', role: 'status' });
  state.renders.push(() => {
    const form = activeForm(state.sheet);
    el.hidden = !form;
    if (!form) return;
    const hp = state.sheet.wild_shape.active.hp;
    el.textContent = `Wild Shape: ${form.name}${hp != null ? `, ${hp} of ${form.hp_max} hit points` : ''}`;
  });
  return el;
}
