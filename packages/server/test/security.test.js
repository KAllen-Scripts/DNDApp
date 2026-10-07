import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { setup, createFakeLLM, terrain, SAMPLE, PASSWORD } from './helpers.js';
import { publicMessage, exposureWarnings, SECURITY_HEADERS } from '../src/app.js';
import { inspectPicture } from '../src/characters/pictures.js';
import { LLMError } from '../src/llm/index.js';

const login = (t, name, password, ip = '127.0.0.1', headers = {}) =>
  t.app.inject({ method: 'POST', url: '/login', payload: { name, password }, remoteAddress: ip, headers });

const mapLLM = () =>
  createFakeLLM({
    structured: () => ({
      readable: true,
      kind: 'battle',
      name: 'Clearing',
      description: 'A trapdoor under the well.',
      grid: { visible: false, columns: null, rows: null },
      scale: { distance: null, unit: null, per: null },
      notes: '',
    }),
  });

/** A shown map, plus a live stream of its updates for `token`. */
async function liveMap(t, token) {
  const base = `/campaigns/${t.campaign.id}/maps`;
  const created = await t.request('POST', base, { body: { filename: 'clearing.png', data: (await terrain(200, 200)).toString('base64') } });
  assert.equal(created.statusCode, 201, created.body);
  const map = created.json();
  for (let i = 0; t.maps.get(t.campaign.id, map.id).reading.status === 'pending' && i < 200; i++) await new Promise((r) => setTimeout(r, 20));
  await t.request('PATCH', `${base}/${map.id}`, { body: { shown: true } });
  if (!t.app.server.listening) await t.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = t.app.server.address();
  const res = await fetch(`http://127.0.0.1:${port}${base}/events`, { headers: { authorization: `Bearer ${token}` } });
  return { map, base, res, reader: res.ok ? res.body.pipeThrough(new TextDecoderStream()).getReader() : null };
}

/** The next event of a stream, or 'closed' once the server ends it. */
async function nextEvent(stream) {
  stream.text ??= '';
  for (;;) {
    const m = /event: (\w+)\ndata: (.*)\n\n/.exec(stream.text);
    if (m) {
      stream.text = stream.text.slice(m.index + m[0].length);
      return { event: m[1], data: JSON.parse(m[2]) };
    }
    const { value, done } = await stream.reader.read();
    if (done) return 'closed';
    stream.text += value;
  }
}

test('security headers: the page and the API forbid framing, outside scripts and sniffing', async () => {
  const t = await setup();
  try {
    for (const res of [await t.app.inject({ method: 'GET', url: '/' }), await t.request('GET', '/me'), await t.app.inject({ method: 'GET', url: '/me' })]) {
      assert.equal(res.headers['content-security-policy'], SECURITY_HEADERS['Content-Security-Policy']);
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['referrer-policy'], 'no-referrer');
      assert.match(res.headers['strict-transport-security'], /max-age=\d+/); // PUBLIC_URL is https
    }
    const csp = SECURITY_HEADERS['Content-Security-Policy'];
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
  } finally {
    await t.cleanup();
  }
  const plain = await setup({ config: { publicUrl: 'http://192.168.1.5:4400' } });
  try {
    assert.equal((await plain.request('GET', '/me')).headers['strict-transport-security'], undefined);
  } finally {
    await plain.cleanup();
  }
});

test('body limits: logins and ordinary requests are small; uploads may be big', async () => {
  const t = await setup();
  try {
    const big = 'x'.repeat(1.5 * 1024 * 1024);
    assert.equal((await t.app.inject({ method: 'POST', url: '/login', payload: { name: 'Sam', password: 'x'.repeat(20_000) } })).statusCode, 413);
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/notes`, { as: t.sam.token, body: { text: big } })).statusCode, 413);
    // Without a login, a big body is refused before it is read.
    assert.equal((await t.app.inject({ method: 'POST', url: `/campaigns/${t.campaign.id}/notes`, payload: { text: big } })).statusCode, 401);
    // A long transcript is still fine.
    const transcript = `${SAMPLE}\n${Array.from({ length: 25_000 }, (_, i) => `[01:${String(i % 60).padStart(2, '0')}:00] KennyDM: The rain keeps falling on the road north, line ${i}.`).join('\n')}`;
    assert.ok(transcript.length > 1.5 * 1024 * 1024);
    assert.equal((await t.request('POST', `/campaigns/${t.campaign.id}/sessions/preview`, { body: { transcript } })).statusCode, 200);
  } finally {
    await t.cleanup();
  }
});

test('errors: unexpected server errors say nothing about the host machine; AI errors still explain themselves', async () => {
  const fsError = Object.assign(new Error("ENOENT: no such file or directory, open 'C:\\Users\\Kenny\\DNDApp\\data\\archive\\x'"), { code: 'ENOENT', path: 'C:\\Users\\Kenny' });
  assert.doesNotMatch(publicMessage(fsError), /Kenny|ENOENT/);
  assert.doesNotMatch(publicMessage(Object.assign(new Error('no such table: maps'), { code: 'SQLITE_ERROR' })), /table/);
  assert.doesNotMatch(publicMessage(new TypeError("Cannot read properties of undefined (reading 'x')")), /undefined/);
  assert.equal(publicMessage(new LLMError('maps: Claude Code failed (overloaded).')), 'maps: Claude Code failed (overloaded).');

  const t = await setup({
    llm: createFakeLLM({
      structured: () => {
        throw fsError;
      },
    }),
  });
  try {
    const res = await t.request('POST', `/campaigns/${t.campaign.id}/maps`, { body: { filename: 'x.png', data: (await terrain(100, 100)).toString('base64') } });
    assert.equal(res.statusCode, 201);
    // The map couldn't be read; the DM is told so without the details.
    let reading;
    for (let i = 0; (reading = t.maps.get(t.campaign.id, res.json().id).reading).status === 'pending' && i < 200; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(reading.status, 'failed');
    assert.doesNotMatch(reading.error, /Kenny|ENOENT/);
    // Asking a question that hits a broken database reports a general error.
    t.qa.ask = async () => {
      throw fsError;
    };
    const body = (await t.request('POST', `/campaigns/${t.campaign.id}/ask`, { as: t.sam.token, body: { question: 'Hi?' } })).body;
    assert.match(body, /event: error/);
    assert.doesNotMatch(body, /Kenny|ENOENT/);
    // An ordinary route failing the same way.
    t.sheets.get = () => {
      throw fsError;
    };
    const sheet = await t.request('GET', `/campaigns/${t.campaign.id}/sheet`, { as: t.sam.token });
    assert.equal(sheet.statusCode, 500);
    assert.doesNotMatch(sheet.json().error, /Kenny|ENOENT/);
  } finally {
    await t.cleanup();
  }
});

test('logins: guesses from one address are limited across names; the per-name lock still applies', async () => {
  const t = await setup({ config: { auth: { loginDays: 30, maxFailedLogins: 10, maxFailedLoginsPerAddress: 4 } } });
  try {
    for (const name of ['Sam', 'Alex', 'Kenny', 'Nobody']) assert.equal((await login(t, name, 'guess', '203.0.113.5')).statusCode, 401);
    // That address is now refused, even with the right password...
    assert.equal((await login(t, 'Sam', PASSWORD, '203.0.113.5')).statusCode, 429);
    // ...but Sam can still log in from elsewhere.
    assert.equal((await login(t, 'Sam', PASSWORD, '198.51.100.9')).statusCode, 200);
    // A forwarded address is only believed from a proxy on this machine (a tunnel), so outsiders can't dodge the limit.
    assert.equal((await login(t, 'Sam', PASSWORD, '203.0.113.5', { 'x-forwarded-for': '192.0.2.1' })).statusCode, 429);
    for (let i = 0; i < 4; i++) await login(t, 'Nobody', 'guess', '127.0.0.1', { 'x-forwarded-for': '192.0.2.50' });
    assert.equal((await login(t, 'Alex', PASSWORD, '127.0.0.1', { 'x-forwarded-for': '192.0.2.50' })).statusCode, 429);
    assert.equal((await login(t, 'Alex', PASSWORD, '127.0.0.1', { 'x-forwarded-for': '192.0.2.51' })).statusCode, 200);
  } finally {
    await t.cleanup();
  }
});

test('live map updates stop when a player is blocked or removed, and follow role changes', async () => {
  const t = await setup({ llm: mapLLM() });
  try {
    // Alex is blocked: their open stream ends at the next update instead of carrying on.
    const alex = await liveMap(t, t.alex.token);
    t.auth.revoke(t.alex.id);
    await t.request('PATCH', `${alex.base}/${alex.map.id}`, { body: { name: 'Renamed' } });
    assert.equal(await nextEvent(alex), 'closed');

    // Sam is the DM for a while: their stream shows what the DM sees, and stops doing so once they're a player again.
    t.auth.addMember(t.campaign.id, t.sam.id, 'dm');
    const sam = await liveMap(t, t.sam.token);
    await t.request('PATCH', `${sam.base}/${sam.map.id}`, { body: { name: 'One' } });
    assert.equal((await nextEvent(sam)).data.description, 'A trapdoor under the well.');
    t.auth.addMember(t.campaign.id, t.sam.id, 'player', 'Thorin');
    await t.request('PATCH', `${sam.base}/${sam.map.id}`, { body: { name: 'Two' } });
    const update = await nextEvent(sam);
    assert.equal(update.data.name, 'Two');
    assert.equal(update.data.description, '');
    // Removed from the campaign: the stream ends.
    t.auth.removeMember(t.campaign.id, t.sam.id);
    await t.request('PATCH', `${sam.base}/${sam.map.id}`, { body: { name: 'Three' } });
    assert.equal(await nextEvent(sam), 'closed');
  } finally {
    await t.cleanup();
  }
});

test('live streams: one login can only hold a few open at once', async () => {
  const t = await setup({ llm: mapLLM(), config: { maxStreamsPerUser: 2 } });
  try {
    const first = await liveMap(t, t.sam.token);
    const second = await liveMap(t, t.sam.token);
    assert.equal((await liveMap(t, t.sam.token)).res.status, 429);
    const alex = await liveMap(t, t.alex.token);
    assert.equal(alex.res.status, 200); // others aren't affected
    // Closing one makes room again.
    await first.reader.cancel();
    await new Promise((r) => setTimeout(r, 100));
    const again = await liveMap(t, t.sam.token);
    assert.equal(again.res.status, 200);
    for (const s of [second, alex, again]) await s.reader.cancel();
  } finally {
    await t.cleanup();
  }
});

test("processing errors: players only learn that processing failed; the DM sees why", async () => {
  const t = await setup();
  try {
    await t.request('POST', `/campaigns/${t.campaign.id}/sessions`, { body: { number: 1, played_on: '2026-10-01', transcript: SAMPLE } });
    await t.jobs.idle();
    const detail = "EACCES: permission denied, open 'C:\\Users\\Kenny\\data'";
    t.db.prepare('UPDATE sessions SET status = ?, error = ?').run('failed', detail);
    t.db.prepare('UPDATE jobs SET status = ?, error = ?').run('failed', detail);
    const player = (await t.request('GET', `/campaigns/${t.campaign.id}/sessions`, { as: t.sam.token })).json()[0];
    assert.equal(player.error, 'Processing failed.');
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sessions/1`, { as: t.sam.token })).json().session.error, 'Processing failed.');
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/jobs`, { as: t.sam.token })).json()[0].error, 'Processing failed.');
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/sessions`)).json()[0].error, detail);
    assert.equal((await t.request('GET', `/campaigns/${t.campaign.id}/jobs`)).json()[0].error, detail);
  } finally {
    await t.cleanup();
  }
});

/** A tiny PNG file whose header claims it is width × height (a "decompression bomb"). */
function claimedPng(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(10))), chunk('IEND', Buffer.alloc(0))]);
}

test('pictures: a small file claiming an enormous size is refused before it is opened', async () => {
  await assert.rejects(inspectPicture(claimedPng(15_000, 9_000)), /too many pixels/);
  const ok = await inspectPicture(claimedPng(4000, 3000));
  assert.equal(ok.width, 4000);
});

test('start-up warns when the server is reachable without https', () => {
  assert.deepEqual(exposureWarnings({ host: '127.0.0.1', publicUrl: 'https://dnd.example.xyz' }), []);
  const open = exposureWarnings({ host: '0.0.0.0', publicUrl: 'http://203.0.113.5:4400' });
  assert.equal(open.length, 2);
  assert.match(open[0], /HOST is 0\.0\.0\.0/);
  assert.match(open[1], /isn't https/);
});
