/**
 * Drag, wheel and pinch to move round a big drawing (the wiki's Web,
 * Timeline, Wheel and Boards). `panZoom(frame, content)` moves `content`
 * inside `frame` with a CSS transform; the maths below it is plain numbers,
 * so it's tested without a page.
 *
 * A view is { x, y, k }: the content's point (0, 0) sits at (x, y) in the
 * frame, drawn k times its size.
 */

export const clampK = (k, { min = 0.2, max = 4 } = {}) => Math.min(max, Math.max(min, k));

/** Zoom by `factor` keeping the frame's point (px, py) over the same spot of the content. */
export function zoomAt(view, factor, px, py, limits) {
  const k = clampK(view.k * factor, limits);
  const f = k / view.k;
  return { x: px - (px - view.x) * f, y: py - (py - view.y) * f, k };
}

/** The view that fits a box { x, y, w, h } of the content into a frame width × height, with a margin. */
export function fitBox(box, width, height, { margin = 24, ...limits } = {}) {
  const k = clampK(Math.min((width - 2 * margin) / Math.max(1, box.w), (height - 2 * margin) / Math.max(1, box.h)), limits);
  return { x: (width - box.w * k) / 2 - box.x * k, y: (height - box.h * k) / 2 - box.y * k, k };
}

/** The view that puts the content's point (cx, cy) in the middle of the frame, at zoom k. */
export const centreOn = (cx, cy, width, height, k) => ({ x: width / 2 - cx * k, y: height / 2 - cy * k, k });

/** Where a point of the frame falls on the content. */
export const toContent = (view, px, py) => ({ x: (px - view.x) / view.k, y: (py - view.y) / view.k });

export const transformText = (view) => `translate(${view.x}px, ${view.y}px) scale(${view.k})`;

/**
 * Let the user move `content` round inside `frame`. opts:
 * - min, max: zoom limits
 * - axis: 'both' (default) or 'x' (the Timeline: dragging and zooming only sideways)
 * - onChange(view): after every move
 * Returns { view(), set(view), fit(box), centre(x, y, k), destroy() }.
 * A drag that starts on something with data-no-pan (a card being moved) is left alone.
 */
export function panZoom(frame, content, { axis = 'both', onChange = null, ...limits } = {}) {
  let view = { x: 0, y: 0, k: 1 };
  const pointers = new Map();
  let pinch = null;

  const set = (v) => {
    view = axis === 'x' ? { ...v, y: 0 } : v;
    content.style.transformOrigin = '0 0';
    content.style.transform = axis === 'x' ? `translate(${view.x}px, 0) scaleX(${view.k})` : transformText(view);
    onChange?.(view);
  };
  const local = (e) => {
    const r = frame.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e) => {
    if (e.button > 0 || e.target.closest?.('[data-no-pan]')) return;
    pointers.set(e.pointerId, local(e));
    frame.setPointerCapture?.(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { gap: Math.hypot(a.x - b.x, a.y - b.y), view };
    }
  };
  const move = (e) => {
    const was = pointers.get(e.pointerId);
    if (!was) return;
    const now = local(e);
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) {
      set({ ...view, x: view.x + now.x - was.x, y: view.y + now.y - was.y });
    } else if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const factor = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.gap);
      set(zoomAt(pinch.view, factor, (a.x + b.x) / 2, (a.y + b.y) / 2, limits));
    }
  };
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  const wheel = (e) => {
    e.preventDefault();
    const p = local(e);
    set(zoomAt(view, Math.exp(-e.deltaY * 0.0015), p.x, p.y, limits));
  };

  frame.addEventListener('pointerdown', down);
  frame.addEventListener('pointermove', move);
  frame.addEventListener('pointerup', up);
  frame.addEventListener('pointercancel', up);
  frame.addEventListener('wheel', wheel, { passive: false });
  frame.style.touchAction = 'none';
  set(view);

  return {
    view: () => view,
    set,
    fit: (box, opts) => set(fitBox(box, frame.clientWidth, frame.clientHeight, { ...limits, ...opts })),
    centre: (x, y, k = view.k) => set(centreOn(x, y, frame.clientWidth, frame.clientHeight, k)),
    destroy() {
      frame.removeEventListener('pointerdown', down);
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerup', up);
      frame.removeEventListener('pointercancel', up);
      frame.removeEventListener('wheel', wheel);
    },
  };
}
