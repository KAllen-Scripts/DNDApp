/**
 * Recording from Discord on the DM's Sessions tab (campaign/sessions.js): link the
 * campaign's Discord server and voice channel, start and stop, and put a
 * finished recording's transcript into the upload form. The bot is the real
 * one with a fake Discord (server test/fake-discord.js); speech-to-text is the fake engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm } from './helpers.js';
import { fakeDiscord, opusPackets } from '../../server/test/fake-discord.js';
import { startDiscordBot } from '../../server/src/recording/discord-bot.js';

const GUILD = {
  id: '500000000000000001',
  name: 'Our table',
  channels: [{ id: '600000000000000002', name: 'Tavern' }],
  members: [
    { id: '700000000000000001', name: 'Dana', username: 'danadm', channel: '600000000000000002' },
    { id: '700000000000000002', name: 'Sam', username: 'samplays', channel: '600000000000000002' },
  ],
};

const button = (root, text) => {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent === text);
  if (!b) throw new Error(`no "${text}" button`);
  return b;
};

test('recording: without a bot token the Sessions tab says how to set it up, and uploads still work', async () => {
  await withPage({ before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana, campaign: t.campaign }) }, async (page) => {
    page.click('[data-tab=sessions]');
    await page.settle();
    const rec = page.$('#sessions .recorder');
    assert.match(page.text(rec), /Record from Discord.*isn’t set up.*DISCORD_BOT_TOKEN/);
    assert.ok(page.$('#sessions form.upload-form'));
  });
});

test('recording: link the Discord channel, record, stop, then use the transcript for the upload', async () => {
  const fake = fakeDiscord({ guilds: [GUILD] });
  const setup = {
    config: { discord: { token: 'test-token', silenceMs: 1000 } },
    bot: (ctx) => startDiscordBot(ctx, { discord: fake.discord, voice: fake.voice, log: { info() {}, warn() {}, error() {} } }),
  };
  await withPage({ setup, before: async (t) => ({ dana: await addDm(t) }), page: (t, { dana }) => ({ as: dana, campaign: t.campaign }) }, async (page, t) => {
    page.click('[data-tab=sessions]');
    await page.settle();
    const rec = () => page.$('#sessions .recorder');
    assert.ok(button(rec(), 'Start recording').disabled, 'nothing linked yet');

    page.type(rec().querySelector('[aria-label="Discord server"]'), GUILD.id);
    await page.settle();
    // The voice channels say who's in them.
    const channel = rec().querySelector('[aria-label="Voice channel"]');
    assert.deepEqual([...channel.options].map((o) => o.textContent), ['Choose a voice channel…', 'Tavern (Dana, Sam)']);
    page.type(channel, '600000000000000002');
    await page.settle();
    assert.deepEqual(t.store.getSettings(t.campaign.id).discord, { guild_id: GUILD.id, channel_id: '600000000000000002' });

    page.click(button(rec(), 'Start recording'));
    await page.settle();
    assert.match(page.text(rec().querySelector('.recorder-live')), /Recording in Tavern since .* 0 people heard so far/);
    assert.ok(rec().querySelector('[aria-label="Discord server"]').disabled, 'the channel stays put while recording');

    await fake.speak('700000000000000001', opusPackets(50));
    await fake.speak('700000000000000002', opusPackets(60));
    page.click(button(rec(), 'Stop'));
    await page.settle();
    await t.recordings.idle();
    page.click('[data-tab=sessions]');
    await page.settle();
    const row = rec().querySelector('.recording');
    assert.match(page.text(row), /Tavern · danadm, samplays.*transcribed, 2 lines/);

    page.click(button(row, 'Use for upload'));
    await page.settle();
    const form = page.$('#sessions form.upload-form');
    assert.ok(page.$('#sessions details.upload').open);
    assert.match(form.querySelector('[aria-label="Transcript text"]').value, /^\[00:00:00\] danadm: \(speech, 1\.0 s\)\n\[00:00:00\] samplays: \(speech, 1\.2 s\)/);
    assert.equal(form.querySelector('[aria-label="Date played"]').value, t.recordings.list(t.campaign.id)[0].played_on);
    await page.waitFor(() => form.querySelectorAll('.speaker-row').length === 2, { what: 'who’s who for the recording' });
    assert.match(page.text('#sessions-status'), /in the upload form/);

    // Delete it (asked first).
    page.answers.confirm = [true];
    page.click(button(rec().querySelector('.recording'), 'Delete'));
    await page.settle();
    assert.equal(rec().querySelector('.recording'), null);
    assert.deepEqual(t.recordings.list(t.campaign.id), []);
  });
});
