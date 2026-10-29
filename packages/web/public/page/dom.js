/**
 * Building the page's pieces: finding and making elements (HTML and SVG),
 * short messages in a status line, and reading a chosen file. Every tab uses
 * these; talking to the server is api.js.
 */

/** The first element matching a CSS selector. */
export const $ = (sel) => document.querySelector(sel);

/** "goblin" -> "Goblin". */
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A chosen file's contents as base64 (for JSON uploads). */
export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** What h() and setChildren() put in: null, undefined and false are left out (the DOM would print them as "null"...). */
const shown = (children) => children.flat(Infinity).filter((c) => c != null && c !== false);

/** el.replaceChildren(...children), leaving out null, undefined and false like h() does. */
export function setChildren(el, ...children) {
  el.replaceChildren(...shown(children));
  return el;
}

/** Build an element: h('button', { class: 'ghost', onclick }, 'Text', child, ...) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...shown(children));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Build an SVG element: svg('circle', { r: 4 }, child, 'text', ...). Attributes that are null are left out, and so are empty children. */
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

// ---------- short messages in a status line ----------

/** How long a message stays: done, still working ("Searching…"), and errors. */
export const NOTE_MS = { done: 8000, working: 120000, error: 20000 };

/**
 * Show a short message in a status line (Items, Creatures, Merchants, the
 * Inventory's add box). On a phone these float over the page, so every message
 * has a ✕ and goes by itself after a while; an empty text clears it.
 */
export function note(el, text, error = false) {
  if (!el) return;
  clearTimeout(el.noteTimer);
  el.classList.toggle('error', !!text && error);
  if (!text) return el.replaceChildren();
  el.replaceChildren(text, h('button', { type: 'button', class: 'note-close', title: 'Dismiss', 'aria-label': 'Dismiss', onclick: () => note(el, '') }, '✕'));
  el.noteTimer = setTimeout(() => note(el, ''), error ? NOTE_MS.error : text.endsWith('…') ? NOTE_MS.working : NOTE_MS.done);
}
