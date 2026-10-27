/** mini-views.js: the small drawings draw only what they're given, in each family's colour. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { miniCrop, miniRing, miniRibbon, ringPoints } from '../public/mini-views.js';

before(() => {
  globalThis.document = new JSDOM('').window.document;
});

test('mini views: a map crop shows the pins inside it and leaves out the rest', () => {
  const el = miniCrop({ src: 'map.png', crop: { x: 100, y: 100, w: 200, h: 100 }, width: 120, height: 60, pins: [
    { x: 150, y: 150, family: 'place', title: 'Millbrook' },
    { x: 900, y: 900, family: 'person', title: 'Far away' },
  ] });
  const pins = el.querySelectorAll('.mini-pin');
  assert.equal(pins.length, 1);
  assert.match(pins[0].getAttribute('class'), /fam-place/);
  assert.equal(pins[0].querySelector('title').textContent, 'Millbrook');
  assert.equal(el.querySelector('image').getAttribute('href'), 'map.png');
});

test('mini views: a ring puts the page in the middle and its neighbours round it, with rumours dotted', () => {
  const pts = ringPoints(4, 10);
  assert.ok(Math.abs(pts[0].x) < 1e-9 && Math.abs(pts[0].y + 10) < 1e-9, 'the first at the top');
  const el = miniRing({ centre: { title: 'Veyra', family: 'person' }, neighbours: [
    { title: 'Thorin', family: 'person' },
    { title: 'The Pale Hand', family: 'faction', rumour: true },
  ] });
  assert.equal(el.querySelectorAll('.mini-node').length, 3);
  assert.equal(el.querySelectorAll('.mini-line.rumour').length, 1);
  assert.deepEqual([...el.querySelectorAll('title')].map((t) => t.textContent).sort(), ['The Pale Hand', 'Thorin', 'Veyra']);
});

test('mini views: a ribbon spreads the moments in order from the first to the last', () => {
  const el = miniRibbon({ width: 112, events: [{ at: 10, title: 'a' }, { at: 30, title: 'c' }, { at: 20, title: 'b' }] });
  const xs = Object.fromEntries([...el.querySelectorAll('.mini-dot')].map((d) => [d.querySelector('title').textContent, Number(d.getAttribute('cx'))]));
  assert.deepEqual(xs, { a: 6, b: 56, c: 106 });
});
