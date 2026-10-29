/**
 * The Discord bot that records sessions. It runs inside the server when
 * DISCORD_BOT_TOKEN is set, joins a voice channel when the DM asks (the
 * Sessions tab's Start, or /record in Discord) and saves each person's
 * speech separately (Discord sends each voice on its own), so every line of
 * the transcript knows who said it. /stop (or Stop) ends it and the speech is
 * transcribed (recordings.js).
 *
 * Discord encrypts calls end to end (DAVE, since March 2026): @discordjs/voice
 * 0.19.2+ with @snazzah/davey decrypts what the bot hears. Discord never
 * officially supported bots hearing calls; if that breaks, transcripts can
 * still be uploaded from anything else.
 */

const MAX_HOURS = 8;
const EMPTY_STOP_MS = 5 * 60_000;
const RECORDING_NICK = '🔴 Recording';

/** The bot's Discord permissions: see channels, join voice, post the "recording" notice, show it in its nickname. */
const PERMISSIONS = ['ViewChannel', 'SendMessages', 'Connect', 'ChangeNickname'];

export function inviteUrl(applicationId, permissions) {
  return `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot%20applications.commands&permissions=${permissions}`;
}

/** Turned off: no token in .env. Everything says so instead of failing oddly. */
function offBot() {
  const off = () => {
    throw Object.assign(new Error('The Discord bot isn’t set up (DISCORD_BOT_TOKEN in .env).'), { statusCode: 400 });
  };
  return { configured: false, status: () => ({ configured: false, ready: false, error: null, invite_url: null, guilds: [] }), start: off, stop: off, recordingFor: () => null, close: async () => {} };
}

/**
 * campaignsFor(guildId) -> [{ id, name, settings }]: campaigns linked to that Discord server.
 * isDm(campaignId, discordUsername): their speaker-map link is to one of the campaign's DMs.
 * discord / voice: the discord.js and @discordjs/voice modules (tests pass fakes).
 */
export async function createDiscordBot({ config, recordings, campaignsFor, isDm, log = console, discord, voice }) {
  const { excluded } = recordings;
  if (!config.discord.token) return offBot();
  discord ??= await import('discord.js');
  voice ??= await import('@discordjs/voice');
  const { Client, Events, GatewayIntentBits, PermissionsBitField, ChannelType } = discord;
  const { joinVoiceChannel, entersState, VoiceConnectionStatus, EndBehaviorType } = voice;

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const permissions = new PermissionsBitField(PERMISSIONS).bitfield.toString();
  let ready = false;
  let error = null;
  // guild id -> { cid, rec, guild, channelId, connection, writers: Map(user id -> clip), startedAt, timers }
  const live = new Map();

  const commands = [
    { name: 'record', description: 'Record this session for The Party Ledger (joins your voice channel)' },
    { name: 'stop', description: 'Stop recording; the transcript appears on the Sessions tab' },
    { name: 'norecord', description: 'Leave your voice out of recordings (again to be recorded)' },
  ];

  async function registerCommands(guild) {
    try {
      await guild.commands.set(commands);
    } catch (err) {
      log.warn?.(`Discord: couldn't add the /record commands in ${guild.name}: ${err.message}`);
    }
  }

  client.once(Events.ClientReady, async () => {
    ready = true;
    error = null;
    log.info?.(`Discord bot: logged in as ${client.user.tag}, in ${client.guilds.cache.size} server(s)`);
    for (const guild of client.guilds.cache.values()) await registerCommands(guild);
  });
  client.on(Events.GuildCreate, registerCommands);
  client.on(Events.Error, (err) => log.error?.(err));
  client.on(Events.InteractionCreate, (i) => onCommand(i).catch((err) => log.error?.(err)));
  client.on(Events.VoiceStateUpdate, (before, after) => {
    for (const s of [before, after]) {
      const l = live.get(s.guild.id);
      if (l) checkEmpty(l);
    }
  });
  client.login(config.discord.token).catch((err) => {
    error = `Couldn't log in to Discord: ${err.message}`;
    log.error?.(error);
  });

  const voiceChannels = (guild) =>
    [...guild.channels.cache.values()]
      .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
      .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
      .map((c) => ({ id: c.id, name: c.name, people: [...(c.members?.values() ?? [])].filter((m) => !m.user.bot).map((m) => m.displayName) }));

  function status() {
    return {
      configured: true,
      ready,
      error,
      invite_url: client.application?.id ? inviteUrl(client.application.id, permissions) : null,
      guilds: ready ? [...client.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name, voice_channels: voiceChannels(g) })) : [],
    };
  }

  const humansIn = (l) => [...(l.guild.channels.cache.get(l.channelId)?.members?.values() ?? [])].filter((m) => !m.user.bot).length;

  /** Nobody left in the channel for a while: stop on its own. */
  function checkEmpty(l) {
    if (humansIn(l)) {
      clearTimeout(l.timers.empty);
      l.timers.empty = null;
    } else if (!l.timers.empty) {
      l.timers.empty = setTimeout(() => end(l.guild.id, 'Everyone left the voice channel, so the recording stopped.'), EMPTY_STOP_MS);
      l.timers.empty.unref?.();
    }
  }

  async function onSpeak(l, userId) {
    if (l.writers.has(userId) || excluded.has(userId)) return;
    l.writers.set(userId, null); // claimed while the member is looked up
    let member = l.guild.members.cache.get(userId);
    try {
      member ??= await l.guild.members.fetch(userId);
    } catch {
      // still record them, by id
    }
    if (member?.user?.bot || !live.has(l.guild.id)) return l.writers.delete(userId);
    const writer = recordings.clip(l.cid, l.rec.id, { user_id: userId, speaker: member?.user?.username ?? userId, start_ms: Date.now() - l.startedAt });
    l.writers.set(userId, writer);
    const stream = l.connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: config.discord.silenceMs } });
    const close = () => {
      writer.end();
      if (l.writers.get(userId) === writer) l.writers.delete(userId);
    };
    stream.on('data', (p) => writer.packet(p));
    stream.once('end', close);
    stream.once('close', close);
    stream.on('error', (err) => {
      log.warn?.(`Discord: lost some audio from ${member?.user?.username ?? userId}: ${err.message}`);
      close();
    });
  }

  /** Joins the voice channel and starts recording for the campaign. */
  async function start(cid, { guild_id, channel_id, started_by }) {
    if (!ready) throw Object.assign(new Error(error ?? 'The Discord bot is still connecting. Try again in a moment.'), { statusCode: 409 });
    const guild = client.guilds.cache.get(guild_id);
    if (!guild) throw Object.assign(new Error('The bot isn’t in that Discord server (invite it first).'), { statusCode: 400 });
    const channel = guild.channels.cache.get(channel_id);
    if (!channel || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) throw Object.assign(new Error('Pick a voice channel.'), { statusCode: 400 });
    if (live.has(guild_id)) throw Object.assign(new Error('The bot is already recording in that Discord server.'), { statusCode: 409 });

    const rec = recordings.begin(cid, { guild_id, guild_name: guild.name, channel_id, channel_name: channel.name, started_by });
    const connection = joinVoiceChannel({ channelId: channel_id, guildId: guild_id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: true });
    const l = { cid, rec, guild, channelId: channel_id, connection, writers: new Map(), startedAt: Date.now(), timers: {} };
    live.set(guild_id, l);
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch {
      live.delete(guild_id);
      try {
        connection.destroy();
      } catch {
        // already gone
      }
      recordings.abandon(cid, rec.id);
      throw Object.assign(new Error('The bot couldn’t join the voice channel (does it have permission to connect there?).'), { statusCode: 409 });
    }
    l.startedAt = Date.now();
    connection.receiver.speaking.on('start', (userId) => onSpeak(l, userId).catch((err) => log.error?.(err)));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moved to another channel or a brief network drop: Discord reconnects by itself.
        await Promise.race([entersState(connection, VoiceConnectionStatus.Signalling, 5_000), entersState(connection, VoiceConnectionStatus.Connecting, 5_000)]);
      } catch {
        end(guild_id, 'The bot was disconnected from Discord, so the recording stopped there.');
      }
    });
    l.timers.max = setTimeout(() => end(guild_id, `Recordings stop after ${MAX_HOURS} hours.`), MAX_HOURS * 3600_000);
    l.timers.max.unref?.();
    checkEmpty(l);
    guild.members.me?.setNickname(RECORDING_NICK).catch(() => {});
    return recordings.get(cid, rec.id);
  }

  /** Stops a recording: every open clip is closed, then it's transcribed. */
  async function end(guildId, note = null) {
    const l = live.get(guildId);
    if (!l) return null;
    live.delete(guildId);
    clearTimeout(l.timers.max);
    clearTimeout(l.timers.empty);
    for (const userId of l.writers.keys()) l.connection.receiver.subscriptions.get(userId)?.destroy();
    for (const w of l.writers.values()) w?.end();
    try {
      l.connection.destroy();
    } catch {
      // already gone
    }
    l.guild.members.me?.setNickname(null).catch(() => {});
    return recordings.finish(l.cid, l.rec.id, { note });
  }

  const recordingFor = (cid) => [...live.values()].find((l) => l.cid === cid) ?? null;

  async function stop(cid) {
    const l = recordingFor(cid);
    if (!l) throw Object.assign(new Error('Nothing is being recorded for this campaign.'), { statusCode: 409 });
    return end(l.guild.id);
  }

  // ---------- /record, /stop, /norecord ----------

  const say = (i, content, secret = true) => i.reply({ content, ...(secret && { flags: discord.MessageFlags?.Ephemeral ?? 64 }) });

  /** May this Discord user start and stop recordings for the campaign? Server managers and the campaign's DM. */
  const allowed = (i, cid) => i.memberPermissions?.has?.(PermissionsBitField.Flags.ManageGuild) || isDm(cid, i.user.username);

  async function onCommand(i) {
    if (!i.isChatInputCommand?.() || !i.guild) return;
    if (i.commandName === 'norecord') {
      const now = excluded.toggle(i.user.id);
      if (now) {
        const l = live.get(i.guild.id);
        if (l) l.connection.receiver.subscriptions.get(i.user.id)?.destroy();
      }
      return say(i, now ? 'Your voice is left out of recordings from now on. /norecord again to be recorded.' : 'You’ll be recorded again from your next words.');
    }
    if (i.commandName === 'stop') {
      const l = live.get(i.guild.id);
      if (!l) return say(i, 'Nothing is being recorded here.');
      if (!allowed(i, l.cid) && l.rec.started_by !== `discord:${i.user.id}`) return say(i, 'Only the DM (or whoever manages this server) can stop the recording.');
      await end(i.guild.id);
      return say(i, '⏹️ Recording stopped. The transcript will be on the Sessions tab once it’s written.', false);
    }
    if (i.commandName === 'record') {
      const linked = campaignsFor(i.guild.id);
      if (!linked.length) return say(i, 'This Discord server isn’t linked to a campaign yet. The DM can link it on the Sessions tab of The Party Ledger.');
      const channelId = i.member?.voice?.channelId ?? null;
      const campaign = linked.length === 1 ? linked[0] : linked.find((c) => c.settings.discord?.channel_id === channelId);
      if (!campaign) return say(i, 'Several campaigns use this Discord server. Start the recording from the Sessions tab instead.');
      if (!allowed(i, campaign.id)) return say(i, 'Only the DM (or whoever manages this server) can start a recording.');
      const target = channelId ?? campaign.settings.discord?.channel_id;
      if (!target) return say(i, 'Join the voice channel first, then /record.');
      await i.deferReply();
      try {
        await start(campaign.id, { guild_id: i.guild.id, channel_id: target, started_by: `discord:${i.user.id}` });
        const name = i.guild.channels.cache.get(target)?.name ?? 'the voice channel';
        await i.editReply(`🔴 Recording this session of **${campaign.name}** in **${name}**. Everyone's voice there is saved for the session transcript; use /norecord to leave yours out. /stop when you're done.`);
      } catch (err) {
        await i.editReply(`Couldn’t start recording: ${err.message}`);
      }
    }
  }

  return {
    configured: true,
    status,
    start,
    stop,
    recordingFor: (cid) => {
      const l = recordingFor(cid);
      return l && { recording: l.rec.id, guild_id: l.guild.id, channel_id: l.channelId, speaking: [...l.writers.keys()].length };
    },
    /** Stops any recording (so what was said is kept) and logs out. */
    async close() {
      for (const guildId of [...live.keys()]) await end(guildId, 'The server was stopped during this recording.');
      await client.destroy();
    },
  };
}

/** The bot for a running server (index.js): campaigns are linked to a Discord server in their settings. */
export function startDiscordBot(ctx, { log, discord, voice } = {}) {
  const { db, store, config, recordings } = ctx;
  const campaignsFor = (guildId) =>
    db
      .prepare('SELECT id, name FROM campaigns ORDER BY id')
      .all()
      .map((c) => ({ ...c, settings: store.getSettings(c.id) }))
      .filter((c) => c.settings.discord?.guild_id === guildId);
  const isDm = (cid, username) => {
    const link = store.getSpeakers(cid).find((s) => s.speaker === username && s.user_id != null);
    return !!link && store.roster(cid).some((m) => m.user_id === link.user_id && m.role === 'dm');
  };
  return createDiscordBot({ config, recordings, campaignsFor, isDm, log, discord, voice });
}
