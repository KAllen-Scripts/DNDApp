/**
 * Starting a new map in the creator (map-creator.js): blank, one the server
 * makes (a dungeon, cave, village...), or the AI's draft from the DM's
 * description and sketch; each shown first, to use or try again. And the
 * floors of a building: each floor its own map, added above or below, with
 * the floor below drawn faintly to line walls up with it.
 */
import { DESIGN_MAX, DESIGN_MIN, FLOORS, emptyDesign, normalizeDesign } from '/shared/map-design.js';
import { drawDesign } from '/shared/map-art.js';
import { levelName } from '/shared/map.js';
import { LoggedOut, api, h, readBase64 } from '../../page/api.js';
import { onMap } from '../map.js';
import { base, state } from '../state.js';

const $ = (sel) => document.querySelector(sel);
const POLL_MS = 2000; // how often the page asks how the AI's draft is getting on (the first time sooner)
const GROUNDS = ['g', 's', 'f', 'w', 'd', 'r', 'a', 'n', 'c', '.'];

/** The start screen for a new map. */
export function renderStart(c, act) {
  const box = $('#creator-start');
  if (!box) return;
  // Each way of starting has its own size: blank; made by the server or the AI only if the DM asks for one.
  c.start ??= {
    kinds: [], ground: 'g', result: null, kind: null, prompt: '', sketch: null, busy: false,
    blank: { cols: 30, rows: 20 }, make: { on: false, cols: 30, rows: 20 }, ai: { on: false, cols: 30, rows: 20 },
  };
  const s = c.start;
  const num = (id, of, key, min) => h('input', { id, type: 'number', min: String(min), max: String(DESIGN_MAX), value: String(of[key]), 'aria-label': key === 'cols' ? 'Squares across' : 'Squares down', onchange: (e) => { of[key] = Math.round(Number(e.target.value)) || of[key]; } });
  const size = (prefix, of, min = DESIGN_MIN) => h('span', { class: 'creator-size' }, num(`${prefix}-cols`, of, 'cols', min), '×', num(`${prefix}-rows`, of, 'rows', min), h('span', { class: 'muted small' }, 'squares'));
  const sizeChoice = (prefix, of, min) => [
    h('label', { class: 'map-check' }, h('input', { type: 'checkbox', id: `${prefix}-sized`, checked: of.on, onchange: (e) => { of.on = e.target.checked; renderStart(c, act); } }), ' At a size of my own'),
    of.on ? size(prefix, of, min) : null,
  ];
  const ground = h('select', { id: 'creator-ground', onchange: (e) => { s.ground = e.target.value; } },
    ...GROUNDS.map((ch) => new Option(ch === '.' ? 'Nothing (black)' : FLOORS[ch].name, ch, false, s.ground === ch)));
  const kinds = h('div', { class: 'creator-kinds' }, s.kinds.map((k) => h('button', {
    type: 'button', class: 'ghost creator-kind', 'data-generate': k.key, 'aria-pressed': String(s.kind === k.key), disabled: s.busy,
    onclick: () => generate(c, act, k.key).catch((err) => fail(c, act, err)),
  }, h('strong', {}, k.name), h('span', { class: 'muted small' }, k.about))));
  const describe = h('textarea', { id: 'creator-describe', rows: 4, maxLength: 4000, value: s.prompt, placeholder: "A smugglers' cave under a lighthouse: a sea cave with a jetty and a rowing boat, tunnels up to a cellar full of crates, and a hidden room.", oninput: (e) => { s.prompt = e.target.value; } });
  const sketch = h('input', { type: 'file', id: 'creator-sketch', accept: 'image/png,image/jpeg,image/webp', onchange: (e) => { s.sketch = e.target.files[0] ?? null; } });
  box.replaceChildren(
    h('div', { class: 'creator-start-choices' },
      h('section', { class: 'creator-start-part' },
        h('h3', {}, 'Start blank'),
        h('div', { class: 'creator-row' }, size('creator-start', s.blank)),
        h('label', { class: 'map-field' }, h('span', {}, 'Floor to start with'), ground),
        h('p', { class: 'muted small', id: 'creator-floors-hint' }, 'Only a start: a map can have as many kinds of floor as you like. Paint others over it with the Floor and Fill tools, and each Room brings its own.'),
        h('button', { type: 'button', class: 'primary', id: 'creator-blank', onclick: () => act.begin(emptyDesign(clampSize(s.blank.cols), clampSize(s.blank.rows), s.ground)) }, 'Start drawing'),
      ),
      h('section', { class: 'creator-start-part' },
        h('h3', {}, 'Describe it to the AI'),
        h('p', { class: 'muted small' }, 'Say what the place is and what is in it. Add a sketch (even a photo of graph paper) and it follows the layout.'),
        describe,
        h('label', { class: 'map-field' }, h('span', {}, 'Sketch (optional)'), sketch),
        ...sizeChoice('creator-ai', s.ai, DESIGN_MIN),
        h('button', { type: 'button', class: 'primary', id: 'creator-draft', disabled: s.busy, onclick: () => draft(c, act).catch((err) => fail(c, act, err)) }, 'Draft it'),
      ),
      h('section', { class: 'creator-start-part' },
        h('h3', {}, 'Make one to start from'),
        h('p', { class: 'muted small' }, 'Made new each time, at its usual size or the size you give. Change anything you like afterwards.'),
        ...sizeChoice('creator-make', s.make, 16),
        kinds,
      ),
    ),
    h('section', { class: 'creator-start-result', id: 'creator-result' }, ...result(c, act)),
  );
  if (!s.kinds.length) {
    api('GET', `${base()}/design/kinds`).then(({ kinds: list }) => {
      if (c.start !== s || !list.length) return;
      s.kinds = list;
      if ($('#creator-start')) renderStart(c, act);
    }).catch((err) => fail(c, act, err));
  }
}

const clampSize = (n) => Math.min(DESIGN_MAX, Math.max(DESIGN_MIN, Math.round(Number(n)) || 20));

function fail(c, act, err) {
  if (err instanceof LoggedOut) throw err;
  if (c.start) c.start.busy = false;
  act.status(err.message);
  if ($('#creator-start')) renderStart(c, act);
}

/** What was made, shown to use or try again. */
function result(c, act) {
  const r = c.start.result;
  if (c.start.busy) return [h('p', { class: 'creator-waiting', id: 'creator-waiting' }, c.start.waiting ?? 'Making it…')];
  if (!r) return [h('p', { class: 'muted' }, 'What you make shows here first, to use or try again.')];
  const W = 560;
  const k = Math.min(W / r.design.cols, 420 / r.design.rows);
  const preview = h('canvas', { width: Math.ceil(r.design.cols * k), height: Math.ceil(r.design.rows * k), class: 'creator-preview', id: 'creator-preview' });
  const ctx = preview.getContext('2d');
  if (ctx) drawDesign(ctx, r.design, { cell: k, makeCanvas: (w, ht) => Object.assign(document.createElement('canvas'), { width: w, height: ht }) });
  return [
    h('h3', {}, r.name),
    preview,
    h('p', { class: 'muted small' }, `${r.design.cols} × ${r.design.rows} squares.${r.notes ? ` ${r.notes}` : ''}`),
    h('div', { class: 'creator-row' },
      h('button', { type: 'button', class: 'primary', id: 'creator-use', onclick: () => act.begin(r.design, r.name) }, 'Use this one'),
      r.kind ? h('button', { type: 'button', class: 'ghost', id: 'creator-again', onclick: () => generate(c, act, r.kind).catch((err) => fail(c, act, err)) }, 'Make another') : null,
      r.ai ? h('button', { type: 'button', class: 'ghost', id: 'creator-redraft', onclick: () => draft(c, act).catch((err) => fail(c, act, err)) }, 'Ask again') : null,
    ),
  ];
}

async function generate(c, act, kind) {
  const s = c.start;
  s.busy = true;
  s.kind = kind;
  s.waiting = 'Making it…';
  renderStart(c, act);
  const body = { kind, ...(s.make.on && { cols: Math.max(16, clampSize(s.make.cols)), rows: Math.max(12, clampSize(s.make.rows)) }) };
  const out = await api('POST', `${base()}/design/generate`, body);
  if (c.start !== s || !$('#creator-start')) return;
  s.busy = false;
  s.result = { name: out.name, design: normalizeDesign(out.design), kind, notes: '' };
  act.status('');
  renderStart(c, act);
}

/** Ask the AI for a draft, then wait for it (it takes a while: the page asks how it's getting on). */
async function draft(c, act) {
  const s = c.start;
  const prompt = s.prompt.trim();
  if (prompt.length < 3) {
    act.status('Describe the map first: what the place is and what is in it.');
    $('#creator-describe')?.focus();
    return;
  }
  if (s.sketch && s.sketch.size > 10 * 1024 * 1024) return act.status('That sketch is too big (10 MB at most).');
  s.busy = true;
  s.waiting = 'The AI is drafting your map. This can take a minute or two…';
  renderStart(c, act);
  const body = { prompt, ...(s.ai.on && { cols: clampSize(s.ai.cols), rows: clampSize(s.ai.rows) }), ...(s.sketch && { sketch: await readBase64(s.sketch) }) };
  const job = await state.guarded(() => api('POST', `${base()}/design/draft`, body));
  if (!job) {
    s.busy = false;
    return renderStart(c, act);
  }
  const started = Date.now();
  for (let i = 0; ; i += 1) {
    await new Promise((r) => setTimeout(r, i ? POLL_MS : 400));
    if (c.start !== s || !$('#creator-start')) return;
    const d = await api('GET', `${base()}/design/draft/${job.id}`);
    if (d.status === 'pending') {
      const waiting = $('#creator-waiting');
      if (waiting) waiting.textContent = `The AI is drafting your map (${Math.round((Date.now() - started) / 1000)} s). This can take a minute or two…`;
      continue;
    }
    s.busy = false;
    if (d.status === 'failed') throw new Error(d.error);
    s.result = { name: d.name, design: normalizeDesign(d.design), ai: true, notes: d.notes };
    act.status('');
    renderStart(c, act);
    return;
  }
}

// ---------- floors of a building ----------

/** The maps of the building the open map is in, highest first (the map alone, as its ground floor, if it has no others). */
function floorsOf(c) {
  const group = c.map.level?.group ?? c.map.id;
  const floors = state.maps.filter((m) => (m.level?.group ?? m.id) === group);
  if (!floors.some((m) => m.id === c.map.id)) floors.push(c.map);
  return floors.map((m) => ({ map: m, n: m.level?.n ?? 0 })).sort((p, q) => q.n - p.n);
}

/** The Map tab's floors: each to open, more to add above and below, and the floor below drawn faintly. */
export function renderLevels(c, act) {
  const floors = floorsOf(c);
  const here = floors.find((f) => f.map.id === c.map.id)?.n ?? 0;
  const top = floors[0].n;
  const bottom = floors.at(-1).n;
  const start = h('select', { id: 'creator-level-start', 'aria-label': 'The new floor starts' },
    new Option("With this floor's walls", 'copy'), new Option('Empty', 'empty'));
  const add = async (n) => {
    const made = await state.guarded(() => api('POST', `${base()}/${c.map.id}/levels`, { n, start: start.value }));
    if (!made) return;
    onMap(made);
    // This map is now the building's ground floor (if it wasn't in a building).
    if (!c.map.level) c.map = { ...c.map, level: { group: c.map.id, n: 0 } };
    act.status(`Added ${made.name}.`);
    if (confirm(`Open "${made.name}" in the creator now?`)) await act.switchTo(made);
    else act.panel();
  };
  const below = floors.find((f) => f.n < here) ?? floors.find((f) => f.n > here);
  const ghost = h('input', { type: 'checkbox', id: 'creator-ghost', checked: !!c.ghost, disabled: !below, onchange: (e) => toggleGhost(c, act, e.target.checked ? below.map : null).catch((err) => act.status(err.message)) });
  return [
    h('h3', {}, 'Floors of this building'),
    h('ol', { class: 'creator-levels', id: 'creator-levels' }, floors.map((f) => h('li', { 'aria-current': f.map.id === c.map.id ? 'true' : null },
      h('span', {}, h('strong', {}, levelName(f.n)), ` ${f.map.name}`),
      f.map.id === c.map.id ? h('span', { class: 'muted small' }, 'open now') : h('button', { type: 'button', class: 'ghost small', onclick: () => act.switchTo(f.map).catch((err) => act.status(err.message)) }, 'Open')))),
    h('div', { class: 'creator-row' },
      h('button', { type: 'button', class: 'ghost', id: 'creator-add-above', disabled: top >= 9, onclick: () => add(top + 1).catch((err) => act.status(err.message)) }, `Add ${levelName(top + 1).toLowerCase()}`),
      h('button', { type: 'button', class: 'ghost', id: 'creator-add-below', disabled: bottom <= -9, onclick: () => add(bottom - 1).catch((err) => act.status(err.message)) }, `Add ${levelName(bottom - 1).toLowerCase()}`)),
    start,
    h('p', { class: 'muted small' }, 'Stairs, ladders and trapdoors lead between floors: pick one on the map and set where it leads. Taking them arrives at the same place on the other floor.'),
    h('label', { class: 'map-check' }, ghost, below ? ` Show ${levelName(below.n).toLowerCase()} faintly` : ' Show the floor below faintly'),
  ];
}

async function toggleGhost(c, act, map) {
  if (!map) {
    c.ghost = null;
    act.redraw();
    return;
  }
  const { design } = await api('GET', `${base()}/${map.id}/design`);
  if (act.current() !== c) return;
  c.ghost = { design: normalizeDesign(design), name: map.name };
  if (design.cols !== c.design.cols || design.rows !== c.design.rows) act.status(`${map.name} is a different size, so it won't line up exactly.`);
  act.redraw();
}
