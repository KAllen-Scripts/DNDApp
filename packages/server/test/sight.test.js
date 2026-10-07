import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exploreGrid, markExplored, exploredRects, EXPLORE_CELLS } from '../src/maps/sight.js';
import { joinEnds } from '../src/maps/read.js';

test('explored cells: marked where a polygon covers their middle, drawn as few rectangles', () => {
  const image = { width: 256, height: 100 };
  const grid = exploreGrid(image);
  assert.deepEqual(grid, { cell: 256 / EXPLORE_CELLS, cols: 128, rows: 50 });
  const bits = new Uint8Array(Math.ceil((grid.cols * grid.rows) / 8));
  assert.equal(markExplored(bits, grid, [[[0, 0], [10, 0], [10, 6], [0, 6]]]), true);
  assert.equal(markExplored(bits, grid, [[[0, 0], [10, 0], [10, 6], [0, 6]]]), false, 'nothing new');
  assert.deepEqual(exploredRects(bits, grid, image), [{ x: 0, y: 0, w: 10, h: 6 }]);
  // Two separate runs in a row, and an L shape that only partly lines up.
  markExplored(bits, grid, [[[20, 0], [24, 0], [24, 2], [20, 2]], [[0, 6], [4, 6], [4, 10], [0, 10]]]);
  assert.deepEqual(exploredRects(bits, grid, image), [
    { x: 20, y: 0, w: 4, h: 2 },
    { x: 0, y: 0, w: 10, h: 6 },
    { x: 0, y: 6, w: 4, h: 4 },
  ]);
  // The last cell stops at the image's edge.
  const odd = { width: 100, height: 33 };
  const g2 = exploreGrid(odd);
  const b2 = new Uint8Array(Math.ceil((g2.cols * g2.rows) / 8)).fill(255);
  assert.deepEqual(exploredRects(b2, g2, odd), [{ x: 0, y: 0, w: 100, h: 33 }]);
});

test('joinEnds puts line ends that nearly meet on one point', () => {
  const lines = [
    { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
    { a: { x: 10.5, y: 0.5 }, b: { x: 10, y: 20 } },
    { a: { x: 30, y: 30 }, b: { x: 40, y: 40 } },
  ];
  joinEnds(lines, 1);
  assert.deepEqual(lines[0].b, { x: 10.25, y: 0.25 });
  assert.deepEqual(lines[1].a, { x: 10.25, y: 0.25 });
  assert.deepEqual(lines[2], { a: { x: 30, y: 30 }, b: { x: 40, y: 40 } });
});
