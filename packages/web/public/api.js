/**
 * Talking to the DNDApp server. Every request goes to the server that served
 * this page (relative paths), so the page works at whatever address that is.
 */

// ---------- login token (kept in this browser only) ----------

let memoryToken = null;
export const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ }
  },
};
const TOKEN_KEY = 'dndapp.token';
export const getToken = () => memoryToken ?? storage.get(TOKEN_KEY);
export const setToken = (t) => { memoryToken = t; storage.set(TOKEN_KEY, t); };

// ---------- requests ----------

/** Thrown when the server says we're not logged in (expired, logged out elsewhere, blocked). */
export class LoggedOut extends Error {}

// ---------- staying on the server's version of the page ----------

// The server sends a fingerprint of the page's files with every response. If it
// changes, the server was updated while this page was open: reload, so old page
// code never runs against a new server. While someone is typing, wait until they
// leave the field (or the tab is hidden), so nothing they're writing is lost.
let pageVersion = null;
let reloading = false;
export const reloadPage = { now: () => location.reload() };
const typing = () => {
  const el = document.activeElement;
  return !!el && (el.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'button'));
};
function checkVersion(res) {
  const v = res.headers?.get?.('x-page-version');
  if (!v) return;
  pageVersion ??= v;
  if (v === pageVersion || reloading) return;
  reloading = true;
  const go = () => {
    if (typing() && document.visibilityState !== 'hidden') return;
    document.removeEventListener('focusout', later, true);
    document.removeEventListener('visibilitychange', later);
    reloadPage.now();
  };
  const later = () => setTimeout(go, 0);
  document.addEventListener('focusout', later, true);
  document.addEventListener('visibilitychange', later);
  go();
}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(getToken() && { authorization: `Bearer ${getToken()}` }),
      ...(body && { 'content-type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  checkVersion(res);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') throw new LoggedOut(data.error);
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

/** POST and read a Server-Sent Events stream, calling onEvent(event, data) for each event. */
export async function stream(path, body, onEvent) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${getToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await readEvents(res, onEvent);
}

/** Listen to a GET Server-Sent Events stream until it ends or `signal` aborts it. */
export async function listen(path, onEvent, { signal } = {}) {
  const res = await fetch(path, { headers: { authorization: `Bearer ${getToken()}` }, signal });
  await readEvents(res, onEvent);
}

async function readEvents(res, onEvent) {
  checkVersion(res);
  if (res.status === 401) throw new LoggedOut();
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}

/** Fetch a file that needs the login (an <img> can't send it) and return a URL for it. */
export async function fileUrl(path) {
  const res = await fetch(path, { headers: { authorization: `Bearer ${getToken()}` } });
  checkVersion(res);
  if (res.status === 401) throw new LoggedOut();
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

/** A chosen file's contents as base64 (for JSON uploads). */
export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Build an element: h('button', { class: 'ghost', onclick }, 'Text', child, ...) */
/** What h() and setChildren() put in: null, undefined and false are left out (the DOM would print them as "null"...). */
const shown = (children) => children.flat(Infinity).filter((c) => c != null && c !== false);

/** el.replaceChildren(...children), leaving out null, undefined and false like h() does. */
export function setChildren(el, ...children) {
  el.replaceChildren(...shown(children));
  return el;
}

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
