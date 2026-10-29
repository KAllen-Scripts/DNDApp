/**
 * An item's card: what it is and does at a glance (kind, rarity, attunement,
 * weight, a weapon's damage and properties, armour's AC, charges, healing,
 * what it does to the sheet) and its description, rendered from Markdown.
 * The Inventory shows it before an item is added (Add / Cancel), so a
 * player can check an item's stats first.
 */
import { ABILITY_NAMES, formatBonus } from '/shared/sheet.js';
import { EFFECT_TARGETS } from '/shared/gear.js';
import { markdownBox } from '../page/markdown.js';
import { actionSummary } from '/shared/item-actions.js';
import { cap, h } from '../page/dom.js';

export const GEAR_KINDS = { weapon: 'Weapon', armor: 'Armour', gear: 'Gear', tool: 'Tool', potion: 'Potion', scroll: 'Scroll', magic: 'Magic item', other: 'Other' };
const lb = (n) => `${Math.round(n * 100) / 100} lb`;

/** "+1 AC", "Strength becomes 19". */
export function effectText(e) {
  if (e.target.startsWith('score.')) return `${ABILITY_NAMES[e.target.slice(6)]} ${e.value}`;
  if (e.target.startsWith('bonus.')) return `${ABILITY_NAMES[e.target.slice(6)]} ${formatBonus(e.value)}`;
  if (e.target === 'speed') return `speed ${formatBonus(e.value)} ft`;
  return `${formatBonus(e.value)} ${EFFECT_TARGETS[e.target].replace(/^All s/, 's').replace(/^AC \(no armour or shield\)/, 'AC without armour or shield')}`;
}

/** The item's numbers as [label, value] pairs (only the ones it has). */
export function gearFacts(g) {
  const out = [];
  if (g.weapon) {
    out.push(['Damage', `${g.weapon.damage || 'none'}${g.magic ? ` (${formatBonus(g.magic)} to hit and damage)` : ''}`]);
    out.push(['Weapon', `${cap(g.weapon.category)}${g.weapon.properties.length ? `: ${g.weapon.properties.join(', ')}` : ''}`]);
  }
  if (g.armor) {
    const a = g.armor;
    out.push(['Armour class', a.type === 'shield'
      ? `+${a.base + g.magic}`
      : `${a.base + g.magic}${a.type === 'light' ? ' + Dex' : a.type === 'medium' ? ' + Dex (max 2)' : ''}`]);
    out.push(['Type', a.type === 'shield' ? 'Shield' : `${cap(a.type)} armour`]);
    if (a.strength) out.push(['Needs', `Strength ${a.strength}`]);
    if (a.stealth) out.push(['Stealth', 'disadvantage']);
  }
  if (g.charges) out.push(['Charges', `${g.charges.max}${g.charges.recharge ? `, regains ${g.charges.recharge}${g.charges.when ? ` at ${g.charges.when}` : ''}` : ''}`]);
  if (g.heal) out.push(['Heals', g.heal]);
  for (const a of g.actions ?? []) out.push([a.kind === 'summon' ? 'Summons' : a.kind === 'spell' ? 'Casts' : 'Use', `${a.name}: ${actionSummary(a)}${a.source === 'ai' ? ' (the AI read this: check it)' : ''}`]);
  if (g.effects?.length) out.push(['On your sheet', g.effects.map(effectText).join(', ')]);
  if (g.weight != null) out.push(['Weight', lb(g.weight)]);
  return out;
}

/**
 * The card. item: an inventory line as the lookup gives it. actions: buttons
 * at the bottom (Add, Cancel). note: a line under the title (where it came from).
 */
export function gearCard(item, { actions = [], note = '' } = {}) {
  const tags = [
    GEAR_KINDS[item.kind] ?? 'Other',
    item.rarity ? cap(item.rarity) : '',
    item.attunement ? 'Needs attunement' : '',
  ].filter(Boolean);
  const facts = gearFacts(item);
  return h('article', { class: 'gear-card', 'aria-label': `About ${item.name}` },
    h('header', { class: 'gear-card-head' },
      h('h3', {}, item.name),
      h('div', { class: 'gear-card-tags' }, tags.map((t) => h('span', { class: 'tag' }, t))),
    ),
    note ? h('p', { class: 'muted small' }, note) : null,
    facts.length ? h('dl', { class: 'gear-card-facts' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
    item.text?.trim() ? markdownBox(item.text, { class: 'gear-card-text md' }) : h('p', { class: 'muted small' }, 'No description.'),
    item.source ? h('p', { class: 'muted small' }, `Source: ${item.source}`) : null,
    actions.length ? h('div', { class: 'gear-card-actions' }, h('span', { class: 'spacer' }), ...actions) : null,
  );
}
