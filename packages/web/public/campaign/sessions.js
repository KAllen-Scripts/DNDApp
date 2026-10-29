/**
 * The DM's Sessions tab, for the campaign they're in (chosen at login, changed
 * with Switch campaign): past uploads with their processing state,
 * player notes waiting for a transcript, and the upload form (session number,
 * date played, title, transcript, and who's who in the transcript).
 *
 * Player notes are matched to a session by date, so the date chosen here is
 * what connects a transcript to the notes players took while it was played.
 *
 * Above them, recording from Discord: the server's bot joins a voice channel,
 * and a finished recording's transcript goes into the same upload form.
 */
import { api, h } from '../page/api.js';

const $ = (sel) => document.querySelector(sel);

const MAX_BYTES = 50 * 1024 * 1024; // the server's upload limit (MAX_UPLOAD_MB)

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const longDate = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const notesText = (notes, authors) => (notes ? `${plural(notes, 'note')} from ${plural(authors, 'player')}` : null);

// campaign: the one the DM is in ({ id, name }). view: its GET .../sessions/overview. rec: its GET .../recordings.
const state = { campaign: null, view: null, rec: null, guarded: (fn) => fn() };
let timer = null;
let list = null; // the element holding the sessions list
let recorder = null; // the element holding the Discord recorder
let fillUpload = null; // puts a transcript into the upload form (set by uploadForm)

const base = () => `/campaigns/${state.campaign.id}`;
const recBusy = (rec) => !!rec && (!!rec.live || rec.recordings.some((r) => ['recording', 'queued', 'transcribing'].includes(r.status)) || (rec.bot.configured && !rec.bot.ready && !rec.bot.error));
const busy = (v) => v.sessions.some((s) => ['queued', 'processing'].includes(s.status) || ['queued', 'running'].includes(s.job?.status)) || recBusy(state.rec);

/** Enter a campaign as its DM. Players never call this. */
export async function loadSessions({ campaign, guarded }) {
  Object.assign(state, { campaign, guarded });
  await refresh();
}

async function refresh() {
  [state.view, state.rec] = await Promise.all([api('GET', `${base()}/sessions/overview`), api('GET', `${base()}/recordings`)]);
  draw();
  poll();
}

function say(text, error = false) {
  const el = $('#sessions-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

/** Do something, reload the tab, then say how it went. */
async function run(fn, done) {
  try {
    const ok = await state.guarded(async () => {
      await fn();
      await refresh();
      return true;
    });
    if (ok) say(done);
  } catch (err) {
    say(err.message, true);
  }
}

/** Refresh just the sessions list, leaving a half-filled upload form alone. */
async function refreshList() {
  const cid = state.campaign.id;
  const [v, rec] = await Promise.all([api('GET', `${base()}/sessions/overview`), api('GET', `${base()}/recordings`)]);
  if (cid !== state.campaign.id) return; // the DM switched campaign meanwhile
  state.view = v;
  state.rec = rec;
  if (list?.isConnected) list.replaceChildren(...renderList());
  if (recorder?.isConnected && !recorder.contains(document.activeElement)) recorder.replaceChildren(...renderRecorder());
}

/** While anything is processing, refresh the list every few seconds. */
function poll() {
  clearTimeout(timer);
  if (!state.view || !busy(state.view)) return;
  timer = setTimeout(async () => {
    if ($('#tab-sessions').hidden) return; // opening the tab again starts it again
    try {
      await state.guarded(refreshList);
    } catch {
      // try again later
    }
    poll();
  }, 4000);
}

// ---------- past uploads ----------

function statusOf(s) {
  const retry = (label) =>
    h('button', {
      class: 'ghost',
      onclick: () => run(() => api('POST', `${base()}/sessions/${s.number}/process`), `Session ${s.number} is queued for processing.`),
    }, label);
  if (s.status === 'ready') return [h('span', { class: 'badge ok' }, 'processed')];
  if (s.status === 'queued') return [h('span', { class: 'badge' }, 'queued')];
  if (s.status === 'processing') {
    const pct = s.job ? `${Math.round((s.job.progress ?? 0) * 100)}%` : '';
    return [h('span', { class: 'badge warn' }, 'processing'), h('div', { class: 'small muted' }, [pct, s.job?.message].filter(Boolean).join(' · '))];
  }
  if (s.status === 'failed') return [h('span', { class: 'badge bad' }, 'failed'), h('div', { class: 'small error' }, s.error ?? ''), retry('Retry')];
  return [h('span', { class: 'badge' }, 'not processed'), retry('Process')];
}

function renderList() {
  const v = state.view;
  const out = [];
  if (!v.sessions.length) out.push(h('p', { class: 'muted small' }, 'No sessions uploaded yet.'));
  else {
    out.push(h('div', { class: 'table-wrap' }, h('table', { class: 'sessions-table' },
      h('thead', {}, h('tr', {}, ...['Session', 'Played on', 'Title', 'Player notes', 'At the table', 'Status'].map((t) => h('th', {}, t)))),
      h('tbody', {}, v.sessions.map((s) => h('tr', {},
        h('td', {}, h('strong', {}, `#${s.number}`)),
        h('td', {}, longDate(s.played_on)),
        h('td', {}, s.title || h('span', { class: 'muted' }, '—')),
        h('td', { class: 'small' }, notesText(s.notes, s.note_authors) ?? h('span', { class: 'muted' }, 'none')),
        h('td', { class: 'small' }, s.status === 'ready' ? plural(s.attendees, 'account') : h('span', { class: 'muted' }, '—')),
        h('td', { class: 'status-cell' }, statusOf(s)),
      ))),
    )));
  }
  if (v.notes_waiting.length) {
    out.push(h('div', { class: 'notice' },
      h('strong', {}, 'Player notes waiting for a transcript'),
      h('ul', {}, v.notes_waiting.map((w) => h('li', {}, `${longDate(w.date)}: ${notesText(w.notes, w.authors)}`))),
    ));
  }
  return out;
}

// ---------- upload form ----------

function uploadForm() {
  const v = state.view;
  const { campaign } = state;
  const number = h('input', { type: 'number', min: 1, step: 1, value: v.next_number, required: true, 'aria-label': 'Session number' });
  const date = h('input', { type: 'date', value: v.notes_waiting[0]?.date ?? v.today, required: true, 'aria-label': 'Date played' });
  const title = h('input', { placeholder: 'Title (optional)', maxLength: 200, 'aria-label': 'Session title' });
  const file = h('input', { type: 'file', accept: '.txt,text/plain', 'aria-label': 'Transcript file' });
  const paste = h('textarea', { rows: 4, placeholder: '[00:00:05] Speaker Name: what they said', 'aria-label': 'Transcript text' });
  const dateHint = h('p', { class: 'small hint' });
  const who = h('div', { class: 'speakers' });
  const button = h('button', { type: 'submit', class: 'primary', disabled: true }, 'Upload session');
  let transcript = '';
  let speakerRows = [];
  // A finished Discord recording: its transcript and the date it was played go in, ready to check.
  fillUpload = (text, playedOn) => {
    file.value = '';
    paste.value = text;
    paste.closest('details').open = true;
    if (playedOn) {
      date.value = playedOn;
      updateDateHint();
    }
    readTranscript(text);
  };

  // What this date means for player notes.
  const updateDateHint = () => {
    const d = date.value;
    const clash = v.sessions.find((s) => s.played_on === d);
    const waiting = v.notes_waiting.find((w) => w.date === d);
    const notes = clash ? notesText(clash.notes, clash.note_authors) : waiting ? notesText(waiting.notes, waiting.authors) : null;
    dateHint.replaceChildren(
      `Player notes are matched to a session by date (notes written before ${v.rollover_hour}am count as the day before). `,
      d ? (notes ? h('strong', {}, `${notes} on ${longDate(d)} will go with this session.`) : `No player notes are dated ${longDate(d)}.`) : '',
      clash ? h('span', { class: 'error' }, ` Session #${clash.number} already has this date, so both would get the same notes.`) : '',
    );
  };
  date.addEventListener('input', updateDateHint);
  updateDateHint();

  // Best guess at who a transcript name is: an account or character whose name it contains ("KennyDM" is Kenny),
  // or one with the transcript name as a word of it ("Rowan" is test-rowan).
  const guess = (speaker) => {
    const s = speaker.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hit = v.members.filter((m) =>
      [m.name, m.character_name].filter(Boolean).some((n) => {
        const k = n.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (k.length >= 3 && s.includes(k)) || (s.length >= 3 && n.toLowerCase().split(/[^a-z0-9]+/).includes(s));
      }),
    );
    return hit.length === 1 ? hit[0].user_id : null;
  };

  async function readTranscript(text) {
    transcript = text;
    speakerRows = [];
    button.disabled = true;
    who.replaceChildren();
    if (!text.trim()) return;
    try {
      const p = await state.guarded(() => api('POST', `${base()}/sessions/preview`, { transcript: text }));
      if (!p) return;
      speakerRows = p.speakers.map((sp) => {
        const pick = sp.user_id ?? guess(sp.speaker);
        const select = h('select', { 'aria-label': `Who is ${sp.speaker}` },
          h('option', { value: '' }, 'Not in the campaign (guest, bot…)'),
          v.members.map((m) => h('option', { value: m.user_id, selected: m.user_id === pick },
            m.role === 'dm' ? `${m.name} (DM)` : `${m.name}${m.character_name ? ` (${m.character_name})` : ''}`)));
        const row = h('div', { class: 'speaker-row' }, h('span', {}, h('strong', {}, sp.speaker), h('span', { class: 'muted small' }, ` · ${plural(sp.lines, 'line')}`)), select);
        const mark = () => row.classList.toggle('unlinked', !select.value);
        select.addEventListener('change', mark);
        mark();
        return { speaker: sp.speaker, select, row };
      });
      who.replaceChildren(
        h('p', { class: 'small' }, h('strong', {}, "Who's who in this transcript"),
          ` · ${plural(p.lines, 'line')}, ${p.first} to ${p.last}. Linking each name to an account is how the AI knows who was at the session (and so who knows what).`),
        ...speakerRows.map((r) => r.row),
      );
      button.disabled = false;
    } catch (err) {
      who.replaceChildren(h('p', { class: 'small error' }, `Can't read this transcript: ${err.message}`));
    }
  }

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return readTranscript(paste.value);
    if (f.size > MAX_BYTES) return say(`That file is too big (limit ${MAX_BYTES / 1024 / 1024} MB).`, true);
    paste.value = '';
    readTranscript(await f.text());
  });
  let pasteTimer;
  paste.addEventListener('input', () => {
    file.value = '';
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => readTranscript(paste.value), 500);
  });

  return h(
    'form',
    {
      class: 'upload-form',
      onsubmit: (e) => {
        e.preventDefault();
        // Enter in a field submits even while the button is disabled.
        if (!transcript.trim() || !speakerRows.length) return say('Choose a transcript file (or paste the text) first.', true);
        const n = Number(number.value);
        if (v.sessions.some((s) => s.number === n)) {
          return say(`Session #${n} already exists in ${campaign.name}. Uploaded transcripts are permanent, so use a new number.`, true);
        }
        const clash = v.sessions.find((s) => s.played_on === date.value);
        if (clash && !confirm(`Session #${clash.number} is already dated ${longDate(date.value)}. Both sessions would get that day's player notes. Upload anyway?`)) return;
        const unlinked = speakerRows.filter((r) => !r.select.value).map((r) => r.speaker);
        if (unlinked.length && !confirm(`These names aren't linked to an account: ${unlinked.join(', ')}.\n\nThat's fine for guests or bots. If any of them is a player, link them first, or the AI won't know they were there.\n\nUpload anyway?`)) return;
        button.disabled = true;
        run(async () => {
          await api('POST', `${base()}/sessions`, {
            number: n,
            played_on: date.value,
            title: title.value.trim() || null,
            transcript,
            speakers: speakerRows.map((r) => ({ speaker: r.speaker, user_id: r.select.value ? Number(r.select.value) : null })),
          });
        }, `Uploaded session #${n} (${longDate(date.value)}) to ${campaign.name}. Processing has started; it can take a few minutes.`).finally(() => {
          if (button.isConnected) button.disabled = !speakerRows.length;
        });
      },
    },
    h('div', { class: 'upload-grid' },
      h('label', {}, 'Session #', number),
      h('label', {}, 'Date played', date),
      h('label', { class: 'grow' }, 'Title', title),
    ),
    dateHint,
    h('label', { class: 'file-label' }, 'Transcript (.txt)', file),
    h('details', {}, h('summary', { class: 'small' }, 'or paste the text'), paste),
    who,
    button,
  );
}

// Each campaign's own colour, the same as on the admin screen (by id, so it never changes).
const HUES = [8, 212, 145, 275, 32, 182, 330, 95];

// ---------- recording from Discord ----------

const clockTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const lengthText = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

/** Link the campaign to a Discord server and voice channel; Start and Stop; recordings waiting to be uploaded. */
function renderRecorder() {
  const { bot, link, live, recordings } = state.rec;
  const out = [h('h3', {}, 'Record from Discord')];
  if (!bot.configured) {
    out.push(h('p', { class: 'small muted' }, 'The Discord bot isn’t set up on this server. Whoever hosts the server adds the bot’s token (DISCORD_BOT_TOKEN) to its .env file; docs/hosting.md in the app’s folder says how. Transcripts from anything else can still be uploaded below.'));
    return out;
  }
  if (bot.error) out.push(h('p', { class: 'small error' }, bot.error));
  else if (!bot.ready) out.push(h('p', { class: 'small muted' }, 'The bot is connecting to Discord…'));
  if (bot.ready && !bot.guilds.length) {
    out.push(h('p', { class: 'small' }, 'The bot isn’t in any Discord server yet. Whoever manages your group’s server opens ',
      bot.invite_url ? h('a', { href: bot.invite_url, target: '_blank', rel: 'noopener' }, 'this invite link') : 'the invite link', ' and picks the server.'));
  }
  if (bot.ready && bot.guilds.length) {
    const guild = bot.guilds.find((g) => g.id === link.guild_id) ?? null;
    const save = (guild_id, channel_id) =>
      run(() => api('PUT', `${base()}/recordings/link`, { guild_id: guild_id || null, channel_id: channel_id || null }), 'Saved where sessions are recorded.');
    const guildSelect = h('select', { 'aria-label': 'Discord server', disabled: !!live, onchange: (e) => save(e.target.value, null) },
      h('option', { value: '' }, 'Choose a Discord server…'),
      bot.guilds.map((g) => h('option', { value: g.id, selected: g.id === link.guild_id }, g.name)));
    const channelSelect = h('select', { 'aria-label': 'Voice channel', disabled: !guild || !!live, onchange: (e) => save(link.guild_id, e.target.value) },
      h('option', { value: '' }, 'Choose a voice channel…'),
      (guild?.voice_channels ?? []).map((c) => h('option', { value: c.id, selected: c.id === link.channel_id }, c.people.length ? `${c.name} (${c.people.join(', ')})` : c.name)));
    out.push(h('div', { class: 'recorder-link' }, h('label', {}, 'Discord server', guildSelect), h('label', {}, 'Voice channel', channelSelect)));
    const current = live && recordings.find((r) => r.id === live.recording);
    if (current) {
      out.push(h('div', { class: 'recorder-live' },
        h('span', { class: 'rec-dot', 'aria-hidden': 'true' }),
        h('span', {}, h('strong', {}, 'Recording'), ` in ${current.channel_name} since ${clockTime(current.started_at)} · ${Object.keys(current.speakers).length} ${Object.keys(current.speakers).length === 1 ? 'person' : 'people'} heard so far`),
        h('button', { class: 'primary', onclick: () => run(() => api('POST', `${base()}/recordings/stop`), 'Recording stopped. It’s being transcribed on the server now.') }, 'Stop')));
    } else {
      out.push(h('div', { class: 'recorder-live' },
        h('button', {
          class: 'primary',
          disabled: !link.guild_id || !link.channel_id,
          onclick: () => run(() => api('POST', `${base()}/recordings/start`), 'Recording. Everyone in the voice channel is told the session is being recorded.'),
        }, 'Start recording'),
        h('span', { class: 'small muted' }, 'Or type /record in Discord (and /stop at the end). Anyone can type /norecord to leave their voice out.')));
    }
  }
  const done = recordings.filter((r) => r.status !== 'recording');
  if (done.length) out.push(h('ul', { class: 'recordings' }, done.map(recordingRow)));
  out.push(h('p', { class: 'small muted' }, 'Recordings are transcribed on the server’s own computer; the audio never leaves it.'));
  return out;
}

function recordingRow(r) {
  const when = `${longDate(r.played_on)}, ${clockTime(r.started_at)}`;
  const length = r.stopped_at ? lengthText(new Date(r.stopped_at) - new Date(r.started_at)) : '';
  const people = Object.values(r.speakers);
  const remove = h('button', {
    class: 'ghost',
    onclick: () => confirm(`Delete the recording from ${when}? Its audio is deleted for good (a transcript you already uploaded stays).`) && run(() => api('DELETE', `${base()}/recordings/${r.id}`), 'Recording deleted.'),
  }, 'Delete');
  const status =
    r.status === 'ready' ? [
      h('span', { class: 'badge ok' }, r.lines ? `transcribed, ${r.lines} lines` : 'nothing was said'),
      r.lines ? h('button', { class: 'primary', onclick: () => useRecording(r) }, 'Use for upload') : null,
      remove,
    ]
    : r.status === 'failed' ? [h('span', { class: 'badge bad' }, 'transcribing failed'), h('span', { class: 'small error' }, r.error ?? ''),
      h('button', { class: 'ghost', onclick: () => run(() => api('POST', `${base()}/recordings/${r.id}/retry`), 'Transcribing again.') }, 'Retry'), remove]
    : [h('span', { class: 'badge warn' }, r.status === 'queued' ? 'waiting to transcribe' : `transcribing ${Math.round((r.progress ?? 0) * 100)}%`), h('span', { class: 'small muted' }, r.message ?? '')];
  return h('li', { class: 'recording' },
    h('div', {}, h('strong', {}, when), h('span', { class: 'small muted' }, ` · ${[length, r.channel_name, people.length ? people.join(', ') : 'nobody spoke'].filter(Boolean).join(' · ')}`)),
    r.note ? h('div', { class: 'small muted' }, r.note) : null,
    h('div', { class: 'recording-actions' }, status));
}

/** The recording's transcript goes into the upload form, to check and upload like any other. */
async function useRecording(r) {
  try {
    const { transcript } = await state.guarded(() => api('GET', `${base()}/recordings/${r.id}/transcript`));
    const box = $('#sessions details.upload');
    box.open = true;
    fillUpload?.(transcript, r.played_on);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    say('The recording’s transcript is in the upload form. Check the session number, date and who’s who, then upload it.');
  } catch (err) {
    say(err.message, true);
  }
}

function draw() {
  list = h('div', { class: 'sessions-list' }, renderList());
  recorder = h('section', { class: 'recorder' }, renderRecorder());
  const box = $('#sessions');
  box.style.setProperty('--hue', HUES[(state.campaign.id - 1) % HUES.length]);
  box.replaceChildren(
    // Which campaign this is: the one in the top bar. Another one is a Switch campaign away.
    h('p', { class: 'sessions-campaign' }, 'For ', h('strong', {}, state.campaign.name)),
    recorder,
    list,
    h('details', { class: 'upload', open: !state.view.sessions.length },
      h('summary', {}, 'Upload a session transcript'),
      uploadForm()),
  );
}

export function initSessionActions() {
  // Opening the tab picks up what changed (and restarts the refresh while something is processing).
  $('[data-tab=sessions]').addEventListener('click', () => state.campaign && state.guarded(refreshList).then(poll, () => {}));
}
