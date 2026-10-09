/**
 * A stat block in a dialog (DM only), with a way to look up a different
 * creature instead. Used for tokens on the map (map.js) and the DM's saved
 * creatures (creatures.js).
 */
import { h } from './api.js';
import { markdownBox } from './markdown.js';

const SOURCES = {
  ai: () => "From the AI's memory of the 5e rules. Only you see this.",
  web: () => 'Found on the web by the AI; check it. Only you see this.',
  book: (st) => `From your books: ${st.from || 'a book'}. Only you see this.`,
};

/**
 * @param {HTMLDialogElement} dialog
 * @param {{ title: string, stats: object, onLookup: (name: string) => void }} options
 */
export function showStatBlock(dialog, { title, stats: st, onLookup }) {
  const other = h('input', { placeholder: 'Another creature, e.g. Bugbear', maxLength: 100 });
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      if (other.value.trim()) onLookup(other.value.trim());
      dialog.close();
    } },
      h('h2', {}, `${title}: ${st.name || 'stat block'}`),
      h('p', { class: 'muted small' }, [st.ac != null ? `AC ${st.ac}` : '', st.hp_formula ? `HP ${st.hp_formula}` : '', st.speed, st.challenge ? `CR ${st.challenge}` : ''].filter(Boolean).join(' · ')),
      markdownBox(st.text, { class: 'a stat-text stat-block' }),
      h('p', { class: 'muted small' }, (st.from?.startsWith('your creatures') ? `From ${st.from}. Only you see this.` : SOURCES[st.source]?.(st)) ?? 'Only you see this.'),
      h('div', { class: 'map-dialog-actions' }, other, h('button', { class: 'ghost' }, 'Look up instead'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'primary', onclick: () => dialog.close() }, 'Close')),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}

/** The status line after the AI filled a stat block. */
export const statsFound = (name, st) =>
  st.source === 'book' || st.from?.startsWith('your creatures')
    ? `Stat block for ${name}: ${st.name || name}, from ${st.from || 'your books'}.`
    : `Stat block for ${name}: ${st.name || name} (from the AI's memory; it isn't in your books, so check it if it matters).`;
