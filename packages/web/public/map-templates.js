/**
 * Spell templates on the map (areas of effect anyone can place): the Template dialog, placing,
 * moving and turning them, and who they catch.
 */
import { onMap, render, renderMeasureTools, renderPinTool, renderPins, renderRuler, renderSelection, renderTokens, setTool, svgEl, toImage } from './map.js';
import { LoggedOut, api, h } from './api.js';
import { TEMPLATE_COLOR, TEMPLATE_SHAPES, TEMPLATE_SHAPE_NAMES, snapTemplatePoint, spellArea, templateShape, tokensInTemplate } from './shared/map.js';
import { base, report, state, status } from './map-state.js';
import { field } from './map-dm.js';

const $ = (sel) => document.querySelector(sel);

// ---------- spell templates (areas of effect) ----------

export const canChangeTemplate = (t) => state.canEdit || (t.user_id != null && t.user_id === state.userId);

/** The direction from a to b in degrees, in steps of 15. */
function aim(a, b) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return 0;
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return ((Math.round(deg / 15) * 15) % 360 + 360) % 360;
}

/** The template being placed, as it would be saved. */
function draftTemplate(place) {
  return { ...state.templateDraft, id: 'placing', x: place.a.x, y: place.a.y, angle: aim(place.a, place.b) };
}

/** Templates on the map (everyone's the viewer gets), and which tokens the selected or placed one catches. */
export function renderTemplates() {
  const map = state.current;
  const svg = $('#map-templates');
  state.caught = new Set();
  if (!map) return;
  svg.setAttribute('viewBox', `0 0 ${map.image.width} ${map.image.height}`);
  svg.replaceChildren();
  const drag = state.templateDrag?.moved ? state.templateDrag : null;
  const list = (map.templates ?? []).map((t) => (drag?.id === t.id ? { ...t, x: drag.x, y: drag.y } : t));
  let focus = list.find((t) => t.id === state.selectedTemplate);
  if (state.templatePlace && state.templateDraft) {
    focus = draftTemplate(state.templatePlace);
    list.push(focus);
  }
  for (const t of list) {
    const shape = templateShape(map, t);
    const cls = `template${t === focus ? (t.id === 'placing' ? ' placing' : ' selected') : ''}`;
    const style = `--tpl:${t.color}`;
    svg.append(shape.circle
      ? svgEl('circle', { cx: shape.circle.cx, cy: shape.circle.cy, r: shape.circle.r, class: cls, style, 'data-template': t.id })
      : svgEl('polygon', { points: shape.points.map((p) => p.join(',')).join(' '), class: cls, style, 'data-template': t.id }));
  }
  if (focus) state.caught = new Set(tokensInTemplate(map, focus).map((t) => t.id));
}

export function selectTemplate(id) {
  Object.assign(state, { selectedTemplate: id, selected: null, selectedPin: null, selectedDoor: null });
  renderTemplates();
  renderTokens();
  renderPins();
  renderSelection();
}

/** Place, change or remove a template; the answer is the whole map. */
async function templateRequest(method, path, body) {
  try {
    const res = await state.guarded(() => api(method, `${base()}/${state.current.id}/templates${path}`, body));
    if (res) onMap(res.map);
    return res;
  } catch (err) {
    report(err);
    return null;
  }
}

export async function placeTemplate(e) {
  const place = state.templatePlace;
  state.templatePlace = null;
  if (e.type !== 'pointerup') {
    renderTemplates();
    return renderTokens();
  }
  const { shape, x, y, angle, size, width, label, color } = draftTemplate(place);
  state.templateDraft = null;
  renderMeasureTools();
  const res = await templateRequest('POST', '', { shape, x, y, angle, size, width, label, color });
  if (res) selectTemplate(res.template.id);
  else render();
}

export function templateMove(e) {
  const drag = state.templateDrag;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
  drag.moved = true;
  const at = toImage(e.clientX, e.clientY);
  Object.assign(drag, snapTemplatePoint(state.current, { x: at.x - drag.grab.x, y: at.y - drag.grab.y }));
  renderTemplates();
  renderTokens();
}

export function templateUp(e) {
  const drag = state.templateDrag;
  state.templateDrag = null;
  if (!drag.moved) return;
  const tpl = state.current.templates.find((t) => t.id === drag.id);
  if (tpl && e.type === 'pointerup') {
    Object.assign(tpl, { x: drag.x, y: drag.y });
    templateRequest('PATCH', `/${tpl.id}`, { x: drag.x, y: drag.y });
  }
  renderTemplates();
  renderTokens();
  renderSelection();
}

/** What a template is: "20 ft radius", "15 ft cone", "100 × 5 ft line". */
function templateText(map, t) {
  const unit = map.scale?.unit ?? 'ft';
  if (t.shape === 'circle') return `${t.size} ${unit} radius`;
  if (t.shape === 'line') return `${t.size} × ${t.width} ${unit} line`;
  return `${t.size} ${unit} ${t.shape}`;
}

export function templateControls(tpl) {
  const map = state.current;
  const caught = tokensInTemplate(map, tpl);
  const mine = canChangeTemplate(tpl);
  return [
    h('span', { class: 'swatch', style: `background:${tpl.color}` }),
    h('strong', {}, tpl.label || TEMPLATE_SHAPE_NAMES[tpl.shape]),
    h('span', { class: 'muted small' }, templateText(map, tpl)),
    h('span', { class: 'small template-caught' }, caught.length ? `Catches ${caught.map((t) => t.name).join(', ')}` : 'Catches nobody you can see'),
    h('span', { class: 'spacer' }),
    mine ? h('span', { class: 'muted small' }, 'Drag to move.') : null,
    mine && tpl.shape !== 'circle' ? h('button', { class: 'ghost', title: 'Turn it 45°', onclick: () => templateRequest('PATCH', `/${tpl.id}`, { angle: (tpl.angle + 45) % 360 }) }, 'Turn') : null,
    mine ? h('button', { class: 'ghost danger', onclick: () => {
      selectTemplate(null);
      templateRequest('DELETE', `/${tpl.id}`);
    } }, 'Remove') : null,
    h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => selectTemplate(null) }, '✕'),
  ].filter(Boolean);
}

/** How many of the map's units one foot is (spells are in feet). */
const FOOT = { ft: 1, m: 0.3, mi: 1 / 5280, km: 0.0003 };

/** Choose a template (or one of your spells with an area), then click and drag on the map to place and aim it. */
export async function templateDialog() {
  const map = state.current;
  if (!map) return;
  const unit = map.scale?.unit ?? 'ft';
  // Your spells that have an area, from your character sheet.
  let spells = [];
  try {
    const res = await api('GET', `/campaigns/${state.campaignId}/sheet`);
    spells = (res.sheet.spells ?? []).map((sp) => ({ name: sp.name, area: spellArea(sp) })).filter((sp) => sp.area);
  } catch (err) {
    if (err instanceof LoggedOut) throw err;
  }
  const dialog = $('#map-dialog');
  const spell = h('select', {}, new Option('None (choose a shape)', ''), ...spells.map((sp, i) => new Option(`${sp.name} (${sp.area.size} ft ${sp.area.shape === 'circle' ? 'radius' : sp.area.shape})`, i)));
  const shape = h('select', {}, ...TEMPLATE_SHAPES.map((sh) => new Option(TEMPLATE_SHAPE_NAMES[sh], sh)));
  const size = h('input', { type: 'number', min: '0.5', step: 'any', value: '20', required: true });
  const width = h('input', { type: 'number', min: '0.5', step: 'any', value: String(5 * FOOT[unit]) });
  const label = h('input', { maxLength: 80, placeholder: 'Fireball' });
  const color = h('input', { type: 'color', value: TEMPLATE_COLOR });
  const sizeField = field(`Size (${unit})`, size);
  const widthField = field(`Width (${unit})`, width);
  const sync = () => {
    widthField.hidden = shape.value !== 'line';
    sizeField.firstChild.textContent = `${shape.value === 'circle' ? 'Radius' : 'Length'} (${unit})`;
  };
  shape.addEventListener('change', sync);
  spell.addEventListener('change', () => {
    const sp = spells[Number(spell.value)];
    if (!sp || spell.value === '') return;
    shape.value = sp.area.shape;
    size.value = String(Math.round(sp.area.size * FOOT[unit] * 100) / 100);
    if (sp.area.width) width.value = String(Math.round(sp.area.width * FOOT[unit] * 100) / 100);
    label.value = sp.name.slice(0, 80);
    sync();
  });
  sync();
  dialog.replaceChildren(
    h('form', { method: 'dialog', class: 'map-dialog-inner', onsubmit: (e) => {
      e.preventDefault();
      const n = Number(size.value);
      if (!(n > 0)) return;
      setTool({});
      state.templateDraft = { shape: shape.value, size: n, width: shape.value === 'line' ? Number(width.value) || 5 * FOOT[unit] : null, label: label.value.trim(), color: color.value };
      Object.assign(state, { measuring: false, ruler: null, pinMode: false, pinging: false, drawing: false });
      renderPinTool();
      renderMeasureTools();
      renderRuler();
      status(state.templateDraft.shape === 'circle' ? 'Click where it centres. Everyone can see it.' : 'Press where it starts and drag to aim it. Everyone can see it.');
      dialog.close();
    } },
      h('h2', {}, 'Place a template'),
      spells.length ? field('One of your spells', spell) : null,
      h('div', { class: 'map-row' }, field('Shape', shape), sizeField, widthField),
      h('div', { class: 'map-row' }, field('Label', label), field('Colour', color)),
      map.scale ? null : h('p', { class: 'muted small' }, "This map has no scale yet, so a square counts as 5 ft."),
      h('p', { class: 'muted small' }, 'On a grid it starts on a square\'s corner; tokens with any square\'s middle inside are caught.'),
      h('div', { class: 'map-dialog-actions' },
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'primary' }, 'Place it'),
      ),
    ),
  );
  dialog.onclose = null;
  dialog.showModal();
}
