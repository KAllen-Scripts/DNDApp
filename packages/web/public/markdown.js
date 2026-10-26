/**
 * Markdown (with some HTML) from the AI or the archivist -> safe HTML, the
 * same way everywhere: answers, stat blocks, records. The text can quote
 * transcripts or the web, so it's never trusted: nothing that runs, loads,
 * links out or restyles the page gets through.
 */
import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';

const SAFE_HTML = {
  ALLOWED_TAGS: [
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'small', 'sub', 'sup', 'code', 'pre', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
    'div', 'span', 'section', 'details', 'summary',
  ],
  ALLOWED_ATTR: ['class', 'colspan', 'rowspan', 'scope', 'align', 'start', 'open'],
};

// Markdown that's still streaming can end mid-table or mid-tag; marked and the sanitiser cope with both.
marked.use({ gfm: true, breaks: true });

/** Markdown -> a sanitised DocumentFragment. */
export const markdownFragment = (text) => DOMPurify.sanitize(marked.parse(text.trim()), { ...SAFE_HTML, RETURN_DOM_FRAGMENT: true });

/** An element showing markdown, sanitised. */
export function markdownBox(text, attrs = {}) {
  const box = document.createElement('div');
  for (const [k, v] of Object.entries(attrs)) box.setAttribute(k, v);
  box.append(markdownFragment(text));
  return box;
}

/**
 * A text box for Markdown (an item's description, a spell's, Features &
 * traits) that shows the text formatted (tables, bold, lists) until you edit
 * it: click the text or "Edit text" to change it; clicking away (or "Show
 * formatted") shows it formatted again. Empty, it's just the text box.
 * `textarea` keeps working as before (its value, listeners, label).
 * Returns { el, toggle, show(editing) }: el holds the formatted view, the
 * text box and the toggle under them.
 */
export function markdownEditor(textarea, { showLabel = 'Show formatted', cls = '' } = {}) {
  const preview = document.createElement('div');
  preview.className = 'a stat-text md-preview';
  preview.tabIndex = 0;
  preview.title = 'Click to edit';
  const label = textarea.getAttribute('aria-label');
  if (label) preview.setAttribute('aria-label', `${label} (click to edit)`);
  preview.style.setProperty('--md-rows', Number(textarea.getAttribute('rows')) || 4);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'link small md-toggle';
  const bar = document.createElement('div');
  bar.className = 'md-bar';
  bar.append(toggle);
  const el = document.createElement('div');
  el.className = `md-editor ${cls}`.trim();
  el.append(preview, textarea, bar);

  let editing = false;
  const show = (edit) => {
    const empty = !textarea.value.trim();
    editing = edit || empty;
    textarea.hidden = !editing;
    preview.hidden = editing;
    bar.hidden = empty;
    toggle.textContent = editing ? showLabel : 'Edit text';
    if (!editing) preview.replaceChildren(markdownFragment(textarea.value));
  };
  const edit = () => {
    show(true);
    textarea.focus();
  };
  toggle.addEventListener('click', (e) => {
    e.preventDefault(); // inside a <label>: don't pass the click on
    if (editing) show(false);
    else edit();
  });
  preview.addEventListener('click', (e) => {
    e.preventDefault();
    if (!String(window.getSelection?.() ?? '')) edit(); // selecting text to copy isn't a click to edit
  });
  preview.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); edit(); }
  });
  textarea.addEventListener('input', () => { bar.hidden = !textarea.value.trim(); });
  // Clicking away shows it formatted again (not when the click is on its own toggle).
  textarea.addEventListener('blur', (e) => { if (editing && e.relatedTarget !== toggle) show(false); });
  show(false);
  return { el, toggle, show };
}
