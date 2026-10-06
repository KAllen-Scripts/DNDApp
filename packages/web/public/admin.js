/**
 * Admin screen: accounts (add with the campaigns they can access, change that
 * access, password, log out everywhere, block, delete) and campaigns (create,
 * who's in them, who's the DM, characters).
 * Shown instead of Ask/Notes when the admin login is used.
 */
import { api, h } from './api.js';
import { createSessions } from './admin-sessions.js';

const $ = (sel) => document.querySelector(sel);

let guarded = (fn) => fn();
let me = null;
let users = [];
let campaigns = [];
let wired = false;
let addAccess = null; // the campaign picker on the "add account" form
let editing = null; // id of the account whose campaigns are being edited

export async function showAdmin(opts) {
  ({ me, guarded } = opts);
  $('#admin-name').textContent = `logged in as ${me.name}`;
  if (!wired) wire();
  wired = true;
  await refresh();
}

// ---------- helpers ----------

let messageTimer;
function say(text, isError = false) {
  const box = $('#admin-message');
  box.textContent = text;
  box.classList.toggle('error-banner', isError);
  box.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (box.hidden = true), isError ? 8000 : 4000);
}

/** Do something, show the outcome, and reload the lists. */
async function run(fn, success) {
  try {
    await guarded(async () => {
      await fn();
      if (success) say(success);
      await refresh();
    });
  } catch (err) {
    say(err.message, true);
  }
}

const ago = (sqlTime) => {
  if (!sqlTime) return '';
  const mins = Math.round((Date.now() - new Date(sqlTime.replace(' ', 'T') + 'Z')) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
};

/**
 * Pick campaigns for an account: a checkbox per campaign, with role and
 * character for the ticked ones. current: [{ campaign_id, role, character_name }]
 */
function accessEditor(current = []) {
  const rows = campaigns.map((c) => {
    const had = current.find((m) => m.campaign_id === c.id);
    const on = h('input', { type: 'checkbox', checked: !!had });
    const role = roleSelect(had?.role);
    const character = h('input', { value: had?.character_name ?? '', placeholder: 'Character name', 'aria-label': `Character in ${c.name}` });
    const sync = () => {
      role.disabled = character.disabled = !on.checked;
      character.disabled ||= role.value === 'dm';
    };
    on.addEventListener('change', sync);
    role.addEventListener('change', sync);
    sync();
    return {
      el: h('div', { class: 'access-row' }, h('label', { class: 'access-name' }, on, dot(c.id), c.name), role, character),
      value: () => (on.checked ? { campaign_id: c.id, role: role.value, character_name: role.value === 'dm' ? null : character.value.trim() || null } : null),
    };
  });
  return {
    el: h('div', { class: 'access' }, rows.length ? rows.map((r) => r.el) : h('p', { class: 'muted small' }, 'No campaigns yet. Create one below, then give people access.')),
    value: () => rows.map((r) => r.value()).filter(Boolean),
  };
}

// Each campaign gets its own colour (by id, so it never changes), used on its card,
// on the account pills and in the campaign checkboxes.
const HUES = [8, 212, 145, 275, 32, 182, 330, 95];
const campStyle = (id) => `--hue: ${HUES[(id - 1) % HUES.length]}`;
const dot = (id) => h('span', { class: 'camp camp-dot', style: campStyle(id), 'aria-hidden': 'true' });

const roleLabel = (m) => `${m.role === 'dm' ? 'DM' : 'player'}${m.character_name ? ` (${m.character_name})` : ''}`;

// Sessions on each campaign card (admin-sessions.js).
const sessions = createSessions({ run, say, guarded: () => guarded });

// ---------- forms that are always there ----------

function wire() {
  $('#add-user-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const access = addAccess.value();
    run(async () => {
      await api('POST', '/admin/users', { name, password: form.password.value, campaigns: access, must_change_password: form.must_change.checked });
      form.reset();
      addAccess = null;
    }, `Added "${name}"${access.length ? '' : '. They have no campaigns yet: use "Edit campaigns" to give them some'}.`);
  });

  $('#add-campaign-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    run(async () => {
      await api('POST', '/admin/campaigns', { name });
      form.reset();
    }, `Created "${name}".`);
  });
}

async function refresh() {
  [users, campaigns] = await Promise.all([api('GET', '/admin/users'), api('GET', '/admin/campaigns')]);
  await sessions.load(campaigns.map((c) => c.id));
  // Keep what's ticked on the add-account form across refreshes.
  addAccess = accessEditor(addAccess?.value() ?? []);
  $('#add-user-campaigns').replaceChildren(h('span', { class: 'access-label' }, 'Campaigns they can access'), addAccess.el);
  renderUsers();
  renderCampaigns(campaigns);
}

// ---------- accounts ----------

function setPassword(user) {
  const password = prompt(`New password for ${user.name} (at least 6 characters).\nThey'll be logged out everywhere.`);
  if (password == null) return;
  const mustChange =
    user.id !== me.id &&
    confirm(`Should ${user.name} have to choose their own password the next time they log in?\n\nOK = yes, they must change it.\nCancel = no, they can keep this one.`);
  run(
    () => api('PUT', `/admin/users/${user.id}/password`, { password, must_change_password: mustChange }),
    `Password changed for ${user.name}${mustChange ? "; they'll choose their own when they next log in" : ''}. Remember to tell them.`,
  );
}

function setMustChange(user, on) {
  run(
    () => api('PUT', `/admin/users/${user.id}/must-change-password`, { must_change_password: on }),
    on ? `${user.name} will have to choose a new password when they next use the site.` : `${user.name} no longer has to change their password.`,
  );
}

function campaignEditorRow(u) {
  const editor = accessEditor(u.campaigns);
  return h(
    'tr',
    { class: 'editor-row' },
    h(
      'td',
      { colSpan: 5 },
      h('p', { class: 'small' }, h('strong', {}, `Campaigns ${u.name} can access`)),
      editor.el,
      h(
        'div',
        { class: 'editor-buttons' },
        h('button', {
          class: 'primary',
          onclick: () =>
            run(async () => {
              await api('PUT', `/admin/users/${u.id}/campaigns`, { campaigns: editor.value() });
              editing = null;
            }, `Saved ${u.name}'s campaigns.`),
        }, 'Save'),
        h('button', { class: 'ghost', onclick: () => { editing = null; renderUsers(); } }, 'Cancel'),
      ),
    ),
  );
}

function renderUsers() {
  const rows = users.flatMap((u) => {
    const self = u.id === me.id;
    const status = u.revoked_at
      ? h('span', { class: 'badge bad' }, 'blocked')
      : !u.has_password
        ? h('span', { class: 'badge bad' }, 'no password')
        : h('span', { class: 'badge ok' }, 'active');
    const row = h(
      'tr',
      {},
      h('td', {}, h('strong', {}, u.name), u.is_admin ? h('span', { class: 'badge' }, 'admin') : null),
      h(
        'td',
        { class: 'status-cell' },
        status,
        u.must_change_password ? h('span', { class: 'badge warn' }, 'must change password') : null,
        self
          ? null
          : h('button', { class: 'link small', onclick: () => setMustChange(u, !u.must_change_password) },
              u.must_change_password ? "Don't require" : 'Require new password'),
      ),
      h(
        'td',
        { class: 'small' },
        u.is_admin
          ? h('span', { class: 'muted' }, 'management only')
          : [
              u.campaigns.length
                ? u.campaigns.map((m) =>
                    h('span', { class: 'camp camp-pill', style: campStyle(m.campaign_id) },
                      h('span', { class: 'camp-dot' }), h('strong', {}, m.campaign), ` · ${m.role === 'dm' ? 'DM' : m.character_name || 'player'}`))
                : h('span', { class: 'muted' }, 'no campaigns'),
              h('button', { class: 'link', onclick: () => { editing = editing === u.id ? null : u.id; renderUsers(); } }, 'Edit campaigns'),
            ],
      ),
      h('td', { class: 'small muted' }, u.logins ? `${u.logins} device${u.logins > 1 ? 's' : ''}, ${ago(u.last_seen)}` : 'not logged in'),
      h(
        'td',
        { class: 'actions' },
        h('button', { class: 'ghost', onclick: () => setPassword(u) }, 'Set password'),
        !self && u.logins
          ? h('button', { class: 'ghost', onclick: () => run(() => api('POST', `/admin/users/${u.id}/logout`), `${u.name} has been logged out everywhere.`) }, 'Log out')
          : null,
        !self
          ? u.revoked_at
            ? h('button', { class: 'ghost', onclick: () => run(() => api('POST', `/admin/users/${u.id}/unblock`), `${u.name} can log in again.`) }, 'Unblock')
            : h('button', {
                class: 'ghost',
                onclick: () =>
                  confirm(`Block ${u.name}? They'll be logged out and can't log in until you unblock them. Their notes are kept.`) &&
                  run(() => api('POST', `/admin/users/${u.id}/block`), `${u.name} is blocked.`),
              }, 'Block')
          : null,
        !self
          ? h('button', {
              class: 'ghost danger',
              onclick: () =>
                confirm(`Delete ${u.name}'s account for good? (Only possible if they haven't used it yet.)`) &&
                run(() => api('DELETE', `/admin/users/${u.id}`), `Deleted ${u.name}.`),
            }, 'Delete')
          : null,
      ),
    );
    return editing === u.id ? [row, campaignEditorRow(u)] : [row];
  });
  $('#users-table').replaceChildren(
    h('thead', {}, h('tr', {}, ...['Name', 'Status', 'Campaigns', 'Logged in', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows),
  );
}

// ---------- campaigns ----------

const roleSelect = (role = 'player') =>
  h('select', { 'aria-label': 'Role' },
    h('option', { value: 'player', selected: role === 'player' }, 'Player'),
    h('option', { value: 'dm', selected: role === 'dm' }, 'DM'));

function renderCampaigns(campaigns) {
  const box = $('#campaigns');
  if (!campaigns.length) {
    box.replaceChildren(h('p', { class: 'muted' }, 'No campaigns yet. Create one above.'));
    return;
  }
  box.replaceChildren(...campaigns.map(renderCampaign));
}

function deleteCampaign(c) {
  const typed = prompt(
    `Delete "${c.name}"?\n\n` +
      `This removes its ${c.sessions} session${c.sessions === 1 ? '' : 's'}, the AI's knowledge base, everyone's notes and questions, ` +
      `and who's in it. Players lose access straight away. Their accounts are kept.\n\n` +
      `The original files stay in the server's archive folder (marked deleted), but the campaign won't come back by itself.\n\n` +
      `Type the campaign's name to confirm:`,
  );
  if (typed == null) return;
  // Ignore case and extra spaces: the page shows "a  b" as "a b", so that's what people will type.
  const loose = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  if (loose(typed) !== loose(c.name)) return say(`Not deleted: the name you typed didn't match "${c.name}".`, true);
  run(() => api('DELETE', `/admin/campaigns/${c.id}`), `Deleted "${c.name}".`);
}

function renderCampaign(c) {
  const memberRows = c.members.map((m) => {
    const role = roleSelect(m.role);
    const character = h('input', { value: m.character_name ?? '', placeholder: 'Character name', 'aria-label': 'Character name' });
    return h(
      'tr',
      {},
      h('td', {}, m.name, m.revoked_at ? h('span', { class: 'badge bad' }, 'blocked') : null),
      h('td', {}, role),
      h('td', {}, character),
      h(
        'td',
        { class: 'actions' },
        h('button', {
          class: 'ghost',
          onclick: () =>
            run(
              () => api('PUT', `/admin/campaigns/${c.id}/members/${m.user_id}`, { role: role.value, character_name: character.value }),
              `Saved ${m.name}.`,
            ),
        }, 'Save'),
        h('button', {
          class: 'ghost danger',
          onclick: () =>
            confirm(`Remove ${m.name} from ${c.name}? Their account and notes are kept; you can add them back.`) &&
            run(() => api('DELETE', `/admin/campaigns/${c.id}/members/${m.user_id}`), `Removed ${m.name} from ${c.name}.`),
        }, 'Remove'),
      ),
    );
  });

  const available = users.filter((u) => !u.is_admin && !c.members.some((m) => m.user_id === u.id));
  const who = h('select', { 'aria-label': 'Account', required: true },
    h('option', { value: '' }, available.length ? 'Choose an account…' : 'No accounts left to add'),
    available.map((u) => h('option', { value: u.id }, u.name)));
  const role = roleSelect();
  const character = h('input', { placeholder: 'Character name (optional)', 'aria-label': 'Character name' });
  const addForm = h(
    'form',
    {
      class: 'inline-form',
      onsubmit: (e) => {
        e.preventDefault();
        if (!who.value) return;
        const name = who.selectedOptions[0].textContent;
        run(
          () => api('PUT', `/admin/campaigns/${c.id}/members/${who.value}`, { role: role.value, character_name: character.value }),
          `Added ${name} to ${c.name}.`,
        );
      },
    },
    who, role, character,
    h('button', { type: 'submit', class: 'primary', disabled: !available.length }, 'Add to campaign'),
  );

  const dms = c.members.filter((m) => m.role === 'dm');
  const players = c.members.length - dms.length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return h(
    'section',
    { class: 'camp campaign', style: campStyle(c.id), 'aria-label': c.name },
    h(
      'header',
      { class: 'campaign-head' },
      h(
        'div',
        {},
        h('h3', {}, c.name),
        h(
          'div',
          { class: 'campaign-meta' },
          h('span', { class: 'pill' }, plural(c.sessions, 'session')),
          h('span', { class: 'pill' }, plural(players, 'player')),
          h('span', { class: dms.length ? 'pill' : 'pill warn' }, dms.length ? `DM: ${dms.map((m) => m.name).join(', ')}` : 'No DM yet'),
        ),
      ),
      h('button', { class: 'ghost danger', onclick: () => deleteCampaign(c) }, 'Delete campaign'),
    ),
    h(
      'div',
      { class: 'campaign-body' },
      h('h4', {}, 'Sessions'),
      sessions.section(c),
      h('h4', {}, 'People'),
      c.members.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
            h('thead', {}, h('tr', {}, ...['Name', 'Role', 'Character', ''].map((t) => h('th', {}, t)))),
            h('tbody', {}, memberRows)))
        : h('p', { class: 'muted small' }, 'Nobody in this campaign yet.'),
      h('h4', {}, 'Add someone'),
      addForm,
    ),
  );
}
