/**
 * The DM's Sessions tab (sessions.js): pick which of their campaigns a
 * transcript is for, check who's who, upload it, and watch it get processed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, upload, createFakeLLM, SAMPLE } from './helpers.js';

const asDana = (opts = {}) => ({
  ...opts,
  before: async (t) => ({ ...(await opts.before?.(t)), dana: await addDm(t) }),
  page: (t, { dana }) => ({ as: dana, campaign: t.campaign }),
});

const button = (root, text) => {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent === text);
  if (!b) throw new Error(`no "${text}" button`);
  return b;
};
const box = (page) => page.$('#sessions');
const form = (page) => box(page).querySelector('form.upload-form');
const message = (page) => page.text('#sessions-status');

test('sessions: only the DM has the tab', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    assert.ok(page.$('[data-tab=sessions]').hidden);
  });
});

test('sessions: paste a transcript, check who\'s who, upload; it gets processed', async () => {
  await withPage(asDana({ before: async (t) => { await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: 'A note' } }); } }), async (page, t) => {
    assert.ok(!page.$('[data-tab=sessions]').hidden);
    page.click('[data-tab=sessions]');
    await page.settle();
    assert.match(page.text(box(page).querySelector('.sessions-list')), /No sessions uploaded yet/);
    // A note with no transcript yet is waiting, and its date is suggested.
    assert.match(page.text(box(page).querySelector('.notice')), /Player notes waiting for a transcript.*1 note from 1 player/);
    const f = form(page);
    assert.equal(f.querySelector('[aria-label="Session number"]').value, '1');
    assert.match(page.text(f.querySelector('.hint')), /1 note from 1 player on .* will go with this session/);
    assert.ok(f.querySelector('[type=submit]').disabled);

    // Submitting before there's a transcript says what's missing.
    page.submit(f);
    assert.match(message(page), /Choose a transcript file/);

    page.type(f.querySelector('[aria-label="Transcript text"]'), SAMPLE);
    await page.waitFor(() => f.querySelectorAll('.speaker-row').length === 3, { what: 'the speaker preview' });
    assert.match(page.text(f.querySelector('.speakers p')), /6 lines, 00:00:05 to 00:02:00/);
    const picks = Object.fromEntries([...f.querySelectorAll('.speaker-row')].map((r) => [r.querySelector('strong').textContent, r.querySelector('select').selectedOptions[0].textContent]));
    assert.deepEqual(picks, { KennyDM: 'Kenny (DM)', SamPlays: 'Sam (Thorin)', AlexR: 'Alex (Lyra)' });
    assert.ok(!f.querySelector('[type=submit]').disabled);

    // Unlink one: the upload asks first (cancelled, then confirmed).
    page.type(f.querySelector('[aria-label="Who is AlexR"]'), '');
    assert.ok(f.querySelector('[aria-label="Who is AlexR"]').closest('.speaker-row').classList.contains('unlinked'));
    page.type(f.querySelector('[aria-label="Title"]'), 'Arrival in Brindle');
    page.answers.confirm = [false, true];
    page.submit(f);
    assert.match(page.dialogs.at(-1).message, /aren't linked to an account: AlexR/);
    assert.equal(page.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/sessions')).length, 0);
    page.submit(f);
    await page.settle();
    assert.match(message(page), /Uploaded session #1 .* to Test Campaign\. Processing has started/);
    const sent = page.requests.find((r) => r.method === 'POST' && r.path.endsWith('/sessions')).body;
    assert.equal(sent.title, 'Arrival in Brindle');
    assert.deepEqual(sent.speakers.map((s) => s.user_id), [t.dm.id, t.sam.id, null]);

    // Once processed, the list says so (it refreshes itself while anything is processing).
    await t.jobs.idle();
    await page.waitFor(() => /processed/.test(page.text(box(page).querySelector('.sessions-list'))), { timeout: 8000, what: 'the session to show as processed' });
    const row = box(page).querySelector('.sessions-table tbody tr');
    assert.match(page.text(row), /#1.*Arrival in Brindle.*1 note from 1 player.*3 accounts.*processed/);
    assert.equal(box(page).querySelector('.notice'), null);
  });
});

test('sessions: the DM picks which of their campaigns the transcript is for', async () => {
  // Dana runs a second campaign, and plays in a third (which isn't offered).
  await withPage({
    before: async (t) => {
      const dana = await addDm(t);
      const other = t.store.createCampaign('Second Campaign');
      const played = t.store.createCampaign('Played Campaign');
      t.auth.addMember(other.id, dana.id, 'dm');
      t.auth.addMember(played.id, dana.id, 'player', 'Vex');
      t.auth.addMember(other.id, t.sam.id, 'player', 'Bram');
      return { dana, other };
    },
    page: (t, { dana }) => ({ as: dana, campaign: t.campaign }),
  }, async (page, t, { other }) => {
    page.click('[data-tab=sessions]');
    await page.settle();
    const pick = box(page).querySelector('[aria-label="Campaign"]');
    assert.deepEqual([...pick.options].map((o) => o.textContent), ['Second Campaign', 'Test Campaign'], 'by name');
    assert.equal(pick.selectedOptions[0].textContent, 'Test Campaign', 'starts on the campaign the DM is in');

    page.type(pick, String(other.id));
    await page.settle();
    // The form is now the other campaign's: its members are the choices.
    const f = form(page);
    page.type(f.querySelector('[aria-label="Transcript text"]'), SAMPLE);
    await page.waitFor(() => f.querySelectorAll('.speaker-row').length === 3, { what: 'the speaker preview' });
    const choices = [...f.querySelector('[aria-label="Who is SamPlays"]').options].map((o) => o.textContent);
    assert.deepEqual(choices, ['Not in the campaign (guest, bot…)', 'Dana (DM)', 'Sam (Bram)']);
    page.answers.confirm = [true];
    page.submit(f);
    await page.settle();
    assert.match(message(page), /Uploaded session #1 .* to Second Campaign/);
    await t.jobs.idle();
    assert.equal(t.store.getSession(other.id, 1).number, 1);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sessions`)).json().length, 0, 'nothing went to the campaign the DM is in');
  });
});

test('sessions: a number that\'s taken is refused; a date that\'s taken asks first; a bad transcript is reported', async () => {
  await withPage(asDana({ before: (t) => upload(t, { transcript: SAMPLE, played_on: '2026-10-01' }) }), async (page) => {
    page.click('[data-tab=sessions]');
    await page.settle();
    const f = form(page);
    assert.equal(f.querySelector('[aria-label="Session number"]').value, '2');

    page.type(f.querySelector('[aria-label="Transcript text"]'), 'no timestamps here');
    await page.waitFor(() => f.querySelector('.speakers .error'), { what: 'the error' });
    assert.match(page.text(f.querySelector('.speakers')), /^Can't read this transcript/);

    page.setFiles(f.querySelector('[aria-label="Transcript file"]'), [{ name: 's.txt', type: 'text/plain', content: SAMPLE }]);
    await page.waitFor(() => f.querySelectorAll('.speaker-row').length === 3, { what: 'the speaker preview' });
    page.type(f.querySelector('[aria-label="Session number"]'), '1');
    page.submit(f);
    assert.match(message(page), /Session #1 already exists in Test Campaign/);

    page.type(f.querySelector('[aria-label="Session number"]'), '2');
    page.type(f.querySelector('[aria-label="Date played"]'), '2026-10-01');
    assert.match(page.text(f.querySelector('.hint')), /Session #1 already has this date/);
    page.answers.confirm = [false];
    page.submit(f);
    assert.match(page.dialogs.at(-1).message, /Session #1 is already dated/);
  });
});

test('sessions: a failed session shows its error and can be retried', async () => {
  let fail = true;
  const llm = createFakeLLM({
    archivist: async () => {
      if (fail) throw new Error('The archivist fell over');
      return 'ok';
    },
  });
  await withPage(asDana({ setup: { llm }, before: (t) => upload(t, { transcript: SAMPLE }) }), async (page, t) => {
    page.click('[data-tab=sessions]');
    await page.settle();
    const list = () => box(page).querySelector('.sessions-list');
    assert.match(page.text(list()), /failed.*The archivist fell over/);
    fail = false;
    page.click(button(list(), 'Retry'));
    await page.settle();
    assert.equal(message(page), 'Session 1 is queued for processing.');
    await t.jobs.idle();
    await page.waitFor(() => /processed/.test(page.text(list())), { timeout: 8000, what: 'the retried session to be processed' });
  });
});
