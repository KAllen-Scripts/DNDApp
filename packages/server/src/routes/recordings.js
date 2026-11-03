/**
 * Recording sessions from Discord (the DM's Sessions tab): link the campaign to
 * a Discord server and voice channel, start and stop the bot, and take a
 * finished recording's transcript into the upload form. Uploading stays the
 * DM's own step (POST /campaigns/:cid/sessions), as for any transcript.
 */
import { z } from 'zod';
import { BadRequestError } from '../store.js';

import { offBot } from '../recording/discord-bot.js';

const OFF = offBot();

export function registerRecordings(app, r) {
  const { access, config, recordings, store } = r;
  // The campaign's own bot (its DM's key, else the server's), or one that says it isn't set up.
  const botOf = async (cid) => (await r.discordBots?.forCampaign(cid)) ?? OFF;
  const SNOWFLAKE = z.string().regex(/^\d{5,25}$/);

  /** Everything the Sessions tab shows about recording. The key itself is never sent, only whose it is. */
  app.get('/campaigns/:cid/recordings', async (request) => {
    const { cid } = access(request, { dm: true });
    const bot = await botOf(cid);
    return {
      bot: bot.status(),
      key: r.discordBots?.keyOf(cid) ?? null,
      link: store.getSettings(cid).discord,
      live: bot.recordingFor(cid) ?? null,
      engine: config.transcribe?.engine ?? 'local',
      recordings: recordings.list(cid),
    };
  });

  /**
   * The campaign's own Discord bot key (DM), from the Discord developer portal; null to use the
   * server's (DISCORD_BOT_TOKEN), if it has one. Kept only on the server and never sent back.
   */
  app.put('/campaigns/:cid/recordings/key', async (request) => {
    const { cid } = access(request, { dm: true });
    const { key } = z.object({ key: z.string().trim().regex(/^[\w.-]{30,200}$/, 'That doesn’t look like a Discord bot key').nullable() }).parse(request.body);
    if (!r.discordBots) throw new BadRequestError('Discord recording isn’t running on this server.');
    const bot = await r.discordBots.setKey(cid, key);
    return { key: r.discordBots.keyOf(cid), bot: bot.status() };
  });

  /** Which Discord server and voice channel this campaign's sessions are recorded in (null to unlink). */
  app.put('/campaigns/:cid/recordings/link', async (request) => {
    const { cid } = access(request, { dm: true });
    const { guild_id, channel_id } = z.object({ guild_id: SNOWFLAKE.nullable(), channel_id: SNOWFLAKE.nullable() }).parse(request.body);
    if (guild_id) {
      const guild = (await botOf(cid)).status().guilds.find((g) => g.id === guild_id);
      if (!guild) throw new BadRequestError('The bot isn’t in that Discord server.');
      if (channel_id && !guild.voice_channels.some((c) => c.id === channel_id)) throw new BadRequestError('That isn’t a voice channel in that server.');
    }
    return store.setSettings(cid, { discord: { guild_id, channel_id: guild_id ? channel_id : null } }).discord;
  });

  app.post('/campaigns/:cid/recordings/start', async (request, reply) => {
    const { cid, userId } = access(request, { dm: true });
    const { guild_id, channel_id } = store.getSettings(cid).discord;
    const bot = await botOf(cid);
    if (!bot.configured) throw new BadRequestError('This campaign has no Discord bot key yet.');
    if (!guild_id || !channel_id) throw new BadRequestError('Choose the Discord server and voice channel first.');
    const recording = await bot.start(cid, { guild_id, channel_id, started_by: `user:${userId}` });
    reply.status(201);
    return { recording };
  });

  app.post('/campaigns/:cid/recordings/stop', async (request) => {
    const { cid } = access(request, { dm: true });
    const bot = await botOf(cid);
    if (!bot.configured) throw new BadRequestError('This campaign has no Discord bot key yet.');
    return { recording: await bot.stop(cid) };
  });

  /** A finished recording's transcript, for the upload form. */
  app.get('/campaigns/:cid/recordings/:id/transcript', async (request) => {
    const { cid } = access(request, { dm: true });
    const recording = recordings.get(cid, request.params.id);
    return { recording, transcript: recordings.transcript(cid, request.params.id) };
  });

  app.post('/campaigns/:cid/recordings/:id/retry', async (request) => {
    const { cid } = access(request, { dm: true });
    return { recording: recordings.retry(cid, request.params.id) };
  });

  app.delete('/campaigns/:cid/recordings/:id', async (request) => {
    const { cid } = access(request, { dm: true });
    recordings.remove(cid, request.params.id);
    return { ok: true };
  });
}
