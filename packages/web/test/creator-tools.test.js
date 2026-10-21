/**
 * The map creator's drawing tools (map-creator.js, map-creator-panel.js):
 * walls, doors, secret doors, windows, curves, round towers, labels, roads
 * and rivers; picking, moving, turning and copying things with the pointer
 * and the keyboard; the fill, the rubber, scattering and placing; areas,
 * copy and paste and stamps; the look. Starting and saving maps is tested in
 * creator.test.js.
 *
 * At zoom 1 a square is 28 px on the creator's canvas, which sits at the
 * page's top left in jsdom, so square (x, y) is at (28x, 28y) on screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPage, addDm, createFakeLLM } from './helpers.js';

const S = 28;
const dm = (answers = {}) => ({
  setup: { llm: createFakeLLM() },
  before: async (t) => ({ dana: await addDm(t) }),
  page: (t, { dana }) => ({ as: dana, answers }),
});

const at = ([x, y], init = {}) => ({ clientX: x * S, clientY: y * S, ...init });
/** Drag on the canvas through `points` (a click when there's one). */
function stroke(page, points, init = {}) {
  page.pointer('#creator-canvas', 'pointerdown', at(points[0], init));
  for (const p of points.slice(1)) page.pointer('#creator-canvas', 'pointermove', at(p, init));
  page.pointer('#creator-canvas', 'pointerup', at(points.at(-1), init));
}
const drag = (page, from, to, init) => stroke(page, [from, to], init);
const click = (page, p, init) => stroke(page, [p], init);
const hover = (page, p) => page.pointer('#creator-canvas', 'pointermove', at(p));
const tool = (page, key) => page.click(`[data-creator-tool="${key}"]`);
const pressed = (page, sel) => page.$(sel)?.getAttribute('aria-pressed') === 'true';
const press = (page, key, init = {}) => page.key('#map-creator', key, init);
const buttonIn = (page, sel, text) => [...page.$(sel).querySelectorAll('button')].find((b) => b.textContent === text);
const edges = (walls, type) => walls.filter((w) => w.type === type).map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2]);

/** A new map in the creator: blank, grass (30 x 20). Returns what reads the design being made. */
async function startBlank(page) {
  page.click('[data-tab=map]');
  await page.settle();
  page.click('#map-new'); page.click('#map-create');
  await page.settle();
  page.click('#creator-blank');
  const { creatorDesign } = await page.module('map-creator.js');
  return creatorDesign;
}

async function saveAndClose(page, name) {
  page.type('#creator-name', name);
  page.click('#creator-save');
  await page.waitFor(() => !page.$('#map-creator').open, { timeout: 30000, what: 'the creator to close' });
  await page.settle();
}

test('creator tools: low and stone walls, a door clicked in, a secret door, a window, a curve, a round tower, a label, a river and a road', async () => {
  await withPage(dm(), async (page, t) => {
    const design = await startBlank(page);
    tool(page, 'wall');
    page.click('[data-wall-type="low"]');
    page.click('[data-wall-style="wood"]');
    drag(page, [1, 1], [5, 1]);
    page.click('[data-wall-type="wall"]');
    page.click('[data-wall-style="stone"]');
    drag(page, [1, 3], [9, 3]);

    // Doors: a click puts a door a square wide in the wall; secret doors and windows too.
    tool(page, 'door');
    assert.match(page.text('#creator-options'), /Open and shut on the map/);
    click(page, [4.5, 3.05]);
    page.click('[data-door-type="secret"]');
    assert.match(page.text('#creator-options'), /Looks like wall to players/);
    click(page, [7.5, 3]);
    page.click('[data-door-type="window"]');
    drag(page, [2, 3], [3, 3]);
    click(page, [20.5, 15.5]);
    assert.match(page.text('#creator-status'), /Click on a straight wall/);
    let d = design();
    assert.deepEqual(edges(d.walls, 'low'), [[1, 1, 5, 1]]);
    assert.equal(d.walls.find((w) => w.type === 'low').style, 'wood');
    assert.deepEqual(edges(d.walls, 'door'), [[4, 3, 5, 3]]);
    assert.deepEqual(edges(d.walls, 'secret'), [[7, 3, 8, 3]]);
    assert.deepEqual(edges(d.walls, 'window'), [[2, 3, 3, 3]]);
    assert.deepEqual(edges(d.walls, 'wall'), [[1, 3, 2, 3], [3, 3, 4, 3], [5, 3, 7, 3], [8, 3, 9, 3]], 'the wall is cut round its openings');

    // A curve: drag its ends, move to bend it, click.
    tool(page, 'curve');
    drag(page, [10, 10], [14, 10]);
    assert.match(page.text('#creator-status'), /bend the curve/);
    hover(page, [12, 8]);
    click(page, [12, 8]);
    d = design();
    assert.deepEqual(d.walls.filter((w) => w.arc).map(({ x1, y1, x2, y2, arc }) => [x1, y1, x2, y2, arc]), [[10, 10, 14, 10, { x: 12, y: 8 }]]);

    // A round tower with a flagstone floor inside.
    tool(page, 'circle');
    assert.ok(page.$('#creator-circle-floor').checked);
    page.click('[data-floor="f"]');
    drag(page, [20, 5], [23, 5]);
    d = design();
    assert.equal(d.walls.filter((w) => w.arc).length, 3, 'the curve and the tower in two halves');
    assert.equal(d.floor[5].slice(16, 25), 'gffffffgg');

    // A label: the words first.
    tool(page, 'label');
    click(page, [15, 17]);
    assert.match(page.text('#creator-status'), /Type the words/);
    page.type('#creator-label-text', 'Old Mill');
    page.type('#creator-label-font', 'title');
    page.type('#creator-label-size', '1.5');
    click(page, [15, 17]);
    assert.deepEqual(design().labels.map(({ text, font, size, x, y }) => [text, font, size, x, y]), [['Old Mill', 'title', 1.5, 15, 17]]);

    // A river drawn freehand, and a road clicked point by point (Enter ends it).
    tool(page, 'path');
    page.click('[data-path-kind="river"]');
    assert.equal(page.$('#creator-path-width').value, '2.4');
    stroke(page, [[0.5, 12], [3, 12.4], [6, 12.1], [9, 12.6], [12, 12.2], [15, 12.5]]);
    page.click('[data-path-kind="road"]');
    click(page, [2, 18]);
    assert.ok(buttonIn(page, '#creator-options', 'Finish this road'));
    click(page, [8, 18]);
    click(page, [8, 14]);
    press(page, 'Enter');
    assert.ok(!buttonIn(page, '#creator-options', 'Finish this road'));
    d = design();
    assert.deepEqual(d.paths.map((p) => [p.kind, p.w]), [['river', 2.4], ['road', 1.6]]);
    assert.ok(d.paths[0].pts.length >= 2 && d.paths[0].pts[0][0] === 0.5);
    assert.deepEqual(d.paths[1].pts, [[2, 18], [8, 18], [8, 14]]);

    await saveAndClose(page, 'Mill');
    const [map] = t.maps.list(t.campaign.id);
    assert.equal(map.walls.filter((w) => w.door).length, 2, 'the door and the secret door');
    assert.ok(map.walls.some((w) => w.door === 'secret' || w.secret), 'the secret door is secret');
  });
});

test('creator tools: picking with the pointer and the keyboard: move, turn, flip, nudge, copy, delete, undo and redo; several at once; what can be changed', async () => {
  await withPage(dm(), async (page, t) => {
    const design = await startBlank(page);
    page.click('[data-asset="barrel"]');
    click(page, [3.5, 3.5]);
    page.click('[data-asset="chest"]');
    click(page, [6.5, 3.5]);
    tool(page, 'wall');
    drag(page, [15, 2], [20, 2]);
    press(page, 'v');
    assert.ok(pressed(page, '[data-creator-tool="select"]'), 'V is the Pick tool');
    const barrel = () => design().assets.find((a) => a.a === 'barrel');

    click(page, [3.5, 3.5]);
    assert.equal(page.text('#creator-selected h3'), 'Barrel');
    stroke(page, [[3.5, 3.5], [4.5, 5], [5.5, 6.5]]);
    assert.deepEqual([barrel().x, barrel().y], [5.5, 6.5]);
    press(page, 'r');
    press(page, 'f');
    press(page, 'ArrowRight');
    press(page, 'ArrowDown', { shiftKey: true });
    assert.deepEqual([barrel().x, barrel().y, barrel().rot, barrel().flip], [5.75, 7.5, 45, true]);

    // Ctrl+D copies it (the copy is picked), Delete removes the copy; undo and redo.
    press(page, 'd', { ctrlKey: true });
    assert.equal(design().assets.filter((a) => a.a === 'barrel').length, 2);
    const copy = design().assets.at(-1);
    assert.deepEqual([copy.x, copy.y, copy.rot, copy.flip], [6.75, 8.5, 45, true]);
    press(page, 'Delete');
    assert.equal(design().assets.filter((a) => a.a === 'barrel').length, 1);
    press(page, 'z', { ctrlKey: true });
    assert.equal(design().assets.filter((a) => a.a === 'barrel').length, 2);
    press(page, 'z', { ctrlKey: true, shiftKey: true });
    assert.equal(design().assets.filter((a) => a.a === 'barrel').length, 1);
    press(page, 'y', { ctrlKey: true });
    assert.match(page.text('#creator-status'), /Nothing to redo/);

    // Dragging over the floor picks everything in the rectangle.
    drag(page, [0.2, 0.2], [8, 8]);
    assert.equal(page.text('#creator-selected h3'), '2 picked');
    buttonIn(page, '#creator-selected', 'Flip').click();
    assert.deepEqual(design().assets.map((a) => [a.a, a.flip]), [['barrel', false], ['chest', true]]);
    // Shift-click takes one off.
    click(page, [5.75, 7.5], { shiftKey: true });
    assert.equal(page.text('#creator-selected h3'), 'Chest');

    // What can be changed about a thing: what it blocks.
    page.type('#creator-blocks', 'wall');
    assert.equal(design().assets.find((a) => a.a === 'chest').blocks, 'wall');
    // A wall can be picked and changed too.
    click(page, [17.5, 2]);
    assert.equal(page.text('#creator-selected h3'), 'Wall');
    page.type('#creator-wall-type', 'low');
    assert.deepEqual(edges(design().walls, 'low'), [[15, 2, 20, 2]]);
    // Esc lets go.
    page.$('#map-creator').dispatchEvent(new page.window.Event('cancel', { cancelable: true }));
    assert.ok(!page.visible('#creator-selected'));
    assert.ok(page.$('#map-creator').open, 'and keeps the creator open');

    // Every tool has its key; [ and ] change the brush; + zooms in.
    for (const [key, k] of [['room', 'q'], ['wall', 'w'], ['door', 'd'], ['curve', 'c'], ['circle', 'o'], ['floor', 'b'], ['fill', 'g'], ['rubber', 'e'], ['path', 'p'], ['label', 't'], ['place', 'a'], ['scatter', 'k'], ['area', 's'], ['select', 'v']]) {
      press(page, k);
      assert.ok(pressed(page, `[data-creator-tool="${key}"]`), `${k} is ${key}`);
    }
    press(page, 'b');
    press(page, ']');
    press(page, ']');
    assert.equal(page.$('#creator-brush').value, '3');
    press(page, '[');
    assert.equal(page.$('#creator-brush').value, '2');
    press(page, '+');
    assert.equal(page.$('#creator-canvas').width, 30 * 28 * 1.25);

    press(page, 'v');
    await saveAndClose(page, 'Store');
    const [map] = t.maps.list(t.campaign.id);
    assert.deepEqual(map.design.assets.map(({ a, x, y, rot, flip, blocks }) => [a, x, y, rot, flip, blocks]), [['barrel', 5.75, 7.5, 45, false, 'low'], ['chest', 6.5, 3.5, 0, true, 'wall']]);
  });
});

test('creator tools: fill up to the walls, a floor rectangle, the rubber (floor, things and a square of wall), scattering stones, and placing with a little variety', async () => {
  await withPage(dm(), async (page, t) => {
    const design = await startBlank(page);
    tool(page, 'room');
    drag(page, [2, 2], [8, 6]);
    // The fill: the room's stone, up to its walls.
    tool(page, 'fill');
    page.click('[data-floor="w"]');
    click(page, [4.5, 4.5]);
    let d = design();
    assert.equal(d.floor[3].slice(1, 10), 'gwwwwwwgg');
    assert.equal(d.floor[1][1], 'g');
    // A rectangle of sand.
    tool(page, 'floor');
    page.click('[data-floor-shape="rect"]');
    assert.ok(!page.$('#creator-brush'), 'no brush for a rectangle');
    page.click('[data-floor="a"]');
    drag(page, [22, 12], [26, 15]);
    assert.equal(design().floor[12].slice(21, 27), 'gaaaag');
    assert.equal(design().floor[15][22], 'g');

    // The rubber: floor, then a thing, then a square of the room's wall.
    tool(page, 'rubber');
    page.click('[data-rubber="floor"]');
    click(page, [15.5, 15.5]);
    assert.equal(design().floor[15][15], '.');
    page.click('[data-asset="barrel"]');
    click(page, [20.5, 10.5]);
    tool(page, 'rubber');
    page.click('[data-rubber="things"]');
    click(page, [20.5, 10.5]);
    assert.equal(design().assets.length, 0);
    click(page, [5.5, 2]);
    assert.deepEqual(edges(design().walls, 'wall').filter((w) => w[1] === 2 && w[3] === 2), [[2, 2, 5, 2], [6, 2, 8, 2]]);

    // Scattering stones, close together.
    tool(page, 'scatter');
    page.click('[data-asset="rock"]');
    assert.ok(pressed(page, '[data-creator-tool="scatter"]'), 'picking a thing keeps the scatter tool');
    page.type('#creator-spacing', '0.6');
    drag(page, [10, 10], [20, 18]);
    const rocks = design().assets.filter((a) => a.a === 'rock');
    assert.ok(rocks.length >= 5, `${rocks.length} rocks`);
    assert.ok(rocks.every((a) => a.x >= 10 && a.x <= 20 && a.y >= 10 && a.y <= 18));

    // Placing bushes, each a little different.
    tool(page, 'place');
    page.click('[data-asset="bush"]');
    page.type('#creator-vary', true);
    hover(page, [25.3, 3.7]);
    click(page, [25.3, 3.7]);
    const bush = design().assets.find((a) => a.a === 'bush');
    assert.deepEqual([bush.x, bush.y], [25.3, 3.7], 'off the grid');
    assert.ok(bush.rot !== 0 || bush.w !== 1, 'turned or sized');
    // R turns the next one placed.
    page.type('#creator-vary', false);
    press(page, 'r');
    assert.match(page.text('#creator-options'), /Turned 45°/);
    click(page, [27.5, 3.5]);
    assert.equal(design().assets.at(-1).rot, 45);

    await saveAndClose(page, 'Garden');
    assert.equal(t.maps.list(t.campaign.id)[0].design.floor[3][3], 'w');
  });
});

test('creator tools: an area copied, turned and put down; kept as a stamp, renamed, used and taken off; a built-in stamp; cut, Ctrl+C and Ctrl+V, and clearing', async () => {
  await withPage(dm({ prompt: ['Guard room', 'Gatehouse'], confirm: true }), async (page, t) => {
    const design = await startBlank(page);
    tool(page, 'room');
    drag(page, [2, 2], [7, 6]);
    page.click('[data-asset="table"]');
    click(page, [4.5, 4]);
    const count = (ch) => design().floor.join('').split(ch).length - 1;
    const tables = () => design().assets.filter((a) => a.a === 'table');
    assert.equal(count('s'), 20);

    // Copy an area, turn it, put it down.
    press(page, 's');
    assert.match(page.text('#creator-options'), /Drag a rectangle/);
    drag(page, [1, 1], [8, 7]);
    page.click('#creator-copy');
    assert.match(page.text('#creator-status'), /Copied/);
    page.click('#creator-paste');
    assert.match(page.text('#creator-options'), /Putting down.*the copy/);
    press(page, 'r');
    hover(page, [20, 10]);
    click(page, [20, 10]);
    assert.equal(count('s'), 40);
    assert.equal(tables().length, 2);
    assert.equal(tables()[1].rot, 90, 'turned with the copy');
    assert.ok(design().walls.filter((w) => w.type === 'wall').length >= 8);
    // Esc stops putting it down.
    page.$('#map-creator').dispatchEvent(new page.window.Event('cancel', { cancelable: true }));
    assert.ok(pressed(page, '[data-creator-tool="select"]'));

    // Keep the copy as a stamp: it's kept for every map.
    tool(page, 'area');
    drag(page, [17, 7], [23, 14]);
    page.click('#creator-keep-stamp');
    await page.settle();
    assert.match(page.dialogs.at(-1).message, /Name the stamp/);
    assert.ok(pressed(page, '[data-creator-tab="stamps"]') || page.$('[data-creator-tab="stamps"]').getAttribute('aria-selected') === 'true');
    assert.match(page.text('#creator-own-stamps'), /Guard room/);
    const [stamp] = t.mapStamps.list(t.campaign.id);
    assert.equal(stamp.name, 'Guard room');
    assert.equal(stamp.clip.assets.length, 1);
    page.click(`[aria-label="Rename Guard room"]`);
    await page.settle();
    assert.match(page.text('#creator-own-stamps'), /Gatehouse/);
    assert.equal(t.mapStamps.get(t.campaign.id, stamp.id).name, 'Gatehouse');
    // Put it down once more.
    page.click(`#creator-own-stamps [data-stamp="${stamp.id}"]`);
    assert.match(page.text('#creator-status'), /put down Gatehouse/);
    hover(page, [11, 15]);
    click(page, [11, 15]);
    assert.equal(tables().length, 3);
    // A built-in stamp: a campsite.
    assert.ok(page.$$('[data-stamp^="b:"]').length >= 16);
    page.click('[data-stamp="b:campsite"]');
    hover(page, [26, 4]);
    click(page, [26, 4]);
    assert.ok(design().assets.some((a) => a.a === 'campfire'));
    // Taken off the list (the archive keeps it).
    page.click(`[aria-label="Remove Gatehouse"]`);
    await page.settle();
    assert.match(page.text('#creator-own-stamps'), /None yet/);
    assert.deepEqual(t.mapStamps.list(t.campaign.id), []);

    // Cut the first room out.
    tool(page, 'area');
    drag(page, [1, 1], [8, 7]);
    page.click('#creator-cut');
    assert.equal(design().floor[3].slice(1, 8), '.......');
    assert.equal(tables().length, 2);
    // Ctrl+C and Ctrl+V with something picked.
    tool(page, 'select');
    click(page, [tables()[0].x, tables()[0].y]);
    press(page, 'c', { ctrlKey: true });
    press(page, 'v', { ctrlKey: true });
    hover(page, [15, 18]);
    click(page, [15, 18]);
    assert.equal(tables().length, 3);
    // Clearing an area with Delete.
    tool(page, 'area');
    drag(page, [23, 1], [30, 8]);
    press(page, 'Delete');
    assert.ok(!design().assets.some((a) => a.a === 'campfire'));

    await saveAndClose(page, 'Barracks');
    assert.equal(t.maps.list(t.campaign.id)[0].design.assets.filter((a) => a.a === 'table').length, 3);
  });
});

test('creator tools: the look (light, grid on the picture, shadows, glow, blending, the colour where there is no floor), undone and redone', async () => {
  await withPage(dm(), async (page, t) => {
    const design = await startBlank(page);
    page.click('[data-creator-tab="look"]');
    assert.equal(page.$('#creator-mood').value, 'day');
    page.type('#creator-mood', 'night');
    assert.equal(design().look.mood, 'night');
    page.click('#creator-undo');
    assert.equal(design().look.mood, 'day');
    page.click('#creator-redo');
    assert.equal(design().look.mood, 'night');
    page.type('#creator-grid', 'dark');
    page.type('#creator-look-shadows', false);
    page.type('#creator-look-glow', false);
    page.type('#creator-look-soft', false);
    page.type('#creator-look-void', '#203040');
    // How it's shown while drawing isn't part of the map.
    page.type('#creator-preview-look', false);
    page.type('#creator-show-grid', false);
    assert.deepEqual(design().look, { void: '#203040', grid: 'dark', shadows: false, glow: false, mood: 'night', soft: false });
    tool(page, 'room');
    drag(page, [2, 2], [6, 6]);
    await saveAndClose(page, 'Night');
    assert.deepEqual(t.maps.list(t.campaign.id)[0].design.look, { void: '#203040', grid: 'dark', shadows: false, glow: false, mood: 'night', soft: false });
  });
});

// The owner (2026-10-14): a Room always came walled all round, so a patch of another floor needed walls rubbed out.
test('regression: creator: the Room tool can lay its floor without walls', async () => {
  await withPage(dm(), async (page) => {
    const design = await startBlank(page);
    tool(page, 'room');
    page.click('[data-floor="d"]');
    assert.ok(page.$('#creator-room-walls').checked, 'walls all round to start with');
    page.click('#creator-room-walls');
    assert.ok(!page.$('[data-wall-style]'), 'no wall styles without walls');
    drag(page, [2, 2], [5, 4]);
    let d = design();
    assert.equal(d.walls.length, 0);
    assert.equal(d.floor[2].slice(1, 6), 'gdddg');
    assert.equal(d.floor[3].slice(1, 6), 'gdddg');
    // Ticked again, a room is walled as before.
    page.click('#creator-room-walls');
    drag(page, [10, 2], [13, 4]);
    d = design();
    assert.equal(d.walls.filter((w) => w.type === 'wall').length, 4);
  });
});

test('creator tools: the height tool raises a walled room with a click and a rectangle with a drag; the map gets them as raised areas', async () => {
  await withPage(dm(), async (page, t) => {
    const design = await startBlank(page);
    tool(page, 'room');
    drag(page, [2, 2], [8, 6]);
    tool(page, 'height');
    assert.ok(pressed(page, '[data-creator-tool="height"]'));
    page.type('#creator-height', '15');
    // A click inside the room: all of it, up to its walls.
    click(page, [4.5, 4.5]);
    const d = design();
    assert.deepEqual(d.heights[6].slice(2, 18), [0, 0, ...Array(12).fill(15), 0, 0]);
    assert.equal(d.heights[2][8], 0);
    assert.equal(d.heights[11][15], 15);
    // A drag: a pit.
    page.type('#creator-height', '-10');
    drag(page, [20, 10], [23, 12]);
    assert.deepEqual(design().heights[22].slice(39, 47), [0, -10, -10, -10, -10, -10, -10, 0]);
    // 0 puts squares back on the ground; a drag goes by half squares.
    page.type('#creator-height', '0');
    drag(page, [22.5, 10], [23, 12]);
    assert.deepEqual(design().heights[22].slice(39, 47), [0, -10, -10, -10, -10, -10, 0, 0]);

    await saveAndClose(page, 'Keep');
    const map = t.maps.list(t.campaign.id)[0];
    assert.deepEqual(map.raised.map(({ points, height, source }) => ({ points, height, source })), [
      { points: [[280, 280], [1120, 280], [1120, 840], [280, 840]], height: 15, source: 'creator' },
      { points: [[2800, 1400], [3150, 1400], [3150, 1680], [2800, 1680]], height: -10, source: 'creator' },
    ]);
  });
});
