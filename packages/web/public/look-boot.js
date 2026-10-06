/**
 * The page's look: theme, layout, density, chat style, sheet style and sheet
 * layout. Chosen under "Look" (look.js) and kept in this browser only.
 *
 * A plain script loaded in <head>, so the saved look is applied before the
 * page draws (no flash of the default theme). look.js uses window.dndLook.
 */
(function () {
  var KEY = 'dndapp.look';

  // Which themes are dark (the rest are light; "tavern" follows the device).
  var DARK = { arcane: 1, dungeon: 1, infernal: 1, neon: 1, pixel: 1, abyss: 1 };

  var OPTIONS = {
    theme: ['tavern', 'arcane', 'dungeon', 'grove', 'infernal', 'frost', 'scroll', 'neon', 'pixel', 'ink', 'feywild', 'abyss'],
    layout: ['classic', 'sidebar', 'wide', 'app'],
    density: ['cozy', 'compact', 'roomy'],
    chat: ['bubbles', 'script', 'letters', 'terminal'],
    sheetStyle: ['match', 'official', 'grimoire', 'cards', 'blueprint', 'terminal'],
    sheetLayout: ['classic', 'combat', 'single'],
  };
  var DEFAULTS = { theme: 'tavern', layout: 'classic', density: 'cozy', chat: 'bubbles', sheetStyle: 'match', sheetLayout: 'classic' };

  function read() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* private mode or bad JSON */ }
    var look = {};
    for (var k in DEFAULTS) look[k] = OPTIONS[k].indexOf(saved[k]) >= 0 ? saved[k] : DEFAULTS[k];
    return look;
  }

  var deviceDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var current = read();

  function scheme(theme) {
    if (theme === 'tavern') return deviceDark.matches ? 'dark' : 'light';
    return DARK[theme] ? 'dark' : 'light';
  }

  // The Ask and Sheet panels carry their own attributes (so previews in the Look dialog can reuse the same CSS).
  function applyPanels() {
    var ask = document.getElementById('tab-ask');
    var sheet = document.getElementById('tab-sheet');
    if (ask) ask.setAttribute('data-chat', current.chat);
    if (sheet) {
      sheet.setAttribute('data-sheet-style', current.sheetStyle);
      sheet.setAttribute('data-sheet-layout', current.sheetLayout);
    }
  }

  function apply(look) {
    current = look;
    var root = document.documentElement;
    root.setAttribute('data-theme', look.theme);
    root.setAttribute('data-scheme', scheme(look.theme));
    root.setAttribute('data-layout', look.layout);
    root.setAttribute('data-density', look.density);
    applyPanels();
  }

  function save(look) {
    apply(look);
    try { localStorage.setItem(KEY, JSON.stringify(look)); } catch (e) { /* not saved; still applied */ }
  }

  if (deviceDark.addEventListener) {
    deviceDark.addEventListener('change', function () { apply(current); });
  }
  apply(current);
  document.addEventListener('DOMContentLoaded', applyPanels);

  window.dndLook = {
    OPTIONS: OPTIONS,
    DEFAULTS: DEFAULTS,
    get: function () { var c = {}; for (var k in current) c[k] = current[k]; return c; },
    save: save,
    scheme: scheme,
  };
})();
