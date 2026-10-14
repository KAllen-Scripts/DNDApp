/**
 * Wild Shape: the beast forms a druid can turn into, kept on the character
 * sheet (sheet.wild_shape), and what changes while they're in one.
 *
 * Plain JS like sheet.js: the server uses it and the page loads it from
 * /shared/wild-shape.js. Both rules editions (the campaign's setting):
 *
 * - 2014 (PHB p. 66): from druid level 2, twice per short or long rest
 *   (unlimited at 20). Beast Shapes table: CR 1/4 with no flying or swimming
 *   speed, CR 1/2 with no flying speed from level 4, CR 1 from level 8.
 *   Circle of the Moon: CR 1 from level 2, then druid level ÷ 3 from level 6;
 *   elementals from level 10 for two uses. The form has its own hit points:
 *   at 0 you change back and the rest of the damage carries over to you.
 * - 2024 (PHB p. 80): uses 2, 3 from level 6, 4 from level 17; a short rest
 *   gives one back, a long rest all. Same CR limits (flying from level 8,
 *   swimming any time). You know 4 forms, 6 from level 4, 8 from level 8.
 *   You keep your own hit points and gain temporary hit points equal to your
 *   druid level. Circle of the Moon: CR up to druid level ÷ 3 (at least 1),
 *   three times the temporary hit points, AC at least 13 + Wisdom modifier.
 *
 * Both: you keep Intelligence, Wisdom and Charisma, your skill and saving
 * throw proficiencies (using the beast's bonus when it's higher), and use the
 * beast's Strength, Dexterity, Constitution, AC, speeds and attacks. You can't
 * cast spells while in a form.
 */
import { ABILITIES, SKILLS, abilityMod, classKey } from './sheet.js';

export const MAX_FORMS = 30;
export const FORM_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const SPEEDS = ['walk', 'fly', 'swim', 'climb', 'burrow'];
const FORM_SOURCES = ['srd', 'book', 'ai', 'manual'];

const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const int = (v, { min = -999, max = 999, fallback = null } = {}) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/^\s*\+/, ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** "1/4" → 0.25, "2" → 2; null if it isn't a challenge rating. */
export function crValue(cr) {
  const m = /^\s*(\d+)\s*(?:\/\s*(\d+))?/.exec(String(cr ?? ''));
  if (!m) return null;
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
}
const crText = (n) => (n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n));

/** One beast form, cleaned up (from the SRD list, a lookup, or the page). */
export function normalizeForm(f = {}) {
  const abilities = {};
  for (const a of ABILITIES) abilities[a] = int(f.abilities?.[a], { min: 1, max: 30, fallback: 10 });
  const saves = {};
  for (const [a, n] of Object.entries(f.saves ?? {})) if (ABILITIES.includes(a) && int(n) != null) saves[a] = int(n, { min: -10, max: 30 });
  const skills = {};
  for (const [k, n] of Object.entries(f.skills ?? {})) if (SKILLS[k] && int(n) != null) skills[k] = int(n, { min: -10, max: 30 });
  const speed = {};
  for (const k of SPEEDS) {
    const n = int(f.speed?.[k], { min: 0, max: 500 });
    if (n) speed[k] = n;
  }
  return {
    id: str(f.id, 64) || newId(),
    name: str(f.name, 100).trim(),
    size: FORM_SIZES.includes(String(f.size).toLowerCase()) ? String(f.size).toLowerCase() : 'medium',
    type: str(f.type, 40).toLowerCase() || 'beast',
    cr: crValue(f.cr) == null ? '0' : str(f.cr, 10).trim(),
    ac: int(f.ac, { min: 0, max: 40, fallback: 10 }),
    hp_max: int(f.hp_max, { min: 1, max: 9999, fallback: 1 }),
    hp_formula: str(f.hp_formula, 40),
    speed,
    abilities,
    saves,
    skills,
    senses: str(f.senses, 300),
    traits: (Array.isArray(f.traits) ? f.traits : []).slice(0, 20).map((t) => ({ name: str(t?.name, 100), text: str(t?.text, 2000) })).filter((t) => t.name || t.text),
    attacks: (Array.isArray(f.attacks) ? f.attacks : []).slice(0, 12).map((a) => ({
      name: str(a?.name, 100),
      bonus: int(a?.bonus, { min: -10, max: 30 }),
      save: ABILITIES.includes(a?.save) ? a.save : '',
      dc: int(a?.dc, { min: 1, max: 40 }),
      damage: str(a?.damage, 100),
      notes: str(a?.notes, 1000),
    })).filter((a) => a.name),
    source: FORM_SOURCES.includes(f.source) ? f.source : 'manual',
    source_note: str(f.source_note, 300),
  };
}

/** sheet.wild_shape, cleaned up. active: the form they're in now (hp: the form's own hit points, 2014 rules). */
export function normalizeWildShape(w = {}) {
  const forms = (Array.isArray(w?.forms) ? w.forms : []).slice(0, MAX_FORMS).map(normalizeForm).filter((f) => f.name);
  const a = w?.active;
  const active = a && forms.some((f) => f.id === a.form)
    ? { form: String(a.form), hp: int(a.hp, { min: -9999, max: 9999 }), uses: int(a.uses, { min: 0, max: 2, fallback: 1 }) }
    : null;
  return { forms, uses_spent: int(w?.uses_spent, { min: 0, max: 20, fallback: 0 }), active };
}

/** How many druid levels a sheet has, and whether one of its druid classes is Circle of the Moon. */
export function druidOf(sheet) {
  const druid = (sheet?.classes ?? []).filter((c) => classKey(c.name) === 'druid');
  return { level: Math.min(20, druid.reduce((n, c) => n + (Number(c.level) || 0), 0)), moon: druid.some((c) => /moon/i.test(c.subclass ?? '')) };
}

/**
 * What Wild Shape allows this druid. uses: per rest (null: unlimited);
 * max_cr; no_fly / no_swim: forms with those speeds aren't allowed yet;
 * known: how many forms they know (2024; null in 2014); temp_hp: temporary
 * hit points on changing (2024; 0 in 2014); elementals (2014 Moon, level 10).
 */
export function wildShapeRules(sheet, edition = '2014') {
  const { level, moon } = druidOf(sheet);
  const e2024 = edition === '2024';
  const table = level >= 8 ? 1 : level >= 4 ? 0.5 : 0.25;
  const base = { level, moon, edition: e2024 ? '2024' : '2014', hours: Math.floor(level / 2), no_fly: level < 8 };
  if (level < 2) return { ...base, available: false, uses: 0, max_cr: 0, no_swim: true, known: null, temp_hp: 0, elementals: false, ac_floor: null };
  if (e2024) {
    return {
      ...base,
      available: true,
      uses: level >= 17 ? 4 : level >= 6 ? 3 : 2,
      max_cr: moon ? Math.max(1, Math.floor(level / 3)) : table,
      no_swim: false,
      known: level >= 8 ? 8 : level >= 4 ? 6 : 4,
      temp_hp: level * (moon ? 3 : 1),
      elementals: false,
      ac_floor: moon ? 13 + abilityMod(sheet.abilities?.wis ?? 10) : null,
    };
  }
  return {
    ...base,
    available: true,
    uses: level >= 20 ? null : 2,
    max_cr: moon ? (level >= 6 ? Math.floor(level / 3) : 1) : table,
    no_swim: level < 4,
    known: null,
    temp_hp: 0,
    elementals: moon && level >= 10,
    ac_floor: null,
  };
}

/** Uses left (null: unlimited). */
export const usesLeft = (sheet, rules) => (rules.uses == null ? null : Math.max(0, rules.uses - (sheet.wild_shape?.uses_spent ?? 0)));

/** Uses it costs to turn into this form (an elemental: two, 2014 Moon). */
export const formCost = (form) => (form.type === 'elemental' ? 2 : 1);

/** Why this druid can't take this form yet ('' if they can). */
export function formProblem(form, rules) {
  if (!rules.available) return 'Wild Shape starts at druid level 2.';
  if (form.type === 'elemental') return rules.elementals ? '' : 'Elementals need a Circle of the Moon druid of level 10 (2014 rules).';
  if (form.type !== 'beast') return 'Wild Shape forms are beasts.';
  const cr = crValue(form.cr) ?? 0;
  if (cr > rules.max_cr) return `Challenge ${form.cr} is over your limit (${crText(rules.max_cr)}).`;
  if (rules.no_fly && form.speed.fly) return 'Flying forms need druid level 8.';
  if (rules.no_swim && form.speed.swim) return 'Swimming forms need druid level 4.';
  return '';
}

/**
 * Turn into a form. Uses one use (two for an elemental), or throws if none
 * are left or the form isn't allowed. 2014: the form's own hit points start
 * full. 2024: temporary hit points (the higher of these and any you have).
 * @returns a new sheet
 */
export function startWildShape(sheet, formId, edition = '2014') {
  const rules = wildShapeRules(sheet, edition);
  const form = sheet.wild_shape?.forms.find((f) => f.id === formId);
  if (!form) throw new Error('That form isn\'t on your sheet.');
  const problem = formProblem(form, rules);
  if (problem) throw new Error(problem);
  const cost = formCost(form);
  const left = usesLeft(sheet, rules);
  // Changing straight from one form to another still costs a use.
  if (left != null && left < cost) throw new Error(`You have no Wild Shape uses left. ${rules.edition === '2024' ? 'A short rest gives one back' : 'A short or long rest gives them back'}.`);
  const out = structuredClone(sheet);
  out.wild_shape.uses_spent += left == null ? 0 : cost;
  out.wild_shape.active = { form: form.id, hp: rules.edition === '2024' ? null : form.hp_max, uses: cost };
  if (rules.temp_hp) out.hp.temp = Math.max(out.hp.temp ?? 0, rules.temp_hp);
  return out;
}

/** Change back to your own form. */
export function endWildShape(sheet) {
  const out = structuredClone(sheet);
  out.wild_shape.active = null;
  return out;
}

/** The form they're in now, or null. */
export const activeForm = (sheet) => {
  const id = sheet?.wild_shape?.active?.form;
  return id ? sheet.wild_shape.forms.find((f) => f.id === id) ?? null : null;
};

/** True when the form has its own hit points (2014 rules). */
export const formHasHp = (sheet) => activeForm(sheet) != null && sheet.wild_shape.active.hp != null;

/**
 * The form's hit points became `current` (damage or healing, from the sheet
 * or a token on the map). 2014: at 0 or below you change back, and the
 * damage left over comes off your own hit points. No form hit points (2024):
 * your own hit points change, as normal.
 * @param {number|null} ownMax your hit point maximum, for when your current hit points are blank
 * @returns {{ sheet, reverted: boolean, carried: number }}
 */
export function setFormHp(sheet, current, ownMax = null) {
  const out = structuredClone(sheet);
  const form = activeForm(sheet);
  if (!form || out.wild_shape.active.hp == null) {
    out.hp.current = current;
    return { sheet: out, reverted: false, carried: 0 };
  }
  const hp = Math.min(form.hp_max, Math.trunc(current));
  if (hp > 0) {
    out.wild_shape.active.hp = hp;
    return { sheet: out, reverted: false, carried: 0 };
  }
  const carried = -hp;
  out.wild_shape.active = null;
  if (carried) out.hp.current = (out.hp.current ?? ownMax ?? 0) - carried;
  return { sheet: out, reverted: true, carried };
}

/**
 * Everything the sheet shows while in a form: scores (the beast's Strength,
 * Dexterity, Constitution; your own Intelligence, Wisdom, Charisma), saves
 * and skills (yours with the new scores, or the beast's if higher), AC,
 * speeds, initiative and passive Perception. calc is computeSheet(sheet).
 */
export function formStats(sheet, form, calc, edition = '2014') {
  const rules = wildShapeRules(sheet, edition);
  const pb = calc.values.proficiency_bonus;
  const scores = {};
  const mod = {};
  for (const a of ABILITIES) {
    scores[a] = ['str', 'dex', 'con'].includes(a) ? form.abilities[a] : calc.scores[a];
    mod[a] = abilityMod(scores[a]);
  }
  const better = (own, beast) => (beast != null && beast > own ? beast : own);
  const saves = {};
  for (const a of ABILITIES) saves[a] = better(mod[a] + (calc.values[`save_prof.${a}`] ? pb : 0), form.saves[a]);
  const half = calc.values.jack_of_all_trades ? Math.floor(pb / 2) : 0;
  const skills = {};
  for (const [k, { ability }] of Object.entries(SKILLS)) {
    const p = sheet.skills?.[k];
    const mult = p === 'expertise' ? 2 : p === 'proficient' ? 1 : 0;
    skills[k] = better(mod[ability] + (mult ? mult * pb : half), form.skills[k]);
  }
  const active = sheet.wild_shape?.active?.form === form.id ? sheet.wild_shape.active : null;
  return {
    scores,
    mod,
    saves,
    skills,
    ac: rules.ac_floor != null ? Math.max(form.ac, rules.ac_floor) : form.ac,
    speed: form.speed,
    initiative: mod.dex + half,
    passive_perception: 10 + skills.perception,
    hp: active?.hp != null ? { current: active.hp, max: form.hp_max } : null,
  };
}

/** "Walk 40 ft., climb 30 ft." */
export const speedText = (speed) =>
  Object.entries(speed ?? {}).map(([k, n], i) => `${i ? k : k.charAt(0).toUpperCase() + k.slice(1)} ${n} ft.`).join(', ') || '—';

/** A rest: 2014, a short or long rest gives every use back; 2024, a short rest one, a long rest all. */
export function restWildShape(sheet, kind, edition = '2014') {
  const out = structuredClone(sheet);
  const w = out.wild_shape;
  if (!w) return out;
  w.uses_spent = kind === 'short' && edition === '2024' ? Math.max(0, w.uses_spent - 1) : 0;
  return out;
}
