/** Shared bits for the web page's tests. */
import { setup, PASSWORD } from '../../server/test/helpers.js';
import { openPage } from './page.js';

export { setup, PASSWORD, openPage };
import { terrain } from '../../server/test/helpers.js';

export { createFakeLLM, SAMPLE, SAMPLE_2, makePdf, terrain } from '../../server/test/helpers.js';

/** Another account, logged in. role: 'player' | 'dm' in t.campaign (or none); returns { id, name, token }. */
export async function addAccount(t, name, { role = null, character = null, campaign = t.campaign, ...opts } = {}) {
  const user = await t.auth.createUser(name, { password: PASSWORD, ...opts });
  if (role) t.auth.addMember(campaign.id, user.id, role, character);
  const { token } = await t.auth.login(name, PASSWORD);
  return { ...user, token };
}

/** A DM who isn't the admin (the setup's DM, Kenny, is the admin, who gets the admin screen). */
export const addDm = (t, name = 'Dana') => addAccount(t, name, { role: 'dm' });

/** Upload a transcript as the DM and wait for it to be processed. */
export async function upload(t, { number = 1, played_on = '2026-10-01', transcript }) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number, played_on, transcript } });
  if (res.statusCode >= 300) throw new Error(`upload failed: ${res.body}`);
  await t.jobs.idle();
  return res.json();
}

/**
 * Run a test with a server and a page; both are cleaned up afterwards.
 * opts: { setup: {...} for the server, page: {...} for openPage or a function (t) => opts, before: async (t) => {} }
 */
export async function withPage(opts, fn) {
  const t = await setup(opts.setup);
  let page = null;
  try {
    const extra = (await opts.before?.(t)) ?? {};
    const pageOpts = typeof opts.page === 'function' ? await opts.page(t, extra) : opts.page;
    page = await openPage(t, pageOpts);
    await fn(page, t, extra);
    // Anything the page threw in an event handler fails the test, even when the screen looked right.
    if (page.errors.length) throw page.errors[0];
    // Nor may a missing value show up as a word on the page ("nullnull", "undefined gp", "NaN").
    const words = shownMissing(page.document);
    if (words) throw new Error(`The page shows "${words}"`);
  } finally {
    await page?.close();
    await t.cleanup();
  }
}

/**
 * Text on the page (and in its inputs, titles and labels) where a missing value was printed:
 * "null", "undefined" or "NaN" as words. Returns the first bit around one, or null.
 */
export function shownMissing(document) {
  const bad = /(^|[^\w-])(null|undefined|NaN)(?![\w-])/;
  // Error messages are left out: they can quote the server or the AI word for word.
  const body = document.body.cloneNode(true);
  for (const el of body.querySelectorAll('.error, [role=alert]')) el.remove();
  const texts = [body.textContent];
  for (const el of document.querySelectorAll('input, textarea, select')) texts.push(el.value ?? '', el.placeholder ?? '');
  for (const el of document.querySelectorAll('[title], [aria-label], [placeholder]')) texts.push(el.getAttribute('title') ?? '', el.getAttribute('aria-label') ?? '', el.getAttribute('placeholder') ?? '');
  for (const text of texts) {
    const m = bad.exec(text);
    if (!m) continue;
    // Say where: the innermost element holding it.
    const holder = [...body.querySelectorAll('*')].filter((el) => bad.test(el.textContent)).at(-1);
    const where = holder ? ` in <${holder.tagName.toLowerCase()}${holder.id ? ` id="${holder.id}"` : ''}${holder.className && typeof holder.className === 'string' ? ` class="${holder.className}"` : ''}>` : '';
    return `${text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ').trim()}${where}`;
  }
  return null;
}

/** What the fake AI says about any map it reads. */
export const mapReading = (over = {}) => ({
  readable: true,
  kind: 'battle',
  name: 'Forest clearing',
  description: 'A clearing with a hidden trapdoor under the well.',
  grid: { visible: true, columns: 20, rows: 14 },
  scale: { distance: null, unit: null, per: null },
  notes: 'The north edge is cut off.',
  ...over,
});

/**
 * Import a 700 x 490 map with a 35 px grid (as the admin, who acts as DM) and wait for the AI to read it.
 * patch: changes to make afterwards, e.g. { shown: true, grid: { size: 35, x: 0, y: 0 } }.
 */
export async function importMap(t, { patch = null, filename = 'forest_clearing.png' } = {}) {
  const png = await terrain(700, 490, { size: 35 });
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { read: true, filename, data: png.toString('base64') } });
  if (res.statusCode !== 201) throw new Error(`import failed: ${res.body}`);
  const id = res.json().id;
  for (let i = 0; t.maps.get(t.campaign.id, id).reading.status === 'pending'; i++) {
    if (i > 500) throw new Error('the map was never read');
    await new Promise((r) => setTimeout(r, 10));
  }
  if (patch) await t.request('PATCH', `/campaigns/${t.campaign.id}/maps/${id}`, { body: patch });
  return t.maps.get(t.campaign.id, id);
}

/** Add a token as the DM; returns the token. */
export async function addToken(t, map, body) {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps/${map.id}/tokens`, { body });
  if (res.statusCode !== 201) throw new Error(`token failed: ${res.body}`);
  return res.json().token;
}

/** The DM's Items or Merchants: views of the wiki's space now, not tabs (wiki-panels.js). */
export async function openWikiView(page, name) {
  if (page.document.documentElement.dataset.space !== 'wiki') page.click('[data-tab=wiki]');
  const label = { items: 'Items', merchants: 'Merchants' }[name];
  page.click(page.$$('#wiki-rail button').find((b) => b.querySelector('.wiki-rail-label')?.textContent === label));
  await page.waitFor(() => page.visible(`#tab-${name}`) && !!page.$(`#wiki-main > #tab-${name}`));
}
