/**
 * Extra damage a character can add when an attack hits (Sneak Attack and the
 * like): the extension point for the map's attacks (attacks.js) and anything
 * else that rolls an attack from the sheet. Each rider says when it can apply
 * to an action, its dice for this character, and whether to tick it by
 * default for a given attack (`suggest`); the player can always tick or untick
 * it in the attack picker. Riders are rolled only on a hit, and doubled on a
 * critical hit like the weapon's dice.
 *
 * To add one (Divine Smite, Hunter's Mark, Hex, a Rage bonus…), add an entry
 * to RIDERS: { id, name, note, applies(ctx), dice(ctx), type?(ctx),
 * suggest?(ctx) }, where ctx is { sheet, values, levels (class key → level),
 * edition, action } and suggest also gets { mode, allyNear }.
 */
import { classLevels } from './class-features.js';

export const RIDERS = [
  {
    id: 'sneak_attack',
    name: 'Sneak Attack',
    note: 'Once a turn, with a finesse or ranged weapon: when you have advantage, or an ally is within 5 ft of the target (and you don’t have disadvantage).',
    applies: ({ levels, action }) => (levels.rogue ?? 0) >= 1 && action.kind === 'attack' && ['weapon', 'attack'].includes(action.source) && (action.finesse || action.ranged),
    dice: ({ levels }) => `${Math.ceil(levels.rogue / 2)}d6`,
    suggest: ({ mode, allyNear }) => mode === 'advantage' || (allyNear && mode !== 'disadvantage'),
  },
];

/**
 * The riders this character can add to this action: [{ id, name, note, dice,
 * type, suggest(mode, allyNear) → boolean }]. type '' means the action's own
 * damage type.
 */
export function attackRiders(sheet, values, action, { edition = '2014' } = {}) {
  const { levels } = classLevels(sheet);
  const ctx = { sheet, values, levels, edition, action };
  return RIDERS.filter((r) => r.applies(ctx)).map((r) => ({
    id: r.id,
    name: r.name,
    note: r.note,
    dice: r.dice(ctx),
    type: r.type?.(ctx) ?? '',
    suggest: (mode, allyNear) => !!r.suggest?.({ ...ctx, mode, allyNear }),
  }));
}
