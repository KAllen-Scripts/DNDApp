// Manual end-to-end privacy scenario against a REAL running server (uses real AI calls).
// Fresh data dir, then: npm run admin -- init "Host" "host-password"   (setup creates campaign 1 and the accounts)
// Phases, in order: setup, upload1, (wait for status: ready), upload2, (wait), kb, ask
//   node drive.mjs <adminName> <adminPassword> <phase>   env DND_SERVER overrides http://127.0.0.1:4400
// Expected: Sam (Thorin) is told 10 gp is still owed and sees his own note clues; Alex (Lyra, absent
// from session 2) is told 20 gp, sees only the ash whisper, and cannot learn what was in the mill.

const [adminName, adminPassword, phase] = process.argv.slice(2);
const server = process.env.DND_SERVER ?? 'http://127.0.0.1:4400';
const base = `${server}/campaigns/1`;
const login = async (name, password) => {
  const res = await fetch(`${server}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password }) });
  const j = await res.json();
  if (!res.ok) throw new Error(`login ${name}: ${j.error}`);
  return j.token;
};
const token = await login(adminName, adminPassword);
const fs = await import('node:fs');
const dir = new URL('.', import.meta.url);
const state = fs.existsSync(new URL('state.json', dir)) ? JSON.parse(fs.readFileSync(new URL('state.json', dir))) : {};
const call = async (method, path, body, as = token, raw = false) => {
  const res = await fetch((path.startsWith('/admin') ? server : base) + path, { method, headers: { authorization: `Bearer ${as}`, ...(body && { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' }) }, body: typeof body === 'string' ? body : body && JSON.stringify(body) });
  if (raw) return res.text();
  const j = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j)}`);
  return j;
};
const save = () => fs.writeFileSync(new URL('state.json', dir), JSON.stringify(state, null, 2));

if (phase === 'setup') {
  const campaign = await call('POST', '/admin/campaigns', { name: 'Privacy Test' });
  if (campaign.id !== 1) throw new Error('Use a fresh data dir: this script expects campaign 1');
  const account = async (name, password, role, character_name = null) => {
    const user = await call('POST', '/admin/users', { name, password });
    await call('PUT', `/admin/campaigns/1/members/${user.id}`, { role, character_name });
    return user;
  };
  const dm = await account('Dee', 'dee-password', 'dm');
  const samUser = await account('Sam', 'sam-password', 'player', 'Thorin');
  const alexUser = await account('Alex', 'alex-password', 'player', 'Lyra');
  const sam = { user: samUser, token: await login('Sam', 'sam-password') };
  const alex = { user: alexUser, token: await login('Alex', 'alex-password') };
  state.sam = { id: sam.user.id, password: 'sam-password' };
  state.alex = { id: alex.user.id, password: 'alex-password' };
  await call('PUT', '/speakers', [
    { speaker: 'KennyDM', display_name: 'DM', user_id: dm.id },
    { speaker: 'SamPlays', display_name: 'Thorin (Sam)', user_id: sam.user.id },
    { speaker: 'AlexR', display_name: 'Lyra (Alex)', user_id: alex.user.id },
  ]);
  await call('PUT', '/glossary', [{ term: 'Brother Hal', variants: ['Brother Hall'] }]);
  await call('POST', '/notes', { text: 'Hal winked at me when he handed over the key. Hiding something? Key has a flame rune on it.', session_date: '2026-10-01' }, sam.token);
  await call('POST', '/notes', { text: 'DM whispered: ash on Hal\'s sleeve!! Hal might be in the cult. Not telling the others yet.', session_date: '2026-10-01' }, alex.token);
  save();
  console.log('setup done', state);
}
if (phase === 'upload1') console.log(await call('POST', '/sessions?number=1&played_on=2026-10-01', fs.readFileSync(new URL('session-1.txt', dir), 'utf8')));
if (phase === 'upload2') console.log(await call('POST', '/sessions?number=2&played_on=2026-10-08', fs.readFileSync(new URL('session-2.txt', dir), 'utf8')));
if (phase === 'status') {
  console.log(await call('GET', '/sessions'));
  console.log((await call('GET', '/jobs')).slice(0, 3).map((j) => `${j.id} ${j.type} ${j.status} ${Math.round(j.progress * 100)}% ${j.message ?? ''} ${j.error ?? ''}`));
}
if (phase === 'kb') {
  const kb = await call('GET', '/kb');
  console.log('GUIDE:\n' + kb.guide + '\n');
  for (const r of kb.records) console.log(`#${r.id} [${r.kind}] ${r.title} | status=${r.status || '-'} | known_by=${r.known_by == null ? 'everyone' : r.known_by.join(',')}${r.pinned ? ' | PINNED' : ''}\n   ${r.body.replace(/\n/g, ' ').slice(0, 220)}\n   data=${JSON.stringify(r.data)}`);
  console.log('\nQUESTIONS:', (await call('GET', '/questions')).map((q) => q.question));
}
if (phase === 'ask') {
  const qs = [
    ['sam', 'How much do we still owe Brother Hal?'],
    ['alex', 'How much do we still owe Brother Hal?'],
    ['alex', 'Is there anything suspicious about Brother Hal?'],
    ['sam', 'Is there anything suspicious about Brother Hal?'],
    ['alex', 'What was in the mill?'],
  ];
  for (const who of ['sam', 'alex']) state[who].token = await login(who, state[who].password);
  for (const [who, q] of qs) {
    const t0 = Date.now();
    const body = await call('POST', '/ask', { question: q }, state[who].token, true);
    const events = body.split('\n\n').filter((b) => b.startsWith('event:')).map((b) => { const [e, d] = b.split('\n'); return { e: e.slice(7), d: JSON.parse(d.slice(6)) }; });
    const done = events.find((x) => x.e === 'done')?.d;
    const tools = events.filter((x) => x.e === 'tool').map((x) => x.d.name);
    console.log(`\n=== ${who.toUpperCase()} asks: ${q}  (${Date.now() - t0}ms, tools: ${tools.join(', ') || 'none'})\n${done?.answer ?? JSON.stringify(events.find((x) => x.e === 'error')?.d)}`);
  }
}
