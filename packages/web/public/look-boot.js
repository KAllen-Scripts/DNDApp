/**
 * The page's look: theme, layout, density, chat style, sheet style and sheet
 * layout, plus the personal touches: an accent colour, the map toolbar's
 * place, which side panel goes on which side of the map, token names, which
 * map tools show, and the order of the tabs. Chosen under "Look" (look.js)
 * and kept in this browser only.
 *
 * A plain script loaded in <head>, so the saved look is applied before the
 * page draws (no flash of the default theme). look.js uses window.dndLook.
 */
(function () {
  var KEY = 'dndapp.look';

  // Which themes are dark (the rest are light; "tavern" follows the device).
  var DARK = { arcane: 1, dungeon: 1, infernal: 1, neon: 1, pixel: 1, abyss: 1 };

  // One choice each.
  var OPTIONS = {
    theme: ['tavern', 'arcane', 'dungeon', 'grove', 'infernal', 'frost', 'scroll', 'neon', 'pixel', 'ink', 'feywild', 'abyss'],
    layout: ['classic', 'sidebar', 'wide', 'app'],
    density: ['cozy', 'compact', 'roomy'],
    chat: ['bubbles', 'script', 'letters', 'terminal'],
    sheetStyle: ['match', 'official', 'grimoire', 'cards', 'blueprint', 'terminal'],
    sheetLayout: ['classic', 'combat', 'abilities', 'tabs', 'single'],
    mapBar: ['top', 'bottom', 'left'],
    besideSide: ['right', 'left'],
    tokenLabels: ['always', 'hover', 'never'],
    startTab: ['ask', 'notes', 'sheet', 'inventory', 'creatures', 'items', 'merchants', 'map', 'handouts', 'archivist'],
  };
  // The tabs, and the map tools that can be hidden (each is an element with data-tool on the map bar).
  var TABS = OPTIONS.startTab;
  var TOOLS = ['grid', 'fit', 'pin', 'measure', 'ping', 'draw', 'template', 'initiative', 'fullscreen', 'sheet-window'];
  var DEFAULTS = {
    theme: 'tavern', layout: 'classic', density: 'cozy', chat: 'bubbles', sheetStyle: 'match', sheetLayout: 'classic',
    mapBar: 'top', besideSide: 'right', tokenLabels: 'always', startTab: 'ask',
    accent: '', tabOrder: TABS.slice(), hiddenTabs: [], hiddenTools: [],
  };

  /** Only the known values of a list, each once. */
  function pick(list, known) {
    var out = [];
    if (Object.prototype.toString.call(list) !== '[object Array]') return out;
    for (var i = 0; i < list.length; i++) if (known.indexOf(list[i]) >= 0 && out.indexOf(list[i]) < 0) out.push(list[i]);
    return out;
  }

  /** Does hiding these still leave a tab everyone has? (Sheet is the players'; Creatures, Items, Merchants and Archivist the DM's.) */
  var EVERYONE = ['ask', 'notes', 'map', 'handouts'];
  function keepsATab(hidden) {
    for (var i = 0; i < EVERYONE.length; i++) if (hidden.indexOf(EVERYONE[i]) < 0) return true;
    return false;
  }

  /** A saved look, made safe: unknown values fall back to the defaults. */
  function clean(saved) {
    saved = saved || {};
    var look = {};
    for (var k in OPTIONS) look[k] = OPTIONS[k].indexOf(saved[k]) >= 0 ? saved[k] : DEFAULTS[k];
    look.accent = /^#[0-9a-f]{6}$/i.test(saved.accent) ? saved.accent.toLowerCase() : '';
    // Tabs missing from a saved order (new ones) go at the end.
    look.tabOrder = pick(saved.tabOrder, TABS);
    for (var i = 0; i < TABS.length; i++) if (look.tabOrder.indexOf(TABS[i]) < 0) look.tabOrder.push(TABS[i]);
    look.hiddenTabs = pick(saved.hiddenTabs, TABS);
    if (!keepsATab(look.hiddenTabs)) look.hiddenTabs = [];
    // The tab that opens first is never a hidden one.
    if (look.hiddenTabs.indexOf(look.startTab) >= 0) {
      for (var j = 0; j < look.tabOrder.length; j++) {
        if (look.hiddenTabs.indexOf(look.tabOrder[j]) < 0) { look.startTab = look.tabOrder[j]; break; }
      }
    }
    look.hiddenTools = pick(saved.hiddenTools, TOOLS);
    return look;
  }

  function read() {
    try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return clean(null); } // private mode or bad JSON
  }

  var deviceDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var current = read();

  function scheme(theme) {
    if (theme === 'tavern') return deviceDark.matches ? 'dark' : 'light';
    return DARK[theme] ? 'dark' : 'light';
  }

  /** Black or white text, whichever reads better on this colour. */
  function textOn(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return lum > 0.179 ? '#111111' : '#ffffff';
  }

  // Parts of the page that only exist once it has loaded: the Ask and Sheet panels carry their own attributes
  // (so previews in the Look dialog can reuse the same CSS), and the tabs and map tools are ordered and hidden.
  function applyPage() {
    var ask = document.getElementById('tab-ask');
    var sheet = document.getElementById('tab-sheet');
    if (ask) ask.setAttribute('data-chat', current.chat);
    if (sheet) {
      sheet.setAttribute('data-sheet-style', current.sheetStyle);
      sheet.setAttribute('data-sheet-layout', current.sheetLayout);
    }
    var nav = document.querySelector('#app-view .tabs');
    if (nav) {
      for (var i = 0; i < current.tabOrder.length; i++) {
        var tab = nav.querySelector('[data-tab="' + current.tabOrder[i] + '"]');
        if (tab) {
          nav.appendChild(tab);
          tab.classList.toggle('user-hidden', current.hiddenTabs.indexOf(current.tabOrder[i]) >= 0);
        }
      }
    }
    var tools = document.querySelectorAll('[data-tool]');
    for (var j = 0; j < tools.length; j++) {
      tools[j].classList.toggle('user-hidden', current.hiddenTools.indexOf(tools[j].getAttribute('data-tool')) >= 0);
    }
  }

  function apply(look) {
    current = look;
    var root = document.documentElement;
    root.setAttribute('data-theme', look.theme);
    root.setAttribute('data-scheme', scheme(look.theme));
    root.setAttribute('data-layout', look.layout);
    root.setAttribute('data-density', look.density);
    root.setAttribute('data-map-bar', look.mapBar);
    root.setAttribute('data-beside-side', look.besideSide);
    root.setAttribute('data-token-labels', look.tokenLabels);
    if (look.accent) {
      root.setAttribute('data-accent', look.accent);
      root.style.setProperty('--accent', look.accent);
      root.style.setProperty('--accent-text', textOn(look.accent));
    } else {
      root.removeAttribute('data-accent');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-text');
    }
    applyPage();
  }

  function save(look) {
    look = clean(look);
    apply(look);
    try { localStorage.setItem(KEY, JSON.stringify(look)); } catch (e) { /* not saved; still applied */ }
    // The page may need to react (a tab it's on was hidden, the map's size changed).
    try { window.dispatchEvent(new CustomEvent('dndlook', { detail: get() })); } catch (e) { /* very old browser */ }
  }

  function get() {
    var c = {};
    for (var k in current) c[k] = Object.prototype.toString.call(current[k]) === '[object Array]' ? current[k].slice() : current[k];
    return c;
  }

  if (deviceDark.addEventListener) {
    deviceDark.addEventListener('change', function () { apply(current); });
  }
  apply(current);
  document.addEventListener('DOMContentLoaded', applyPage);

  window.dndLook = {
    OPTIONS: OPTIONS,
    DEFAULTS: DEFAULTS,
    TABS: TABS,
    TOOLS: TOOLS,
    keepsATab: keepsATab,
    get: get,
    save: save,
    scheme: scheme,
  };
})();
