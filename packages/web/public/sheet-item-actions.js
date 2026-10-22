/**
 * The Item actions box on the character sheet: what the character's items
 * let them do (shared/item-actions.js), with a Use button each. Bag of
 * Tricks pulls out a creature (the server rolls its table, adds it to
 * Companions and puts it on the map), Wand of Fireballs casts with its DC
 * (spend more charges for more damage), and so on. It shows what stops one
 * (attune first, no charges left); actions the AI read when the item was
 * looked up are marked so the player checks them. sheet.js passes in `use`,
 * which saves the sheet first and rolls through the server.
 */
import { h } from './api.js';
import { actionProblem, actionSummary } from './shared/item-actions.js';

/**
 * @param {object} ctx
 * @param {object} ctx.state  the sheet's state (sheet, renders)
 * @param {(line, action, extra: number) => Promise<void>} ctx.use  use it (the server spends, rolls and does it)
 */
export function itemActionsBox({ state, use }) {
  const el = h('section', { class: 'sh-box item-actions' });
  let drawn = null;

  const lines = () => (state.sheet.inventory ?? []).filter((g) => g.actions?.length);

  const paint = () => {
    const key = JSON.stringify(lines().map((g) => [g.id, g.name, g.actions, g.charges, g.equipped, g.attuned, g.attunement, g.qty]));
    if (key === drawn) return;
    drawn = key;
    const list = lines();
    el.hidden = !list.length;
    el.replaceChildren(h('h3', {}, 'Item actions'), ...list.map(item));
  };

  function item(g) {
    const left = g.charges ? g.charges.max - g.charges.used : null;
    return h('div', { class: 'item-action-group' },
      h('div', { class: 'item-action-head' },
        h('strong', {}, g.name),
        left != null ? h('span', { class: 'small muted' }, `${left} of ${g.charges.max} charge${g.charges.max === 1 ? '' : 's'} left${g.charges.when ? ` · back ${/^after/.test(g.charges.when) ? g.charges.when : `at ${g.charges.when}`}` : ''}`) : null,
        g.qty > 1 ? h('span', { class: 'small muted' }, `× ${g.qty}`) : null,
      ),
      g.actions.map((a) => action(g, a)),
    );
  }

  function action(g, a) {
    const problem = actionProblem(g, a);
    const extra = a.max_extra && a.extra ? h('select', { 'aria-label': `Extra ${a.consumes || /bead/i.test(a.text) ? 'beads' : 'charges'} for ${a.name}: ${g.name}` },
      Array.from({ length: a.max_extra + 1 }, (_, i) => new Option(i ? `+${i} (+${i}${a.extra.replace(/^1/, '')})` : 'No extra', String(i)))) : null;
    const button = h('button', {
      type: 'button', class: 'small primary', disabled: !!problem, title: problem || a.text,
      'aria-label': `Use ${g.name}: ${a.name}`,
      onclick: async () => {
        button.disabled = true;
        try {
          await use(g, a, Number(extra?.value ?? 0));
        } finally {
          if (button.isConnected) button.disabled = !!actionProblem(g, a);
        }
      },
    }, 'Use');
    return h('div', { class: 'item-action' },
      h('div', { class: 'item-action-text' },
        h('span', { class: 'item-action-name' }, a.name),
        a.source === 'ai' ? h('span', { class: 'tag ai-tag', title: 'The AI read this from the item when it was looked up: check it against the book' }, 'AI: check it') : null,
        h('span', { class: 'small muted' }, actionSummary(a)),
        problem ? h('span', { class: 'small item-action-problem' }, problem) : null,
      ),
      h('div', { class: 'item-action-buttons' }, extra, button),
    );
  }

  paint();
  state.renders.push(paint);
  return el;
}
