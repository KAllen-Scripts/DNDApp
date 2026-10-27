/**
 * pan-zoom.js (moving round the wiki's big views) and mini-views.js (the small
 * drawings on a page's compass, the Home and the rail).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { zoomAt, fitBox, centreOn, toContent, panZoom } from '../public/pan-zoom.js';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('pan-zoom: zooming keeps the point under the pointer still, within the limits', () => {
  const view = { x: 10, y: 20, k: 1 };
  const before = toContent(view, 100, 50);
  const after = zoomAt(view, 2, 100, 50);
  assert.equal(after.k, 2);
  const still = toContent(after, 100, 50);
  close(still.x, before.x, 'x');
  close(still.y, before.y, 'y');
  assert.equal(zoomAt(view, 100, 0, 0, { max: 3 }).k, 3);
  assert.equal(zoomAt(view, 0.001, 0, 0, { min: 0.5 }).k, 0.5);
});

test('pan-zoom: fitting a box centres it in the frame, and centring puts a point in the middle', () => {
  const v = fitBox({ x: 100, y: 100, w: 200, h: 100 }, 400, 400, { margin: 0 });
  assert.equal(v.k, 2);
  const mid = toContent(v, 200, 200);
  close(mid.x, 200, 'x');
  close(mid.y, 150, 'y');
  const c = centreOn(50, 60, 400, 300, 1.5);
  const m = toContent(c, 200, 150);
  close(m.x, 50, 'x');
  close(m.y, 60, 'y');
});

test('pan-zoom: the wheel zooms the content and dragging moves it, but not from a card marked data-no-pan', () => {
  const dom = new JSDOM('<div id="f"><div id="c"><span id="card" data-no-pan></span></div></div>');
  const { document, MouseEvent, WheelEvent } = dom.window;
  const frame = document.querySelector('#f');
  const content = document.querySelector('#c');
  const seen = [];
  const pz = panZoom(frame, content, { onChange: (v) => seen.push(v) });
  frame.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 0, clientY: 0, cancelable: true }));
  assert.ok(pz.view().k > 1, 'zoomed in');
  assert.match(content.style.transform, /scale\(/);
  const pointer = (type, target, x, y) => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    target.dispatchEvent(e);
  };
  const k = pz.view().k;
  pointer('pointerdown', frame, 10, 10);
  pointer('pointermove', frame, 40, 30);
  pointer('pointerup', frame, 40, 30);
  assert.deepEqual(pz.view(), { x: 30, y: 20, k });
  pointer('pointerdown', document.querySelector('#card'), 0, 0);
  pointer('pointermove', frame, 100, 100);
  pointer('pointerup', frame, 100, 100);
  assert.deepEqual(pz.view(), { x: 30, y: 20, k }, 'a drag on a card leaves the view alone');
  pz.destroy();
  assert.ok(seen.length >= 2);
});
