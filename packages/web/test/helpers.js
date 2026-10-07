/** Shared bits for the web page's tests. */
import { setup, PASSWORD } from '../../server/test/helpers.js';
import { openPage } from './page.js';

export { setup, PASSWORD, openPage };
export { createFakeLLM, SAMPLE, SAMPLE_2, makePdf } from '../../server/test/helpers.js';

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
  } finally {
    await page?.close();
    await t.cleanup();
  }
}
