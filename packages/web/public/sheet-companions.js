/**
 * The Companions box on the character sheet: familiars, pets, mounts,
 * summons, sidekicks and animal companions, each with its stat block, hit
 * points, attacks to roll, and Put on the map / Take off / Dismiss. They're
 * kept on the sheet, so they follow the character from map to map; on a map
 * the token is tied to the entry (the server keeps the hit points the same).
 * Added by name (the SRD's creatures, then the books, then the AI, like Wild
 * Shape forms), or from a spell or class feature the sheet has (Find
 * Familiar, Find Steed, Primal Companion, Steel Defender, a drake…), whose
 * stat block is worked out from the character. The rules are in
 * shared/companions.js; sheet.js owns the sheet and passes in what this needs.
 */
import { api, h } from './api.js';
import { ABILITIES, ABILITY_NAMES, formatBonus } from './shared/sheet.js';
import { d20Plus } from './shared/dice.js';
import { speedText } from './shared/wild-shape.js';
import { COMPANION_KINDS, MAX_SHEET_COMPANIONS, builtStatBlock, companionSources, normalizeCompanion, rangersCompanion } from './shared/companions.js';
import { roll, rollModeFromEvent, D20_ICON } from './dice.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const mod = (score) => Math.floor((score - 10) / 2);
const SOURCE_NOTES = { srd: 'SRD', book: 'Your book', ai: 'AI memory (check it)', manual: 'Worked out' };
const FROM_NAMES = { spell: 'spell', feature: 'feature', item: 'item' };

/** The dice of an action's damage ("2d4+2 piercing" → "2d4+2"), or ''. */
const dice = (a) => /^\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)/i.exec(a.damage ?? '')?.[1].replace(/\s+/g, '') ?? '';

/**
 * @param {object} ctx
 * @param {object} ctx.state  the sheet's state (sheet, calc, settings, edition, campaignId, guarded, renders)
 * @param {() => void} ctx.changed  the sheet changed: save soon
 * @param {() => Promise<void>} ctx.flush  save now (before the server needs the companion)
 */
export function companionsBox({ state, changed, flush }) {
  const el = h('section', { class: 'sh-box companions' });
  const base = () => `/campaigns/${state.campaignId}`;
  const edition = () => state.settings?.edition || state.edition || '2014';
  const list = () => (state.sheet.companions ??= []);
  let where = {};
  let note = '';
  let drawn = null;

  const paint = () => {
    const key = JSON.stringify([list(), where, note, edition(), state.sheet.spells?.map((s) => s.name), state.sheet.classes, state.calc.values.proficiency_bonus, state.calc.values.spell_attack]);
    if (key === drawn && el.childElementCount) return;
    drawn = key;
    draw();
  };
  const say = (text) => { note = text; drawn = null; paint(); };

  const loadWhere = () => state.guarded(() => api('GET', `${base()}/sheet/companions/where`))
    .then((res) => { if (res) { where = res.where ?? {}; drawn = null; paint(); } })
    .catch(() => {});

  function draw() {
    const cs = list();
    el.replaceChildren(
      h('h3', {}, 'Companions'),
      cs.length ? h('div', { class: 'companion-list' }, cs.map(card)) : h('p', { class: 'muted small' }, 'Familiars, pets, mounts, summons and animal companions. Each keeps its stat block and hit points here, and goes on the map with you.'),
      note ? h('p', { class: 'small companion-note', role: 'status' }, note) : null,
      cs.length < MAX_SHEET_COMPANIONS ? addForm() : null,
    );
  }

  /** One companion: hit points, AC, speed, the map buttons and its stat block with rolls. */
  function card(c) {
    const f = c.form;
    const hp = h('input', { type: 'text', inputMode: 'numeric', class: 'num', value: String(c.hp.current), 'aria-label': `${c.name} hit points` });
    hp.addEventListener('change', () => {
      const n = parseInt(hp.value, 10);
      if (!Number.isFinite(n)) return (hp.value = String(c.hp.current));
      c.hp.current = Math.min(c.hp.max, n);
      hp.value = String(c.hp.current);
      changed();
      if (c.hp.current <= 0) say(`${c.name} is at 0 hit points.${c.expires === 'dawn' || c.from.kind === 'item' ? ' A summon like this one vanishes: Dismiss it.' : ''}`);
    });
    const at = where[c.id];
    const placeButton = at
      ? h('button', { type: 'button', class: 'ghost small', title: `On "${at.map_name}". Take it off the map (it stays here)`, onclick: () => unplace(c) }, 'Take off the map')
      : h('button', { type: 'button', class: 'primary small', title: 'Put it on the map your character is on, next to them', onclick: () => place(c) }, 'Put on the map');
    const facts = [`AC ${f.ac}`, speedText(f.speed), `${cap(f.size)} ${f.type}`].join(' · ');
    return h('article', { class: 'companion', 'data-id': c.id },
      h('div', { class: 'companion-head' },
        h('strong', { class: 'companion-name' }, c.name),
        h('span', { class: 'tag' }, COMPANION_KINDS[c.kind]),
        c.from.name ? h('span', { class: 'muted small' }, `from ${c.from.name}${c.from.kind ? ` (${FROM_NAMES[c.from.kind]})` : ''}`) : null,
        h('span', { class: 'spacer' }),
        placeButton,
        h('button', { type: 'button', class: 'ghost small danger', 'aria-label': `Dismiss ${c.name}`, title: 'It goes from your sheet (and the map)', onclick: () => dismiss(c) }, 'Dismiss'),
      ),
      h('div', { class: 'companion-vitals' },
        h('label', { class: 'stat companion-hp' }, h('span', { class: 'companion-hp-val' }, hp, h('span', { class: 'muted' }, ` / ${c.hp.max}`)), h('span', { class: 'lbl' }, 'Hit points')),
        h('span', { class: 'muted small' }, facts),
        at ? h('span', { class: 'small companion-where' }, `On the map: ${at.map_name}`) : null,
        c.until ? h('span', { class: 'small muted' }, `Lasts: ${c.until}`) : null,
      ),
      attackList(c),
      h('details', { class: 'companion-more' },
        h('summary', {}, 'Stat block'),
        h('div', { class: 'ws-scores' }, ABILITIES.map((a) => h('div', { class: 'ws-score' },
          rollButton(a.toUpperCase(), () => d20Plus(mod(f.abilities[a])), () => `${c.name}: ${ABILITY_NAMES[a]} check`),
          h('span', { class: 'ws-mod' }, formatBonus(mod(f.abilities[a]))),
          h('span', { class: 'muted small' }, String(f.abilities[a])),
          rollButton(`Save ${formatBonus(f.saves[a] ?? mod(f.abilities[a]))}`, () => d20Plus(f.saves[a] ?? mod(f.abilities[a])), () => `${c.name}: ${ABILITY_NAMES[a]} save`, 'small'),
        ))),
        f.senses ? h('p', { class: 'small' }, h('strong', {}, 'Senses '), f.senses) : null,
        ...f.traits.map((t) => h('p', { class: 'small ws-text' }, h('strong', {}, `${t.name}. `), t.text)),
        h('p', { class: 'muted small' }, `CR ${f.cr}. From: ${SOURCE_NOTES[f.source] ?? f.source}${f.source_note && f.source !== 'srd' ? ` (${f.source_note})` : ''}.`),
      ),
    );
  }

  const rollButton = (content, notation, label, cls = '') => {
    const b = h('button', { type: 'button', class: `roll-name ${cls}`, title: 'Click to roll (Shift: advantage, Alt: disadvantage)' }, content);
    b.addEventListener('click', (e) => roll(notation(), { label: label(), mode: rollModeFromEvent(e) }));
    return b;
  };

  /** Its actions: attacks roll to hit, then damage; saves show their DC; anything else is its text. */
  function attackList(c) {
    if (!c.form.attacks.length) return null;
    return h('div', { class: 'ws-attacks companion-attacks' }, c.form.attacks.map((a) => {
      const title = `${c.name}: ${a.name}`;
      const hit = a.bonus != null ? (() => {
        const b = h('button', { type: 'button', class: 'icon-roll', title: 'Roll to hit (Shift: advantage, Alt: disadvantage)', 'aria-label': `Roll ${c.name} ${a.name} to hit` });
        b.innerHTML = D20_ICON;
        b.addEventListener('click', (e) => roll(d20Plus(a.bonus), { label: `${title}: to hit`, mode: rollModeFromEvent(e), then: dice(a) && { label: `${title}: damage`, notation: dice(a) } }));
        return b;
      })() : null;
      const dmg = dice(a) ? h('button', { type: 'button', class: 'icon-roll dmg-roll', 'aria-label': `Roll ${c.name} ${a.name} damage`, onclick: () => roll(dice(a), { label: `${title}: ${/heal/i.test(a.damage) ? 'healing' : 'damage'}${a.dc ? ` (DC ${a.dc}${a.save ? ` ${cap(a.save)}` : ''} save)` : ''}` }) }, /heal/i.test(a.damage) ? 'Heal' : 'Dmg') : null;
      const summary = [a.bonus != null ? `${formatBonus(a.bonus)} to hit` : '', a.dc ? `DC ${a.dc}${a.save ? ` ${cap(a.save)}` : ''}` : '', a.damage].filter(Boolean).join(' · ');
      return h('div', { class: 'ws-attack' },
        h('div', { class: 'ws-attack-head' }, h('strong', {}, a.name), summary ? h('span', { class: 'muted small' }, ` ${summary}`) : null, h('span', { class: 'spacer' }), hit, dmg),
        a.notes ? h('p', { class: 'small ws-text' }, a.notes) : null,
      );
    }));
  }

  async function place(c) {
    try {
      await flush();
      const res = await state.guarded(() => api('POST', `${base()}/sheet/companions/${encodeURIComponent(c.id)}/map`, {}));
      if (!res) return;
      where = { ...where, [c.id]: { map_id: res.map.id, map_name: res.map.name, token_id: res.token?.id } };
      say(`${c.name} is on "${res.map.name}", next to you.`);
    } catch (err) {
      say(err.message);
    }
  }

  async function unplace(c) {
    try {
      await state.guarded(() => api('DELETE', `${base()}/sheet/companions/${encodeURIComponent(c.id)}/map`));
      const { [c.id]: _gone, ...rest } = where;
      where = rest;
      say(`${c.name} is off the map (still here on your sheet).`);
    } catch (err) {
      say(err.message);
    }
  }

  function dismiss(c) {
    if (!confirm(`Dismiss ${c.name}? It goes from your sheet${where[c.id] ? ' and the map' : ''}.`)) return;
    state.sheet.companions = list().filter((x) => x.id !== c.id);
    const { [c.id]: _gone, ...rest } = where;
    where = rest;
    changed();
    say(`${c.name} is dismissed.`);
  }

  /** Add a companion: from a spell or feature on this sheet, or any creature by name. */
  function addForm() {
    const sources = companionSources(state.sheet, { edition: edition() });
    const from = h('select', { 'aria-label': 'Where the companion comes from' }, new Option('A creature by name', ''), ...sources.map((s) => new Option(`${s.name} (${s.from})`, s.id)));
    const creature = h('input', { type: 'text', list: 'dl-companion-creatures', placeholder: 'A creature, e.g. Wolf, Owl, Riding Horse', autocomplete: 'off', 'aria-label': 'Creature' });
    const creatures = h('datalist', { id: 'dl-companion-creatures' });
    const choice = h('select', { 'aria-label': 'Which one' });
    const level = h('select', { 'aria-label': 'Spell slot level' });
    const kind = h('select', { 'aria-label': 'Kind of companion' }, Object.entries(COMPANION_KINDS).map(([k, n]) => new Option(n, k)));
    const name = h('input', { type: 'text', maxLength: 80, placeholder: 'Its name (optional)', 'aria-label': 'Companion name' });
    const hint = h('p', { class: 'muted small' });
    let srd = [];
    const fill = () => {
      const s = sources.find((x) => x.id === from.value);
      kind.value = s?.kind ?? 'pet';
      hint.textContent = s?.note ?? 'Its stat block comes from the SRD, your books or the AI (marked when it is).';
      choice.hidden = !s?.built;
      level.hidden = !s?.levels;
      creature.hidden = !!s?.built;
      if (s?.built) choice.replaceChildren(...Object.entries(s.choices).map(([k, n]) => new Option(n, k)));
      if (s?.levels) level.replaceChildren(...s.levels.map((n) => new Option(`Level ${n} slot`, String(n))));
      const names = s?.creatures ?? srd;
      creatures.replaceChildren(...names.map((n) => h('option', { value: n })));
      if (s?.creatures?.length && !s.creatures.includes(creature.value)) creature.value = '';
    };
    state.guarded(() => api('GET', `${base()}/forms`)).then((forms) => {
      srd = (forms ?? []).map((f) => f.name);
      fill();
    }).catch(() => {});
    from.addEventListener('change', fill);
    fill();
    const add = async (e) => {
      e.preventDefault();
      const s = sources.find((x) => x.id === from.value);
      let form;
      try {
        if (s?.built) {
          form = builtStatBlock(s.id, { sheet: state.sheet, values: state.calc.values, edition: edition(), choice: choice.value, level: Number(level.value) || null });
        } else {
          const want = creature.value.trim();
          if (!want) return say('Which creature? Type its name (Wolf, Owl, Warhorse…).');
          say(`Looking up ${want}…`);
          form = await state.guarded(() => api('GET', `${base()}/forms/lookup?name=${encodeURIComponent(want)}`));
          if (!form) return;
          if (s?.id === 'rangers_companion') form = rangersCompanion(form, { sheet: state.sheet, values: state.calc.values });
        }
      } catch (err) {
        return say(err.message);
      }
      const c = normalizeCompanion({
        name: name.value.trim() || form.name, kind: kind.value, form, hp: { max: form.hp_max, current: form.hp_max },
        from: s ? { kind: s.from, name: s.name } : {}, until: s?.until ?? '',
      });
      list().push(c);
      changed();
      say(`${c.name} joined you${form.source === 'ai' ? " (its stat block is from the AI's memory: check it)" : ''}. Put it on the map when it's with you.`);
    };
    return h('form', { class: 'add-form companion-add', onsubmit: add },
      h('div', { class: 'companion-add-row' }, from, creatures, creature, choice, level),
      h('div', { class: 'companion-add-row' }, kind, name, h('button', { type: 'submit', class: 'primary' }, 'Add companion')),
      hint,
    );
  }

  paint();
  loadWhere();
  state.renders.push(paint);
  return el;
}
