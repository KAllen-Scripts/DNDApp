/**
 * The web page. Display only: it sends what people type to the DNDApp server
 * and shows what comes back. Players get Ask and Notes; the admin login gets
 * the admin screen (admin.js) instead. The Sheet tab is in sheet.js; the DM
 * gets Creatures (creatures.js) in its place, and Items (items.js) and
 * Merchants (merchants.js) to set up shops.
 */
import { api, stream, storage, getToken, setToken, LoggedOut, h } from './api.js';
import { showAdmin } from './admin.js';
import { loadSheet, initSheetActions, flush as flushSheet } from './sheet.js';
import { markdownFragment } from './markdown.js';
import { CITATION_RE } from './shared/citations.js';
import { initLook } from './look.js';
import { initDice, setDiceCampaign } from './dice.js';
import { loadMaps, initMapActions, stopMaps } from './map.js';
import { placeCreature, placeMerchant } from './map-dm.js';
import { loadTable, stopTable, handoutsOpened } from './table.js';
import { setRestsCampaign, initRests } from './rests.js';
import { loadArchivist, initArchivistActions } from './archivist.js';
import { loadCreatures, initCreatureActions } from './creatures.js';
import { loadItems, initItemActions } from './items.js';
import { loadMerchants, initMerchantActions, merchantsOpened } from './merchants.js';
import { SHEET_WINDOW, windowCampaign, besidePanel, placeBeside, setSheetCampaign, initSheetPlace } from './sheet-place.js';

const $ = (sel) => document.querySelector(sel);
const CAMPAIGN_KEY = 'dndapp.campaign'; // last campaign chosen in this browser (pre-selected next time)

// The campaign this browser tab is in. Survives reloads, but a new visit asks again.
const TAB_CAMPAIGN_KEY = 'dndapp.tabCampaign';
const tabCampaign = {
  get() {
    try { return sessionStorage.getItem(TAB_CAMPAIGN_KEY); } catch { return null; }
  },
  set(id) {
    try { id == null ? sessionStorage.removeItem(TAB_CAMPAIGN_KEY) : sessionStorage.setItem(TAB_CAMPAIGN_KEY, String(id)); } catch { /* ignore */ }
  },
};

// ---------- state ----------

const state = {
  me: null,
  campaign: null, // { id, name, role, character_name }
  conversationId: null,
  asking: false,
};

// ---------- views ----------

function hideAll() {
  for (const id of ['#login-view', '#password-view', '#campaign-view', '#app-view', '#admin-view']) $(id).hidden = true;
}

function showLogin(message) {
  stopMaps();
  setToken(null);
  tabCampaign.set(null);
  state.me = null;
  hideAll();
  $('#login-view').hidden = false;
  const err = $('#login-error');
  err.textContent = message ?? '';
  err.hidden = !message;
  $('#login-form [name=password]').value = '';
  $('#login-form [name=name]').focus();
}

/** Run an action; if the login has expired, go back to the login screen. */
async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LoggedOut) showLogin(err.message || 'Please log in again.');
    else throw err;
  }
}

async function start() {
  if (!getToken()) return showLogin();
  await guarded(async () => {
    state.me = await api('GET', '/me');
    hideAll();
    // The admin can require a new password at next login; nothing else works until it's done.
    if (state.me.user.must_change_password) return showPasswordChange({ forced: true });
    if (state.me.user.is_admin) {
      $('#admin-view').hidden = false;
      return showAdmin({ me: state.me.user, guarded });
    }
    const campaigns = state.me.campaigns;
    // A popped-out sheet window is for the campaign it was opened from.
    const current = campaigns.find((c) => String(c.id) === ((SHEET_WINDOW && windowCampaign()) || tabCampaign.get()));
    if (current) return enterCampaign(current);
    if (campaigns.length === 1) return enterCampaign(campaigns[0]);
    showCampaignPicker();
  });
}

// ---------- changing your own password ----------

function showPasswordChange({ forced }) {
  hideAll();
  $('#password-view').hidden = false;
  const form = $('#password-form');
  form.reset();
  form.username.value = state.me.user.name;
  $('#password-error').hidden = true;
  $('#password-reason').textContent = forced
    ? `Hi ${state.me.user.name}. Before you continue, please replace the password you were given with one of your own.`
    : 'Your other devices will be logged out. This one stays logged in.';
  $('#password-cancel').hidden = forced;
  form.current.focus();
}

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const error = (text) => {
    $('#password-error').textContent = text;
    $('#password-error').hidden = false;
  };
  $('#password-error').hidden = true;
  if (form.next.value !== form.again.value) return error("The new passwords don't match.");
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    await guarded(() => api('POST', '/account/password', { current_password: form.current.value, new_password: form.next.value }));
    form.reset();
    await start();
  } catch (err) {
    error(err.message);
  } finally {
    button.disabled = false;
  }
});

$('#password-cancel').addEventListener('click', () => start());
for (const button of document.querySelectorAll('.change-password')) {
  button.addEventListener('click', () => showPasswordChange({ forced: false }));
}

const describe = (c) => (c.role === 'dm' ? 'DM' : c.character_name ? `playing ${c.character_name}` : 'player');

/** After logging in: choose which campaign to be in (skipped when there's only one). */
function showCampaignPicker() {
  hideAll();
  tabCampaign.set(null);
  $('#campaign-view').hidden = false;
  const campaigns = state.me.campaigns;
  $('#campaign-hello').textContent = `Hi ${state.me.user.name}`;
  $('#campaign-form').hidden = !campaigns.length;
  $('#no-campaigns').hidden = !!campaigns.length;
  const select = $('#campaign-pick');
  select.replaceChildren(...campaigns.map((c) => new Option(`${c.name} (${describe(c)})`, c.id)));
  const last = campaigns.find((c) => String(c.id) === storage.get(CAMPAIGN_KEY));
  if (last) select.value = last.id;
  select.focus();
}

$('#campaign-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const campaign = state.me.campaigns.find((c) => String(c.id) === $('#campaign-pick').value);
  if (campaign) guarded(() => enterCampaign(campaign));
});

$('#switch-campaign').addEventListener('click', async () => {
  await flushSheet();
  stopMaps();
  showCampaignPicker();
});

/** Everything on the Ask and Notes tabs belongs to this campaign. */
async function enterCampaign(campaign) {
  hideAll();
  $('#app-view').hidden = false;
  state.campaign = campaign;
  storage.set(CAMPAIGN_KEY, String(campaign.id));
  tabCampaign.set(campaign.id);
  $('#campaign-name').textContent = campaign.name;
  $('#character').textContent = describe(campaign);
  $('#switch-campaign').hidden = state.me.campaigns.length < 2;
  newConversation();
  const isDm = campaign.role === 'dm';
  // The Archivist tab is the DM's; a player who was on it goes back to the first tab.
  $('[data-tab=archivist]').hidden = !isDm;
  // The DM gets Creatures (enemies and NPCs to put on maps) instead of a character sheet.
  $('[data-tab=sheet]').hidden = isDm;
  $('[data-tab=creatures]').hidden = !isDm;
  // ...and Items and Merchants, to set up shops players buy from.
  $('[data-tab=items]').hidden = !isDm;
  $('[data-tab=merchants]').hidden = !isDm;
  $('#map-sheet-window').hidden = isDm;
  // A tab this person doesn't have (now) goes to Creatures for the DM's sheet, else the first tab.
  const here = $(`[data-tab="${currentTab}"]`);
  if (isDm && currentTab === 'sheet') showTab('creatures');
  else showTab(here.hidden || here.classList.contains('user-hidden') ? firstTab() : currentTab);
  setSheetCampaign(campaign.id);
  setRestsCampaign({ campaignId: campaign.id, guarded, isDm, userId: state.me.user.id });
  if (SHEET_WINDOW && isDm) {
    // A sheet window left open from before someone became the DM: there's no sheet to show.
    $('#tab-sheet').hidden = false;
    $('#sheet').replaceChildren(h('p', { class: 'muted' }, 'The DM has Creatures instead of a character sheet. Close this window.'));
    $('.sheet-bar').hidden = true;
    return;
  }
  if (SHEET_WINDOW) {
    // The popped-out sheet: only the sheet, and dice to roll from it.
    document.title = `${campaign.character_name || 'Sheet'} · ${campaign.name}`;
    showTab('sheet');
    await Promise.all([
      setDiceCampaign({ campaignId: campaign.id, guarded, roller: state.me.dice?.roller, isDm, userId: state.me.user.id }),
      loadSheet({ campaignId: campaign.id, userId: state.me.user.id, guarded }),
    ]);
    return;
  }
  await Promise.all([
    setDiceCampaign({ campaignId: campaign.id, guarded, roller: state.me.dice?.roller, isDm, userId: state.me.user.id }),
    loadConversations(),
    loadNotes(),
    isDm ? null : loadSheet({ campaignId: campaign.id, userId: state.me.user.id, guarded }),
    loadMaps({ campaignId: campaign.id, userId: state.me.user.id, guarded }),
    loadTable({ campaignId: campaign.id, guarded }),
    isDm ? loadArchivist({ campaignId: campaign.id, guarded }) : null,
    isDm ? loadCreatures({ campaignId: campaign.id, guarded }) : null,
    isDm ? loadItems({ campaignId: campaign.id, guarded }) : null,
    loadMerchants({ campaignId: campaign.id, guarded, isDm }),
  ]);
}

const base = () => `/campaigns/${state.campaign.id}`;

// ---------- login / logout ----------

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const { token } = await api('POST', '/login', { name: form.name.value, password: form.password.value });
    setToken(token);
    form.password.value = '';
    $('#login-error').hidden = true;
    await start();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
  } finally {
    button.disabled = false;
  }
});

for (const button of document.querySelectorAll('.logout')) {
  button.addEventListener('click', async () => {
    await flushSheet().catch(() => {});
    stopMaps();
    stopTable();
    await api('POST', '/logout').catch(() => {});
    showLogin();
  });
}

// ---------- tabs ----------

// The tab to open on: chosen under Look (look-boot.js), Ask unless changed.
let currentTab = window.dndLook.get().startTab;

/** Show a tab. On the map, another panel can be beside it too (sheet-place.js). */
function showTab(name) {
  currentTab = name;
  const beside = name === 'map' ? besidePanel() : null; // never a tab this person doesn't have (sheet-place.js)
  for (const t of document.querySelectorAll('[data-tab]')) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    $(`#tab-${t.dataset.tab}`).hidden = !(on || t.dataset.tab === beside);
  }
  placeBeside(beside);
  if (beside === 'handouts') handoutsOpened();
  if (name === 'merchants' || beside === 'merchants') merchantsOpened();
  // The sheet and maps need more room than Ask and Notes.
  $('#app-view').classList.toggle('wide', name === 'sheet' || name === 'map' || name === 'creatures' || name === 'items' || name === 'merchants');
}

/** The first tab along the bar that's shown (tabs can be reordered and hidden under Look). */
const firstTab = () => [...document.querySelectorAll('[data-tab]')].find((t) => !t.hidden && !t.classList.contains('user-hidden'))?.dataset.tab ?? 'ask';

// Changing the look can hide the tab you're on, or change what goes beside the map.
window.addEventListener('dndlook', () => {
  if (SHEET_WINDOW) return;
  showTab($(`[data-tab="${currentTab}"]`).classList.contains('user-hidden') ? firstTab() : currentTab);
});

for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => {
    showTab(tab.dataset.tab);
    if (tab.dataset.tab === 'ask' || tab.dataset.tab === 'notes') $(`#tab-${tab.dataset.tab} textarea`)?.focus();
    if (tab.dataset.tab === 'handouts') handoutsOpened();
  });
}

// ---------- answers: text, citations, evidence ----------

const citationKey = (num, from, to) => `S${num}${from ? ` ${from}${to ? `-${to}` : ''}` : ''}`;

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Citations in text -> buttons that jump to the evidence (plain labels when there's no evidence for them). */
function linkCitations(root, sources) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('code, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const texts = [];
  while (walker.nextNode()) if (walker.currentNode.data.search(CITATION_RE) >= 0) texts.push(walker.currentNode);
  for (const node of texts) {
    const html = escapeHtml(node.data).replace(CITATION_RE, (match, num, from, to) => {
      const key = citationKey(num, from, to);
      const label = escapeHtml(match.slice(1, -1));
      return sources.has(key)
        ? `<button type="button" class="cite" data-source="${escapeHtml(key)}">${label}</button>`
        : `<span class="cite static">${label}</span>`;
    });
    const t = document.createElement('template');
    t.innerHTML = html;
    node.replaceWith(t.content);
  }
}

/** Answer text (markdown and/or HTML) -> sanitised HTML, with citations as buttons. */
function renderAnswer(text, evidence = []) {
  const root = markdownFragment(text);
  // Wide tables scroll inside the answer rather than stretching the page.
  for (const table of root.querySelectorAll('table')) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.replaceWith(wrap);
    wrap.append(table);
  }
  linkCitations(root, new Set(evidence.map((e) => e.source)));
  const box = document.createElement('div');
  box.append(root);
  return box.innerHTML;
}

function renderEvidence(evidence) {
  if (!evidence?.length) return null;
  const box = document.createElement('div');
  box.className = 'evidence';
  box.innerHTML = '<h3>From the sessions</h3>';
  for (const e of evidence) {
    const fig = document.createElement('figure');
    fig.dataset.source = e.source;
    const cap = document.createElement('figcaption');
    cap.textContent = e.source.replace(/^S(\d+)/, 'Session $1');
    const pre = document.createElement('pre');
    pre.textContent = e.excerpt;
    fig.append(cap, pre);
    box.append(fig);
  }
  return box;
}

$('#thread').addEventListener('click', (e) => {
  const cite = e.target.closest('button.cite');
  if (!cite) return;
  const fig = [...cite.closest('.a').querySelectorAll('.evidence figure')].find((f) => f.dataset.source === cite.dataset.source);
  if (!fig) return;
  fig.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  fig.classList.add('flash');
  setTimeout(() => fig.classList.remove('flash'), 1200);
});

function addTurn(question, answer = '', evidence = []) {
  $('#thread .empty')?.remove();
  const q = document.createElement('div');
  q.className = 'q';
  q.textContent = question;
  const a = document.createElement('div');
  a.className = 'a';
  const body = document.createElement('div');
  body.innerHTML = renderAnswer(answer, evidence);
  a.append(body);
  const ev = renderEvidence(evidence);
  if (ev) a.append(ev);
  $('#thread').append(q, a);
  return { a, body };
}

// ---------- asking ----------

// ---------- chats: list, open, pin, rename, delete ----------

const ICONS = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3.5 20.5 9.5 17 11l-3.5 3.5.5 4-1.5 1.5-4-4-4.5 4.5L3.5 20l4.5-4.5-4-4L5.5 10l4 .5L13 7z" fill="currentColor"/></svg>',
  unpin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3.5 20.5 9.5 17 11l-3.5 3.5.5 4-1.5 1.5-4-4-4.5 4.5L3.5 20l4.5-4.5-4-4L5.5 10l4 .5L13 7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const EMPTY_THREAD = '<p class="empty muted">Ask anything about the campaign, or about D&amp;D in general. Campaign answers only use what your character knows, with links back to the session.</p>';

const chats = { list: [] };
const currentChat = () => chats.list.find((c) => c.id === state.conversationId);
const chatName = (c) => c.title || 'Untitled chat';

const chatDate = (c) => {
  const d = new Date(`${(c.updated_at ?? c.created_at).replace(' ', 'T')}Z`);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (now - d < 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** The chat list is a drawer in some layouts (a sidebar on wide screens in others; CSS decides). */
function setChatsOpen(open) {
  $('#tab-ask').classList.toggle('chats-open', open);
  $('#chats-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('#chat-filter').focus();
}
$('#chats-toggle').addEventListener('click', () => setChatsOpen(!$('#tab-ask').classList.contains('chats-open')));
$('.chats-close').addEventListener('click', () => setChatsOpen(false));
$('.chats-scrim').addEventListener('click', () => setChatsOpen(false));
$('#chats').addEventListener('keydown', (e) => e.key === 'Escape' && setChatsOpen(false));

function iconButton(button, icon, label) {
  button.innerHTML = ICONS[icon];
  button.title = label;
  button.setAttribute('aria-label', label);
}

/** The header above the thread: the open chat's title and its pin / rename / delete buttons. */
function drawChatHead() {
  const c = currentChat();
  $('#chat-title').textContent = c ? chatName(c) : 'New chat';
  for (const id of ['#chat-pin', '#chat-rename', '#chat-delete']) $(id).hidden = !c;
  if (!c) return;
  iconButton($('#chat-pin'), c.pinned ? 'pin' : 'unpin', c.pinned ? 'Unpin this chat' : 'Pin this chat to the top');
  $('#chat-pin').setAttribute('aria-pressed', String(c.pinned));
  iconButton($('#chat-rename'), 'rename', 'Rename this chat');
  iconButton($('#chat-delete'), 'trash', 'Delete this chat');
}

function drawChatList() {
  const filter = $('#chat-filter').value.trim().toLowerCase();
  const shown = chats.list.filter((c) => !filter || chatName(c).toLowerCase().includes(filter));
  const box = $('#chat-list');
  const none = (text) => {
    const p = document.createElement('p');
    p.className = 'muted small chat-none';
    p.textContent = text;
    box.replaceChildren(p);
  };
  if (!chats.list.length) return none('No chats yet. Ask something and it will appear here.');
  if (!shown.length) return none('No chats match.');
  const group = (label, items) => {
    if (!items.length) return [];
    const h = document.createElement('h3');
    h.textContent = label;
    return [h, ...items.map(chatRow)];
  };
  box.replaceChildren(...group('Pinned', shown.filter((c) => c.pinned)), ...group('Recent', shown.filter((c) => !c.pinned)));
}

function chatRow(c) {
  const row = document.createElement('div');
  row.className = 'chat-row';
  row.classList.toggle('current', c.id === state.conversationId);
  row.classList.toggle('pinned', c.pinned);
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'chat-open';
  if (c.id === state.conversationId) open.setAttribute('aria-current', 'true');
  const title = document.createElement('span');
  title.className = 'chat-name';
  title.textContent = chatName(c);
  const when = document.createElement('span');
  when.className = 'chat-when';
  when.textContent = chatDate(c);
  open.append(title, when);
  open.addEventListener('click', () => openChat(c.id));
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'icon-btn chat-pin';
  iconButton(pin, c.pinned ? 'pin' : 'unpin', `${c.pinned ? 'Unpin' : 'Pin to the top'}: ${chatName(c)}`);
  pin.addEventListener('click', () => togglePin(c));
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'icon-btn chat-del danger';
  iconButton(del, 'trash', `Delete: ${chatName(c)}`);
  del.addEventListener('click', () => deleteChat(c));
  row.append(open, pin, del);
  return row;
}

$('#chat-filter').addEventListener('input', drawChatList);

function newConversation() {
  state.conversationId = null;
  $('#thread').innerHTML = EMPTY_THREAD;
  drawChatHead();
  drawChatList();
  setChatsOpen(false);
}

async function loadConversations() {
  chats.list = await api('GET', `${base()}/conversations`);
  drawChatHead();
  drawChatList();
}

for (const b of document.querySelectorAll('.new-chat')) {
  b.addEventListener('click', () => {
    if (state.asking) return;
    newConversation();
    $('#ask-form textarea').focus();
  });
}

function openChat(id) {
  if (state.asking) return;
  return guarded(async () => {
    const conv = await api('GET', `${base()}/conversations/${id}`);
    state.conversationId = conv.id;
    $('#thread').replaceChildren();
    for (const t of conv.turns) addTurn(t.question, t.answer ?? '', t.evidence);
    if (!conv.turns.length) $('#thread').innerHTML = EMPTY_THREAD;
    $('#thread').scrollTop = $('#thread').scrollHeight;
    drawChatHead();
    drawChatList();
    setChatsOpen(false);
  }).catch((err) => alert(`Couldn't open that chat: ${err.message}`));
}

const changeChat = (c, body, what) =>
  guarded(async () => {
    await api('PATCH', `${base()}/conversations/${c.id}`, body);
    await loadConversations();
  }).catch((err) => alert(`Couldn't ${what}: ${err.message}`));

const togglePin = (c) => changeChat(c, { pinned: !c.pinned }, c.pinned ? 'unpin it' : 'pin it');

function renameChat(c) {
  const title = prompt('Name this chat:', c.title ?? '')?.trim();
  if (title && title !== c.title) return changeChat(c, { title: title.slice(0, 80) }, 'rename it');
}

async function deleteChat(c) {
  if (state.asking && c.id === state.conversationId) return;
  if (!confirm(`Delete "${chatName(c)}"?\n\nIts questions and answers are erased for good.`)) return;
  await guarded(async () => {
    await api('DELETE', `${base()}/conversations/${c.id}`);
    if (c.id === state.conversationId) newConversation();
    await loadConversations();
  }).catch((err) => alert(`Couldn't delete it: ${err.message}`));
}

$('#chat-pin').addEventListener('click', () => currentChat() && togglePin(currentChat()));
$('#chat-rename').addEventListener('click', () => currentChat() && renameChat(currentChat()));
$('#chat-delete').addEventListener('click', () => currentChat() && deleteChat(currentChat()));

const TOOL_LABELS = {
  search_kb: 'Checking the campaign records',
  list_records: 'Checking the campaign records',
  get_records: 'Reading the campaign records',
  list_sessions: 'Looking at the session list',
  search_transcript: 'Searching the session transcripts',
  read_transcript: 'Reading a session transcript',
  search_my_notes: 'Searching your notes',
  search_books: 'Searching the rulebooks',
  read_book: 'Reading the rulebook',
  book_contents: 'Checking the rulebook contents',
};

$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.asking) return;
  const field = e.target.question;
  const question = field.value.trim();
  if (!question) return;
  field.value = '';
  ask(question);
});

$('#ask-form textarea').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});

async function ask(question) {
  state.asking = true;
  const button = $('#ask-form button');
  button.disabled = true;
  const { a, body } = addTurn(question);
  const status = document.createElement('p');
  status.className = 'status';
  status.textContent = 'Thinking…';
  body.replaceChildren(status);
  const thread = $('#thread');
  thread.scrollTop = thread.scrollHeight;

  let text = '';
  const show = () => {
    body.innerHTML = renderAnswer(text);
    thread.scrollTop = thread.scrollHeight;
  };
  try {
    await guarded(() =>
      stream(`${base()}/ask`, { question, ...(state.conversationId && { conversationId: state.conversationId }) }, (event, data) => {
        if (event === 'conversation') state.conversationId = data.conversationId;
        else if (event === 'turn') {
          // A new model turn: text so far was thinking aloud, so replace it.
          text = '';
          if (data.turn > 0) body.replaceChildren(status);
        } else if (event === 'tool') {
          status.textContent = `${TOOL_LABELS[data.name] ?? 'Looking things up'}…`;
          if (!text) body.replaceChildren(status);
        } else if (event === 'text') {
          text += data.delta;
          show();
        } else if (event === 'done') {
          body.innerHTML = renderAnswer(data.answer, data.evidence);
          const ev = renderEvidence(data.evidence);
          if (ev) a.append(ev);
        } else if (event === 'error') {
          throw new Error(data.error);
        }
      }),
    );
    await guarded(loadConversations);
  } catch (err) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = `Sorry, something went wrong: ${err.message}`;
    body.replaceChildren(p);
  } finally {
    state.asking = false;
    button.disabled = false;
  }
}

// ---------- notes ----------

const formatDate = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

async function loadNotes() {
  const notes = await api('GET', `${base()}/notes`);
  const byDate = new Map();
  for (const n of [...notes].sort((x, y) => y.written_at.localeCompare(x.written_at))) {
    if (!byDate.has(n.session_date)) byDate.set(n.session_date, []);
    byDate.get(n.session_date).push(n);
  }
  const box = $('#notes');
  if (!notes.length) {
    box.innerHTML = '<p class="muted">No notes yet. Anything you write here is private to you, and helps the AI remember what your character knows.</p>';
    return;
  }
  box.replaceChildren(
    ...[...byDate].map(([date, list]) => {
      const section = h('section', {}, h('h2', {}, formatDate(date)));
      for (const n of list) section.append(noteCard(n));
      return section;
    }),
  );
}

/** One of your notes, with Edit and Delete. Editing swaps the text for a box in place. */
function noteCard(n) {
  const div = h('div', { class: 'note card', 'data-id': n.id });
  const time = h('time', { datetime: n.written_at }, new Date(n.written_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
  const show = () => div.replaceChildren(
    h('div', { class: 'note-head' }, time, n.edited_at ? h('span', { class: 'muted note-edited', title: `Edited ${new Date(n.edited_at).toLocaleString()}` }, '(edited)') : null),
    h('div', { class: 'note-text' }, n.text),
    h('span', { class: 'note-actions' },
      h('button', { type: 'button', class: 'link small', onclick: edit }, 'Edit'),
      h('button', { type: 'button', class: 'link small danger', onclick: remove }, 'Delete')),
  );
  const edit = () => {
    const box = h('textarea', { rows: 3, maxLength: 10000, 'aria-label': 'Edit your note' });
    box.value = n.text;
    const save = async () => {
      const text = box.value.trim();
      if (!text || text === n.text) return show();
      try {
        const saved = await guarded(() => api('PATCH', `${base()}/notes/${n.id}`, { text }));
        if (saved) Object.assign(n, saved);
        show();
      } catch (err) {
        alert(`Couldn't save your note: ${err.message}`);
      }
    };
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
      if (e.key === 'Escape') show();
    });
    div.replaceChildren(time, box, h('div', { class: 'composer-row' },
      h('button', { type: 'button', class: 'ghost', onclick: show }, 'Cancel'),
      h('button', { type: 'button', class: 'primary', onclick: save }, 'Save')));
    box.focus();
  };
  const remove = async () => {
    if (!confirm('Delete this note?')) return;
    try {
      await guarded(() => api('DELETE', `${base()}/notes/${n.id}`));
      await loadNotes();
    } catch (err) {
      alert(`Couldn't delete your note: ${err.message}`);
    }
  };
  show();
  return div;
}

$('#note-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const text = form.text.value.trim();
  if (!text) return;
  const button = form.querySelector('button');
  button.disabled = true;
  guarded(async () => {
    await api('POST', `${base()}/notes`, { text });
    form.text.value = '';
    await loadNotes();
  })
    .catch((err) => alert(`Couldn't save your note: ${err.message}`))
    .finally(() => {
      button.disabled = false;
      form.text.focus();
    });
});

$('#note-form textarea').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});

initSheetActions();
initSheetPlace({ onChange: () => showTab(currentTab) });
showTab(currentTab);
initMapActions();
initArchivistActions();
initCreatureActions({ place: placeCreature });
initItemActions();
initMerchantActions({ place: placeMerchant });
initDice();
initRests();
initLook();
start().catch((err) => showLogin(err.message));
