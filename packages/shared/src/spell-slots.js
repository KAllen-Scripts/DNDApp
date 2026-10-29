/**
 * Spell slots (D&D 5e): how many are left, spending one to cast a spell, and
 * giving it back. One place for both casting from the sheet (the server's
 * POST /sheet/spells/cast) and from the map (routes/attacks.js), and the
 * sheet page shows the slot lists with it. The slot counts themselves come
 * from computeSheet (shared/sheet.js): calc.values["slots.N"], pact_level,
 * pact_slots; the sheet keeps what's used in spellcasting.slots_used and
 * spellcasting.pact_used.
 */

/** Spell slots left: { 1: n, ..., 9: n } and pact: { level, left } (warlocks). */
export function slotsLeft(sheet, calc) {
  const out = {};
  for (let n = 1; n <= 9; n++) out[n] = Math.max(0, (Number(calc.values[`slots.${n}`]) || 0) - (sheet.spellcasting?.slots_used?.[n] ?? 0));
  const pactLevel = Number(calc.values.pact_level) || 0;
  out.pact = { level: pactLevel, left: pactLevel ? Math.max(0, (Number(calc.values.pact_slots) || 0) - (sheet.spellcasting?.pact_used ?? 0)) : 0 };
  return out;
}

/**
 * Spend a slot of `level` for a spell: an ordinary slot of that level, else a
 * Pact Magic slot of that level. Returns { sheet, used: 'slot' | 'pact' }, or
 * null when none is left.
 */
export function spendSlot(sheet, calc, level) {
  const left = slotsLeft(sheet, calc);
  const out = structuredClone(sheet);
  out.spellcasting ??= { class: '', slots_used: {}, pact_used: 0 };
  out.spellcasting.slots_used ??= {};
  if (left[level] > 0) {
    out.spellcasting.slots_used[level] = (out.spellcasting.slots_used[level] ?? 0) + 1;
    return { sheet: out, used: 'slot' };
  }
  if (left.pact.level === level && left.pact.left > 0) {
    out.spellcasting.pact_used = (out.spellcasting.pact_used ?? 0) + 1;
    return { sheet: out, used: 'pact' };
  }
  return null;
}

/**
 * The slot levels a spell of `level` can be cast with: [{ level, left, pact }]
 * from `level` up to 9th, counting both ordinary and Pact Magic slots
 * (`pact`: how many of `left` are pact slots). `first` is the lowest level
 * with a slot left, or `level` when none is.
 */
export function castLevels(sheet, calc, level) {
  const left = slotsLeft(sheet, calc);
  const levels = [];
  for (let n = Math.max(1, level); n <= 9; n++) {
    const pact = left.pact.level === n ? left.pact.left : 0;
    levels.push({ level: n, left: left[n] + pact, pact });
  }
  return { levels, first: levels.find((l) => l.left > 0)?.level ?? Math.max(1, level) };
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/**
 * Cast a spell of 1st level or higher with a slot of `slot` (its own level if
 * not given; never lower): the slot is spent. Shared by the sheet's Cast and
 * the map's attacks. Returns { sheet, used, level }; throws an Error saying
 * why when the slot is too low or there's none left.
 */
export function castWithSlot(sheet, calc, spell, slot = null) {
  const own = Number(spell.level) || 0;
  if (own < 1) throw new Error(`${spell.name || 'A cantrip'} is a cantrip: it needs no spell slot.`);
  const level = Number(slot ?? own);
  if (!(level >= own && level <= 9)) throw new Error(`${spell.name} is a ${ORD[own]}-level spell: cast it with a slot of ${ORD[own]} level or higher.`);
  const spent = spendSlot(sheet, calc, level);
  if (!spent) throw new Error(`No ${ORD[level]}-level spell slots left. A long rest gives them back${(Number(calc.values.pact_level) || 0) ? ' (Pact Magic slots: a short rest)' : ''}.`);
  return { ...spent, level };
}

/** Give back a slot spent by spendSlot (Undo). */
export function refundSlot(sheet, level, used) {
  const out = structuredClone(sheet);
  if (used === 'pact') out.spellcasting.pact_used = Math.max(0, (out.spellcasting.pact_used ?? 0) - 1);
  else if (out.spellcasting?.slots_used?.[level]) out.spellcasting.slots_used[level] -= 1;
  return out;
}
