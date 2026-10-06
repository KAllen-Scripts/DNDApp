/**
 * The "Look" dialog: themes, layouts, density, chat style, sheet style and
 * sheet layout. Choices apply straight away and are kept in this browser
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

function section(title, hint, key, options, preview, cls = '') {
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
  return el('section', { class: 'look-section' }, el('h3', {}, title), hint && el('p', { class: 'muted small' }, hint), grid);
}

function build() {
  $body().replaceChildren(
    section('Theme', 'Colours, fonts and atmosphere for the whole page.', 'theme', THEMES, themePreview, 'themes'),
    section('Layout', null, 'layout', LAYOUTS, (k) => diagram('layout', k)),
    section('Text size', null, 'density', DENSITIES, densityPreview, 'small-cards'),
    section('Chat style', 'How questions and answers are shown on the Ask tab.', 'chat', CHATS, chatPreview),
    section('Character sheet style', null, 'sheetStyle', SHEET_STYLES, sheetPreview),
    section('Character sheet layout', null, 'sheetLayout', SHEET_LAYOUTS, (k) => diagram('sheet', k), 'small-cards'),
  );
}

const $body = () => document.getElementById('look-body');

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
      dialog.querySelector('.look-card[aria-checked="true"]')?.focus();
    });
  }
  $body().addEventListener('click', (e) => {
    const card = e.target.closest('.look-card');
    if (card) choose(card.dataset.key, card.dataset.value);
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
  dialog.querySelector('.look-reset').addEventListener('click', () => {
    look.save({ ...look.DEFAULTS });
    build();
  });
  // Click on the backdrop closes it.
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
}
