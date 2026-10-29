/**
 * Recording sessions from Discord (the DM's Sessions tab): link the campaign to
 * a Discord server and voice channel, start and stop the bot, and take a
 * finished recording's transcript into the upload form. Uploading stays the
 * DM's own step (POST /campaigns/:cid/sessions), as for any transcript.
 */
import { z } from 'zod';
import { BadRequestError } from '../store.js';

const OFF = { configured: false, ready: false, error: null, invite_url: null, guilds: [] };

export function registerRecordings(app, r) {
  const { access, config, recordings, store } = r;
  const bot = () => r.discordBot ?? null;
  const SNOWFLAKE = z.string().regex(/^\d{5,25}$/);

  /** Everything the Sessions tab shows about recording. */
  app.get('/campaigns/:cid/recordings', async (request) => {
    const { cid } = access(request, { dm: true });
    return {
      bot: bot()?.status() ?? OFF,
      link: store.getSettings(cid).discord,
      live: bot()?.recordingFor(cid) ?? null,
      engine: config.transcribe?.engine ?? 'local',
      recordings: recordings.list(cid),
    };
  });

  /** Which Discord server and voice channel this campaign's sessions are recorded in (null to unlink). */
  app.put('/campaigns/:cid/recordings/link', async (request) => {
    const { cid } = access(request, { dm: true });
    const { guild_id, channel_id } = z.object({ guild_id: SNOWFLAKE.nullable(), channel_id: SNOWFLAKE.nullable() }).parse(request.body);
    if (guild_id) {
      const guild = bot()?.status().guilds.find((g) => g.id === guild_id);
      if (!guild) throw new BadRequestError('The bot isn’t in that Discord server.');
      if (channel_id && !guild.voice_channels.some((c) => c.id === channel_id)) throw new BadRequestError('That isn’t a voice channel in that server.');
    }
    return store.setSettings(cid, { discord: { guild_id, channel_id: guild_id ? channel_id : null } }).discord;
  });

  app.post('/campaigns/:cid/recordings/start', async (request, reply) => {
    const { cid, userId } = access(request, { dm: true });
    const { guild_id, channel_id } = store.getSettings(cid).discord;
    if (!bot()?.configured) throw new BadRequestError('The Discord bot isn’t set up (DISCORD_BOT_TOKEN in .env).');
    if (!guild_id || !channel_id) throw new BadRequestError('Choose the Discord server and voice channel first.');
    const recording = await bot().start(cid, { guild_id, channel_id, started_by: `user:${userId}` });
    reply.status(201);
    return { recording };
  });

  app.post('/campaigns/:cid/recordings/stop', async (request) => {
    const { cid } = access(request, { dm: true });
    if (!bot()?.configured) throw new BadRequestError('The Discord bot isn’t set up (DISCORD_BOT_TOKEN in .env).');
    return { recording: await bot().stop(cid) };
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
