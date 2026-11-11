/** The Map tab's pins (moved out of map.js): each person's own markers on a map, placed, dragged, labelled. */
import { base, report, state } from './state.js';
import { $, h } from '../page/dom.js';
import { renderTemplates } from './spell-templates.js';
import { render, renderSelection, renderTokens, toImage } from './map.js';
import { api } from '../page/api.js';

export const myPins = () => (state.current && state.pins.get(state.current.id)) || [];

export function renderPins() {
  const layer = $('#map-pins');
  layer.replaceChildren(
    ...myPins().map((p) => {
      const dragging = state.pinDrag?.id === p.id;
      const el = h('div', {
        class: `map-pin${state.selectedPin === p.id ? ' selected' : ''}${dragging ? ' dragging' : ''}`,
        title: p.label ? `${p.label} (only you see this pin)` : 'Your pin (only you see it)',
        role: 'button',
        tabindex: '0',
        'aria-label': p.label || 'Pin',
        'data-pin': p.id,
      }, p.label ? h('span', { class: 'map-pin-label' }, p.label) : null);
      el.style.cssText = `left:${dragging ? state.pinDrag.x : p.x}px;top:${dragging ? state.pinDrag.y : p.y}px;--pin:${p.color}`;
      el.addEventListener('pointerdown', (e) => pinDown(e, p));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectPin(p.id);
        }
      });
      return el;
    }),
  );
}

function selectPin(id) {
  state.selectedPin = id;
  if (id) Object.assign(state, { selected: null, selectedTemplate: null, selectedDoor: null, selectedRaised: null });
  renderTemplates();
  renderTokens();
  renderPins();
  renderSelection();
}

/** Change this person's pins on the server; the answer is their whole list. */
async function pinRequest(method, path, body) {
  const map = state.current;
  try {
    const res = await state.guarded(() => api(method, `${base()}/${map.id}/pins${path}`, body));
    if (!res) return null;
    state.pins.set(map.id, res.pins);
    if (state.current?.id === map.id) {
      renderPins();
      renderSelection();
    }
    return res;
  } catch (err) {
    report(err);
    return null;
  }
}

export async function dropPin(at) {
  state.pinMode = false;
  renderPinTool();
  render();
  const res = await pinRequest('POST', '', { x: at.x, y: at.y });
  if (res) {
    selectPin(res.pin.id);
    $('#map-selection input')?.focus();
  }
}

export function renderPinTool() {
  $('#map-pin').setAttribute('aria-pressed', String(state.pinMode));
  $('#map-view').classList.toggle('pin-placing', state.pinMode || state.pinging || state.drawing);
}

function pinDown(e, pin) {
  e.stopPropagation();
  $('#map-view').setPointerCapture(e.pointerId);
  state.pinDrag = { id: pin.id, pointer: e.pointerId, x: pin.x, y: pin.y, moved: false, sx: e.clientX, sy: e.clientY };
}

export function pinMove(e) {
  const drag = state.pinDrag;
  if (e.pointerId !== drag.pointer) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
  drag.moved = true;
  const map = state.current;
  const at = toImage(e.clientX, e.clientY);
  drag.x = Math.max(0, Math.min(map.image.width, at.x));
  drag.y = Math.max(0, Math.min(map.image.height, at.y));
  const el = document.querySelector(`.map-pin[data-pin="${drag.id}"]`);
  if (el) {
    el.style.left = `${drag.x}px`;
    el.style.top = `${drag.y}px`;
    el.classList.add('dragging');
  }
}

export function pinUp(e) {
  const drag = state.pinDrag;
  if (e.pointerId !== drag.pointer) return;
  state.pinDrag = null;
  if (!drag.moved) return selectPin(drag.id);
  const pin = myPins().find((p) => p.id === drag.id);
  if (pin) Object.assign(pin, { x: drag.x, y: drag.y });
  renderPins();
  pinRequest('PATCH', `/${drag.id}`, { x: drag.x, y: drag.y });
}

export function pinControls(pin) {
  const label = h('input', { value: pin.label, maxLength: 80, placeholder: 'A note to yourself', 'aria-label': 'Pin label', class: 'map-pin-input' });
  label.addEventListener('change', () => pinRequest('PATCH', `/${pin.id}`, { label: label.value.trim() }));
  label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') label.blur();
  });
  const color = h('input', { type: 'color', value: pin.color, 'aria-label': 'Pin colour', class: 'map-pin-color' });
  color.addEventListener('change', () => pinRequest('PATCH', `/${pin.id}`, { color: color.value }));
  return [
    h('span', { class: 'swatch', style: `background:${pin.color}` }),
    h('strong', {}, 'Your pin'),
    label,
    color,
    h('span', { class: 'muted small' }, 'Only you see it. Drag to move.'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'ghost danger', onclick: () => {
      selectPin(null);
      pinRequest('DELETE', `/${pin.id}`);
    } }, 'Remove'),
    h('button', { class: 'ghost icon-btn', 'aria-label': 'Close', onclick: () => selectPin(null) }, '✕'),
  ];
}
