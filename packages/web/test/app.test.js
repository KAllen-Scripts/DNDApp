/**
 * The player page (app.js): logging in, passwords, choosing a campaign, tabs,
 * asking questions, chats and notes. Runs the real page against a real server
 * with a fake AI (see page.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addAccount, upload, createFakeLLM, SAMPLE, PASSWORD } from './helpers.js';

// ---------- logging in ----------

test('login: no saved login shows the login form; a wrong password says so; the right one enters the campaign', async () => {
  await withPage({}, async (page, t) => {
    assert.ok(page.visible('#login-view'));
    assert.ok(!page.visible('#app-view'));

    page.type('#login-form [name=name]', 'Sam');
    page.type('#login-form [name=password]', 'wrong password');
    page.submit('#login-form');
    await page.settle();
    assert.ok(page.visible('#login-error'));
    assert.match(page.text('#login-error'), /name or password/i);
    assert.ok(page.visible('#login-view'));

    page.type('#login-form [name=password]', PASSWORD);
    page.click('#login-form button[type=submit]');
    await page.settle();
    assert.ok(page.visible('#app-view'));
    assert.ok(!page.visible('#login-error'));
    // Only one campaign: straight in, no picker.
    assert.equal(page.text('#campaign-name'), 'Test Campaign');
    assert.equal(page.text('#character'), 'playing Thorin');
    assert.ok(!page.visible('#switch-campaign'));
    // The password field is cleared, and the login is kept in this browser.
    assert.equal(page.$('#login-form [name=password]').value, '');
    assert.ok(page.window.localStorage.getItem('dndapp.token'));
  });
});

test('login: a saved login that has expired goes back to the login form with a message', async () => {
  await withPage({ page: { as: { token: 'not-a-real-token' } } }, async (page) => {
    assert.ok(page.visible('#login-view'));
    assert.ok(page.visible('#login-error'));
    assert.equal(page.window.localStorage.getItem('dndapp.token'), null);
  });
});

test('logout: ends the login on the server and shows the login form', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page, t) => {
    assert.ok(page.visible('#app-view'));
    page.click('#app-view .logout');
    await page.settle();
    assert.ok(page.visible('#login-view'));
    assert.equal(page.window.localStorage.getItem('dndapp.token'), null);
    assert.equal((await t.request('GET', '/me', { as: t.sam.token })).statusCode, 401);
  });
});

test('the admin login gets the admin screen, not the player app', async () => {
  await withPage({ page: (t) => ({ as: { token: t.dmToken } }) }, async (page) => {
    assert.ok(page.visible('#admin-view'));
    assert.ok(!page.visible('#app-view'));
  });
});

// ---------- passwords ----------

test('password: a forced change comes first; mismatches and wrong current passwords are reported; then the app opens', async () => {
  await withPage({
    before: async (t) => ({ jo: await addAccount(t, 'Jo', { role: 'player', character: 'Pip', mustChange: true }) }),
    page: (t, { jo }) => ({ as: jo }),
  }, async (page, t, { jo }) => {
    assert.ok(page.visible('#password-view'));
    assert.ok(!page.visible('#password-cancel'), 'a forced change has no cancel');
    assert.match(page.text('#password-reason'), /Hi Jo/);

    page.type('#password-form [name=current]', PASSWORD);
    page.type('#password-form [name=next]', 'brand new pw');
    page.type('#password-form [name=again]', 'brand new px');
    page.submit('#password-form');
    await page.settle();
    assert.match(page.text('#password-error'), /don't match/);

    page.type('#password-form [name=current]', 'not my password');
    page.type('#password-form [name=again]', 'brand new pw');
    page.submit('#password-form');
    await page.settle();
    assert.ok(page.visible('#password-error'));
    assert.ok(page.visible('#password-view'));

    page.type('#password-form [name=current]', PASSWORD);
    page.submit('#password-form');
    await page.settle();
    assert.ok(page.visible('#app-view'));
    assert.equal(page.text('#character'), 'playing Pip');
    assert.equal((await t.app.inject({ method: 'POST', url: '/login', payload: { name: 'Jo', password: 'brand new pw' } })).statusCode, 200);
    assert.ok(jo);
  });
});

test('password: changing it by choice can be cancelled', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    page.click('#app-view .change-password');
    assert.ok(page.visible('#password-view'));
    assert.ok(page.visible('#password-cancel'));
    page.click('#password-cancel');
    await page.settle();
    assert.ok(page.visible('#app-view'));
  });
});

// ---------- campaigns ----------

test('campaigns: someone in two picks one (the last choice is pre-selected) and can switch', async () => {
  await withPage({
    before: async (t) => {
      const second = t.store.createCampaign('Second Campaign');
      t.auth.addMember(second.id, t.sam.id, 'dm');
      return { second };
    },
    page: (t, { second }) => ({ as: t.sam, storage: { 'dndapp.campaign': String(second.id) } }),
  }, async (page, t, { second }) => {
    assert.ok(page.visible('#campaign-view'));
    assert.equal(page.text('#campaign-hello'), 'Hi Sam');
    const options = page.$$('#campaign-pick option').map((o) => o.textContent);
    assert.deepEqual(options.sort(), ['Second Campaign (DM)', 'Test Campaign (playing Thorin)']);
    assert.equal(page.$('#campaign-pick').value, String(second.id));

    page.type('#campaign-pick', String(t.campaign.id));
    page.submit('#campaign-form');
    await page.settle();
    assert.ok(page.visible('#app-view'));
    assert.equal(page.text('#campaign-name'), 'Test Campaign');
    assert.ok(page.visible('#switch-campaign'));
    assert.equal(page.window.sessionStorage.getItem('dndapp.tabCampaign'), String(t.campaign.id));

    page.click('#switch-campaign');
    await page.settle();
    assert.ok(page.visible('#campaign-view'));
    page.type('#campaign-pick', String(second.id));
    page.submit('#campaign-form');
    await page.settle();
    assert.equal(page.text('#campaign-name'), 'Second Campaign');
    assert.equal(page.text('#character'), 'DM');
  });
});

test('campaigns: a reload stays in the tab\'s campaign; someone in none is told to ask the admin', async () => {
  await withPage({
    before: async (t) => {
      const second = t.store.createCampaign('Second Campaign');
      t.auth.addMember(second.id, t.sam.id, 'player', 'Thorin II');
      return { second, lonely: await addAccount(t, 'Lonely') };
    },
    page: (t, { second }) => ({ as: t.sam, campaign: second }),
  }, async (page) => {
    assert.ok(page.visible('#app-view'));
    assert.equal(page.text('#campaign-name'), 'Second Campaign');
  });
  await withPage({
    before: async (t) => ({ lonely: await addAccount(t, 'Lonely') }),
    page: (t, { lonely }) => ({ as: lonely }),
  }, async (page) => {
    assert.ok(page.visible('#campaign-view'));
    assert.ok(page.visible('#no-campaigns'));
    assert.ok(!page.visible('#campaign-form'));
  });
});

// ---------- tabs ----------

test('tabs: one panel at a time; Sheet and Map make the page wide', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    const shown = () => ['ask', 'notes', 'sheet', 'map'].filter((name) => page.visible(`#tab-${name}`));
    assert.deepEqual(shown(), ['ask']);
    for (const name of ['notes', 'sheet', 'map', 'ask']) {
      page.click(`[data-tab=${name}]`);
      assert.deepEqual(shown(), [name]);
      assert.equal(page.$(`[data-tab=${name}]`).getAttribute('aria-selected'), 'true');
      assert.equal(page.$('#app-view').classList.contains('wide'), name === 'sheet' || name === 'map');
    }
  });
});

// ---------- asking ----------

const ANSWER = 'Brother Hal is the **innkeeper** [S1 00:00:40]. He warned you about the cult [S1 00:00:40-00:01:30] and maybe [S9].';

test('ask: the answer streams in as markdown; citations become buttons that jump to the quoted lines', async () => {
  const llm = createFakeLLM({ qaScript: [[{ tool: 'search_kb', input: { query: 'Hal', kind: null } }, { answer: ANSWER }]] });
  await withPage({ setup: { llm }, before: (t) => upload(t, { transcript: SAMPLE }), page: (t) => ({ as: t.sam }) }, async (page) => {
    assert.ok(page.$('#thread .empty'));
    page.type('#ask-form textarea', '  Who is Brother Hal?  ');
    page.key('#ask-form textarea', 'Enter');
    await page.settle();

    assert.equal(page.$('#ask-form textarea').value, '');
    assert.ok(!page.$('#thread .empty'));
    assert.equal(page.text('#thread .q'), 'Who is Brother Hal?');
    const answer = page.$('#thread .a');
    assert.equal(answer.querySelector('strong').textContent, 'innkeeper');
    const cites = [...answer.querySelectorAll('.cite')];
    assert.deepEqual(cites.map((c) => [c.tagName, c.textContent]), [
      ['BUTTON', 'S1 00:00:40'],
      ['BUTTON', 'S1 00:00:40-00:01:30'],
      ['SPAN', 'S9'], // no evidence for it: a plain label
    ]);
    const figures = [...answer.querySelectorAll('.evidence figure')];
    assert.ok(figures.length >= 1);
    assert.match(page.text(figures[0].querySelector('figcaption')), /^Session 1/);
    assert.match(figures[0].querySelector('pre').textContent, /Brother Hall, the innkeeper/);

    // Clicking a citation highlights its quote.
    page.click(cites[0]);
    assert.ok(answer.querySelector(`.evidence figure[data-source="${cites[0].dataset.source}"]`).classList.contains('flash'));

    // The chat now exists and is listed, titled after the question.
    assert.equal(page.text('#chat-title'), 'Who is Brother Hal?');
    assert.ok(page.visible('#chat-delete'));
    assert.deepEqual(page.$$('#chat-list .chat-name').map((n) => n.textContent), ['Who is Brother Hal?']);
    assert.equal(page.$('#ask-form button').disabled, false);
  });
});

test('ask: answers are sanitised (nothing that runs or links out), tables are wrapped, code is left alone', async () => {
  const answer = [
    '<script>window.hacked = 1</script><img src=x onerror="window.hacked = 1"><a href="https://evil.example">link</a>',
    '<div class="stat-block" onclick="window.hacked = 1" style="color: red"><b>Brown Bear</b></div>',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '`[S1]` stays code',
  ].join('\n');
  const llm = createFakeLLM({ qaScript: [[{ answer }]] });
  await withPage({ setup: { llm }, page: (t) => ({ as: t.sam }) }, async (page) => {
    page.type('#ask-form textarea', 'Stat block for a brown bear?');
    page.submit('#ask-form');
    await page.settle();
    const a = page.$('#thread .a');
    assert.equal(a.querySelector('script, img, a, [onclick], [style]'), null);
    assert.equal(page.window.hacked, undefined);
    assert.equal(a.querySelector('.stat-block b').textContent, 'Brown Bear');
    assert.equal(a.querySelector('table').parentElement.className, 'table-wrap');
    assert.equal(a.querySelector('code').textContent, '[S1]');
    assert.equal(a.querySelector('.cite'), null);
  });
});

test('ask: a failure is shown in the answer, and the form works again', async () => {
  const llm = createFakeLLM({ qaScript: [[{ tool: 'no_such_tool', input: {} }]] });
  await withPage({ setup: { llm }, page: (t) => ({ as: t.sam }) }, async (page) => {
    page.type('#ask-form textarea', 'Break, please');
    page.submit('#ask-form');
    await page.settle();
    assert.match(page.text('#thread .a .error'), /^Sorry, something went wrong:/);
    assert.equal(page.$('#ask-form button').disabled, false);
  });
});

test('ask: Shift+Enter is a new line, not a question; an empty question is ignored', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    page.type('#ask-form textarea', 'line one');
    page.key('#ask-form textarea', 'Enter', { shiftKey: true });
    page.type('#ask-form textarea', '   ');
    page.submit('#ask-form');
    await page.settle();
    assert.equal(page.requests.filter((r) => r.path.endsWith('/ask')).length, 0);
  });
});

// ---------- chats ----------

test('chats: follow-ups stay in the chat; chats can be found, opened, pinned, renamed and deleted', async () => {
  const llm = createFakeLLM({ qaScript: [[{ answer: 'First answer.' }], [{ answer: 'Follow-up answer.' }], [{ answer: 'Other answer.' }]] });
  await withPage({ setup: { llm }, page: (t) => ({ as: t.sam }) }, async (page, t) => {
    const ask = async (q) => {
      page.type('#ask-form textarea', q);
      page.submit('#ask-form');
      await page.settle();
    };
    await ask('Where is the mill?');
    await ask('And who owns it?');
    const asks = page.requests.filter((r) => r.path.endsWith('/ask'));
    assert.ok(asks[1].body.conversationId);
    assert.equal(page.$$('#thread .q').length, 2);

    // A new chat starts empty; the next question makes a second chat.
    page.click('.new-chat-head');
    assert.ok(page.$('#thread .empty'));
    assert.equal(page.text('#chat-title'), 'New chat');
    assert.ok(!page.visible('#chat-pin'));
    await ask('What about the Baron?');
    assert.equal(page.$$('#chat-list .chat-row').length, 2);

    // Filter the list.
    page.type('#chat-filter', 'MILL');
    assert.deepEqual(page.$$('#chat-list .chat-name').map((n) => n.textContent), ['Where is the mill?']);
    page.type('#chat-filter', 'dragons');
    assert.equal(page.text('#chat-list'), 'No chats match.');
    page.type('#chat-filter', '');

    // Open the first chat again: both turns come back.
    const row = page.$$('#chat-list .chat-row').find((r) => r.textContent.includes('Where is the mill?'));
    page.click(row.querySelector('.chat-open'));
    await page.settle();
    assert.deepEqual(page.$$('#thread .q').map((q) => q.textContent), ['Where is the mill?', 'And who owns it?']);
    assert.equal(page.text('#thread .a'), 'First answer.');

    // Pin it: it moves under "Pinned".
    page.click('#chat-pin');
    await page.settle();
    assert.deepEqual(page.$$('#chat-list h3').map((h) => h.textContent), ['Pinned', 'Recent']);
    assert.equal(page.$('#chat-pin').getAttribute('aria-pressed'), 'true');
    assert.ok(page.$('#chat-list .chat-row.pinned.current'));

    // Rename it (the prompt's answer), then a rename to the same name or nothing does nothing.
    page.answers.prompt = ['  The mill  ', '', null];
    page.click('#chat-rename');
    await page.settle();
    assert.equal(page.text('#chat-title'), 'The mill');
    const patches = () => page.requests.filter((r) => r.method === 'PATCH').length;
    const before = patches();
    page.click('#chat-rename');
    page.click('#chat-rename');
    await page.settle();
    assert.equal(patches(), before);

    // Delete: cancelled first, then confirmed. The open chat goes back to a new one.
    page.answers.confirm = [false, true];
    page.click('#chat-delete');
    await page.settle();
    assert.equal(page.$$('#chat-list .chat-row').length, 2);
    page.click('#chat-delete');
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /Delete "The mill"\?/);
    assert.equal(page.$$('#chat-list .chat-row').length, 1);
    assert.equal(page.text('#chat-title'), 'New chat');
    assert.ok(page.$('#thread .empty'));

    // Deleting from the list (another chat than the open one), and the empty list.
    page.answers.confirm = true;
    page.click('#chat-list .chat-del');
    await page.settle();
    assert.equal(page.text('#chat-list'), 'No chats yet. Ask something and it will appear here.');
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/conversations`, { as: t.sam.token })).json().length, 0);
  });
});

test('chats: the list opens as a drawer and closes with ✕, the backdrop or Escape', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    const open = () => page.$('#tab-ask').classList.contains('chats-open');
    page.click('#chats-toggle');
    assert.ok(open());
    assert.equal(page.$('#chats-toggle').getAttribute('aria-expanded'), 'true');
    page.click('.chats-close');
    assert.ok(!open());
    page.click('#chats-toggle');
    page.click('.chats-scrim');
    assert.ok(!open());
    page.click('#chats-toggle');
    page.key('#chat-filter', 'Escape');
    assert.ok(!open());
  });
});

// ---------- notes ----------

test('notes: saved with the button or Ctrl+Enter, grouped by session date, private to their author', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page, t) => {
    page.click('[data-tab=notes]');
    assert.match(page.text('#notes'), /No notes yet/);

    page.type('#note-form textarea', '  The innkeeper seemed nervous.  ');
    page.submit('#note-form');
    await page.settle();
    page.type('#note-form textarea', 'Ask about the silver key.');
    page.key('#note-form textarea', 'Enter', { ctrlKey: true });
    await page.settle();
    assert.equal(page.$('#note-form textarea').value, '');
    // Only spaces: nothing is sent.
    const sent = page.requests.length;
    page.type('#note-form textarea', '   ');
    page.submit('#note-form');
    await page.settle();
    assert.equal(page.requests.length, sent);
    assert.equal(page.$$('#notes section').length, 1);
    const notes = page.$$('#notes .note').map((n) => n.lastChild.textContent);
    assert.deepEqual(notes, ['Ask about the silver key.', 'The innkeeper seemed nervous.']);
    assert.match(page.text('#notes h2'), /\d{4}/);

    const alexNotes = await t.request('GET', `/campaigns/${t.campaign.id}/notes`, { as: t.alex.token });
    assert.equal(alexNotes.json().length, 0);
  });
});

test('notes: a failed save is reported and the text is kept', async () => {
  await withPage({ page: (t) => ({ as: t.sam }) }, async (page) => {
    page.click('[data-tab=notes]');
    page.type('#note-form textarea', 'x'.repeat(10_001)); // over the server's limit (the page's maxlength aside)
    page.submit('#note-form');
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /^Couldn't save your note:/);
    assert.equal(page.$('#note-form textarea').value.length, 10_001);
    assert.equal(page.$('#note-form button').disabled, false);
  });
});
