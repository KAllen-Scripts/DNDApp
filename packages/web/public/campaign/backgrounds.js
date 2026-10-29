/**
 * The DM's own backgrounds, in Campaign settings (campaign/settings.js). They
 * are kept in the campaign's settings (`backgrounds`, shared/backgrounds.js),
 * so they're archived with them and reach every player's sheet live, where
 * the Background box suggests them beside the books' ones.
 */
import { h } from '../page/api.js';
import { ABILITIES, ABILITY_NAMES, SKILLS } from '/shared/sheet.js';
import { MAX_CUSTOM_BACKGROUNDS, backgroundSummary } from '/shared/backgrounds.js';

/**
 * The Backgrounds part of the settings dialog. `list()` gives the DM's
 * backgrounds now; `save(list, done)` saves the whole list (and resolves to
 * something other than false when it worked).
 */
export function backgroundsSection({ list, save }) {
  const box = h('div', { class: 'bg-custom' });
  let editing = null; // the background being edited (a copy), or null

  const form = (b) => {
    const text = (key, label, { rows = 0, max = 300 } = {}) => {
      const el = rows ? h('textarea', { rows, maxLength: max, 'aria-label': label }) : h('input', { type: 'text', maxLength: max, 'aria-label': label });
      el.value = key.includes('.') ? b.feature?.[key.split('.')[1]] ?? '' : b[key] ?? '';
      el.addEventListener('input', () => {
        if (key.includes('.')) b.feature = { ...(b.feature ?? { name: '', text: '' }), [key.split('.')[1]]: el.value };
        else b[key] = el.value;
      });
      return h('label', { class: 'fld' }, h('span', {}, label), el);
    };
    const checks = (key, options, label) => h('fieldset', { class: 'bg-checks' }, h('legend', {}, label),
      Object.entries(options).map(([k, name]) => {
        const box = h('input', { type: 'checkbox', 'data-bg': `${key}-${k}` });
        box.checked = (b[key] ?? []).includes(k);
        box.addEventListener('change', () => {
          b[key] = box.checked ? [...new Set([...(b[key] ?? []), k])] : (b[key] ?? []).filter((x) => x !== k);
        });
        return h('label', { class: 'check' }, box, ` ${name}`);
      }));
    const gold = h('input', { type: 'number', min: 0, step: 1, 'aria-label': 'Gold', value: b.gold ?? 0 });
    gold.addEventListener('input', () => { b.gold = Number(gold.value) || 0; });
    const message = h('p', { class: 'muted small', role: 'status' });
    return h('div', { class: 'bg-form' },
      text('name', 'Name', { max: 60 }),
      checks('skills', Object.fromEntries(Object.entries(SKILLS).map(([k, s]) => [k, s.name])), 'Skill proficiencies (usually two)'),
      text('tools', 'Tool proficiencies'),
      text('languages', 'Languages'),
      text('equipment', 'Equipment', { rows: 2, max: 1000 }),
      h('label', { class: 'fld' }, h('span', {}, 'Gold (gp)'), gold),
      h('p', { class: 'muted small' }, '2014-style: a feature. 2024-style: three abilities to raise and an origin feat. Fill in either, or both.'),
      text('feature.name', 'Feature name', { max: 100 }),
      text('feature.text', 'What the feature does', { rows: 3, max: 2000 }),
      checks('abilities', ABILITY_NAMES, 'Abilities it raises (pick three, or none)'),
      text('feat', 'Origin feat', { max: 100 }),
      message,
      h('div', { class: 'map-dialog-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: () => { editing = null; draw(); } }, 'Cancel'),
        h('button', {
          type: 'button',
          class: 'primary',
          onclick: () => {
            const name = String(b.name ?? '').trim();
            if (!name) return (message.textContent = 'Give it a name.');
            if ((b.abilities ?? []).length && b.abilities.length !== 3) return (message.textContent = 'Pick three abilities to raise, or none.');
            const others = list().filter((x) => x.id !== b.id);
            if (others.some((x) => x.name.toLowerCase() === name.toLowerCase())) return (message.textContent = `There's already a background called ${name}.`);
            const feature = b.feature?.name?.trim() ? { name: b.feature.name.trim(), text: b.feature.text ?? '' } : null;
            const next = list().some((x) => x.id === b.id) ? list().map((x) => (x.id === b.id ? { ...b, name, feature } : x)) : [...list(), { ...b, name, feature }];
            // The form stays open until the save worked, so nothing typed is lost.
            Promise.resolve(save(next, `Saved ${name}. Players' sheets suggest it now.`)).then((ok) => {
              if (ok === false) return;
              editing = null;
              draw();
            });
          },
        }, 'Save background')),
    );
  };

  const draw = () => {
    const mine = list();
    box.replaceChildren(
      h('h3', {}, 'Your own backgrounds'),
      h('p', { class: 'muted small' }, 'Backgrounds you make here are suggested on every player\'s sheet beside the books\' ones, and fill it in the same way when picked.'),
      mine.length
        ? h('ul', { class: 'bg-list' }, mine.map((b) => h('li', {},
          h('strong', {}, b.name),
          h('span', { class: 'muted small' }, ` ${backgroundSummary({ ...b, custom: true }).map((l) => l.label).join(', ')}`),
          h('button', { type: 'button', class: 'ghost small', onclick: () => { editing = structuredClone(b); draw(); } }, 'Edit'),
          h('button', {
            type: 'button',
            class: 'ghost small',
            onclick: () => {
              if (!confirm(`Remove the ${b.name} background? Sheets that already have it keep what it filled in.`)) return;
              save(list().filter((x) => x.id !== b.id), `Removed ${b.name}.`);
            },
          }, 'Remove'))))
        : h('p', { class: 'muted small' }, 'None yet.'),
      editing
        ? form(editing)
        : mine.length < MAX_CUSTOM_BACKGROUNDS
          ? h('button', { type: 'button', class: 'add-row', onclick: () => { editing = { id: Math.random().toString(36).slice(2, 10).padEnd(8, '0'), name: '', skills: [], tools: '', languages: '', equipment: '', gold: 0, feature: null, abilities: [], feat: '' }; draw(); } }, '+ New background')
          : h('p', { class: 'muted small' }, `That's the most (${MAX_CUSTOM_BACKGROUNDS}).`),
    );
  };
  draw();
  return { el: box, draw };
}
