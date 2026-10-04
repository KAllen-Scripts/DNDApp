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

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(getToken() && { authorization: `Bearer ${getToken()}` }),
      ...(body && { 'content-type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') throw new LoggedOut(data.error);
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** POST and read a Server-Sent Events stream, calling onEvent(event, data) for each event. */
export async function stream(path, body, onEvent) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${getToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

/** Build an element: h('button', { class: 'ghost', onclick }, 'Text', child, ...) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}
