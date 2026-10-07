import { test } from 'node:test';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, createFakeLLM, SAMPLE, SAMPLE_2, fakeEmbedder, PASSWORD } from './helpers.js';
import { createContext } from '../src/context.js';
import { PIPELINE_VERSION } from '../src/config.js';

/** Parse an SSE response body into [{event, data}]. */
const parseSse = (body) =>
  body
    .split('\n\n')
    .filter((b) => b.startsWith('event:'))
    .map((b) => {
      const [e, d] = b.split('\n');
      return { event: e.slice(7), data: JSON.parse(d.slice(6)) };
    });

async function upload(t, n = 1, transcript = SAMPLE, played_on = '2026-10-01') {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: n, played_on, transcript } });
  await t.jobs.idle();
  return res;
}

const ask = async (t, question, as) => {
  const res = await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { body: { question }, as });
  return parseSse(res.body);
};

// ---------- accounts ----------

const login = (t, name, password) => t.app.inject({ method: 'POST', url: '/login', payload: { name, password } });

test('auth: rejects missing/invalid tokens and non-members', async () => {
  const t = await setup();
  try {
    assert.equal((await t.app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
    assert.equal((await t.app.inject({ method: 'GET', url: '/me' })).statusCode, 401);
    assert.equal((await t.request('GET', '/me', { as: 'nope' })).statusCode, 401);
    await t.auth.createUser('Outsider', { password: PASSWORD });
    const { token } = await t.auth.login('Outsider', PASSWORD);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}`, { as: token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('login: name (any case) + password; wrong passwords, logout, password changes, lockout', async () => {
  const t = await setup({ config: { auth: { loginDays: 30, maxFailedLogins: 3 } } });
  try {
    const ok = await login(t, '  sAm ', PASSWORD);
    assert.equal(ok.statusCode, 200);
    const { token, user } = ok.json();
    assert.equal(user.id, t.sam.id);
    assert.equal((await t.request('GET', '/me', { as: token })).json().user.name, 'Sam');

    assert.equal((await login(t, 'Sam', 'wrong password')).statusCode, 401);
    assert.equal((await login(t, 'Nobody', PASSWORD)).statusCode, 401);
    assert.equal((await t.app.inject({ method: 'POST', url: '/login', payload: { name: 'Sam' } })).statusCode, 400);

    // Logging out ends that login only.
    await t.request('POST', '/logout', { as: token });
    assert.equal((await t.request('GET', '/me', { as: token })).statusCode, 401);
    assert.equal((await t.request('GET', '/me', { as: t.sam.token })).statusCode, 200);

    // A new password logs them out everywhere; the old password stops working.
    await t.auth.setPassword(t.sam.id, 'a new password');
    assert.equal((await t.request('GET', '/me', { as: t.sam.token })).statusCode, 401);
    assert.equal((await login(t, 'Sam', PASSWORD)).statusCode, 401);
    assert.equal((await login(t, 'Sam', 'a new password')).statusCode, 200);

    // Too many failures for a name lock it for a while, even with the right password.
    for (let i = 0; i < 3; i++) await login(t, 'Alex', 'guess');
    assert.equal((await login(t, 'Alex', PASSWORD)).statusCode, 429);

    // Names are unique ignoring case; passwords have a minimum length.
    await assert.rejects(t.auth.createUser('ALEX', { password: PASSWORD }), /already/);
    await assert.rejects(t.auth.createUser('Jo', { password: '123' }), /at least/);

    // Passwords are stored hashed, never in plain text (including the archive).
    const stored = t.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(t.alex.id).password_hash;
    assert.match(stored, /^scrypt\$/);
    assert.ok(!fs.readFileSync(path.join(t.paths.archive, '_server', 'accounts.json'), 'utf8').includes(PASSWORD));
  } finally {
    await t.cleanup();
  }
});

test('logins expire after LOGIN_DAYS unused', async () => {
  const t = await setup();
  try {
    t.db.prepare("UPDATE logins SET last_used_at = datetime('now', '-31 days')").run();
    assert.equal((await t.request('GET', '/me', { as: t.sam.token })).statusCode, 401);
  } finally {
    await t.cleanup();
  }
});

test('the web page is served without logging in; API routes still need a login', async () => {
  const t = await setup();
  try {
    const page = await t.app.inject({ method: 'GET', url: '/' });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.equal((await t.app.inject({ method: 'GET', url: '/app.js' })).statusCode, 200);
    // Modules the page imports from packages: sheet rules, markdown + sanitising for answers, dice, map geometry.
    for (const url of ['/shared/sheet.js', '/shared/dice.js', '/shared/map.js', '/vendor/marked.js', '/vendor/purify.js', '/vendor/dice/dice-box.js', '/vendor/three/three.module.js', '/vendor/three/three.core.js', '/vendor/cannon-es.js']) {
      const res = await t.app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 200, url);
      assert.match(res.headers['content-type'], /javascript/);
      assert.match(res.body, /\bexport\b/);
    }
    // Libraries are sent compressed when the browser can take it, and not again when it already has them.
    const plain = await t.app.inject({ method: 'GET', url: '/vendor/three/three.core.js' });
    const br = await t.app.inject({ method: 'GET', url: '/vendor/three/three.core.js', headers: { 'accept-encoding': 'gzip, deflate, br' } });
    assert.equal(br.headers['content-encoding'], 'br');
    assert.ok(br.rawPayload.length < plain.rawPayload.length / 4);
    assert.equal(zlib.brotliDecompressSync(br.rawPayload).toString(), plain.body);
    const gz = await t.app.inject({ method: 'GET', url: '/vendor/cannon-es.js', headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.match(zlib.gunzipSync(gz.rawPayload).toString(), /\bexport\b/);
    const again = await t.app.inject({ method: 'GET', url: '/vendor/three/three.core.js', headers: { 'if-none-match': plain.headers.etag } });
    assert.equal(again.statusCode, 304);
    assert.equal(again.rawPayload.length, 0);
    // The 3D dice's sounds come from the same package.
    const sound = await t.app.inject({ method: 'GET', url: '/vendor/dice/sounds/dicehit/dicehit_plastic1.mp3' });
    assert.equal(sound.statusCode, 200);
    assert.equal(sound.headers['content-type'], 'audio/mpeg');
    assert.notEqual((await t.app.inject({ method: 'GET', url: '/vendor/dice/sounds/../../package.json' })).statusCode, 200);
    const texture = await t.app.inject({ method: 'GET', url: '/vendor/dice/textures/fire.webp' });
    assert.equal(texture.statusCode, 200);
    assert.equal(texture.headers['content-type'], 'image/webp');
    assert.notEqual((await t.app.inject({ method: 'GET', url: '/../package.json' })).statusCode, 200);
    assert.equal((await t.app.inject({ method: 'GET', url: `/campaigns/${t.campaign.id}` })).statusCode, 401);
  } finally {
    await t.cleanup();
  }
});

test('admin screen: accounts, campaigns, roles; players and DMs cannot use it', async () => {
  const t = await setup();
  try {
    const admin = (method, url, body) => t.request(method, url, { body });

    // Create an account and put it in a campaign as a player.
    const created = await admin('POST', '/admin/users', { name: 'Jo', password: 'jo-password' });
    assert.equal(created.statusCode, 201);
    const jo = created.json();
    assert.equal((await admin('POST', '/admin/users', { name: 'jo', password: 'whatever1' })).statusCode, 409);
    assert.equal((await admin('POST', '/admin/users', { name: 'Short', password: '123' })).statusCode, 400);

    const campaign = (await admin('POST', '/admin/campaigns', { name: 'Second Campaign' })).json();
    assert.equal((await admin('PUT', `/admin/campaigns/${campaign.id}/members/${jo.id}`, { role: 'player', character_name: 'Pip' })).statusCode, 200);
    const token = (await login(t, 'Jo', 'jo-password')).json().token;
    const me = (await t.request('GET', '/me', { as: token })).json();
    assert.deepEqual(me.campaigns.map((c) => [c.name, c.role, c.character_name]), [['Second Campaign', 'player', 'Pip']]);

    // Players can't do DM things.
    for (const [method, url, body] of [
      ['POST', `/campaigns/${campaign.id}/sessions`, { number: 1, played_on: '2026-10-01', transcript: SAMPLE }],
      ['POST', `/campaigns/${campaign.id}/corrections`, { text: 'x' }],
      ['GET', `/campaigns/${campaign.id}/questions`],
      ['GET', `/campaigns/${campaign.id}/kb`],
    ]) {
      assert.equal((await t.request(method, url, { as: token, body })).statusCode, 403, url);
    }

    // Making someone the DM is a role change.
    await admin('PUT', `/admin/campaigns/${campaign.id}/members/${jo.id}`, { role: 'dm', character_name: '' });
    assert.equal(t.auth.membership(campaign.id, jo.id).role, 'dm');
    assert.equal(t.auth.membership(campaign.id, jo.id).character_name, null);
    assert.equal((await t.request('GET', `/campaigns/${campaign.id}/kb`, { as: token })).statusCode, 200);

    // Only the admin can use the admin routes: not the DM role, not players.
    for (const as of [token, t.sam.token]) {
      for (const [method, url, body] of [
        ['GET', '/admin/users'],
        ['POST', '/admin/users', { name: 'X', password: PASSWORD }],
        ['PUT', `/admin/users/${t.sam.id}/password`, { password: 'hijacked!' }],
        ['POST', '/admin/campaigns', { name: 'Mine' }],
        ['PUT', `/admin/campaigns/${campaign.id}/members/${t.sam.id}`, { role: 'dm' }],
      ]) {
        assert.equal((await t.request(method, url, { as, body })).statusCode, 403, url);
      }
    }

    // The account list shows campaigns, logins and status.
    const list = (await admin('GET', '/admin/users')).json();
    const joRow = list.find((u) => u.id === jo.id);
    assert.equal(joRow.logins, 1);
    assert.equal(joRow.has_password, true);
    assert.deepEqual(joRow.campaigns.map((m) => m.role), ['dm']);
    assert.equal(list[0].is_admin, 1);
    assert.equal((await admin('GET', '/admin/campaigns')).json().find((c) => c.id === campaign.id).members.length, 1);

    // Log out everywhere; set a password (also logs out).
    await admin('POST', `/admin/users/${jo.id}/logout`);
    assert.equal((await t.request('GET', '/me', { as: token })).statusCode, 401);
    assert.equal((await admin('PUT', `/admin/users/${jo.id}/password`, { password: 'jo-second' })).statusCode, 200);
    assert.equal((await login(t, 'Jo', 'jo-password')).statusCode, 401);
    const token2 = (await login(t, 'Jo', 'jo-second')).json().token;

    // Block and unblock.
    await admin('POST', `/admin/users/${jo.id}/block`);
    assert.equal((await t.request('GET', '/me', { as: token2 })).statusCode, 401);
    assert.equal((await login(t, 'Jo', 'jo-second')).statusCode, 401);
    await admin('POST', `/admin/users/${jo.id}/unblock`);
    assert.equal((await login(t, 'Jo', 'jo-second')).statusCode, 200);

    // Remove from a campaign: the account stays.
    await admin('DELETE', `/admin/campaigns/${campaign.id}/members/${jo.id}`);
    assert.equal(t.auth.membership(campaign.id, jo.id), undefined);
    const members = JSON.parse(fs.readFileSync(path.join(t.paths.archive, campaign.slug, 'members.json'), 'utf8'));
    assert.equal(members.length, 0);

    // The admin can't block or delete themselves.
    assert.equal((await admin('POST', `/admin/users/${t.dm.id}/block`)).statusCode, 400);
    assert.equal((await admin('DELETE', `/admin/users/${t.dm.id}`)).statusCode, 400);
  } finally {
    await t.cleanup();
  }
});

test('admin can delete unused accounts, but accounts with history can only be blocked', async () => {
  const t = await setup();
  try {
    const typo = (await t.request('POST', '/admin/users', { body: { name: 'Smaa', password: PASSWORD } })).json();
    assert.equal((await t.request('DELETE', `/admin/users/${typo.id}`)).statusCode, 200);
    assert.ok(!(await t.request('GET', '/admin/users')).json().some((u) => u.id === typo.id));

    // Sam is linked in the speaker map and has a note: deleting would orphan archived data.
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: 'a note' } });
    const res = await t.request('DELETE', `/admin/users/${t.sam.id}`);
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error, /notes.*Block it instead/);
  } finally {
    await t.cleanup();
  }
});

test('admin sets which campaigns an account can access, when adding it and later', async () => {
  const t = await setup();
  try {
    const admin = (method, url, body) => t.request(method, url, { body });
    const b = (await admin('POST', '/admin/campaigns', { name: 'Campaign B' })).json();
    const c = (await admin('POST', '/admin/campaigns', { name: 'Campaign C' })).json();

    // Access chosen when the account is created.
    const jo = (await admin('POST', '/admin/users', {
      name: 'Jo',
      password: 'jo-password',
      campaigns: [{ campaign_id: t.campaign.id, role: 'player', character_name: 'Pip' }, { campaign_id: b.id, role: 'dm' }],
    })).json();
    const token = (await login(t, 'Jo', 'jo-password')).json().token;
    const mine = async () => (await t.request('GET', '/me', { as: token })).json().campaigns.map((m) => [m.name, m.role, m.character_name]);
    assert.deepEqual(await mine(), [['Campaign B', 'dm', null], ['Test Campaign', 'player', 'Pip']]);
    assert.equal((await t.request('GET', `/campaigns/${c.id}`, { as: token })).statusCode, 403);

    // Changed later: drop B, add C, keep the first campaign as it was.
    const res = await admin('PUT', `/admin/users/${jo.id}/campaigns`, {
      campaigns: [{ campaign_id: t.campaign.id, role: 'player', character_name: 'Pip' }, { campaign_id: c.id, role: 'player', character_name: 'Quill' }],
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(await mine(), [['Campaign C', 'player', 'Quill'], ['Test Campaign', 'player', 'Pip']]);
    assert.equal((await t.request('GET', `/campaigns/${b.id}`, { as: token })).statusCode, 403);
    const archived = (slug) => JSON.parse(fs.readFileSync(path.join(t.paths.archive, slug, 'members.json'), 'utf8')).map((m) => m.user_id);
    assert.ok(!archived(b.slug).includes(jo.id));
    assert.ok(archived(c.slug).includes(jo.id));

    // No access at all is allowed; bad campaigns and the admin login are refused.
    await admin('PUT', `/admin/users/${jo.id}/campaigns`, { campaigns: [] });
    assert.deepEqual(await mine(), []);
    assert.equal((await admin('PUT', `/admin/users/${jo.id}/campaigns`, { campaigns: [{ campaign_id: 999 }] })).statusCode, 404);
    assert.equal((await admin('PUT', `/admin/users/${jo.id}/campaigns`, { campaigns: [{ campaign_id: b.id }, { campaign_id: b.id }] })).statusCode, 400);
    assert.equal((await admin('POST', '/admin/users', { name: 'Nope', password: PASSWORD, campaigns: [{ campaign_id: 999 }] })).statusCode, 404);
    assert.ok(!(await admin('GET', '/admin/users')).json().some((u) => u.name === 'Nope'));
    assert.equal((await admin('PUT', `/admin/users/${t.dm.id}/campaigns`, { campaigns: [] })).statusCode, 400);
    assert.equal((await t.request('PUT', `/admin/users/${jo.id}/campaigns`, { as: t.sam.token, body: { campaigns: [] } })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('campaigns are kept separate: Q&A in one campaign never sees another campaign', async () => {
  const llm = createFakeLLM({
    qaScript: [
      [
        { tool: 'search_kb', input: { query: 'Brother Hal innkeeper', kind: null } },
        { tool: 'list_records', input: { kind: null, status: null } },
        { tool: 'get_records', input: { ids: [1, 2, 3, 4, 5] } },
        { tool: 'list_sessions', input: {} },
        { tool: 'search_transcript', input: { query: 'mill silver key', from_session: null, to_session: null } },
        { tool: 'read_transcript', input: { session: 1, from: '00:00:00', to: '01:00:00' } },
        { tool: 'search_my_notes', input: { query: 'trapdoor cellar' } },
        { answer: 'Nothing about that in this campaign.' },
      ],
    ],
  });
  const t = await setup({ llm });
  try {
    // Campaign A (the test campaign): a processed session and a note by Sam.
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: 'Secret trapdoor in the cellar' } });
    await upload(t);
    assert.ok(t.kb.list(t.campaign.id).some((r) => r.title === 'Brother Hal'));

    // Sam is also in campaign B, which has nothing yet.
    const b = (await t.request('POST', '/admin/campaigns', { body: { name: 'Campaign B' } })).json();
    await t.request('PUT', `/admin/users/${t.sam.id}/campaigns`, {
      body: { campaigns: [{ campaign_id: t.campaign.id, role: 'player', character_name: 'Thorin' }, { campaign_id: b.id, role: 'player', character_name: 'Zed' }] },
    });

    await ask({ ...t, campaign: b }, 'What has happened so far?', t.sam.token);
    const call = llm.calls.find((c) => c.purpose === 'qa');
    assert.match(call.system, /Campaign B/);
    assert.match(call.system, /Zed/);
    assert.doesNotMatch(call.system, /Thorin|Test Campaign/);
    const everything = call.prompt + call.system + call.toolResults.map((r) => r.result).join('\n');
    for (const leak of [/Brother Hal/, /Hall/, /silver key/, /mill/i, /trapdoor in the cellar/, /Story so far/]) {
      assert.doesNotMatch(everything, leak);
    }
    assert.equal(call.toolResults.find((r) => r.tool === 'read_transcript').result, 'No session 1.');

    // Notes, sessions and conversations are per campaign too.
    assert.equal((await t.request('GET', `/campaigns/${b.id}/notes`, { as: t.sam.token })).json().length, 0);
    assert.equal((await t.request('GET', `/campaigns/${b.id}/sessions`, { as: t.sam.token })).json().length, 0);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/conversations`, { as: t.sam.token })).json().length, 0);
    assert.equal((await t.request('GET', `/campaigns/${b.id}/conversations`, { as: t.sam.token })).json().length, 1);
    // Alex isn't in B at all.
    assert.equal((await t.request('POST', `/campaigns/${b.id}/ask`, { as: t.alex.token, body: { question: 'hi' } })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('admin can delete a campaign: gone from the database, kept (marked) in the archive, never restored', async () => {
  const t = await setup();
  try {
    const admin = (method, url, body) => t.request(method, url, { body });
    const keepCount = (sql) => t.db.prepare(sql).get().n;
    const before = {
      docs: keepCount('SELECT COUNT(*) AS n FROM docs'),
      fts: keepCount('SELECT COUNT(*) AS n FROM docs_fts'),
    };

    // A second campaign with real content: a member, a note, a processed session, a question.
    const b = (await admin('POST', '/admin/campaigns', { name: 'Doomed' })).json();
    await admin('PUT', `/admin/users/${t.sam.id}/campaigns`, {
      campaigns: [{ campaign_id: t.campaign.id, role: 'player', character_name: 'Thorin' }, { campaign_id: b.id, role: 'player', character_name: 'Zed' }],
    });
    await t.request('POST', `/campaigns/${b.id}/notes`, { as: t.sam.token, body: { text: 'doomed note' } });
    await admin('PUT', `/admin/campaigns/${b.id}/members/${t.dm.id}`, { role: 'dm' });
    await upload({ ...t, campaign: b });
    await ask({ ...t, campaign: b }, 'anything?', t.sam.token);
    assert.ok(keepCount(`SELECT COUNT(*) AS n FROM kb_records WHERE campaign_id = ${b.id}`) > 0);

    // Not while processing is queued.
    t.db.prepare("INSERT INTO jobs (campaign_id, type, status) VALUES (?, 'ingest', 'queued')").run(b.id);
    assert.equal((await admin('DELETE', `/admin/campaigns/${b.id}`)).statusCode, 400);
    t.db.prepare("DELETE FROM jobs WHERE campaign_id = ? AND status = 'queued'").run(b.id);

    // Only the admin.
    assert.equal((await t.request('DELETE', `/admin/campaigns/${b.id}`, { as: t.sam.token })).statusCode, 403);

    const res = await admin('DELETE', `/admin/campaigns/${b.id}`);
    assert.equal(res.statusCode, 200);
    assert.equal((await admin('DELETE', `/admin/campaigns/${b.id}`)).statusCode, 404);

    // Everything for B is gone from the database; A is untouched.
    for (const table of ['memberships', 'sessions', 'player_notes', 'kb_records', 'kb_journal', 'docs', 'conversations', 'speakers', 'jobs']) {
      assert.equal(keepCount(`SELECT COUNT(*) AS n FROM ${table} WHERE campaign_id = ${b.id}`), 0, table);
    }
    assert.equal(keepCount('SELECT COUNT(*) AS n FROM qa_log'), 0);
    assert.equal(keepCount('SELECT COUNT(*) AS n FROM docs'), before.docs);
    assert.equal(keepCount('SELECT COUNT(*) AS n FROM docs_fts'), before.fts);
    t.db.exec("INSERT INTO docs_fts(docs_fts) VALUES ('integrity-check')");
    assert.deepEqual((await t.request('GET', '/me', { as: t.sam.token })).json().campaigns.map((c) => c.name), ['Test Campaign']);
    assert.equal((await t.request('GET', `/campaigns/${b.id}/notes`, { as: t.sam.token })).statusCode, 404);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}`, { as: t.sam.token })).statusCode, 200);

    // The archive keeps every file and gains a deleted marker.
    const folder = path.join(t.paths.archive, b.slug);
    assert.ok(fs.existsSync(path.join(folder, 'sessions', '0001', 'transcript.txt')));
    assert.ok(fs.readdirSync(path.join(folder, 'player-notes')).length);
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'deleted.json'), 'utf8')).name, 'Doomed');

    // A new campaign with the same name gets its own archive folder.
    const again = (await admin('POST', '/admin/campaigns', { name: 'Doomed' })).json();
    assert.notEqual(again.slug, b.slug);
    assert.ok(!fs.existsSync(path.join(t.paths.archive, again.slug, 'deleted.json')));

    // Restoring into a fresh database brings back A and the new "Doomed", not the deleted one.
    const fresh = await createContext({
      config: t.config,
      paths: { ...t.paths, db: path.join(t.dir, 'fresh.sqlite') },
      llm: createFakeLLM(),
      embedder: fakeEmbedder,
    });
    try {
      assert.deepEqual(fresh.restored.sort(), [again.slug, t.campaign.slug].sort());
      assert.ok(!fresh.db.prepare('SELECT 1 FROM campaigns WHERE slug = ?').get(b.slug));
    } finally {
      fresh.db.close();
    }
  } finally {
    await t.cleanup();
  }
});

test('names are stored with extra spaces cleaned up, matching what the page shows', async () => {
  const t = await setup();
  try {
    const c = (await t.request('POST', '/admin/campaigns', { body: { name: '  test   camp ' } })).json();
    assert.equal(c.name, 'test camp');
    assert.equal((await t.request('POST', '/admin/campaigns', { body: { name: 'TEST CAMP' } })).statusCode, 409);
    assert.equal((await t.request('POST', '/admin/campaigns', { body: { name: '   ' } })).statusCode, 400);
    const u = (await t.request('POST', '/admin/users', { body: { name: ' Moss   Bass ', password: PASSWORD } })).json();
    assert.equal(u.name, 'Moss Bass');
    assert.equal((await login(t, 'moss  bass', PASSWORD)).statusCode, 200);
    assert.equal((await t.request('POST', '/admin/users', { body: { name: 'moss bass', password: PASSWORD } })).statusCode, 409);
  } finally {
    await t.cleanup();
  }
});

test('"must change password at next login": set by the admin, enforced by the server, cleared by the player', async () => {
  const t = await setup();
  try {
    const admin = (method, url, body) => t.request(method, url, { body });
    const jo = (await admin('POST', '/admin/users', {
      name: 'Jo', password: 'temp-pass', must_change_password: true,
      campaigns: [{ campaign_id: t.campaign.id, role: 'player', character_name: 'Pip' }],
    })).json();
    assert.equal((await admin('GET', '/admin/users')).json().find((u) => u.id === jo.id).must_change_password, 1);

    // Logging in works, but the login can only see /me, change its password, or log out.
    const first = (await login(t, 'Jo', 'temp-pass')).json();
    assert.equal(first.user.must_change_password, 1);
    const as = first.token;
    const other = (await login(t, 'Jo', 'temp-pass')).json().token; // a second device
    assert.equal((await t.request('GET', '/me', { as })).json().user.must_change_password, 1);
    for (const [method, url, body] of [
      ['GET', `/campaigns/${t.campaign.id}`],
      ['GET', `/campaigns/${t.campaign.id}/notes`],
      ['POST', `/campaigns/${t.campaign.id}/notes`, { text: 'x' }],
      ['POST', `/campaigns/${t.campaign.id}/ask`, { question: 'x' }],
    ]) {
      const res = await t.request(method, url, { as, body });
      assert.equal(res.statusCode, 403, url);
      assert.match(res.json().error, /new password/);
    }

    // Changing it needs the right current password and a different new one.
    const change = (current_password, new_password, who = as) =>
      t.request('POST', '/account/password', { as: who, body: { current_password, new_password } });
    assert.equal((await change('wrong', 'my-own-pass')).statusCode, 400);
    assert.equal((await change('temp-pass', 'temp-pass')).statusCode, 400);
    assert.equal((await change('temp-pass', '123')).statusCode, 400);
    assert.equal((await change('temp-pass', 'my-own-pass')).statusCode, 200);

    // Done: this login now works normally, the other device was logged out, the old password is gone.
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/notes`, { as })).statusCode, 200);
    assert.equal((await t.request('GET', '/me', { as: other })).statusCode, 401);
    assert.equal((await login(t, 'Jo', 'temp-pass')).statusCode, 401);
    assert.equal((await login(t, 'Jo', 'my-own-pass')).json().user.must_change_password, 0);
    const archived = JSON.parse(fs.readFileSync(path.join(t.paths.archive, '_server', 'accounts.json'), 'utf8'));
    assert.equal(archived.find((u) => u.id === jo.id).must_change_password, 0);

    // The admin can switch it on for an existing login (takes effect immediately) and off again.
    await admin('PUT', `/admin/users/${jo.id}/must-change-password`, { must_change_password: true });
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}`, { as })).statusCode, 403);
    await admin('PUT', `/admin/users/${jo.id}/must-change-password`, { must_change_password: false });
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}`, { as })).statusCode, 200);

    // A reset by the admin can require it too.
    await admin('PUT', `/admin/users/${jo.id}/password`, { password: 'reset-pass', must_change_password: true });
    assert.equal((await login(t, 'Jo', 'reset-pass')).json().user.must_change_password, 1);
    await admin('PUT', `/admin/users/${jo.id}/password`, { password: 'reset-pass2' });
    assert.equal((await login(t, 'Jo', 'reset-pass2')).json().user.must_change_password, 0);

    // Anyone can change their own password any time; only admins can use the toggle.
    assert.equal((await change(PASSWORD, 'sams-new-pass', t.sam.token)).statusCode, 200);
    assert.equal((await t.request('PUT', `/admin/users/${jo.id}/must-change-password`, { as: t.sam.token, body: { must_change_password: true } })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('admin sessions view: uploads, processing state, notes matched by date, dates waiting for a transcript', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    const view = async () => (await t.request('GET', `/admin/campaigns/${cid}/sessions`)).json();
    let v = await view();
    assert.deepEqual([v.sessions.length, v.next_number, v.notes_waiting.length], [0, 1, 0]);
    assert.match(v.today, /^\d{4}-\d{2}-\d{2}$/);

    // Notes on two dates; only the first gets a transcript.
    for (const [as, date] of [[t.sam.token, '2026-10-01'], [t.alex.token, '2026-10-01'], [t.sam.token, '2026-10-01'], [t.sam.token, '2026-10-08']]) {
      await t.request('POST', `/campaigns/${cid}/notes`, { as, body: { text: 'note', session_date: date } });
    }
    const res = await t.request('POST', `/campaigns/${cid}/sessions`, {
      body: { number: 1, played_on: '2026-10-01', title: 'Brindle', transcript: SAMPLE + '\n[00:03:00] NewGuy: hello' },
    });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.json().unlinked_speakers, ['NewGuy']);
    assert.equal(res.json().player_notes, 3);
    await t.jobs.idle();

    v = await view();
    assert.equal(v.next_number, 2);
    const [s1] = v.sessions;
    assert.deepEqual([s1.number, s1.title, s1.played_on, s1.status, s1.notes, s1.note_authors], [1, 'Brindle', '2026-10-01', 'ready', 3, 2]);
    assert.equal(s1.job.status, 'done');
    assert.ok(s1.attendees >= 3);
    assert.deepEqual(v.notes_waiting, [{ date: '2026-10-08', notes: 1, authors: 1 }]);

    // Admin only.
    assert.equal((await t.request('GET', `/admin/campaigns/${cid}/sessions`, { as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test('upload preview lists speakers; links sent with the upload are saved before processing', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    t.store.setSpeakers(cid, [{ speaker: 'KennyDM', display_name: 'DM', user_id: t.dm.id }]); // only the DM is linked
    const transcript = SAMPLE_2 + '\n[00:02:00] Guest: hi all';

    const preview = (await t.request('POST', `/campaigns/${cid}/sessions/preview`, { body: { transcript } })).json();
    assert.equal(preview.lines, 4);
    assert.deepEqual([preview.first, preview.last], ['00:00:05', '00:02:00']);
    assert.deepEqual(preview.speakers, [
      { speaker: 'KennyDM', lines: 2, user_id: t.dm.id },
      { speaker: 'SamPlays', lines: 1, user_id: null },
      { speaker: 'Guest', lines: 1, user_id: null },
    ]);
    assert.equal((await t.request('POST', `/campaigns/${cid}/sessions/preview`, { body: { transcript: 'no timestamps here' } })).statusCode, 400);
    assert.equal((await t.request('POST', `/campaigns/${cid}/sessions/preview`, { as: t.sam.token, body: { transcript } })).statusCode, 403);

    // Links to accounts outside the campaign are refused.
    const bad = await t.request('POST', `/campaigns/${cid}/sessions`, {
      body: { number: 1, played_on: '2026-10-08', transcript, speakers: [{ speaker: 'Guest', user_id: 999 }] },
    });
    assert.equal(bad.statusCode, 400);
    assert.equal((await t.request('GET', `/campaigns/${cid}/sessions/1`)).statusCode, 404); // nothing was archived

    const res = await t.request('POST', `/campaigns/${cid}/sessions`, {
      body: { number: 2, played_on: '2026-10-08', transcript, speakers: [{ speaker: 'SamPlays', user_id: t.sam.id }, { speaker: 'Guest', user_id: null }] },
    });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.json().unlinked_speakers, ['Guest']);
    await t.jobs.idle();

    // The map was merged (the DM's link kept) and used for attendance: Sam and the DM were there, Alex wasn't.
    const map = Object.fromEntries(t.store.getSpeakers(cid).map((m) => [m.speaker, [m.display_name, m.user_id]]));
    assert.deepEqual(map, { KennyDM: ['DM', t.dm.id], SamPlays: ['Thorin (Sam)', t.sam.id], Guest: ['Guest', null] });
    const attendees = (await t.request('GET', `/campaigns/${cid}/sessions/2`)).json().attendees.map((a) => a.name).sort();
    assert.deepEqual(attendees, ['Kenny', 'Sam']);
  } finally {
    await t.cleanup();
  }
});

// ---------- sessions & archivist ----------

test('upload needs a date; transcripts are archived and never replaced', async () => {
  const t = await setup();
  try {
    const noDate = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, transcript: SAMPLE } });
    assert.equal(noDate.statusCode, 400);

    assert.equal((await upload(t)).statusCode, 201);
    const archived = path.join(t.paths.archive, t.campaign.slug, 'sessions', '0001', 'transcript.txt');
    assert.equal(fs.readFileSync(archived, 'utf8'), SAMPLE);

    const same = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    assert.equal(same.statusCode, 200);
    const different = await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, {
      body: { number: 1, played_on: '2026-10-01', transcript: `${SAMPLE}\n[00:03:00] KennyDM: extra` },
    });
    assert.equal(different.statusCode, 409);

    const text = await t.request('POST', `/campaigns/${t.campaign.id}/sessions?number=2&played_on=2026-10-08`, {
      body: SAMPLE_2,
      headers: { 'content-type': 'text/plain' },
    });
    assert.equal(text.statusCode, 201);
    await t.jobs.idle();
  } finally {
    await t.cleanup();
  }
});

test('archivist gets the transcript, notes, roster and attendance, and builds the knowledge base', async () => {
  const t = await setup();
  try {
    await t.store.setGlossary(t.campaign.id, [{ term: 'Brother Hal', variants: ['Brother Hall'] }]);
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, {
      as: t.sam.token,
      body: { text: 'Innkeeper is called Hal. Owes us nothing yet.', session_date: '2026-10-01' },
    });
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, {
      as: t.sam.token,
      body: { text: 'Note for a different day', session_date: '2026-09-01' },
    });

    const res = await upload(t);
    assert.equal(res.json().player_notes, 1);
    const s1 = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions/1`)).json();
    assert.equal(s1.session.status, 'ready', s1.session.error);
    assert.deepEqual(s1.attendees.map((a) => a.name).sort(), ['Alex', 'Kenny', 'Sam']);

    const run = t.llm.calls.find((c) => c.purpose === 'archivist:session 1');
    assert.match(run.system, /full authority over the campaign's knowledge base/);
    assert.match(run.prompt, /\[00:00:40\] DM: Brother Hal, the innkeeper/); // speaker map + glossary applied
    assert.match(run.prompt, /user \d+ \(Sam\): Innkeeper is called Hal/); // that day's notes, attributed
    assert.doesNotMatch(run.prompt, /different day/);
    assert.match(run.prompt, /user \d+ \| Sam \| player \| plays Thorin \| transcript name: SamPlays/);
    assert.match(run.prompt, /empty: the knowledge base is new/);

    const dump = (await t.request('GET', `/campaigns/${t.campaign.id}/kb`)).json();
    assert.equal(dump.guide, 'Kinds: npc, debt, story. Story is pinned.');
    assert.deepEqual(dump.records.map((r) => r.title).sort(), ['Brother Hal', 'Story so far']);

    const questions = (await t.request('GET', `/campaigns/${t.campaign.id}/questions`)).json();
    assert.equal(questions[0].question, 'Is it Brother Hal or Brother Hall?');

    // Snapshot of the run (report, journal, full knowledge base) in the archive.
    const outputs = path.join(t.paths.archive, t.campaign.slug, 'outputs', `v${PIPELINE_VERSION}`);
    const [snap] = fs.readdirSync(outputs);
    const journal = JSON.parse(fs.readFileSync(path.join(outputs, snap, 'journal.json'), 'utf8'));
    assert.deepEqual(journal.map((j) => j.op), ['guide', 'create', 'create']);

    // Second run sees the guide and pinned records it made.
    await upload(t, 2, SAMPLE_2, '2026-10-08');
    const run2 = t.llm.calls.find((c) => c.purpose === 'archivist:session 2');
    assert.match(run2.prompt, /<guide>\nKinds: npc, debt, story/);
    assert.match(run2.prompt, /<pinned_records>[\s\S]*Story so far/);
    assert.match(run2.prompt, /<open_questions_for_dm>\n- Is it Brother Hal or Brother Hall\?/);
  } finally {
    await t.cleanup();
  }
});

test('a failed session can be retried', async () => {
  let fail = true;
  const llm = createFakeLLM({
    archivist: async () => {
      if (fail) throw new Error('Claude Code not logged in');
      return 'ok';
    },
  });
  const t = await setup({ llm });
  try {
    await upload(t);
    let s = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions/1`)).json().session;
    assert.equal(s.status, 'failed');
    assert.equal(s.error, 'Claude Code not logged in');
    fail = false;
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/sessions/1/process`)).statusCode, 200);
    await t.jobs.idle();
    s = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions/1`)).json().session;
    assert.equal(s.status, 'ready');
  } finally {
    await t.cleanup();
  }
});

// ---------- player notes ----------

test('player notes are private, archived, and searchable only by their author', async () => {
  const llm = createFakeLLM({
    qaScript: [
      [{ tool: 'search_my_notes', input: { query: 'cellar trapdoor' } }, { answer: 'From your notes.' }],
      [{ tool: 'search_my_notes', input: { query: 'cellar trapdoor' } }, { answer: 'Nothing.' }],
      [{ tool: 'search_my_notes', input: { query: 'cellar trapdoor' } }, { answer: 'Nothing.' }],
    ],
  });
  const t = await setup({ llm });
  try {
    const created = await t.request('POST', `/campaigns/${t.campaign.id}/notes`, {
      as: t.sam.token,
      body: { text: 'Secret trapdoor in the cellar of the inn' },
    });
    assert.equal(created.statusCode, 201);
    const note = created.json();
    assert.match(note.session_date, /^\d{4}-\d{2}-\d{2}$/);

    // Only the author can list it. Not other players, not the DM.
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token })).json().length, 1);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/notes`, { as: t.alex.token })).json().length, 0);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/notes`)).json().length, 0);

    // Archived immediately.
    const file = path.join(t.paths.archive, t.campaign.slug, 'player-notes', `${note.session_date}.jsonl`);
    assert.match(fs.readFileSync(file, 'utf8'), /Secret trapdoor/);

    // Searchable in Q&A by the author only, even before any transcript exists.
    await ask(t, 'Where was the trapdoor?', t.sam.token);
    await ask(t, 'Where was the trapdoor?', t.alex.token);
    await ask(t, 'Where was the trapdoor?', t.dmToken);
    const [samCall, alexCall, dmCall] = llm.calls.filter((c) => c.purpose === 'qa');
    assert.match(samCall.toolResults[0].result, /Secret trapdoor/);
    assert.match(samCall.prompt, /automatic_search_results[\s\S]*Secret trapdoor/);
    assert.equal(alexCall.toolResults[0].result, 'No matching notes.');
    assert.doesNotMatch(alexCall.prompt, /trapdoor in the cellar/);
    assert.equal(dmCall.toolResults[0].result, 'No matching notes.');
  } finally {
    await t.cleanup();
  }
});

// ---------- privacy in Q&A ----------

test('players only see records and transcripts they should know about', async () => {
  const llm = createFakeLLM({
    qaScript: [
      // Sam was at session 2.
      [
        { tool: 'list_records', input: { kind: null, status: null } },
        { tool: 'read_transcript', input: { session: 2, from: '00:00:00', to: '00:02:00' } },
        { answer: 'The cult owes the Baron 200 gold [S2 00:01:00].' },
      ],
      // Alex missed session 2.
      [
        { tool: 'list_records', input: { kind: null, status: null } },
        { tool: 'search_kb', input: { query: 'Baron ledger gold', kind: null } },
        { tool: 'search_transcript', input: { query: 'ledger Baron', from_session: null, to_session: null } },
        { tool: 'read_transcript', input: { session: 2, from: '00:00:00', to: '00:02:00' } },
        { answer: 'Something [S2 00:01:00].' },
      ],
    ],
  });
  const t = await setup({ llm });
  try {
    await upload(t, 1);
    await upload(t, 2, SAMPLE_2, '2026-10-08'); // AlexR doesn't speak: Alex absent

    const s2 = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions/2`)).json();
    assert.deepEqual(s2.attendees.map((a) => a.name).sort(), ['Kenny', 'Sam']);
    const debt = t.db.prepare("SELECT known_by FROM kb_records WHERE kind = 'debt'").get();
    assert.deepEqual(JSON.parse(debt.known_by), [t.dm.id, t.sam.id]);

    const samEvents = await ask(t, 'What did the ledger say?', t.sam.token);
    const alexEvents = await ask(t, 'What did the ledger say?', t.alex.token);
    const [samCall, alexCall] = llm.calls.filter((c) => c.purpose === 'qa');

    assert.match(samCall.toolResults[0].result, /The cult owes the Baron 200 gold/);
    assert.match(samCall.toolResults[1].result, /Thorin finds a ledger/);
    assert.equal(samEvents.at(-1).data.evidence[0].source, 'S2 00:01:00');

    assert.doesNotMatch(alexCall.toolResults[0].result, /Baron/);
    assert.doesNotMatch(alexCall.toolResults[1].result, /Baron/);
    assert.doesNotMatch(alexCall.toolResults[2].result, /ledger/);
    assert.match(alexCall.toolResults[3].result, /wasn't at session 2/);
    assert.doesNotMatch(alexCall.prompt, /Baron/);
    assert.deepEqual(alexEvents.at(-1).data.evidence, []);

    // Pinned records (visible to everyone) reach both.
    assert.match(alexCall.system, /<pinned_records>[\s\S]*Story so far/);
    assert.match(alexCall.system, /You are answering: Alex, who plays Lyra/);
    // General D&D questions are answered from the model's own knowledge; answers may use markdown/HTML.
    assert.match(alexCall.system, /General D&D knowledge/);
    assert.match(alexCall.system, /class="stat-block"/);

    // Transcript endpoint follows attendance too.
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sessions/2/transcript`, { as: t.alex.token })).statusCode, 403);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sessions/2/transcript`, { as: t.sam.token })).statusCode, 200);
    const sessions = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions`, { as: t.alex.token })).json();
    assert.deepEqual(sessions.map((s) => s.attended), [true, false]);
  } finally {
    await t.cleanup();
  }
});

// ---------- corrections & questions ----------

test('DM corrections and answers to archivist questions are applied by the archivist', async () => {
  const t = await setup();
  try {
    await upload(t);
    const res = await t.request('POST', `/campaigns/${t.campaign.id}/corrections`, { body: { text: "The innkeeper's name is Brother Hal." } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().correction.after_session, 1);
    await t.jobs.idle();

    const run = t.llm.calls.find((c) => c.purpose.startsWith('archivist:correction'));
    assert.match(run.prompt, /<dm_correction id="1">\nThe innkeeper's name is Brother Hal\./);
    assert.equal(t.db.prepare("SELECT title FROM kb_records WHERE kind = 'npc'").get().title, 'Brother Hal (corrected)');
    assert.match(fs.readFileSync(path.join(t.paths.archive, t.campaign.slug, 'corrections.jsonl'), 'utf8'), /Brother Hal/);

    const [q] = (await t.request('GET', `/campaigns/${t.campaign.id}/questions?status=open`)).json();
    const answered = await t.request('POST', `/campaigns/${t.campaign.id}/questions/${q.id}/answer`, { body: { answer: 'Brother Hal.' } });
    assert.match(answered.json().correction.text, /You asked: Is it Brother Hal or Brother Hall\?[\s\S]*The DM's answer: Brother Hal\./);
    await t.jobs.idle();
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/questions?status=open`)).json().length, 0);
    assert.equal(t.llm.calls.filter((c) => c.purpose.startsWith('archivist:correction')).length, 2);
  } finally {
    await t.cleanup();
  }
});

test('rebuild wipes the knowledge base and replays sessions and corrections in order', async () => {
  const t = await setup();
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: 'trapdoor note', session_date: '2026-10-01' } });
    await upload(t, 1);
    await t.request('POST', `/campaigns/${t.campaign.id}/corrections`, { body: { text: 'Fix after session 1' } });
    await t.jobs.idle();
    await upload(t, 2, SAMPLE_2, '2026-10-08');
    const before = t.db.prepare('SELECT COUNT(*) AS n FROM kb_records').get().n;

    t.llm.calls.length = 0;
    t.jobs.enqueueRebuild(t.campaign.id);
    await t.jobs.idle();

    assert.deepEqual(
      t.llm.calls.map((c) => c.purpose),
      ['archivist:session 1', 'archivist:correction 1', 'archivist:session 2'],
    );
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM kb_records').get().n, before);
    assert.equal(t.db.prepare("SELECT title FROM kb_records WHERE kind = 'npc'").get().title, 'Brother Hal (corrected)');
    // Player notes are re-indexed.
    assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind = 'note'").get().n, 1);
    const jobsList = (await t.request('GET', `/campaigns/${t.campaign.id}/jobs`)).json();
    assert.equal(jobsList[0].status, 'done', jobsList[0].error);
  } finally {
    await t.cleanup();
  }
});

// ---------- Q&A ----------

test('Q&A pre-searches, cites transcript evidence, and remembers the conversation', async () => {
  const llm = createFakeLLM({
    qaScript: [
      [
        { tool: 'search_kb', input: { query: 'innkeeper', kind: null } },
        { answer: 'Brother Hal is the innkeeper [S1 00:00:40]. He gave you a key [S1 00:01:30-00:02:00] [S1].' },
      ],
      [{ answer: 'The cult hides in the old mill [S1].' }],
    ],
  });
  const t = await setup({ llm });
  try {
    await upload(t);
    const events = await ask(t, 'Who is the innkeeper?', t.sam.token);
    const done = events.find((e) => e.event === 'done').data;
    assert.deepEqual(events.filter((e) => e.event === 'tool').map((e) => e.data.name), ['search_kb']);
    assert.ok(done.durationMs >= 0);

    const qaCall = llm.calls.find((c) => c.purpose === 'qa');
    assert.match(qaCall.prompt, /Question: Who is the innkeeper\?\n\n<automatic_search_results[\s\S]*Brother Hal/);
    assert.match(qaCall.toolResults[0].result, /#\d+ Brother Hal/);
    assert.match(qaCall.system, /<archivist_guide>\nKinds: npc, debt, story/);

    assert.deepEqual(done.evidence.map((e) => e.source), ['S1 00:00:40', 'S1 00:01:30-00:02:00', 'S1']);
    assert.match(done.evidence[0].excerpt, /^\[00:00:40\] DM: Brother Hall, the innkeeper/);
    assert.equal(done.evidence[1].excerpt.split('\n').length, 2);

    await t.request('POST', `/campaigns/${t.campaign.id}/ask`, {
      as: t.sam.token,
      body: { question: 'And the cult?', conversationId: done.conversationId },
    });
    const followUp = llm.calls.filter((c) => c.purpose === 'qa').at(-1);
    assert.match(followUp.prompt, /earlier_in_this_conversation[\s\S]*Brother Hal is the innkeeper[\s\S]*Sources cited/);

    // Conversations are per user.
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/conversations/${done.conversationId}`, { as: t.alex.token })).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test('players can pin and delete their own conversations; deleting erases them but still counts toward the limit', async () => {
  const t = await setup({ config: { qa: { questionsPerUserPerHour: 3 } } });
  try {
    const conv = (events) => events.find((e) => e.event === 'done').data.conversationId;
    const url = (id = '') => `/campaigns/${t.campaign.id}/conversations${id === '' ? '' : `/${id}`}`;
    const first = conv(await ask(t, 'Who is Brother Hal?', t.sam.token));
    const second = conv(await ask(t, 'Where is the mill?', t.sam.token));

    // Newest first, until one is pinned.
    let list = (await t.request('GET', url(), { as: t.sam.token })).json();
    assert.deepEqual(list.map((c) => [c.id, c.pinned]), [[second, false], [first, false]]);
    assert.equal((await t.request('PATCH', url(first), { as: t.sam.token, body: { pinned: true } })).json().pinned, true);
    list = (await t.request('GET', url(), { as: t.sam.token })).json();
    assert.deepEqual(list.map((c) => [c.id, c.pinned]), [[first, true], [second, false]]);
    assert.equal((await t.request('PATCH', url(first), { as: t.sam.token, body: { title: 'The innkeeper' } })).json().title, 'The innkeeper');

    // Only the owner can pin, delete or continue it.
    assert.equal((await t.request('PATCH', url(first), { as: t.alex.token, body: { pinned: false } })).statusCode, 404);
    assert.equal((await t.request('DELETE', url(first), { as: t.alex.token })).statusCode, 404);

    // Deleting hides it and erases what was said...
    assert.equal((await t.request('DELETE', url(first), { as: t.sam.token })).statusCode, 200);
    assert.deepEqual((await t.request('GET', url(), { as: t.sam.token })).json().map((c) => c.id), [second]);
    assert.equal((await t.request('GET', url(first), { as: t.sam.token })).statusCode, 404);
    assert.equal((await t.request('DELETE', url(first), { as: t.sam.token })).statusCode, 404);
    const rows = t.db.prepare('SELECT question, answer FROM qa_log WHERE conversation_id = ?').all(first);
    assert.deepEqual(rows, [{ question: '', answer: null }]);
    assert.equal(t.db.prepare('SELECT title FROM conversations WHERE id = ?').get(first).title, null);
    const followUp = await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { as: t.sam.token, body: { question: 'More?', conversationId: first } });
    assert.match(followUp.body, /Conversation not found/);

    // ...but it still counts toward the hourly limit (2 asked + 1 more = 3).
    await ask(t, 'One more?', t.sam.token);
    const limited = await ask(t, 'And another?', t.sam.token);
    assert.match(limited.find((e) => e.event === 'error').data.error, /questions in the last hour/);
  } finally {
    await t.cleanup();
  }
});

test('Q&A streams over a real HTTP connection and closes when done', async () => {
  const llm = createFakeLLM({ qaScript: [[{ tool: 'list_sessions', input: {} }, { answer: 'One session so far [S1].' }]] });
  const t = await setup({ llm });
  try {
    await upload(t);
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = t.app.server.address();
    const res = await fetch(`http://127.0.0.1:${port}/campaigns/${t.campaign.id}/ask`, {
      method: 'POST',
      headers: { authorization: `Bearer ${t.dmToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'How many sessions?' }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const events = parseSse(await res.text()); // resolves only if the server ends the stream
    assert.deepEqual(events.map((e) => e.event), ['conversation', 'turn', 'tool', 'text', 'done']);
  } finally {
    await t.cleanup();
  }
});

// ---------- restore ----------

test('accounts, campaigns, notes and corrections are restored from the archive', async () => {
  const t = await setup();
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: 'my private note', session_date: '2026-10-01' } });
    await upload(t);
    await t.request('POST', `/campaigns/${t.campaign.id}/corrections`, { body: { text: 'a correction' } });
    await t.jobs.idle();

    const fresh = await createContext({
      config: t.config,
      paths: { ...t.paths, db: path.join(t.dir, 'fresh.sqlite') },
      llm: createFakeLLM(),
      embedder: fakeEmbedder,
    });
    try {
      assert.deepEqual(fresh.restored, [t.campaign.slug]);
      // Passwords still work and keep the same user ids, so note ownership holds.
      assert.equal((await fresh.auth.login('Sam', PASSWORD)).user.id, t.sam.id);
      const c = fresh.db.prepare('SELECT id FROM campaigns').get();
      assert.equal(fresh.auth.membership(c.id, t.sam.id).character_name, 'Thorin');
      assert.equal(fresh.store.playerNotes(c.id, { userId: t.sam.id })[0].text, 'my private note');
      assert.equal(fresh.store.getCorrections(c.id)[0].text, 'a correction');
      assert.equal(fresh.store.getSpeakers(c.id).find((s) => s.speaker === 'SamPlays').user_id, t.sam.id);
      assert.equal(fresh.db.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind = 'note'").get().n, 1);
    } finally {
      fresh.db.close();
    }
  } finally {
    await t.cleanup();
  }
});

test('dice: the server rolls for people in the campaign; advantage keeps the higher d20', async () => {
  const t = await setup();
  try {
    const roll = (body, as = t.sam.token) => t.request('POST', `/campaigns/${t.campaign.id}/roll`, { body, as });
    const res = await roll({ notation: '2d6 + 3' });
    assert.equal(res.statusCode, 200);
    const r = res.json();
    assert.equal(r.notation, '2d6+3');
    assert.equal(r.terms[0].dice.length, 2);
    for (const d of r.terms[0].dice) assert.ok(d.value >= 1 && d.value <= 6);
    assert.equal(r.total, r.terms[0].dice[0].value + r.terms[0].dice[1].value + 3);

    // Every face comes up, and nothing outside 1..20.
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      const { total, natural } = (await roll({ notation: '1d20' })).json();
      assert.ok(total >= 1 && total <= 20);
      assert.equal(natural, total);
      seen.add(total);
    }
    assert.equal(seen.size, 20);

    for (let i = 0; i < 30; i++) {
      const adv = (await roll({ notation: '1d20+1', mode: 'advantage' })).json();
      const [a, b] = adv.terms[0].dice;
      assert.equal(adv.mode, 'advantage');
      assert.equal(adv.natural, Math.max(a.value, b.value));
      assert.equal(adv.total, adv.natural + 1);
      assert.equal([a, b].filter((d) => d.kept).length, 1);
    }

    const bad = await roll({ notation: '1d7' });
    assert.equal(bad.statusCode, 400);
    assert.match(bad.json().error, /d7/);
    assert.equal((await roll({ notation: '1d20', mode: 'cheat' })).statusCode, 400);

    // Only people in the campaign.
    await t.auth.createUser('Outsider', { password: PASSWORD });
    const { token } = await t.auth.login('Outsider', PASSWORD);
    assert.equal((await roll({ notation: '1d20' }, token)).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});
