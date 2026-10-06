/**
 * The "Sessions" part of each campaign card on the admin screen: past uploads
 * with their processing state, player notes waiting for a transcript, and the
 * upload form (session number, date played, title, transcript, and who's who
 * in the transcript).
 *
 * Player notes are matched to a session by date, so the date chosen here is
 * what connects a transcript to the notes players took while it was played.
 */
import { api, h } from './api.js';

const MAX_BYTES = 50 * 1024 * 1024; // the server's upload limit (MAX_UPLOAD_MB)

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const longDate = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const notesText = (notes, authors) => (notes ? `${plural(notes, 'note')} from ${plural(authors, 'player')}` : null);

/**
 * @param {{ run: Function, say: Function, guarded: () => Function }} opts
 *   run(fn, message) does something then reloads the admin screen.
 */
export function createSessions({ run, say, guarded }) {
  const views = new Map(); // campaign id -> GET /admin/campaigns/:cid/sessions
  const lists = new Map(); // campaign id -> element holding the sessions list
  let timer = null;

  const busy = (v) => v.sessions.some((s) => ['queued', 'processing'].includes(s.status) || ['queued', 'running'].includes(s.job?.status));

  async function load(ids) {
    const results = await Promise.all(ids.map((id) => api('GET', `/admin/campaigns/${id}/sessions`)));
    ids.forEach((id, i) => views.set(id, results[i]));
    poll();
  }

  /** While anything is processing, refresh just the session lists every few seconds. */
  function poll() {
    clearTimeout(timer);
    const ids = [...views].filter(([, v]) => busy(v)).map(([id]) => id);
    if (!ids.length) return;
    timer = setTimeout(async () => {
      if (document.querySelector('#admin-view').hidden) return;
      try {
        await guarded()(async () => {
          await load(ids);
          for (const id of ids) {
            const el = lists.get(id);
            if (el?.isConnected) el.replaceChildren(...renderList(id));
          }
        });
      } catch {
        poll(); // try again later
      }
    }, 4000);
  }

  // ---------- past uploads ----------

  function statusOf(campaignId, s) {
    const retry = (label) =>
      h('button', {
        class: 'ghost',
        onclick: () => run(() => api('POST', `/campaigns/${campaignId}/sessions/${s.number}/process`), `Session ${s.number} is queued for processing.`),
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

  function renderList(campaignId) {
    const v = views.get(campaignId);
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
          h('td', { class: 'status-cell' }, statusOf(campaignId, s)),
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

  function uploadForm(c) {
    const v = views.get(c.id);
    const number = h('input', { type: 'number', min: 1, step: 1, value: v.next_number, required: true, 'aria-label': 'Session number' });
    const date = h('input', { type: 'date', value: v.notes_waiting[0]?.date ?? v.today, required: true, 'aria-label': 'Date played' });
    const title = h('input', { placeholder: 'Title (optional)', maxLength: 200, 'aria-label': 'Title' });
    const file = h('input', { type: 'file', accept: '.txt,text/plain', 'aria-label': 'Transcript file' });
    const paste = h('textarea', { rows: 4, placeholder: '[00:00:05] Speaker Name: what they said', 'aria-label': 'Transcript text' });
    const dateHint = h('p', { class: 'small hint' });
    const who = h('div', { class: 'speakers' });
    const button = h('button', { type: 'submit', class: 'primary', disabled: true }, 'Upload session');
    let transcript = '';
    let speakerRows = [];

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

    // Best guess at who a transcript name is: an account or character whose name it contains.
    const guess = (speaker) => {
      const s = speaker.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hit = c.members.filter((m) =>
        [m.name, m.character_name].filter(Boolean).some((n) => {
          const k = n.toLowerCase().replace(/[^a-z0-9]/g, '');
          return k.length >= 3 && s.includes(k);
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
        const p = await guarded()(() => api('POST', `/campaigns/${c.id}/sessions/preview`, { transcript: text }));
        if (!p) return;
        speakerRows = p.speakers.map((sp) => {
          const pick = sp.user_id ?? guess(sp.speaker);
          const select = h('select', { 'aria-label': `Who is ${sp.speaker}` },
            h('option', { value: '' }, 'Not in the campaign (guest, bot…)'),
            c.members.map((m) => h('option', { value: m.user_id, selected: m.user_id === pick },
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
            return say(`Session #${n} already exists. Uploaded transcripts are permanent, so use a new number.`, true);
          }
          const clash = v.sessions.find((s) => s.played_on === date.value);
          if (clash && !confirm(`Session #${clash.number} is already dated ${longDate(date.value)}. Both sessions would get that day's player notes. Upload anyway?`)) return;
          const unlinked = speakerRows.filter((r) => !r.select.value).map((r) => r.speaker);
          if (unlinked.length && !confirm(`These names aren't linked to an account: ${unlinked.join(', ')}.\n\nThat's fine for guests or bots. If any of them is a player, link them first, or the AI won't know they were there.\n\nUpload anyway?`)) return;
          button.disabled = true;
          run(async () => {
            await api('POST', `/campaigns/${c.id}/sessions`, {
              number: n,
              played_on: date.value,
              title: title.value.trim() || null,
              transcript,
              speakers: speakerRows.map((r) => ({ speaker: r.speaker, user_id: r.select.value ? Number(r.select.value) : null })),
            });
          }, `Uploaded session #${n} (${longDate(date.value)}). Processing has started; it can take a few minutes.`).finally(() => {
            button.disabled = !speakerRows.length;
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

  /** The whole Sessions section for one campaign card. */
  function section(c) {
    const list = h('div', { class: 'sessions-list' }, renderList(c.id));
    lists.set(c.id, list);
    return h('div', { class: 'sessions' },
      list,
      h('details', { class: 'upload', open: !views.get(c.id).sessions.length },
        h('summary', {}, 'Upload a session transcript'),
        uploadForm(c)),
    );
  }

  return { load, section };
}
