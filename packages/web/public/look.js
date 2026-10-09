/**
 * The "Look" dialog: themes, layouts, density, chat style, sheet style and
 * sheet layout; an accent colour, the tabs' order, and how the map page is
 * laid out (toolbar, the side panel's side, token names, which tools show). Choices apply straight away and are kept in this browser
 * (look-boot.js applies them on load). Previews reuse the real CSS: a theme
 * preview carries data-theme, a chat preview data-chat, and so on.
 */
const look = window.dndLook;

const THEMES = {
  tavern: ['Tavern', 'Parchment and wine. Follows your device’s light or dark mode.'],
  arcane: ['Arcane Study', 'Midnight indigo, violet ink and glowing runes.'],
  dungeon: ['Dungeon Crawl', 'Cold stone lit by torchlight.'],
  grove: ['Elven Grove', 'Sage leaves, moss and a little gold.'],
  infernal: ['Nine Hells', 'Brimstone black, crimson and embers.'],
  frost: ['Frostmaiden', 'Ice-white and steel blue. Crisp.'],
  scroll: ['Ancient Scroll', 'Aged paper, sepia ink and a scribe’s hand.'],
  neon: ['Synthwave Sorcery', 'Hot pink and cyan on a neon grid.'],
  pixel: ['8-bit Quest', 'Chunky pixels and hard edges. Press start.'],
  ink: ['Ink & Paper', 'Black on white, high contrast. Easy on tired eyes.'],
  feywild: ['Feywild', 'Pastel petals and fairy-light sparkle.'],
  abyss: ['The Abyss', 'Deep water and bioluminescent teal.'],
};

const LAYOUTS = {
  classic: ['Classic', 'One centred column. Chats open in a drawer.'],
  sidebar: ['Sidebar', 'Your chats always on the left (wide screens).'],
  wide: ['Full width', 'Uses the whole window, chats on the left.'],
  app: ['App', 'Phone-app style, with tabs along the bottom.'],
};

const DENSITIES = {
  compact: ['Compact', 'Smaller text, more on screen.'],
  cozy: ['Cosy', 'The default.'],
  roomy: ['Roomy', 'Bigger text, more space. Good across a table.'],
};

const CHATS = {
  bubbles: ['Bubbles', 'Like a messaging app.'],
  script: ['Play script', 'Speaker names in the margin, like a stage play.'],
  letters: ['Letters', 'Answers arrive as sealed letters from the archivist.'],
  terminal: ['Terminal', 'A command line. > ask the archive.'],
};

const SHEET_STYLES = {
  match: ['Match the theme', 'The sheet uses your page theme.'],
  official: ['Official', 'Crisp paper and black ink, like the printed sheet.'],
  grimoire: ['Grimoire', 'Leather binding and gold leaf.'],
  cards: ['Index cards', 'Every box is a card pinned to the table.'],
  blueprint: ['Blueprint', 'White lines on engineer’s blue.'],
  terminal: ['Terminal', 'Green phosphor on black.'],
};

const SHEET_LAYOUTS = {
  classic: ['Three columns', 'Laid out like the official sheet.'],
  combat: ['Combat first', 'AC, HP and attacks across the top, big.'],
  abilities: ['By ability', 'Like the 2024 sheet: each ability holds its save and skills.'],
  tabs: ['Tabs', 'Like the apps: stats up top, the rest in tabs.'],
  single: ['One column', 'Everything in a single scrolling column.'],
};

const MAP_BARS = {
  top: ['Above the map', 'The tools along the top.'],
  bottom: ['Below the map', 'Easier to reach with a thumb on a phone.'],
  left: ['Down the left', 'A column of tools beside the map (below it on a phone).'],
};

const BESIDE_SIDES = {
  right: ['On the right', 'What you put beside the map (Sheet, Ask, Notes…) sits on its right.'],
  left: ['On the left', 'It sits on the map’s left. On a phone it goes above the map.'],
};

const TOKEN_LABELS = {
  always: ['Always', 'Every token’s name under it.'],
  hover: ['When pointed at', 'Names show when you point at or pick a token.'],
  never: ['Never', 'Just the tokens. Their names are still in the tooltip.'],
};

const TAB_NAMES = { ask: 'Ask', notes: 'Notes', sheet: 'Sheet (players)', inventory: 'Inventory (players)', creatures: 'Creatures (DM only)', items: 'Items (DM only)', merchants: 'Merchants (DM only)', map: 'Map', handouts: 'Handouts', archivist: 'Archivist (DM only)' };

const TOOL_NAMES = {
  grid: 'Grid', fit: 'Fit', pin: 'Pin', measure: 'Measure', ping: 'Ping', draw: 'Draw',
  template: 'Template', initiative: 'Initiative', 'sheet-window': 'Sheet window',
};

// The dialog's groups, shown one at a time so it stays short on a phone.
const GROUPS = { page: 'Page', ask: 'Ask', sheet: 'Sheet', map: 'Map' };

const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  e.append(...children.flat().filter((c) => c != null));
  return e;
};

// ---------- previews ----------

const themePreview = (key) =>
  el('div', { class: 'theme-preview', 'data-theme': key, 'data-scheme': look.scheme(key), 'aria-hidden': 'true' },
    el('div', { class: 'tp-bar' }, el('span', { class: 'tp-title' }, 'Aa'), el('span', { class: 'tp-dot' })),
    el('div', { class: 'tp-q' }),
    el('div', { class: 'tp-card' }, el('span', { class: 'tp-line' }), el('span', { class: 'tp-line short' }), el('span', { class: 'tp-cite' })),
    el('div', { class: 'tp-btn' }),
  );

const diagram = (kind, key) => el('div', { class: `diagram ${kind}-${key}`, 'aria-hidden': 'true' }, ...Array.from({ length: 9 }, (_, i) => el('i', { class: `d${i}` })));

const densityPreview = (key) => el('div', { class: `density-preview dp-${key}`, 'aria-hidden': 'true' }, 'Aa');

const chatPreview = (key) =>
  el('div', { class: 'chat-preview', 'data-chat': key, 'aria-hidden': 'true' },
    el('div', { class: 'thread' },
      el('div', { class: 'q' }, 'Who is Hal?'),
      el('div', { class: 'a' }, el('div', {}, el('p', {}, 'The innkeeper ', el('span', { class: 'cite static' }, 'S1'), '.'))),
    ),
  );

const sheetPreview = (key) => {
  const value = (v, cls = '') => el('input', { class: cls, value: v, readonly: '', tabindex: '-1' });
  return el('div', { class: 'sheet-preview', 'data-sheet-style': key, 'aria-hidden': 'true' },
    el('div', { class: 'sheet' },
      el('div', { class: 'sp-row' },
        el('div', { class: 'ability' }, el('span', { class: 'lbl' }, 'Strength'), el('span', { class: 'auto mod' }, value('+3')), value('16', 'score')),
        el('div', { class: 'sp-side' },
          el('div', { class: 'vitals' }, el('div', { class: 'stat big' }, el('span', { class: 'auto' }, value('15')), el('span', { class: 'lbl' }, 'Armour class'))),
          el('div', { class: 'sh-line' }, el('span'), el('span', { class: 'line-val' }, el('span', { class: 'auto' }, value('+2'))), el('span', { class: 'lbl' }, 'Bonus')),
        ),
      ),
    ),
  );
};

// ---------- the dialog ----------

function section(group, title, hint, key, options, preview, cls = '') {
  const current = look.get()[key];
  const grid = el('div', { class: `look-grid ${cls}`, role: 'radiogroup', 'aria-label': title });
  for (const [value, [name, blurb]] of Object.entries(options)) {
    const card = el('div', { class: 'look-card', role: 'radio', tabindex: value === current ? '0' : '-1', 'aria-checked': String(value === current), 'data-key': key, 'data-value': value },
      preview(value),
      el('span', { class: 'look-name' }, name),
      el('span', { class: 'look-blurb' }, blurb),
    );
    grid.append(card);
  }
  return block(group, title, hint, grid);
}

const block = (group, title, hint, ...content) =>
  el('section', { class: 'look-section', 'data-group': group }, el('h3', {}, title), hint && el('p', { class: 'muted small' }, hint), ...content);

/** Your own accent colour, over whichever theme. */
function accentSection() {
  const { accent } = look.get();
  const themeAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const picker = el('input', { type: 'color', id: 'look-accent', 'aria-label': 'Accent colour', value: accent || (/^#[0-9a-f]{6}$/i.test(themeAccent) ? themeAccent : '#8b2e2e') });
  const reset = el('button', { type: 'button', class: 'ghost', id: 'look-accent-reset' }, 'Use the theme’s');
  reset.disabled = !accent;
  return block('page', 'Accent colour', 'Buttons, highlights and the turn ring. Kept when you change the theme.',
    el('div', { class: 'look-row' }, picker, el('span', { class: 'muted small', id: 'look-accent-says' }, accent ? 'Your own colour' : 'The theme’s colour'), reset));
}

/** The tabs: their order, which show, and which one opens first. */
function tabsSection() {
  const { tabOrder, hiddenTabs, startTab } = look.get();
  const rows = tabOrder.map((tab, i) => {
    const shown = !hiddenTabs.includes(tab);
    const show = el('input', { type: 'checkbox', 'data-tab-show': tab, 'aria-label': `Show ${TAB_NAMES[tab]}` });
    show.checked = shown;
    const first = el('input', { type: 'radio', name: 'look-start', 'data-tab-start': tab, 'aria-label': `Open on ${TAB_NAMES[tab]}` });
    first.checked = tab === startTab;
    first.disabled = !shown;
    const up = el('button', { type: 'button', class: 'ghost icon-btn', 'data-tab-move': tab, 'data-by': '-1', 'aria-label': `Move ${TAB_NAMES[tab]} earlier` }, '↑');
    const down = el('button', { type: 'button', class: 'ghost icon-btn', 'data-tab-move': tab, 'data-by': '1', 'aria-label': `Move ${TAB_NAMES[tab]} later` }, '↓');
    up.disabled = i === 0;
    down.disabled = i === tabOrder.length - 1;
    return el('li', { class: 'look-tab-row' + (shown ? '' : ' off') },
      el('label', { class: 'look-check' }, show, ' ', TAB_NAMES[tab]),
      el('label', { class: 'look-check small' }, first, ' Opens first'),
      el('span', { class: 'look-moves' }, up, down));
  });
  return block('page', 'Tabs', 'Put them in your order, hide the ones you don’t use, and pick the one the page opens on.', el('ol', { class: 'look-tabs', id: 'look-tabs' }, rows));
}

/** The map tools you want on the toolbar. */
function toolsSection() {
  const { hiddenTools } = look.get();
  const boxes = look.TOOLS.map((tool) => {
    const box = el('input', { type: 'checkbox', 'data-tool-show': tool });
    box.checked = !hiddenTools.includes(tool);
    return el('label', { class: 'look-check' }, box, ' ', TOOL_NAMES[tool]);
  });
  return block('map', 'Map tools', 'Untick the ones you never use to make the toolbar shorter. The DM’s own tools always show for the DM.', el('div', { class: 'look-tools' }, boxes));
}

let group = 'page';

function build() {
  const nav = el('div', { class: 'look-groups', role: 'tablist', 'aria-label': 'What to change' },
    Object.entries(GROUPS).map(([key, name]) => el('button', { type: 'button', role: 'tab', class: 'ghost', 'data-group-tab': key, 'aria-selected': String(key === group) }, name)));
  $body().replaceChildren(
    nav,
    section('page', 'Theme', 'Colours, fonts and atmosphere for the whole page.', 'theme', THEMES, themePreview, 'themes'),
    accentSection(),
    section('page', 'Layout', null, 'layout', LAYOUTS, (k) => diagram('layout', k)),
    section('page', 'Text size', null, 'density', DENSITIES, densityPreview, 'small-cards'),
    tabsSection(),
    section('ask', 'Chat style', 'How questions and answers are shown on the Ask tab.', 'chat', CHATS, chatPreview),
    section('sheet', 'Character sheet style', null, 'sheetStyle', SHEET_STYLES, sheetPreview),
    section('sheet', 'Character sheet layout', null, 'sheetLayout', SHEET_LAYOUTS, (k) => diagram('sheet', k), 'small-cards'),
    section('map', 'Toolbar', 'Where the map’s tools go.', 'mapBar', MAP_BARS, (k) => diagram('mapbar', k), 'small-cards'),
    section('map', 'Beside the map', 'Pick what goes beside the map with the menu on the map’s toolbar. Here, which side it goes on.', 'besideSide', BESIDE_SIDES, (k) => diagram('side', k), 'small-cards'),
    section('map', 'Token names', null, 'tokenLabels', TOKEN_LABELS, (k) => diagram('labels', k), 'small-cards'),
    toolsSection(),
  );
  showGroup(group);
}

function showGroup(key) {
  group = key;
  for (const b of $body().querySelectorAll('[data-group-tab]')) b.setAttribute('aria-selected', String(b.dataset.groupTab === key));
  for (const s of $body().querySelectorAll('.look-section')) s.hidden = s.dataset.group !== key;
}

/** Save a change to the look, and redraw one part of the dialog (keeping focus on the same control). */
function change(patch, redraw) {
  look.save({ ...look.get(), ...patch });
  if (!redraw) return;
  const focused = document.activeElement;
  const sel = focused && ['data-tab-move', 'data-tab-show', 'data-tab-start', 'id']
    .map((a) => focused.getAttribute(a) && `[${a}="${focused.getAttribute(a)}"]${a === 'data-tab-move' ? `[data-by="${focused.dataset.by}"]` : ''}`)
    .find(Boolean);
  const old = $body().querySelector(redraw);
  const fresh = (redraw === '#look-tabs' ? tabsSection() : accentSection());
  old.closest('.look-section').replaceWith(fresh);
  fresh.hidden = fresh.dataset.group !== group;
  const again = sel && $body().querySelector(sel);
  if (again && !again.disabled) again.focus();
}

function tabsChanged(e) {
  const t = e.target;
  const { hiddenTabs } = look.get();
  if (t.dataset.tabShow) {
    const tab = t.dataset.tabShow;
    const hidden = t.checked ? hiddenTabs.filter((x) => x !== tab) : [...hiddenTabs, tab];
    // At least one tab everyone has stays.
    if (!look.keepsATab(hidden)) return change({}, '#look-tabs');
    return change({ hiddenTabs: hidden }, '#look-tabs');
  }
  if (t.dataset.tabStart) return change({ startTab: t.dataset.tabStart }, '#look-tabs');
}

const $body = () => document.getElementById('look-body');
const $ = (sel) => document.querySelector(sel);

function choose(key, value) {
  look.save({ ...look.get(), [key]: value });
  for (const c of document.querySelectorAll(`.look-card[data-key="${key}"]`)) {
    c.setAttribute('aria-checked', String(c.dataset.value === value));
    c.tabIndex = c.dataset.value === value ? 0 : -1;
  }
}

export function initLook() {
  const dialog = document.getElementById('look-dialog');
  for (const b of document.querySelectorAll('.look-open')) {
    b.addEventListener('click', () => {
      build();
      dialog.showModal();
      dialog.querySelector('.look-section:not([hidden]) .look-card[aria-checked="true"]')?.focus();
    });
  }
  $body().addEventListener('click', (e) => {
    const card = e.target.closest('.look-card');
    if (card) return choose(card.dataset.key, card.dataset.value);
    const groupTab = e.target.closest('[data-group-tab]');
    if (groupTab) return showGroup(groupTab.dataset.groupTab);
    const move = e.target.closest('[data-tab-move]');
    if (move) {
      const order = look.get().tabOrder;
      const from = order.indexOf(move.dataset.tabMove);
      const to = from + Number(move.dataset.by);
      if (to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      return change({ tabOrder: order }, '#look-tabs');
    }
    if (e.target.id === 'look-accent-reset') change({ accent: '' }, '#look-accent');
  });
  $body().addEventListener('change', (e) => {
    if (e.target.closest('#look-tabs')) return tabsChanged(e);
    const tool = e.target.dataset.toolShow;
    if (tool) {
      const hidden = look.get().hiddenTools.filter((x) => x !== tool);
      change({ hiddenTools: e.target.checked ? hidden : [...hidden, tool] });
    }
  });
  // The colour applies while it's being picked.
  $body().addEventListener('input', (e) => {
    if (e.target.id !== 'look-accent') return;
    look.save({ ...look.get(), accent: e.target.value });
    $('#look-accent-says').textContent = 'Your own colour';
    $('#look-accent-reset').disabled = false;
  });
  // Arrow keys move between choices in a group, like radio buttons.
  $body().addEventListener('keydown', (e) => {
    const card = e.target.closest('.look-card');
    if (!card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      return choose(card.dataset.key, card.dataset.value);
    }
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    const cards = [...card.parentElement.children];
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = cards[(cards.indexOf(card) + step + cards.length) % cards.length];
    e.preventDefault();
    next.focus();
    choose(next.dataset.key, next.dataset.value);
  });
  // The group tabs: arrow keys move between them.
  $body().addEventListener('keydown', (e) => {
    const tab = e.target.closest('[data-group-tab]');
    if (!tab || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const tabs = [...tab.parentElement.children];
    const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    e.preventDefault();
    next.focus();
    showGroup(next.dataset.groupTab);
  });
  dialog.querySelector('.look-reset').addEventListener('click', () => {
    look.save({ ...look.DEFAULTS });
    build();
  });
  // Click on the backdrop closes it.
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
}
