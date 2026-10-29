/**
 * Recording sessions from Discord (src/recording/): the Ogg files the bot
 * saves, turning speech into a transcript, the recordings store, the Sessions
 * tab's routes and the bot itself (with a fake Discord, test/fake-discord.js).
 * Speech-to-text is the fake engine: no model is downloaded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { parseTranscript } from '@dndapp/shared';
import { setup } from './helpers.js';
import { fakeDiscord, opusPackets } from './fake-discord.js';
import { createOggOpusWriter, readOggOpus, opusSamples } from '../src/recording/ogg.js';
import { decodeOggOpus, wavBuffer, RATE } from '../src/recording/audio.js';
import { buildTranscript, isHallucination, namesPrompt, speakerName, transcribeClips } from '../src/recording/transcribe.js';
import { createEngine, fakeEngine } from '../src/recording/engines.js';
import { startDiscordBot } from '../src/recording/discord-bot.js';

const settle = async (n = 30) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

function oggOf(packets) {
  const parts = [];
  const w = createOggOpusWriter((b) => parts.push(b));
  for (const p of packets) w.packet(p);
  w.end();
  return Buffer.concat(parts);
}

test('recording: Ogg Opus files round-trip, and decode to 16 kHz mono', () => {
  const packets = opusPackets(50); // 1 second
  assert.equal(opusSamples(packets[0]), 960);
  const file = oggOf(packets);
  assert.equal(file.toString('latin1', 0, 4), 'OggS');
  const back = readOggOpus(file);
  assert.equal(back.channels, 2);
  assert.deepEqual(back.packets.map((p) => p.toString('hex')), packets.map((p) => p.toString('hex')));
  const audio = decodeOggOpus(file);
  assert.equal(audio.length, RATE);
  assert.ok(Math.max(...audio.slice(4000, 8000)) > 0.1, 'the tone is there');
  const wav = wavBuffer(audio);
  assert.equal(wav.toString('latin1', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), RATE);
  assert.equal(wav.length, 44 + RATE * 2);
});

test('recording: pieces become a transcript in the upload format, in time order', () => {
  const text = buildTranscript([
    { speaker: 'sam_plays', clip: 2, at_ms: 65_000, text: 'Thorin draws his axe.' },
    { speaker: 'kenny', clip: 1, at_ms: 5_000, text: 'Welcome back.' },
    { speaker: 'kenny', clip: 1, at_ms: 7_500, text: 'You arrive at dusk.' },
    { speaker: 'kenny', clip: 3, at_ms: 3_725_000, text: 'Thanks for watching!' },
    { speaker: 'Weird: Name', clip: 4, at_ms: 70_000, text: ' Hello   there ' },
  ]);
  assert.equal(text, '[00:00:05] kenny: Welcome back. You arrive at dusk.\n[00:01:05] sam_plays: Thorin draws his axe.\n[00:01:10] Weird Name: Hello there\n');
  const { utterances } = parseTranscript(text);
  assert.deepEqual(utterances.map((u) => [u.time, u.speaker]), [[5, 'kenny'], [65, 'sam_plays'], [70, 'Weird Name']]);
  assert.ok(isHallucination('Thank you for watching.'));
  assert.ok(isHallucination('[BLANK_AUDIO]'));
  assert.ok(!isHallucination('Thank you, innkeeper.'));
  assert.equal(speakerName(''), 'Unknown');
});

test('recording: the prompt names the campaign, its characters and glossary terms, and stays short', () => {
  const prompt = namesPrompt({ campaignName: 'Lanterns of Saltreach', characters: ['Wren', null, 'Bran'], glossary: [{ term: 'Saltreach' }, { term: 'Wren' }] });
  assert.equal(prompt, 'A Dungeons & Dragons session (Lanterns of Saltreach). Names: Wren, Bran, Saltreach');
  const long = namesPrompt({ characters: Array.from({ length: 200 }, (_, i) => `Character${i}`) });
  assert.ok(long.length <= 700);
});

test('recording: clips are transcribed one by one, short noises skipped, times kept', async () => {
  const seen = [];
  const engine = {
    name: 'test',
    perCall: 2,
    async transcribe(clips, { prompt, language }) {
      seen.push({ n: clips.length, prompt, language });
      return clips.map((c) => [{ start_ms: 0, end_ms: 500, text: `${c.length} samples` }, { start_ms: 2000, end_ms: 2500, text: 'and more' }]);
    },
  };
  const clip = (speaker, start_ms, ms) => ({ speaker, start_ms, ms, audio: () => new Float32Array((RATE * ms) / 1000) });
  const progress = [];
  const out = await transcribeClips(engine, [clip('b', 10_000, 1000), clip('a', 1_000, 3000), clip('a', 4_000, 100)], { prompt: 'Names: X', onProgress: (p, m) => progress.push([p, m]) });
  assert.deepEqual(seen, [{ n: 2, prompt: 'Names: X', language: 'en' }]);
  assert.equal(out.transcript, '[00:00:01] a: 48000 samples and more\n[00:00:10] b: 16000 samples and more\n');
  assert.equal(out.speech_ms, 4000);
  assert.deepEqual(progress.at(-1), [1, 'Done']);
});

test('recording: whisper.cpp is run on the clips as WAV files and its JSON read back', async () => {
  const calls = [];
  const spawn = (bin, args) => {
    calls.push({ bin, args });
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout = { resume() {} };
    setImmediate(() => {
      args.forEach((a, i) => {
        if (args[i - 1] !== '-f') return;
        assert.equal(fs.readFileSync(a).toString('latin1', 0, 4), 'RIFF');
        fs.writeFileSync(`${a}.json`, JSON.stringify({ transcription: [{ offsets: { from: 120, to: 900 }, text: ` clip ${path.basename(a)}` }] }));
      });
      child.emit('close', 0);
    });
    return child;
  };
  const engine = createEngine({ engine: 'whisper-cpp', whisperCppBin: 'whisper-cli', whisperCppModel: 'model.bin', threads: 4 }, { spawn });
  const out = await engine.transcribe([new Float32Array(1600), new Float32Array(3200)], { prompt: 'Names: Wren', language: 'en' });
  assert.deepEqual(out, [[{ start_ms: 120, end_ms: 900, text: 'clip 0.wav' }], [{ start_ms: 120, end_ms: 900, text: 'clip 1.wav' }]]);
  assert.equal(calls[0].bin, 'whisper-cli');
  assert.deepEqual(calls[0].args.slice(0, 10), ['-m', 'model.bin', '-l', 'en', '-oj', '-np', '--prompt', 'Names: Wren', '-t', '4']);
  assert.throws(() => createEngine({ engine: 'whisper-cpp' }), /WHISPER_CPP_BIN/);
  assert.throws(() => createEngine({ engine: 'groq' }), /Unknown speech-to-text engine/);
  assert.equal(fakeEngine().name, 'fake');
});

test('recording: a recording saves each burst of speech, then is transcribed', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    const rec = t.recordings.begin(cid, { guild_id: '111111', guild_name: 'Our server', channel_id: '222222', channel_name: 'Table', started_by: `user:${t.dm.id}` });
    assert.equal(rec.status, 'recording');
    assert.equal(t.recordings.active(cid).id, rec.id);
    assert.throws(() => t.recordings.begin(cid, { guild_id: '1', channel_id: '2' }), /already running/);
    const one = t.recordings.clip(cid, rec.id, { user_id: '9001', speaker: 'kenny', start_ms: 2_000 });
    for (const p of opusPackets(50)) one.packet(p);
    one.end();
    const two = t.recordings.clip(cid, rec.id, { user_id: '9002', speaker: 'sam:plays', start_ms: 4_500 });
    for (const p of opusPackets(100)) two.packet(p);
    two.end();
    const meta = t.recordings.get(cid, rec.id);
    assert.deepEqual(meta.speakers, { 9001: 'kenny', 9002: 'sam plays' });
    assert.equal(meta.clips, 2);
    assert.equal(meta.speech_ms, 3000);

    t.recordings.finish(cid, rec.id);
    await t.recordings.idle();
    const done = t.recordings.get(cid, rec.id);
    assert.equal(done.status, 'ready');
    assert.equal(done.engine, 'fake');
    assert.equal(t.recordings.transcript(cid, rec.id), '[00:00:02] kenny: (speech, 1.0 s)\n[00:00:04] sam plays: (speech, 2.0 s)\n');
    assert.equal(t.recordings.active(cid), null);
    // The audio is real Ogg Opus, on disk where the comment in recordings.js says.
    const dir = path.join(t.dir, 'recordings', t.campaign.slug, rec.id);
    assert.ok(fs.existsSync(path.join(dir, 'clips', '00001.ogg')));

    t.recordings.remove(cid, rec.id);
    assert.ok(!fs.existsSync(dir));
    assert.deepEqual(t.recordings.list(cid), []);
  } finally {
    await t.cleanup();
  }
});

test('recording: one that was running when the server stopped is transcribed when it starts again', async () => {
  const t = await setup();
  try {
    const cid = t.campaign.id;
    const rec = t.recordings.begin(cid, { guild_id: '111111', channel_id: '222222' });
    const c = t.recordings.clip(cid, rec.id, { user_id: '9001', speaker: 'kenny', start_ms: 0 });
    for (const p of opusPackets(30)) c.packet(p);
    c.end();
    t.recordings.recover();
    await t.recordings.idle();
    const after = t.recordings.get(cid, rec.id);
    assert.equal(after.status, 'ready');
    assert.match(after.note, /server stopped/);
    assert.equal(after.lines, 1);
  } finally {
    await t.cleanup();
  }
});

test('recording: a failed transcription says why and can be retried', async () => {
  let fail = true;
  const t = await setup();
  try {
    const cid = t.campaign.id;
    // The engine is made when first needed; swap in one that fails once.
    const recordings = (await import('../src/recording/recordings.js')).createRecordings({
      root: path.join(t.dir, 'recordings-2'),
      store: t.store,
      config: t.config,
      engine: () => ({ name: 'flaky', perCall: 1, transcribe: async (clips) => { if (fail) throw new Error('model missing'); return clips.map(() => [{ start_ms: 0, end_ms: 1, text: 'hello' }]); } }),
      log: { error() {} },
    });
    const rec = recordings.begin(cid, { guild_id: '1', channel_id: '2' });
    const c = recordings.clip(cid, rec.id, { user_id: '1', speaker: 'kenny', start_ms: 0 });
    for (const p of opusPackets(30)) c.packet(p);
    c.end();
    recordings.finish(cid, rec.id);
    await recordings.idle();
    assert.equal(recordings.get(cid, rec.id).status, 'failed');
    assert.equal(recordings.get(cid, rec.id).error, 'model missing');
    assert.throws(() => recordings.transcript(cid, rec.id), /no transcript yet/);
    fail = false;
    recordings.retry(cid, rec.id);
    await recordings.idle();
    assert.equal(recordings.transcript(cid, rec.id), '[00:00:00] kenny: hello\n');
    assert.throws(() => recordings.get(cid, '../../etc'), /No such recording/);
  } finally {
    await t.cleanup();
  }
});

test('recording: without a bot token the Sessions tab says so, and nothing can start', async () => {
  const t = await setup();
  try {
    const base = `/campaigns/${t.campaign.id}/recordings`;
    const res = await t.request('GET', base);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { bot: { configured: false, ready: false, error: null, invite_url: null, guilds: [] }, link: { guild_id: null, channel_id: null }, live: null, engine: 'fake', recordings: [] });
    assert.match((await t.request('POST', `${base}/start`)).json().error, /DISCORD_BOT_TOKEN/);
    assert.equal((await t.request('PUT', `${base}/link`, { body: { guild_id: '111111', channel_id: null } })).statusCode, 400);
    // Players never see any of it.
    assert.equal((await t.request('GET', base, { as: t.sam.token })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

const GUILD = {
  id: '500000000000000001',
  name: 'Our table',
  channels: [
    { id: '600000000000000001', name: 'General' , voice: false },
    { id: '600000000000000002', name: 'Tavern' },
  ],
  members: [
    { id: '700000000000000001', name: 'Kenny', username: 'kennydm', channel: '600000000000000002' },
    { id: '700000000000000002', name: 'Sam', username: 'samplays', channel: '600000000000000002' },
    { id: '700000000000000003', name: 'Music', username: 'jukebox', bot: true, channel: '600000000000000002' },
    { id: '700000000000000004', name: 'Alex', username: 'alexr' },
  ],
};

async function withBot(fn) {
  const fake = fakeDiscord({ guilds: [GUILD] });
  const t = await setup({ config: { discord: { token: 'test-token', silenceMs: 1000 } }, bot: (ctx) => startDiscordBot(ctx, { discord: fake.discord, voice: fake.voice, log: { info() {}, warn() {}, error() {} } }) });
  try {
    await settle();
    await fn(t, fake);
  } finally {
    await t.cleanup();
  }
}

test('recording: the DM links a Discord server and channel, starts, people talk, stops; the transcript is ready to upload', async () => {
  await withBot(async (t, fake) => {
    const cid = t.campaign.id;
    const base = `/campaigns/${cid}/recordings`;
    const view = (await t.request('GET', base)).json();
    assert.equal(view.bot.ready, true);
    assert.match(view.bot.invite_url, /client_id=123456789012&scope=bot%20applications.commands/);
    // Only voice channels, with who's in them (not bots).
    assert.deepEqual(view.bot.guilds, [{ id: GUILD.id, name: 'Our table', voice_channels: [{ id: '600000000000000002', name: 'Tavern', people: ['Kenny', 'Sam'] }] }]);
    assert.deepEqual(fake.state.commands.get(GUILD.id), ['record', 'stop', 'norecord']);

    assert.match((await t.request('POST', `${base}/start`)).json().error, /Choose the Discord server/);
    assert.equal((await t.request('PUT', `${base}/link`, { body: { guild_id: GUILD.id, channel_id: '600000000000000001' } })).statusCode, 400, 'a text channel');
    const linked = await t.request('PUT', `${base}/link`, { body: { guild_id: GUILD.id, channel_id: '600000000000000002' } });
    assert.deepEqual(linked.json(), { guild_id: GUILD.id, channel_id: '600000000000000002' });

    const started = await t.request('POST', `${base}/start`);
    assert.equal(started.statusCode, 201);
    const id = started.json().recording.id;
    assert.equal(started.json().recording.channel_name, 'Tavern');
    assert.deepEqual(fake.state.nicknames, ['🔴 Recording']);
    assert.equal((await t.request('POST', `${base}/start`)).statusCode, 409);

    assert.ok(await fake.speak('700000000000000001', opusPackets(50)));
    assert.ok(await fake.speak('700000000000000002', opusPackets(75)));
    // Another bot in the channel (music) isn't recorded.
    assert.ok(!(await fake.speak('700000000000000003', opusPackets(50))));
    assert.deepEqual((await t.request('GET', base)).json().live, { recording: id, guild_id: GUILD.id, channel_id: '600000000000000002', speaking: 0 });

    const stopped = await t.request('POST', `${base}/stop`);
    assert.equal(stopped.statusCode, 200);
    assert.equal(fake.state.connections[0].destroyed, true);
    assert.deepEqual(fake.state.nicknames, ['🔴 Recording', null]);
    await t.recordings.idle();
    const after = (await t.request('GET', base)).json();
    assert.equal(after.live, null);
    assert.equal(after.recordings[0].status, 'ready');
    assert.deepEqual(after.recordings[0].speakers, { '700000000000000001': 'kennydm', '700000000000000002': 'samplays' });
    const { transcript } = (await t.request('GET', `${base}/${id}/transcript`)).json();
    assert.match(transcript, /^\[00:00:00\] kennydm: \(speech, 1\.0 s\)\n\[00:00:00\] samplays: \(speech, 1\.5 s\)\n$/);

    // It uploads like any transcript (the speaker map links Discord names to accounts from then on).
    const up = await t.request('POST', `/campaigns/${cid}/sessions`, { body: { number: 1, played_on: after.recordings[0].played_on, transcript, speakers: [{ speaker: 'kennydm', user_id: t.dm.id }, { speaker: 'samplays', user_id: t.sam.id }] } });
    assert.equal(up.statusCode, 201);
    assert.deepEqual(up.json().unlinked_speakers, []);
  });
});

test('recording: /record, /stop and /norecord in Discord', async () => {
  await withBot(async (t, fake) => {
    const cid = t.campaign.id;
    const at = (userId, manager = false) => ({ guildId: GUILD.id, userId, manager });
    // Not linked to a campaign yet.
    assert.match((await fake.command('record', at('700000000000000001')))[0].content, /isn’t linked to a campaign/);
    await t.request('PUT', `/campaigns/${cid}/recordings/link`, { body: { guild_id: GUILD.id, channel_id: '600000000000000002' } });
    // A player can't start one; nor can the DM's Discord name before it's linked to their account.
    assert.match((await fake.command('record', at('700000000000000002')))[0].content, /Only the DM/);
    assert.match((await fake.command('record', at('700000000000000001')))[0].content, /Only the DM/);
    t.store.setSpeakers(cid, [...t.store.getSpeakers(cid), { speaker: 'kennydm', display_name: 'DM', user_id: t.dm.id }]);
    const started = await fake.command('record', at('700000000000000001'));
    assert.match(started[0].content, /🔴 Recording this session of \*\*Test Campaign\*\* in \*\*Tavern\*\*.*\/norecord/);
    assert.equal(t.recordings.active(cid).started_by, 'discord:700000000000000001');

    // Sam leaves their voice out: nothing of theirs is saved.
    assert.match((await fake.command('norecord', at('700000000000000002')))[0].content, /left out/);
    assert.ok(!(await fake.speak('700000000000000002', opusPackets(50))));
    assert.ok(await fake.speak('700000000000000001', opusPackets(50)));

    assert.match((await fake.command('stop', at('700000000000000002')))[0].content, /Only the DM/);
    // Whoever manages the Discord server can stop it too.
    assert.match((await fake.command('stop', at('700000000000000004', true)))[0].content, /Recording stopped/);
    await t.recordings.idle();
    const [rec] = t.recordings.list(cid);
    assert.deepEqual(Object.values(rec.speakers), ['kennydm']);
    assert.match((await fake.command('stop', at('700000000000000001')))[0].content, /Nothing is being recorded/);
    // Asked again, they're recorded again.
    assert.match((await fake.command('norecord', at('700000000000000002')))[0].content, /recorded again/);
  });
});

test('recording: if the bot can\'t join the channel, nothing is left behind', async () => {
  await withBot(async (t, fake) => {
    const base = `/campaigns/${t.campaign.id}/recordings`;
    await t.request('PUT', `${base}/link`, { body: { guild_id: GUILD.id, channel_id: '600000000000000002' } });
    fake.state.joinFails = true;
    const res = await t.request('POST', `${base}/start`);
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error, /couldn’t join/);
    assert.deepEqual(t.recordings.list(t.campaign.id), []);
    fake.state.joinFails = false;
    assert.equal((await t.request('POST', `${base}/start`)).statusCode, 201);
  });
});
