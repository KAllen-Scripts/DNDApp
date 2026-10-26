/**
 * Extra damage a character can add when an attack hits (Sneak Attack, Divine
 * Smite, Hunter's Mark, Hex, Rage...): the extension point for the map's
 * attacks (attacks.js) and anything else that rolls an attack from the sheet.
 * Riders are rolled only on a hit, and doubled on a critical hit like the
 * weapon's dice; the player can always tick or untick one in the attack
 * picker.
 *
 * What each character can add, and for how much, is worked out once, in
 * attack-extras.js (the extras the sheet's Attacks box offers under each
 * attack: weaponExtras for weapons, planSpell for spells). This file turns
 * those into riders, so the map and the sheet always agree. RIDERS holds
 * what only the map needs on top: when to tick one by default from the
 * situation (`suggest`, given { mode, allyNear } and the extra), and a
 * shorter note. An extra with no entry is ticked when the sheet would tick it
 * (always-on ones like Rage while raging, or Hunter's Mark while it's on).
 *
 * To add a rider: add the extra to attack-extras.js (weaponExtras or
 * planSpell), and an entry here only if the map should suggest it
 * differently.
 */
import { actionExtras } from './attack-extras.js';

const plain = (n) => (n < 0 ? `${n}` : `+${n}`);

export const RIDERS = [
  {
    id: 'sneak_attack',
    note: 'Once a turn, with a finesse or ranged weapon: when you have advantage, or an ally is within 5 ft of the target (and you don’t have disadvantage).',
    suggest: ({ mode, allyNear }) => mode === 'advantage' || (allyNear && mode !== 'disadvantage'),
  },
  // Divine Smite spends a slot, so the map never ticks it by itself.
  { id: 'divine_smite', suggest: () => false },
];
const RIDER_BY_ID = Object.fromEntries(RIDERS.map((r) => [r.id, r]));

/** The option picked for an extra with options (Divine Smite's slot): picks[id] when it's one of them, else the first. */
const optionOf = (x, picks) => x.options?.find((o) => String(o.value) === String(picks?.[x.id])) ?? x.options?.[0] ?? null;

/** An extra's dice and number as one notation: "1d6", "1d6+2", "3". */
function riderDice(x, picks) {
  const dice = optionOf(x, picks)?.dice ?? x.dice;
  if (dice && x.flat) return `${dice}${plain(x.flat)}`;
  if (dice) return dice;
  return x.flat ? String(x.flat) : '';
}

/**
 * The riders this character can add to this action: [{ id, name, note, dice,
 * type, hit, once, spend, options, picked, suggest(mode, allyNear) → boolean }].
 * type '' means the action's own damage type. hit changes the roll to hit
 * (Great Weapon Master's −5). options: the choices one has (Divine Smite's
 * slots: [{ value, label, dice }]), picks: { id: value } the player chose
 * (else the first). spend is what it uses up (a spell slot, a feature's
 * use), as planAttack's spends; the map spends it on a hit (routes/attacks.js).
 */
export function attackRiders(sheet, values, action, { edition = '2014', picks = {} } = {}) {
  const extras = actionExtras(sheet, values, action, { edition });
  return extras
    .filter((x) => !x.needs && (riderDice(x, picks) || x.hit))
    .map((x) => {
      const extra = RIDER_BY_ID[x.id];
      const byDefault = !!(x.auto || x.on);
      const option = optionOf(x, picks);
      return {
        id: x.id,
        name: x.name,
        note: extra?.note ?? x.note ?? '',
        dice: riderDice(x, picks),
        type: /^[a-z]+$/.test(x.type ?? '') ? x.type : '',
        hit: x.hit || 0,
        once: !!x.once,
        options: x.options ? x.options.map((o) => ({ value: o.value, label: o.label, dice: o.dice })) : null,
        picked: option ? option.value : null,
        spend: option ? (option.value === 'free' ? { feature: 'paladins_smite' } : { slot: option.value }) : x.spend ?? null,
        suggest: (mode, allyNear) => (extra?.suggest ? !!extra.suggest({ mode, allyNear, extra: x }) : byDefault),
      };
    });
}
