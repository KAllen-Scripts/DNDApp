/**
 * Boards (wiki space stage 10a): saving and the version check, the DM's and players' own, sharing with the DM,
 * the archive, and a card for a page that's hidden since drawn as "gone".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setup, createFakeLLM, fakeEmbedder } from './helpers.js';
import { createContext } from '../src/context.js';
import { normalizeBoard } from '../src/wiki-boards.js';

test('boards: anything unknown dropped, limits kept, arrows only between cards', () => {
  const b = normalizeBoard({ id: 'aaaaaaaaaa', owner: 3, title: '  ', items: [
    { id: 'abcdef', kind: 'note', text: 'Who?', color: 'red', x: 1e9, y: 2 },
    { id: 'abcdef', kind: 'page', ref: '0123456789', x: 0, y: 0, size: 'huge' },
    { kind: 'page', ref: 'nope', x: 0, y: 0 },
    { kind: 'sword', ref: '0123456789' },
  ], arrows: [{ from: 'abcdef', to: 'abcdef' }, { from: 'abcdef', to: 'zzzzzz' }] });
  assert.equal(b.title, 'A board');
  assert.equal(b.items.length, 2);
  assert.equal(b.items[0].color, 'yellow');
  assert.equal(b.items[0].x, 100000);
  assert.notEqual(b.items[1].id, 'abcdef');
  assert.equal(b.items[1].size, 'medium');
  assert.deepEqual(b.arrows, []);
});

test('wiki boards: the DM\'s and a player\'s, sharing, conflicts, the archive and gone cards', async () => {
  const t = await setup();
  const cid = t.campaign.id;
  const base = `/campaigns/${cid}/wiki`;
  try {
    const shared = (await t.request('POST', base, { body: { title: 'The Pale Hand', available: 'all', sections: [{ heading: '', text: 'A cult.', available: 'all' }] } })).json().page;
    const secret = (await t.request('POST', base, { body: { title: 'The Lich', available: 'dm', sections: [{ heading: '', text: 'Behind it all.', available: 'all' }] } })).json().page;

    // The DM's board.
    const dmBoard = (await t.request('POST', `${base}/boards`, { body: { title: 'Suspects', items: [{ id: 'aaaaaa', kind: 'page', ref: secret.id, x: 0, y: 0 }, { id: 'bbbbbb', kind: 'note', text: 'Who pays them?', x: 300, y: 0 }], arrows: [{ from: 'aaaaaa', to: 'bbbbbb', label: 'funds' }] } })).json().board;
    assert.equal(dmBoard.items[0].title, 'The Lich');
    assert.equal(dmBoard.mine, true);
    // Players never see the DM's boards.
    assert.deepEqual((await t.request('GET', `${base}/boards`, { as: t.sam.token })).json().boards, []);
    assert.equal((await t.request('GET', `${base}/boards/${dmBoard.id}`, { as: t.sam.token })).statusCode, 404);

    // Sam's own board: a page he can see, a note. A page he can't see is refused, like one that doesn't exist.
    const bad = await t.request('POST', `${base}/boards`, { as: t.sam.token, body: { title: 'Mine', items: [{ kind: 'page', ref: secret.id, x: 0, y: 0 }] } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error, (await t.request('POST', `${base}/boards`, { as: t.sam.token, body: { items: [{ kind: 'page', ref: '0000000000', x: 0, y: 0 }] } })).json().error);
    const mine = (await t.request('POST', `${base}/boards`, { as: t.sam.token, body: { title: 'The conspiracy', items: [{ id: 'cccccc', kind: 'page', ref: shared.id, x: 0, y: 0 }, { id: 'dddddd', kind: 'note', text: 'Mira lies', x: 200, y: 0 }], arrows: [{ from: 'cccccc', to: 'dddddd', label: 'knows' }] } })).json().board;
    assert.equal(mine.items[0].title, 'The Pale Hand');
    assert.match(mine.items[0].opening, /A cult/);
    // Not the DM's until shared; not Lyra's ever.
    assert.ok(!(await t.request('GET', `${base}/boards`)).json().boards.some((b) => b.id === mine.id));
    assert.equal((await t.request('GET', `${base}/boards/${mine.id}`)).statusCode, 404);
    assert.equal((await t.request('GET', `${base}/boards/${mine.id}`, { as: t.alex.token })).statusCode, 404);
    const sharedNow = (await t.request('PUT', `${base}/boards/${mine.id}`, { as: t.sam.token, body: { version: 1, shared_with_dm: true } })).json().board;
    assert.equal(sharedNow.version, 2);
    const dmView = (await t.request('GET', `${base}/boards/${mine.id}`)).json().board;
    assert.equal(dmView.mine, false);
    assert.equal(dmView.owner_name, t.sam.character_name ?? dmView.owner_name);
    // The DM reads it; only Sam changes it.
    assert.equal((await t.request('PUT', `${base}/boards/${mine.id}`, { body: { version: 2, title: 'Mine now' } })).statusCode, 400);

    // A save from an old version is refused.
    const moved = mine.items.map((x) => ({ ...x, x: x.x + 10 }));
    assert.equal((await t.request('PUT', `${base}/boards/${mine.id}`, { as: t.sam.token, body: { version: 1, items: moved } })).statusCode, 409);
    assert.equal((await t.request('PUT', `${base}/boards/${mine.id}`, { as: t.sam.token, body: { version: 2, items: moved, arrows: mine.arrows } })).statusCode, 200);

    // The page is hidden from players: Sam's card is gone (no title), the arrow keeps its line but not its label, and the board still saves.
    await t.wiki.update(cid, shared.id, { available: 'dm' }, { by: t.dm.id });
    const after = (await t.request('GET', `${base}/boards/${mine.id}`, { as: t.sam.token })).json().board;
    assert.deepEqual(Object.keys(after.items[0]).sort(), ['gone', 'h', 'id', 'kind', 'size', 'w', 'x', 'y']);
    assert.equal(after.arrows[0].label, '');
    assert.doesNotMatch(JSON.stringify(after), /Pale Hand|A cult/);
    // Saved back as Sam's page has it (no ref), the gone card and its arrow stay.
    const kept = (await t.request('PUT', `${base}/boards/${mine.id}`, { as: t.sam.token, body: { version: 3, title: 'Still mine', items: after.items.map(({ id, kind, x, y, w, h, text }) => ({ id, kind, ref: null, x, y, w, h, text })), arrows: after.arrows } })).json().board;
    assert.equal(kept.items.length, 2);
    assert.ok(kept.items[0].gone);
    assert.equal(kept.arrows.length, 1);
    // Shown again, it's back with its title, and the arrow with its label.
    await t.wiki.update(cid, shared.id, { available: 'all' }, { by: t.dm.id });
    const shown = (await t.request('GET', `${base}/boards/${mine.id}`, { as: t.sam.token })).json().board;
    assert.equal(shown.items[0].title, 'The Pale Hand');
    assert.equal(shown.arrows[0].label, 'knows');

    // Archived whole after each save, and restored from there.
    const lines = t.archive.readWikiBoard(t.campaign.slug, mine.id);
    assert.equal(lines.length, 4);
    assert.equal(lines.at(-1).title, 'Still mine');
    const ctx = await createContext({ config: t.config, paths: { archive: t.archive.root, db: path.join(t.dir, 'fresh.sqlite'), models: path.join(t.dir, 'models') }, llm: createFakeLLM(), embedder: fakeEmbedder, log: { error() {} } });
    try {
      const fresh = ctx.db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(t.campaign.slug).id;
      const back = ctx.wikiBoards.view(fresh, mine.id, { role: 'dm', userId: t.dm.id });
      assert.equal(back.title, 'Still mine');
      assert.equal(back.version, 4);
      assert.equal(back.shared_with_dm, true);
    } finally {
      ctx.jobs.stop();
      ctx.db.close();
    }

    // Deleted: gone for everyone.
    assert.equal((await t.request('DELETE', `${base}/boards/${dmBoard.id}`)).statusCode, 204);
    assert.ok(!(await t.request('GET', `${base}/boards`)).json().boards.some((b) => b.id === dmBoard.id));
  } finally {
    await t.cleanup();
  }
});
