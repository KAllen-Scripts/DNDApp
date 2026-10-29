/**
 * Stand-ins for discord.js and @discordjs/voice, so the recording bot can be
 * tested offline: a Discord server with voice channels and members, and a
 * voice connection whose speakers the test makes "talk" with real Opus packets.
 */
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** 20 ms Opus packets of a tone (opusscript), as Discord sends them. */
export function opusPackets(count, hz = 300) {
  const OpusScript = require('opusscript');
  const enc = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
  const out = [];
  for (let f = 0; f < count; f++) {
    const pcm = Buffer.alloc(960 * 4);
    for (let i = 0; i < 960; i++) {
      const v = Math.round(Math.sin((2 * Math.PI * hz * (f * 960 + i)) / 48000) * 6000);
      pcm.writeInt16LE(v, i * 4);
      pcm.writeInt16LE(v, i * 4 + 2);
    }
    out.push(Buffer.from(enc.encode(pcm, 960)));
  }
  enc.delete();
  return out;
}

const ChannelType = { GuildText: 0, GuildVoice: 2, GuildStageVoice: 13 };

export function fakeDiscord({ guilds = [] } = {}) {
  const state = { clients: [], connections: [], nicknames: [], commands: new Map(), joinFails: false };

  const member = (m) => ({ id: m.id, displayName: m.name, user: { id: m.id, username: m.username ?? m.name.toLowerCase(), bot: !!m.bot }, voice: { channelId: m.channel ?? null } });

  const makeGuild = (g) => {
    const members = new Map(g.members.map((m) => [m.id, member(m)]));
    const channels = new Map(
      g.channels.map((c, i) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          type: c.voice === false ? ChannelType.GuildText : ChannelType.GuildVoice,
          rawPosition: i,
          get members() {
            return new Map([...members].filter(([, m]) => m.voice.channelId === c.id));
          },
        },
      ]),
    );
    return {
      id: g.id,
      name: g.name,
      channels: { cache: channels },
      members: {
        cache: members,
        fetch: async (id) => members.get(id) ?? Promise.reject(new Error('Unknown member')),
        me: { setNickname: async (n) => state.nicknames.push(n) },
      },
      commands: { set: async (list) => state.commands.set(g.id, list.map((c) => c.name)) },
      voiceAdapterCreator: () => ({}),
    };
  };

  class Client extends EventEmitter {
    constructor() {
      super();
      this.guilds = { cache: new Map(guilds.map((g) => [g.id, makeGuild(g)])) };
      this.user = { tag: 'Party Ledger#0001' };
      this.application = { id: '123456789012' };
      state.clients.push(this);
    }
    async login() {
      setImmediate(() => this.emit('ready'));
      return 'token';
    }
    async destroy() {
      this.destroyed = true;
    }
  }

  class PermissionsBitField {
    static Flags = { ManageGuild: 32n };
    constructor(list) {
      this.bitfield = BigInt(list.length);
    }
  }

  const discord = {
    Client,
    Events: { ClientReady: 'ready', GuildCreate: 'guildCreate', Error: 'error', InteractionCreate: 'interactionCreate', VoiceStateUpdate: 'voiceStateUpdate' },
    GatewayIntentBits: { Guilds: 1, GuildVoiceStates: 128 },
    PermissionsBitField,
    ChannelType,
    MessageFlags: { Ephemeral: 64 },
  };

  const VoiceConnectionStatus = { Ready: 'ready', Signalling: 'signalling', Connecting: 'connecting', Disconnected: 'disconnected' };
  const voice = {
    VoiceConnectionStatus,
    EndBehaviorType: { AfterSilence: 1 },
    joinVoiceChannel({ channelId, guildId }) {
      const subscriptions = new Map();
      const connection = Object.assign(new EventEmitter(), {
        channelId,
        guildId,
        destroyed: false,
        receiver: {
          speaking: new EventEmitter(),
          subscriptions,
          subscribe(userId) {
            const stream = Object.assign(new EventEmitter(), {
              destroy() {
                subscriptions.delete(userId);
                stream.emit('end');
              },
            });
            subscriptions.set(userId, stream);
            return stream;
          },
        },
        destroy() {
          connection.destroyed = true;
        },
      });
      state.connections.push(connection);
      return connection;
    },
    entersState: async (connection, status) => {
      if (state.joinFails && status === VoiceConnectionStatus.Ready) throw new Error('timed out');
      return connection;
    },
  };

  /** Someone says something: their stream starts, sends the packets, then goes quiet. */
  async function speak(userId, packets) {
    const connection = state.connections.at(-1);
    connection.receiver.speaking.emit('start', userId);
    // The bot looks the member up before it subscribes.
    for (let i = 0; i < 20 && !connection.receiver.subscriptions.has(userId); i++) await new Promise((r) => setImmediate(r));
    const stream = connection.receiver.subscriptions.get(userId);
    if (!stream) return false;
    for (const p of packets) stream.emit('data', p);
    connection.receiver.subscriptions.delete(userId);
    stream.emit('end');
    return true;
  }

  /** A slash command, as the member typed it. Returns what the bot replied. */
  async function command(name, { guildId, userId, manager = false }) {
    const client = state.clients.at(-1);
    const guild = client.guilds.cache.get(guildId);
    const m = guild.members.cache.get(userId);
    const replies = [];
    const interaction = {
      commandName: name,
      guild,
      user: m.user,
      member: m,
      memberPermissions: { has: () => manager },
      isChatInputCommand: () => true,
      reply: async (r) => replies.push(r),
      deferReply: async () => replies.push({ deferred: true }),
      editReply: async (content) => replies.push({ content }),
    };
    client.emit('interactionCreate', interaction);
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
    return replies.filter((r) => !r.deferred);
  }

  return { discord, voice, state, speak, command };
}
