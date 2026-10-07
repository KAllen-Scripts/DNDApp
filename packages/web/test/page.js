/**
 * Opens the real web page (public/index.html and its modules) in jsdom,
 * talking over real HTTP to a real server built by the server's test helpers
 * (fake AI, temp data). So a test can log in, click, type and check what's on
 * screen without a browser.
 *
 *   const t = await setup();               // server/test/helpers.js
 *   const page = await openPage(t, { as: t.sam });
 *   page.click('[data-tab=notes]');
 *   ...
 *   await page.close(); await t.cleanup();
 *
 * Things jsdom lacks are filled in with simple stand-ins: <dialog>,
 * requestSubmit, matchMedia, pointer capture, canvas, scrollIntoView. Layout
 * isn't computed (sizes are 0) unless a test sets them with page.setRect().
 * alert/confirm/prompt record their messages; confirm and prompt answer from
 * page.answers (confirm defaults to true, prompt to null).
 */
import fs from 'node:fs';
import { register } from 'node:module';
import { resolveObjectURL } from 'node:buffer';
import { JSDOM, VirtualConsole } from 'jsdom';

register('./hooks.js', import.meta.url);

const PUBLIC = new URL('../public/', import.meta.url);
const HTML = fs.readFileSync(new URL('index.html', PUBLIC), 'utf8');
const LOOK_BOOT = fs.readFileSync(new URL('look-boot.js', PUBLIC), 'utf8');

// Node has its own versions of these, which must stay: the page's fetch is Node's (talking to the test server),
// and with it Node's AbortController, streams, Blob and URL (URL.createObjectURL for fetched images).
const KEEP_NODE = new Set([
  'fetch', 'Request', 'Response', 'Headers', 'AbortController', 'AbortSignal', 'Blob', 'URL', 'URLSearchParams',
  'TextEncoder', 'TextDecoder', 'ReadableStream', 'WritableStream', 'TransformStream', 'TextDecoderStream',
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone',
  'crypto', 'performance', 'atob', 'btoa', 'WebAssembly', 'globalThis',
]);
// ...but these must be the page's, because DOM methods only accept jsdom's.
const FORCE_PAGE = ['window', 'self', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'Event', 'EventTarget', 'CustomEvent', 'MessageEvent', 'DOMException'];

const nodeFetch = globalThis.fetch;
let pages = 0;
let current = null;

/**
 * Open the page. `as` logs in as that account first (anything with a .token,
 * e.g. t.sam, or { token }); `campaign` puts this tab in that campaign;
 * `storage` pre-fills localStorage (e.g. saved settings); `media` says which
 * media queries match ({ 'prefers-reduced-motion: reduce': true }).
 */
export async function openPage(t, { as = null, campaign = null, storage = {}, answers = {}, media = {}, settle = true } = {}) {
  if (current) throw new Error('openPage: close the previous page first');
  globalThis.__diceBox ??= { thrown: [], fail: false }; // what the fake 3D dice were asked to roll
  if (!t.app.server.listening) await t.app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${t.app.server.address().port}`;

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => errors.push(err));
  const dom = new JSDOM(HTML, { url: `${base}/`, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole });
  const { window } = dom;

  const dialogs = [];
  const page = {
    window,
    document: window.document,
    base,
    /** Exceptions thrown by the page's event handlers. */
    errors,
    /** Messages shown with alert(), confirm() and prompt(). */
    dialogs,
    /** confirm() answers (default true) and prompt() answers (default null); arrays answer in turn. */
    answers: { confirm: true, prompt: null, ...answers },
    /** Media queries that match, e.g. { 'prefers-color-scheme: dark': true }. */
    media,
    /** Files the page offered to save: { name, text } (text is a promise). */
    downloads: [],
    printed: 0,
    /** Requests the page has made: { method, path, body }. */
    requests: [],
    inflight: 0,
    timers: new Set(),
    controllers: new Set(),
    $: (sel) => window.document.querySelector(sel),
    $$: (sel) => [...window.document.querySelectorAll(sel)],
  };

  polyfill(window, page);
  for (const [k, v] of Object.entries({ ...(as && { 'dndapp.token': as.token }), ...storage })) window.localStorage.setItem(k, v);
  if (campaign) window.sessionStorage.setItem('dndapp.tabCampaign', String(campaign.id ?? campaign));
  window.eval(LOOK_BOOT);

  const restore = installGlobals(window, page, base);
  current = page;

  Object.assign(page, {
    /** Text of an element (whitespace collapsed), or '' when it isn't there. */
    text: (sel = 'body') => (typeof sel === 'string' ? page.$(sel) : sel)?.textContent.replace(/\s+/g, ' ').trim() ?? '',
    /** Is the element there and not hidden by itself or a parent? */
    visible(sel) {
      let el = typeof sel === 'string' ? page.$(sel) : sel;
      if (!el) return false;
      for (; el; el = el.parentElement) if (el.hidden || (el.tagName === 'DIALOG' && !el.open)) return false;
      return true;
    },
    el(sel) {
      const el = typeof sel === 'string' ? page.$(sel) : sel;
      if (!el) throw new Error(`page: nothing matches ${sel}`);
      return el;
    },
    click(sel, init = {}) {
      const el = page.el(sel);
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window, ...init }));
      return el;
    },
    /** Set a field's value as if typed, firing input and change. */
    type(sel, value) {
      const el = page.el(sel);
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!value;
      else el.value = value;
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
      return el;
    },
    key(sel, key, init = {}) {
      const el = page.el(sel);
      el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
      return el;
    },
    /** Submit a form the way pressing its submit button does. */
    submit(sel, submitter) {
      const form = page.el(sel);
      form.requestSubmit(submitter ? page.el(submitter) : undefined);
      return form;
    },
    /** Pointer events, for dragging on the map. */
    pointer(sel, type, init = {}) {
      const el = page.el(sel);
      el.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, isPrimary: true, ...init }));
      return el;
    },
    /** Give an element a size and position (jsdom does no layout). */
    setRect(sel, { left = 0, top = 0, width, height }) {
      const el = page.el(sel);
      el.getBoundingClientRect = () => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height });
      Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
      Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
    },
    /** Put files on a file input and fire change. files: [{ name, type, content (string|Buffer) }] */
    setFiles(sel, files) {
      const el = page.el(sel);
      const list = files.map((f) => new window.File([f.content], f.name, { type: f.type }));
      Object.defineProperty(el, 'files', { value: Object.assign(list, { item: (i) => list[i] }), configurable: true });
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
      return el;
    },
    /** Wait until no request is waiting for its response and the page has had time to draw. */
    async settle({ timeout = 5000 } = {}) {
      const end = Date.now() + timeout;
      let quiet = 0;
      while (quiet < 10) {
        await new Promise((r) => setTimeout(r, 2));
        quiet = page.inflight === 0 ? quiet + 1 : 0;
        if (Date.now() > end) throw new Error(`page.settle: still ${page.inflight} requests after ${timeout}ms`);
      }
      await t.jobs.idle();
    },
    /** Wait until check() returns something truthy (and return it). */
    async waitFor(check, { timeout = 5000, what = String(check) } = {}) {
      const end = Date.now() + timeout;
      for (;;) {
        const value = typeof check === 'string' ? page.$(check) : check();
        if (value) return value;
        if (Date.now() > end) throw new Error(`page.waitFor timed out: ${what}`);
        await new Promise((r) => setTimeout(r, 5));
      }
    },
    /** Close the page: stop its live streams and put Node's globals back. */
    async close() {
      page.closed = true;
      for (const c of page.controllers) c.abort();
      // Drop the page's connections (kept-alive and live streams), so the server can close. A socket that was
      // still connecting is only dropped once it's set up, hence the loop.
      const connections = () => new Promise((r) => t.app.server.getConnections((err, n) => r(err ? 0 : n)));
      for (let i = 0; i < 100; i++) {
        t.app.server.closeAllConnections();
        await new Promise((r) => setTimeout(r, 5));
        if (!(await connections())) break;
      }
      for (const handle of page.timers) clearTimeout(handle);
      restore();
      window.close();
      current = null;
    },
  });

  pages += 1;
  try {
    await import(`../public/app.js?page=${pages}`);
    if (settle) await page.settle();
  } catch (err) {
    await page.close();
    throw err;
  }
  return page;
}

/** Stand-ins for what jsdom doesn't do. */
function polyfill(window, page) {
  const { HTMLDialogElement, HTMLElement, HTMLFormElement, HTMLCanvasElement, Element } = window;
  Object.assign(HTMLDialogElement.prototype, {
    showModal() { this.setAttribute('open', ''); },
    show() { this.setAttribute('open', ''); },
    close(value) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      if (value !== undefined) this.returnValue = value;
      this.dispatchEvent(new window.Event('close'));
    },
  });
  if (!('open' in HTMLDialogElement.prototype)) {
    Object.defineProperty(HTMLDialogElement.prototype, 'open', {
      get() { return this.hasAttribute('open'); },
      set(v) { this.toggleAttribute('open', !!v); },
    });
  }
  // In browsers a form's controls hide its own properties of the same name (form.name is the "name" field).
  const formName = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'name');
  Object.defineProperty(HTMLFormElement.prototype, 'name', {
    configurable: true,
    get() { return this.elements.namedItem('name') ?? formName.get.call(this); },
    set(v) { formName.set.call(this, v); },
  });
  // ...and are properties of the form (form.question), which jsdom doesn't do: look them up when nothing else matches.
  const formParent = Object.getPrototypeOf(HTMLFormElement.prototype);
  Object.setPrototypeOf(HTMLFormElement.prototype, new Proxy(formParent, {
    get(target, key, receiver) {
      if (typeof key === 'string' && !(key in target) && receiver instanceof HTMLFormElement) {
        const el = receiver.elements.namedItem(key);
        if (el) return el;
      }
      return Reflect.get(target, key, receiver);
    },
  }));
  if (!('returnValue' in HTMLDialogElement.prototype)) HTMLDialogElement.prototype.returnValue = '';
  HTMLFormElement.prototype.requestSubmit = function (submitter) {
    if (!this.checkValidity()) return;
    this.dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: submitter ?? null }));
  };
  // A form with method="dialog" closes its dialog when submitted (unless the page stops it).
  window.addEventListener('submit', (e) => {
    if (e.defaultPrevented || e.target.getAttribute('method') !== 'dialog') return;
    e.preventDefault();
    e.target.closest('dialog')?.close(e.submitter?.value ?? '');
  });
  // Clicking a submit button submits its form (jsdom would try to navigate).
  window.addEventListener('click', (e) => {
    const button = e.target.closest?.('button, input[type=submit]');
    if (!button || e.defaultPrevented || button.disabled || !button.form) return;
    if ((button.getAttribute('type') ?? 'submit') !== 'submit') return;
    e.preventDefault();
    button.form.requestSubmit(button);
  });
  Object.assign(Element.prototype, {
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture() { return false; },
    scrollIntoView() {},
    scrollTo() {},
  });
  HTMLElement.prototype.focus ??= function () {};
  HTMLCanvasElement.prototype.getContext = function () {
    // A 2D context that draws nothing: any method returns something you can call anything on.
    const stub = new Proxy(function () {}, {
      get: (target, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'width' ? 0 : stub),
      apply: () => stub,
      set: () => true,
    });
    return new Proxy({ canvas: this }, {
      get: (target, k) => (k in target ? target[k] : stub),
      set: (target, k, v) => ((target[k] = v), true),
    });
  };
  window.matchMedia = (query) => ({
    matches: !!page.media[query.replace(/^\(|\)$/g, '')], media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  const answer = (kind) => {
    const a = page.answers[kind];
    return Array.isArray(a) ? a.shift() : a;
  };
  window.alert = (message) => { page.dialogs.push({ kind: 'alert', message: String(message) }); };
  window.confirm = (message) => { page.dialogs.push({ kind: 'confirm', message: String(message) }); return answer('confirm') ?? true; };
  window.prompt = (message, value) => { page.dialogs.push({ kind: 'prompt', message: String(message), value }); return answer('prompt') ?? null; };
  window.print = () => { page.printed += 1; };
  // A download link: keep what it would save instead of navigating.
  window.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[download]');
    if (!a) return;
    e.preventDefault();
    page.downloads.push({ name: a.getAttribute('download'), text: resolveObjectURL(a.href)?.text() });
  });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
}

/** Make the page's window the global scope for its modules; returns a function that undoes it. */
function installGlobals(window, page, base) {
  const saved = new Map();
  const set = (key, value) => {
    if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true, enumerable: false });
  };
  for (const key of Object.getOwnPropertyNames(window)) {
    if (KEEP_NODE.has(key) || key in globalThis || /^_|^[0-9]/.test(key)) continue;
    let value;
    try { value = window[key]; } catch { continue; }
    set(key, value);
  }
  for (const key of FORCE_PAGE) set(key, window[key]);

  // Timers the page's own code starts are stopped when it closes (an answer's fade, the dice's hide timer...).
  const fromPage = () => new Error().stack.includes(PUBLIC.href);
  for (const name of ['setTimeout', 'setInterval']) {
    const node = globalThis[name];
    set(name, (fn, ms, ...args) => {
      const handle = node(fn, ms, ...args);
      if (fromPage()) page.timers.add(handle);
      return handle;
    });
  }

  // Relative URLs go to the test server; every request is counted and can be aborted on close.
  set('fetch', async (path, init = {}) => {
    // After close, the page's leftover loops (the map's reconnecting live stream) just wait forever.
    if (page.closed) return new Promise(() => {});
    const url = new URL(path, base);
    const controller = new AbortController();
    page.controllers.add(controller);
    if (init.signal) init.signal.addEventListener('abort', () => controller.abort(init.signal.reason), { once: true });
    page.requests.push({ method: init.method ?? 'GET', path: url.pathname + url.search, body: init.body ? safeJson(init.body) : undefined });
    // Live streams (…/events) stay open for as long as the page is, so they don't count as waiting.
    const live = url.pathname.endsWith('/events');
    if (!live) page.inflight += 1;
    try {
      const res = await nodeFetch(url, { ...init, signal: controller.signal });
      // A stream (SSE) stays open; everything else is read now, so "settled" means drawn.
      if ((res.headers.get('content-type') ?? '').startsWith('text/event-stream')) return res;
      const body = await res.arrayBuffer();
      page.controllers.delete(controller);
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    } finally {
      if (!live) page.inflight -= 1;
    }
  });
  const pageFetch = globalThis.fetch;
  return () => {
    for (const [key, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
    // Code still running from the closed page finds a fetch that never answers (Node's can't take its relative URLs).
    globalThis.fetch = pageFetch;
  };
}

function safeJson(body) {
  try { return JSON.parse(body); } catch { return body; }
}
