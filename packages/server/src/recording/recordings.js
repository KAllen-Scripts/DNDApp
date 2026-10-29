/**
 * Recordings of sessions from Discord, and turning them into transcripts.
 *
 *   <data>/recordings/<campaign slug>/<id>/
 *     meta.json      what it is and how far it's got (rewritten as it changes)
 *     clips.jsonl    one line per burst of speech: { file, user_id, speaker, start_ms, ms }
 *     clips/<n>.ogg  that speech (Opus, plays in any audio player)
 *     transcript.txt once transcribed, in the upload format; the DM uploads it from the Sessions tab
 *   <data>/recordings/excluded.json  Discord users who asked (/norecord) not to be recorded
 *
 * Not in the archive: a recording isn't part of the campaign until the DM
 * uploads its transcript (which is then archived like any other), and the DM
 * can delete a recording's audio.
 *
 * status: recording -> queued -> transcribing -> ready | failed
 */
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createOggOpusWriter, SILENCE_FRAME } from './ogg.js';
import { decodeOggOpus } from './audio.js';
import { namesPrompt, speakerName, transcribeClips } from './transcribe.js';
import { NotFoundError, BadRequestError, sessionDateFor } from '../store.js';

const ID_RE = /^\d{8}-\d{6}(-\d+)?$/;

export function createRecordings({ root, store, config, engine: makeEngine, log = console }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const queue = [];
  let working = false;
  let engine = null;

  const excludedFile = path.join(root, 'excluded.json');
  const excludedIds = new Set((() => {
    try {
      return JSON.parse(fs.readFileSync(excludedFile, 'utf8'));
    } catch {
      return [];
    }
  })());
  const excluded = {
    has: (userId) => excludedIds.has(userId),
    /** Leaves them out, or records them again. Returns true if they're now left out. */
    toggle(userId) {
      if (excludedIds.has(userId)) excludedIds.delete(userId);
      else excludedIds.add(userId);
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(excludedFile, JSON.stringify([...excludedIds]));
      return excludedIds.has(userId);
    },
  };

  const dirOf = (cid, id) => {
    if (!ID_RE.test(id)) throw new NotFoundError('No such recording');
    return path.join(root, store.getCampaign(cid).slug, id);
  };
  const readMeta = (dir) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    } catch {
      return null;
    }
  };
  const writeMeta = (meta) => {
    const dir = dirOf(meta.campaign_id, meta.id);
    fs.writeFileSync(path.join(dir, 'meta.tmp'), JSON.stringify(meta, null, 2));
    fs.renameSync(path.join(dir, 'meta.tmp'), path.join(dir, 'meta.json'));
    events.emit('update', meta);
    return meta;
  };
  const update = (cid, id, fields) => writeMeta({ ...get(cid, id), ...fields });
  const readClips = (dir) => {
    try {
      return fs
        .readFileSync(path.join(dir, 'clips.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  };

  function get(cid, id) {
    const meta = readMeta(dirOf(cid, id));
    if (!meta) throw new NotFoundError('No such recording');
    return meta;
  }

  function list(cid) {
    const dir = path.join(root, store.getCampaign(cid).slug);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((d) => ID_RE.test(d))
      .map((d) => readMeta(path.join(dir, d)))
      .filter(Boolean)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }

  const active = (cid) => list(cid).find((r) => r.status === 'recording') ?? null;

  /** A new recording (its clips are added as people speak). */
  function begin(cid, { guild_id, guild_name, channel_id, channel_name, started_by }) {
    if (active(cid)) throw new BadRequestError('A recording is already running for this campaign.');
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    let id = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const base = path.join(root, store.getCampaign(cid).slug);
    for (let n = 2; fs.existsSync(path.join(base, id)); n++) id = `${id.split('-').slice(0, 2).join('-')}-${n}`;
    fs.mkdirSync(path.join(base, id, 'clips'), { recursive: true });
    return writeMeta({
      id,
      campaign_id: cid,
      status: 'recording',
      started_at: now.toISOString(),
      stopped_at: null,
      played_on: sessionDateFor(now, config.notes.rolloverHour),
      guild_id,
      guild_name,
      channel_id,
      channel_name,
      started_by,
      speakers: {},
      clips: 0,
      speech_ms: 0,
      note: null,
      progress: 0,
      message: null,
      error: null,
      engine: null,
      lines: 0,
    });
  }

  /**
   * Saves one burst of someone's speech. Returns { packet(opus), end() }.
   * Gaps where nothing arrived (they paused mid-sentence) are kept as silence,
   * so times within the clip stay true.
   */
  function clip(cid, id, { user_id, speaker, start_ms }) {
    const dir = dirOf(cid, id);
    const meta = get(cid, id);
    const n = meta.clips + 1;
    const file = `clips/${String(n).padStart(5, '0')}.ogg`;
    const name = speakerName(speaker);
    update(cid, id, { clips: n, speakers: { ...meta.speakers, [user_id]: name } });
    const out = fs.openSync(path.join(dir, file), 'w');
    const writer = createOggOpusWriter((b) => fs.writeSync(out, b));
    const t0 = Date.now();
    let ended = false;
    return {
      packet(p) {
        if (ended) return;
        const due = t0 + (writer.samples / 48000) * 1000;
        const late = Date.now() - due;
        // More than a fifth of a second behind: they paused, so fill the pause.
        if (late > 200) for (let k = 0; k < Math.floor(late / 20); k++) writer.packet(SILENCE_FRAME);
        writer.packet(p);
      },
      end() {
        if (ended) return;
        ended = true;
        writer.end();
        fs.closeSync(out);
        const ms = Math.round((writer.samples / 48000) * 1000);
        fs.appendFileSync(path.join(dir, 'clips.jsonl'), `${JSON.stringify({ file, user_id, speaker: name, start_ms, ms })}\n`);
        const m = get(cid, id);
        update(cid, id, { speech_ms: m.speech_ms + ms });
      },
    };
  }

  /** The recording stopped (asked to, or cut off): transcribe what was saved. */
  function finish(cid, id, { note = null } = {}) {
    const meta = get(cid, id);
    if (meta.status !== 'recording') return meta;
    const done = update(cid, id, { status: 'queued', stopped_at: new Date().toISOString(), note, message: 'Waiting to transcribe' });
    enqueue(cid, id);
    return done;
  }

  function enqueue(cid, id) {
    if (!queue.some((q) => q.cid === cid && q.id === id)) queue.push({ cid, id });
    setImmediate(drain);
  }

  async function drain() {
    if (working) return;
    working = true;
    try {
      while (queue.length) {
        const { cid, id } = queue.shift();
        try {
          await transcribeNow(cid, id);
        } catch (err) {
          log.error?.(err);
          try {
            update(cid, id, { status: 'failed', error: String(err.message ?? err), message: null });
          } catch {
            // the recording was deleted meanwhile
          }
        }
      }
    } finally {
      working = false;
    }
  }

  async function transcribeNow(cid, id) {
    const dir = dirOf(cid, id);
    engine ??= makeEngine();
    update(cid, id, { status: 'transcribing', progress: 0, message: 'Starting', error: null, engine: engine.name });
    const c = store.getCampaign(cid);
    const prompt = namesPrompt({
      campaignName: c.name,
      characters: store.roster(cid).map((m) => m.character_name),
      glossary: store.getGlossary(cid),
    });
    const clips = readClips(dir).map((k) => ({ speaker: k.speaker, start_ms: k.start_ms, ms: k.ms, audio: () => decodeOggOpus(fs.readFileSync(path.join(dir, k.file))) }));
    let last = 0;
    const { transcript, lines } = await transcribeClips(engine, clips, {
      prompt,
      language: config.transcribe.language,
      onProgress: (progress, message) => {
        // A few updates a second at most.
        if (Date.now() - last < 300 && progress < 1) return;
        last = Date.now();
        update(cid, id, { progress, message });
      },
    });
    fs.writeFileSync(path.join(dir, 'transcript.txt'), transcript);
    update(cid, id, { status: 'ready', progress: 1, message: null, lines });
  }

  return {
    events,
    root,
    list,
    get,
    active,
    begin,
    clip,
    finish,

    /** The transcript (once ready). */
    transcript(cid, id) {
      const meta = get(cid, id);
      if (meta.status !== 'ready') throw new BadRequestError('This recording has no transcript yet.');
      return fs.readFileSync(path.join(dirOf(cid, id), 'transcript.txt'), 'utf8');
    },

    /** Transcribe again (after a failure, or with another engine). */
    retry(cid, id) {
      const meta = get(cid, id);
      if (['recording', 'queued', 'transcribing'].includes(meta.status)) throw new BadRequestError('This recording is still in progress.');
      const out = update(cid, id, { status: 'queued', error: null, progress: 0, message: 'Waiting to transcribe' });
      enqueue(cid, id);
      return out;
    },

    /** A recording that never got going (the bot couldn't join): gone without a trace. */
    abandon(cid, id) {
      fs.rmSync(dirOf(cid, id), { recursive: true, force: true });
      events.emit('update', { id, campaign_id: cid, status: 'deleted' });
    },

    /** Discord users left out of recordings (/norecord), by Discord user id. */
    excluded,

    /** Deletes a recording and its audio (an uploaded transcript stays in the archive). */
    remove(cid, id) {
      const meta = get(cid, id);
      if (['recording', 'transcribing'].includes(meta.status)) throw new BadRequestError('Stop the recording (or let it finish transcribing) first.');
      const i = queue.findIndex((q) => q.cid === cid && q.id === id);
      if (i >= 0) queue.splice(i, 1);
      fs.rmSync(dirOf(cid, id), { recursive: true, force: true });
      events.emit('update', { ...meta, status: 'deleted' });
    },

    /**
     * After a restart: a recording that was running stopped when the server did
     * (what was saved is transcribed), and unfinished transcriptions start again.
     */
    recover() {
      if (!fs.existsSync(root)) return;
      for (const slug of fs.readdirSync(root)) {
        const c = store.getCampaignBySlug(slug);
        if (!c) continue;
        for (const meta of list(c.id)) {
          if (meta.status === 'recording') finish(c.id, meta.id, { note: 'The server stopped during this recording; what was saved before then is here.' });
          else if (['queued', 'transcribing'].includes(meta.status)) {
            update(c.id, meta.id, { status: 'queued', message: 'Waiting to transcribe' });
            enqueue(c.id, meta.id);
          }
        }
      }
    },

    /** Resolves when nothing is waiting to be transcribed (tests). */
    async idle() {
      await drain();
      while (working || queue.length) await new Promise((r) => setTimeout(r, 20));
    },
  };
}
