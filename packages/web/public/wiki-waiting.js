/**
 * The AI's changes to the DM's wiki (src/wiki-ai.js): after each session the
 * AI proposes new pages, changed sections and reveals; each waits here for
 * Approve, Edit then approve, or Reject.
 */
import { api, h } from './api.js';
import { state, nav, base, status, report, availableText, playerName, sourceImg, SOURCE_NOUN } from './wiki-data.js';
import { sectionBody, availablePicker, richText } from './wiki-page.js';
import { characterOffers } from './wiki-sheet.js';
import { TONES } from './shared/wiki.js';

const $ = (sel) => document.querySelector(sel);

const busy = (run) => run && (run.status === 'queued' || run.status === 'running');

/** While the AI is reading, look again every few seconds (only while the list is open). */
function pollWhileBusy() {
  clearTimeout(state.poll);
  if (!busy(state.aiRun)) return;
  state.poll = setTimeout(async () => {
    if (state.view !== 'review') return;
    try {
      await state.guarded(() => nav.refreshList());
      drawReview();
    } catch (err) {
      report(err);
    }
  }, 3000);
}

function runLine() {
  const run = state.aiRun;
  if (!run) return "The AI hasn't read the records for the wiki yet.";
  if (busy(run)) return `The AI is reading the records… ${run.message ?? ''}`.trim();
  if (run.status === 'failed') return `The AI's last read failed: ${run.error ?? 'unknown error'}`;
  const when = run.finished_at ? new Date(`${run.finished_at.replace(' ', 'T')}${run.finished_at.endsWith('Z') ? '' : 'Z'}`).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `Last read ${when}: ${run.message ?? 'done'}.`;
}

export async function drawReview() {
  const main = $('#wiki-main');
  const head = h('div', { class: 'wiki-page-head' },
    h('h2', {}, "The AI's changes"),
    h('div', { class: 'wiki-actions' },
      h('button', { type: 'button', class: 'ghost', disabled: busy(state.aiRun), onclick: runAI }, 'Read the records now'),
    ),
  );
  main.replaceChildren(h('article', { class: 'wiki-page wiki-review' }, head,
    h('p', { class: 'muted small' }, 'After each session the AI reads what the archivist recorded and suggests changes here. Nothing reaches a page until you approve it. Each part is offered only to the players who know it; you can change that before approving.'),
    h('p', { class: 'wiki-run small' }, runLine()),
    h('p', { class: 'muted small' }, 'Loading…'),
  ));
  main.prepend(nav.phoneBack());
  try {
    const { proposals, ai_run: run, characters } = await state.guarded(() => api('GET', `${base()}/proposals`));
    if (state.view !== 'review') return;
    state.aiRun = run;
    state.proposals = proposals.length;
    nav.drawReviewButton();
    main.querySelector('.wiki-run').textContent = runLine();
    main.querySelector('.wiki-run + p').replaceWith(proposals.length
      ? h('div', { class: 'wiki-proposals' },
          h('div', { class: 'wiki-actions' }, h('button', { type: 'button', class: 'primary', onclick: approveAll }, `Approve all ${proposals.length}`)),
          ...proposals.map(proposalCard))
      : h('p', { class: 'muted' }, 'Nothing waiting for you.'));
    const offers = characterOffers(characters);
    if (offers) main.querySelector('.wiki-run').after(offers);
    pollWhileBusy();
  } catch (err) {
    report(err);
  }
}

async function runAI() {
  try {
    await state.guarded(async () => {
      const res = await api('POST', `${base()}/proposals/run`, {});
      state.aiRun = res.ai_run;
      status('The AI is reading the records.');
      drawReview();
    });
  } catch (err) {
    report(err);
  }
}

async function approveAll() {
  if (!confirm('Approve every change as it is?')) return;
  try {
    await state.guarded(async () => {
      const res = await api('POST', `${base()}/proposals/approve-all`, {});
      await nav.refreshList();
      status(`Approved ${res.approved}.${res.failed.length ? ` ${res.failed.length} couldn't be: ${res.failed.map((f) => f.error).join(' ')}` : ''}`, !!res.failed.length);
      drawReview();
    });
  } catch (err) {
    report(err);
  }
}

/** Who a proposed or current section is available to, in a line. */
const sectionAvailable = (a) => h('p', { class: 'wiki-available small' }, a === 'all' ? 'Available as the page.' : `Available to ${availableText(a)}.`);

const TAGS = { new_page: 'New page', update_section: 'Change', add_section: 'New section', reveal: 'Reveal', set_fact: 'Tie', set_when: 'Time', add_event: 'Event' };

/** One of the AI's changes: what's there now beside what it proposes, and Approve, Edit, Reject. */
function proposalCard(p) {
  const card = h('div', { class: 'wiki-proposal card' });
  const tag = p.from === 'player' ? `From ${playerName(p.by_player)}` : p.dm_section ? 'Suggestion for your section' : TAGS[p.action];
  const where = p.action === 'new_page' ? p.title : p.action === 'set_fact' ? `${p.page_title} › ${p.fact.label}` : p.action === 'set_when' || p.action === 'add_event' ? p.page_title : `${p.page_title}${p.action === 'reveal' ? ` › ${p.section_heading || '(opening section)'}` : p.action === 'update_section' && p.current?.heading ? ` › ${p.current.heading}` : ''}`;
  const edits = { sections: p.sections.map(() => null) };
  const done = async (path, body, message) => {
    try {
      await state.guarded(async () => {
        const res = await api('POST', `${base()}/proposals/${p.id}/${path}`, body);
        await nav.refreshList();
        status(message(res));
        drawReview();
      });
    } catch (err) {
      report(err);
    }
  };

  const body = h('div', { class: 'wiki-proposal-body' });
  let pagePicker = null;
  let playerBoxes = [];
  let usePicture = null;
  let factEdit = null;
  let timeEdit = null;
  // A time as the AI wrote it, and what the calendar reads it as.
  const timeLine = (w) => h('span', {}, w?.text || 'No time', w?.reads && w.reads !== w.text ? h('span', { class: 'muted small' }, ` (reads as ${w.reads})`) : null);
  const eventLine = (e) => h('div', { class: 'wiki-proposed-event' }, e.when?.text ? h('strong', {}, timeLine(e.when), ': ') : null, richText(e.text, 'wiki-event-text'), e.canon && e.canon !== 'true' ? h('span', { class: 'muted small' }, ` (${e.canon})`) : null, sectionAvailable(e.available ?? 'all'));
  const factLine = (f) => h('div', { class: 'wiki-proposed-fact' }, h('strong', {}, `${f.label}: `), richText(f.value, 'wiki-fact-value'), f.canon && f.canon !== 'true' ? h('span', { class: 'muted small' }, ` (${f.canon})`) : null, sectionAvailable(f.available ?? 'all'));
  const draw = (editing) => {
    const parts = [];
    if (p.action === 'set_when') {
      // A page's time (stage 4d): what it says now beside the AI's.
      const input = h('input', { value: p.when.text, maxLength: 200, 'aria-label': 'Proposed time' });
      timeEdit = editing ? { when: input } : null;
      const proposed = h('div', { class: 'wiki-proposed' }, editing ? input : timeLine(p.when));
      parts.push(p.current_when
        ? h('div', { class: 'wiki-compare' }, h('div', { class: 'wiki-now' }, h('div', { class: 'muted small' }, 'Now'), timeLine(p.current_when)), h('div', {}, h('div', { class: 'muted small' }, 'Proposed'), proposed))
        : proposed);
    } else if (p.action === 'add_event') {
      const when = h('input', { value: p.event.when?.text ?? '', maxLength: 200, placeholder: 'When (optional)', 'aria-label': 'Proposed event time' });
      const text = h('textarea', { rows: 3, maxLength: 2000, 'aria-label': 'Proposed event' });
      text.value = p.event.text;
      const picker = availablePicker(p.event.available, { section: true, label: 'Proposed event available to' });
      timeEdit = editing ? { when, text, picker } : null;
      parts.push(editing ? h('div', { class: 'wiki-proposed wiki-event-edit' }, when, text, h('label', { class: 'small' }, 'Available to ', picker.el)) : h('div', { class: 'wiki-proposed' }, eventLine(p.event)));
    } else if (p.action === 'set_fact') {
      // A tie (stage 3e): what the page says now beside the AI's, and when editing, its words, tone and who it's for.
      const label = h('input', { value: p.fact.label, maxLength: 60, 'aria-label': 'Proposed tie' });
      const value = h('input', { value: p.fact.value, maxLength: 500, 'aria-label': 'Proposed tie to' });
      const tone = h('select', { 'aria-label': 'How they feel' }, h('option', { value: '' }, 'From the label'), ...TONES.map((x) => h('option', { value: x, selected: p.fact.tone === x }, x[0].toUpperCase() + x.slice(1))));
      const picker = availablePicker(p.fact.available, { section: true, label: 'Proposed tie available to' });
      factEdit = editing ? { label, value, tone, picker } : null;
      const proposed = editing ? h('div', { class: 'wiki-proposed wiki-fact-row' }, label, value, tone, picker.el) : h('div', { class: 'wiki-proposed' }, factLine(p.fact));
      parts.push(p.current_fact
        ? h('div', { class: 'wiki-compare' }, h('div', { class: 'wiki-now' }, h('div', { class: 'muted small' }, 'Now'), factLine(p.current_fact)), h('div', {}, h('div', { class: 'muted small' }, 'Proposed'), proposed))
        : proposed);
      if (p.current_fact && p.current_fact.canon !== 'true') parts.push(h('p', { class: 'muted small' }, `It stays marked ${p.current_fact.canon}, as you set it.`));
    } else if (p.action === 'reveal') {
      playerBoxes = p.players.map((id) => h('label', {}, h('input', { type: 'checkbox', value: String(id), checked: true }), ` ${playerName(id)}`));
      parts.push(h('p', {}, 'Make this section available to ', ...playerBoxes, '?'));
      parts.push(h('p', { class: 'muted small' }, 'The records say they know it now. Nothing else on the page changes for them.'));
    } else {
      if (p.action === 'new_page') {
        pagePicker = availablePicker(p.page_available, { label: 'Page available to' });
        if (p.picture) {
          usePicture = h('input', { type: 'checkbox', checked: usePicture?.checked ?? true });
          parts.push(h('label', { class: 'wiki-suggested-pic' }, usePicture, sourceImg(p.picture), h('span', {}, `Use the picture of ${p.picture.name} (your ${SOURCE_NOUN[p.picture.kind]}) as its main picture`)));
        }
        parts.push(h('p', { class: 'muted small' }, [p.kind, p.aliases?.length && `also called ${p.aliases.join(', ')}`, p.parent && `inside ${state.pages.find((x) => x.id === p.parent)?.title ?? 'another page'}`].filter(Boolean).join(' · ')));
        parts.push(h('label', { class: 'small' }, 'Page available to ', pagePicker.el));
        if (p.when) parts.push(h('p', { class: 'small' }, h('span', { class: 'muted' }, 'When: '), timeLine(p.when)));
        if (p.events?.length) parts.push(h('div', { class: 'wiki-proposed-events' }, h('div', { class: 'muted small' }, 'Events'), ...p.events.map(eventLine)));
        if (p.facts?.length) parts.push(h('div', { class: 'wiki-proposed-facts' }, h('div', { class: 'muted small' }, 'Ties'), ...p.facts.map(factLine)));
      }
      p.sections.forEach((s, i) => {
        const now = p.action === 'update_section' ? p.current : null;
        const heading = h('input', { value: s.heading, maxLength: 200, placeholder: 'Heading (optional)', 'aria-label': 'Proposed heading' });
        const text = h('textarea', { rows: 8, 'aria-label': 'Proposed text' });
        text.value = s.text;
        const picker = availablePicker(s.available, { section: true, label: 'Proposed section available to' });
        edits.sections[i] = editing ? { heading, text, picker } : null;
        const proposed = editing
          ? h('div', { class: 'wiki-proposed' }, heading, h('label', { class: 'small' }, 'Available to ', picker.el), text)
          : h('div', { class: 'wiki-proposed' },
              s.heading ? h('h3', {}, s.heading) : null,
              sectionAvailable(s.available),
              ...sectionBody(s.text));
        parts.push(now
          ? h('div', { class: 'wiki-compare' },
              h('div', { class: 'wiki-now' }, h('div', { class: 'muted small' }, 'Now'), now.heading ? h('h3', {}, now.heading) : null, sectionAvailable(now.available), ...sectionBody(now.text)),
              h('div', {}, h('div', { class: 'muted small' }, 'Proposed'), proposed))
          : proposed);
      });
    }
    body.replaceChildren(...parts);
  };
  draw(false);

  // A player's lore (stage 6c): what it is once approved, their account by default.
  const canonPick = p.from === 'player' ? h('select', { 'aria-label': 'Approve it as' },
    h('option', { value: 'told' }, `${playerName(p.by_player)}'s account`), h('option', { value: 'true' }, 'True'), h('option', { value: 'false' }, 'False (with the truth)')) : null;
  const truth = canonPick ? h('input', { maxLength: 2000, placeholder: 'What is really so (only you see this)', 'aria-label': 'The truth', hidden: true }) : null;
  canonPick?.addEventListener('change', () => { truth.hidden = canonPick.value !== 'false'; });
  const approve = h('button', { type: 'button', class: 'primary', disabled: p.gone, onclick: () => {
    const out = {};
    if (canonPick) {
      out.canon = canonPick.value;
      if (out.canon === 'false') out.truth = truth.value.trim();
    }
    if (pagePicker) out.page_available = pagePicker.value();
    if (usePicture && !usePicture.checked) out.use_picture = false;
    if (factEdit) out.fact = { label: factEdit.label.value.trim(), value: factEdit.value.value.trim(), tone: factEdit.tone.value || null, available: factEdit.picker.value() };
    if (timeEdit && p.action === 'set_when') {
      if (!timeEdit.when.value.trim()) return status('Give it a time, or reject it.', true);
      out.when = timeEdit.when.value.trim();
    }
    if (timeEdit && p.action === 'add_event') {
      if (!timeEdit.text.value.trim()) return status('Say what happened, or reject it.', true);
      out.event = { when: timeEdit.when.value.trim(), text: timeEdit.text.value.trim(), available: timeEdit.picker.value() };
    }
    if (edits.sections.some(Boolean)) out.sections = edits.sections.map((e) => (e ? { heading: e.heading.value.trim(), text: e.text.value, available: e.picker.value() } : {}));
    if (p.action === 'reveal') {
      out.players = playerBoxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => Number(i.value));
      if (!out.players.length) return status('Tick at least one player, or reject it.', true);
    }
    done('approve', out, (res) => `Approved: ${res.page.title}.`);
  } }, 'Approve');
  const edit = h('button', { type: 'button', class: 'ghost', hidden: p.action === 'reveal' || p.gone, onclick: () => {
    draw(true);
    edit.hidden = true;
    approve.textContent = 'Approve with my changes';
  } }, 'Edit');
  const reject = h('button', { type: 'button', class: 'ghost danger', onclick: () => done('reject', {}, () => (p.from === 'player' ? `Rejected. ${playerName(p.by_player)} sees it wasn't used.` : 'Rejected. The AI won\'t suggest it again.')) }, 'Reject');

  card.append(...[
    h('div', { class: 'wiki-proposal-head' }, h('span', { class: 'wiki-tag small' }, tag), h('strong', {}, where)),
    p.reason ? h('p', { class: 'muted small' }, p.reason) : null,
    p.gone ? h('p', { class: 'wiki-warn small' }, 'That page or section is gone, so this can only be rejected.') : null,
    p.dm_section ? h('p', { class: 'muted small' }, 'You wrote this section. The AI thinks the records disagree with it.') : null,
    body,
    canonPick ? h('div', { class: 'wiki-lore-canon small' }, h('label', {}, 'Approve it as ', canonPick), truth) : null,
    h('div', { class: 'wiki-actions' }, approve, edit, reject),
  ].filter(Boolean));
  return card;
}
