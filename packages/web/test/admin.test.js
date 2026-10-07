/**
 * The admin screen (admin.js, admin-sessions.js): accounts, campaigns,
 * members and session uploads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addAccount, upload, createFakeLLM, SAMPLE, PASSWORD } from './helpers.js';

const asAdmin = (opts = {}) => ({ ...opts, page: (t) => ({ as: { token: t.dmToken } }) });

const userRow = (page, name) => page.$$('#users-table tbody tr').find((r) => r.querySelector('strong')?.textContent === name);
const button = (root, text) => {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent === text);
  if (!b) throw new Error(`no "${text}" button`);
  return b;
};
const campaignCard = (page, name) => page.$(`#campaigns section[aria-label="${name}"]`);
const message = (page) => page.text('#admin-message');
const isError = (page) => page.$('#admin-message').classList.contains('error-banner');
const users = async (t) => (await t.request('GET', '/admin/users')).json();

test('admin: accounts and campaigns are listed', async () => {
  await withPage(asAdmin(), async (page) => {
    assert.equal(page.text('#admin-name'), 'logged in as Kenny');
    const rows = page.$$('#users-table tbody tr');
    assert.deepEqual(rows.map((r) => r.querySelector('strong').textContent).sort(), ['Alex', 'Kenny', 'Sam']);
    assert.match(page.text(userRow(page, 'Kenny')), /admin.*management only/);
    assert.match(page.text(userRow(page, 'Sam')), /active.*Test Campaign · Thorin/);
    assert.match(page.text(userRow(page, 'Sam')), /1 device, just now/);
    // You can't block or delete yourself.
    assert.equal([...userRow(page, 'Kenny').querySelectorAll('button')].some((b) => b.textContent === 'Block'), false);

    const card = campaignCard(page, 'Test Campaign');
    assert.deepEqual([...card.querySelectorAll('.campaign-meta .pill')].map((p) => p.textContent), ['0 sessions', '2 players', 'DM: Kenny']);
    assert.deepEqual([...card.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent), ['Kenny', 'Alex', 'Sam']);
    assert.match(page.text(card.querySelector('.sessions-list')), /No sessions uploaded yet/);
  });
});

test('admin: adding an account with campaign access (a DM has no character)', async () => {
  await withPage(asAdmin(), async (page, t) => {
    const access = page.$('#add-user-campaigns .access-row');
    const [tick, role, character] = [access.querySelector('[type=checkbox]'), access.querySelector('select'), access.querySelector('[aria-label^=Character]')];
    assert.ok(role.disabled && character.disabled, 'nothing to fill in until ticked');
    page.type(tick, true);
    assert.ok(!role.disabled && !character.disabled);
    page.type(role, 'dm');
    assert.ok(character.disabled);
    page.type(role, 'player');
    page.type(character, '  Pip  ');

    page.type('#add-user-form [name=name]', '  Jo  ');
    page.type('#add-user-form [name=password]', PASSWORD);
    page.submit('#add-user-form');
    await page.settle();
    assert.equal(message(page), 'Added "Jo".');
    assert.match(page.text(userRow(page, 'Jo')), /must change password.*Test Campaign · Pip/);
    const jo = (await users(t)).find((u) => u.name === 'Jo');
    assert.equal(jo.must_change_password, 1);
    assert.deepEqual(jo.campaigns.map((c) => [c.role, c.character_name]), [['player', 'Pip']]);
    assert.equal(page.$('#add-user-form [name=name]').value, '', 'the form is cleared');

    // No campaigns, no forced change; a name that's taken is an error.
    page.type('#add-user-form [name=name]', 'Mo');
    page.type('#add-user-form [name=password]', PASSWORD);
    page.type('#add-user-form [name=must_change]', false);
    page.submit('#add-user-form');
    await page.settle();
    assert.match(message(page), /They have no campaigns yet/);
    assert.match(page.text(userRow(page, 'Mo')), /no campaigns/);
    page.type('#add-user-form [name=name]', 'mo');
    page.type('#add-user-form [name=password]', PASSWORD);
    page.submit('#add-user-form');
    await page.settle();
    assert.match(message(page), /already an account called "mo"/);
    assert.ok(isError(page));
  });
});

test('admin: editing which campaigns someone can access', async () => {
  await withPage(asAdmin(), async (page, t) => {
    page.click(button(userRow(page, 'Sam'), 'Edit campaigns'));
    const editor = page.$('#users-table .editor-row');
    assert.match(page.text(editor), /Campaigns Sam can access/);
    assert.equal(editor.querySelector('[aria-label="Character in Test Campaign"]').value, 'Thorin');
    page.click(button(editor, 'Cancel'));
    assert.equal(page.$('#users-table .editor-row'), null);

    page.click(button(userRow(page, 'Sam'), 'Edit campaigns'));
    page.type(page.$('#users-table .editor-row [aria-label="Character in Test Campaign"]'), 'Thorin II');
    page.click(button(page.$('#users-table .editor-row'), 'Save'));
    await page.settle();
    assert.equal(message(page), "Saved Sam's campaigns.");
    assert.match(page.text(userRow(page, 'Sam')), /Thorin II/);

    page.click(button(userRow(page, 'Sam'), 'Edit campaigns'));
    page.type(page.$('#users-table .editor-row [type=checkbox]'), false);
    page.click(button(page.$('#users-table .editor-row'), 'Save'));
    await page.settle();
    assert.match(page.text(userRow(page, 'Sam')), /no campaigns/);
    assert.equal((await users(t)).find((u) => u.name === 'Sam').campaigns.length, 0);
  });
});

test('admin: passwords, forced changes, logging someone out, blocking and deleting', async () => {
  await withPage(asAdmin({ before: async (t) => ({ unused: await t.auth.createUser('Unused', { password: PASSWORD }) }) }), async (page, t) => {
    // Set a password; they must change it (OK). Cancelling the prompt does nothing.
    page.answers.prompt = [null, 'a fresh password'];
    page.answers.confirm = [true];
    page.click(button(userRow(page, 'Sam'), 'Set password'));
    await page.settle();
    assert.equal(page.requests.filter((r) => r.path.includes('/password')).length, 0);
    page.click(button(userRow(page, 'Sam'), 'Set password'));
    await page.settle();
    assert.match(message(page), /Password changed for Sam; they'll choose their own/);
    const login = await t.app.inject({ method: 'POST', url: '/login', payload: { name: 'Sam', password: 'a fresh password' } });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().user.must_change_password, 1);

    page.click(button(userRow(page, 'Sam'), "Don't require"));
    await page.settle();
    assert.equal(message(page), 'Sam no longer has to change their password.');
    page.click(button(userRow(page, 'Alex'), 'Require new password'));
    await page.settle();
    assert.match(page.text(userRow(page, 'Alex')), /must change password/);

    // Log out everywhere.
    page.click(button(userRow(page, 'Alex'), 'Log out'));
    await page.settle();
    assert.equal((await t.request('GET', '/me', { as: t.alex.token })).statusCode, 401);
    assert.match(page.text(userRow(page, 'Alex')), /not logged in/);

    // Block (confirmed) and unblock; a cancelled block does nothing.
    page.answers.confirm = [false, true];
    page.click(button(userRow(page, 'Alex'), 'Block'));
    await page.settle();
    assert.match(page.text(userRow(page, 'Alex')), /active/);
    page.click(button(userRow(page, 'Alex'), 'Block'));
    await page.settle();
    assert.match(page.text(userRow(page, 'Alex')), /blocked/);
    assert.match(page.text(campaignCard(page, 'Test Campaign')), /Alexblocked/);
    page.click(button(userRow(page, 'Alex'), 'Unblock'));
    await page.settle();
    assert.equal(message(page), 'Alex can log in again.');

    // Delete: refused for an account with history, allowed for an unused one.
    page.answers.confirm = true;
    page.click(button(userRow(page, 'Unused'), 'Delete'));
    await page.settle();
    assert.equal(message(page), 'Deleted Unused.');
    assert.equal(userRow(page, 'Unused'), undefined);
    await upload(t, { transcript: SAMPLE });
    page.click(button(userRow(page, 'Sam'), 'Delete'));
    await page.settle();
    assert.ok(isError(page));
    assert.ok(userRow(page, 'Sam'));

    // Your own password: no "must change" question. (Setting it here logs out every login, this one included.)
    page.answers.prompt = ['admin password 2'];
    const asked = page.dialogs.length;
    page.click(button(userRow(page, 'Kenny'), 'Set password'));
    await page.settle();
    assert.equal(page.dialogs.length, asked + 1);
    assert.ok(page.visible('#login-view'));
  });
});

test('admin: campaigns: create, people (add, change, remove), delete by typing the name', async () => {
  await withPage(asAdmin({ before: async (t) => ({ jo: await addAccount(t, 'Jo') }) }), async (page, t) => {
    page.type('#add-campaign-form [name=name]', '  Curse   of Strahd ');
    page.submit('#add-campaign-form');
    await page.settle();
    assert.equal(message(page), 'Created "Curse of Strahd".'); // (text() tidies spaces, as the browser shows them)
    const card = () => campaignCard(page, 'Curse of Strahd');
    assert.match(page.text(card()), /No DM yet/);
    assert.match(page.text(card()), /Nobody in this campaign yet/);
    page.type('#add-campaign-form [name=name]', 'curse of strahd');
    page.submit('#add-campaign-form');
    await page.settle();
    assert.ok(isError(page));

    // Add Jo as DM, then Sam as a player; the admin isn't offered.
    const accounts = [...card().querySelectorAll('[aria-label=Account] option')].map((o) => o.textContent);
    assert.deepEqual(accounts, ['Choose an account…', 'Alex', 'Jo', 'Sam']);
    const add = (who, role, character = '') => {
      const form = card().querySelector('form.inline-form');
      page.type(form.querySelector('[aria-label=Account]'), String(who.id));
      page.type(form.querySelector('[aria-label=Role]'), role);
      page.type(form.querySelector('[aria-label="Character name"]'), character);
      page.submit(form);
    };
    add(t.sam, 'player', 'Ireena');
    await page.settle();
    assert.equal(message(page), 'Added Sam to Curse of Strahd.');
    const jo = (await users(t)).find((u) => u.name === 'Jo');
    add(jo, 'dm');
    await page.settle();
    assert.deepEqual([...card().querySelectorAll('.campaign-meta .pill')].map((p) => p.textContent), ['0 sessions', '1 player', 'DM: Jo']);

    // Change Sam's character, then remove him (after a cancelled confirm).
    const samRow = () => [...card().querySelectorAll('tbody tr')].find((r) => r.firstChild.textContent === 'Sam');
    page.type(samRow().querySelector('[aria-label="Character name"]'), 'Van Richten');
    page.click(button(samRow(), 'Save'));
    await page.settle();
    assert.equal(message(page), 'Saved Sam.');
    assert.match(page.text(userRow(page, 'Sam')), /Curse of Strahd · Van Richten/);
    page.answers.confirm = [false, true];
    page.click(button(samRow(), 'Remove'));
    page.click(button(samRow(), 'Remove'));
    await page.settle();
    assert.equal(samRow(), undefined);

    // Delete: the wrong name is refused; the right one (any case and spacing) deletes it.
    page.answers.prompt = [null, 'Curse of Strahd 2', ' curse   OF strahd '];
    page.click(button(card(), 'Delete campaign'));
    page.click(button(card(), 'Delete campaign'));
    assert.match(message(page), /didn't match/);
    assert.match(page.dialogs.at(-1).message, /Delete "Curse of Strahd"\?/);
    page.click(button(card(), 'Delete campaign'));
    await page.settle();
    assert.equal(card(), null);
    assert.equal((await t.request('GET', '/admin/campaigns')).json().length, 1);
  });
});

test('admin: with no campaigns, the lists say so', async () => {
  await withPage(asAdmin({ before: (t) => t.request('DELETE', `/admin/campaigns/${t.campaign.id}`) }), async (page) => {
    assert.equal(page.text('#campaigns'), 'No campaigns yet. Create one above.');
    assert.match(page.text('#add-user-campaigns'), /No campaigns yet/);
  });
});

// ---------- sessions ----------

const sessionsOf = (page) => campaignCard(page, 'Test Campaign').querySelector('.sessions');

test('sessions: paste a transcript, check who\'s who, upload; it gets processed', async () => {
  await withPage(asAdmin({ before: async (t) => { await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: 'A note' } }); } }), async (page, t) => {
    const box = sessionsOf(page);
    // A note with no transcript yet is waiting, and its date is suggested.
    assert.match(page.text(box.querySelector('.notice')), /Player notes waiting for a transcript.*1 note from 1 player/);
    const form = box.querySelector('form.upload-form');
    assert.equal(form.querySelector('[aria-label="Session number"]').value, '1');
    assert.match(page.text(form.querySelector('.hint')), /1 note from 1 player on .* will go with this session/);
    assert.ok(form.querySelector('[type=submit]').disabled);

    // Submitting before there's a transcript says what's missing.
    page.submit(form);
    assert.match(message(page), /Choose a transcript file/);

    page.type(form.querySelector('[aria-label="Transcript text"]'), SAMPLE);
    await page.waitFor(() => form.querySelectorAll('.speaker-row').length === 3, { what: 'the speaker preview' });
    assert.match(page.text(form.querySelector('.speakers p')), /6 lines, 00:00:05 to 00:02:00/);
    const picks = Object.fromEntries([...form.querySelectorAll('.speaker-row')].map((r) => [r.querySelector('strong').textContent, r.querySelector('select').selectedOptions[0].textContent]));
    assert.deepEqual(picks, { KennyDM: 'Kenny (DM)', SamPlays: 'Sam (Thorin)', AlexR: 'Alex (Lyra)' });
    assert.ok(!form.querySelector('[type=submit]').disabled);

    // Unlink one: the upload asks first (cancelled, then confirmed).
    page.type(form.querySelector('[aria-label="Who is AlexR"]'), '');
    assert.ok(form.querySelector('[aria-label="Who is AlexR"]').closest('.speaker-row').classList.contains('unlinked'));
    page.type(form.querySelector('[aria-label="Title"]'), 'Arrival in Brindle');
    page.answers.confirm = [false, true];
    page.submit(form);
    assert.match(page.dialogs.at(-1).message, /aren't linked to an account: AlexR/);
    assert.equal(page.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/sessions')).length, 0);
    page.submit(form);
    await page.settle();
    assert.match(message(page), /Uploaded session #1 .*Processing has started/);
    const sent = page.requests.find((r) => r.method === 'POST' && r.path.endsWith('/sessions')).body;
    assert.equal(sent.title, 'Arrival in Brindle');
    assert.deepEqual(sent.speakers.map((s) => s.user_id), [t.dm.id, t.sam.id, null]);

    // Once processed, the list says so (it refreshes itself while anything is processing).
    await t.jobs.idle();
    await page.waitFor(() => /processed/.test(page.text(sessionsOf(page).querySelector('.sessions-list'))), { timeout: 8000, what: 'the session to show as processed' });
    const row = sessionsOf(page).querySelector('.sessions-table tbody tr');
    assert.match(page.text(row), /#1.*Arrival in Brindle.*1 note from 1 player.*2 accounts.*processed/);
    assert.equal(sessionsOf(page).querySelector('.notice'), null);
  });
});

test('sessions: a number that\'s taken is refused; a date that\'s taken asks first; a bad transcript is reported', async () => {
  await withPage(asAdmin({ before: (t) => upload(t, { transcript: SAMPLE, played_on: '2026-10-01' }) }), async (page) => {
    const form = sessionsOf(page).querySelector('form.upload-form');
    assert.equal(form.querySelector('[aria-label="Session number"]').value, '2');

    page.type(form.querySelector('[aria-label="Transcript text"]'), 'no timestamps here');
    await page.waitFor(() => form.querySelector('.speakers .error'), { what: 'the error' });
    assert.match(page.text(form.querySelector('.speakers')), /^Can't read this transcript/);

    page.setFiles(form.querySelector('[aria-label="Transcript file"]'), [{ name: 's.txt', type: 'text/plain', content: SAMPLE }]);
    await page.waitFor(() => form.querySelectorAll('.speaker-row').length === 3, { what: 'the speaker preview' });
    page.type(form.querySelector('[aria-label="Session number"]'), '1');
    page.submit(form);
    assert.match(message(page), /Session #1 already exists/);

    page.type(form.querySelector('[aria-label="Session number"]'), '2');
    page.type(form.querySelector('[aria-label="Date played"]'), '2026-10-01');
    assert.match(page.text(form.querySelector('.hint')), /Session #1 already has this date/);
    page.answers.confirm = [false];
    page.submit(form);
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
  await withPage(asAdmin({ setup: { llm }, before: (t) => upload(t, { transcript: SAMPLE }) }), async (page, t) => {
    const list = () => sessionsOf(page).querySelector('.sessions-list');
    assert.match(page.text(list()), /failed.*The archivist fell over/);
    fail = false;
    page.click(button(list(), 'Retry'));
    await page.settle();
    assert.equal(message(page), 'Session 1 is queued for processing.');
    await t.jobs.idle();
    await page.waitFor(() => /processed/.test(page.text(list())), { timeout: 8000, what: 'the retried session to be processed' });
  });
});
