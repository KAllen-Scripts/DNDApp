/**
 * Boards (wiki space stage 10a): a canvas of cards and arrows. The DM's boards (a session's prep laid out, a web of
 * suspects), and each player's own (their conspiracy board): cards of pages they can see, their own sticky notes,
 * wiki pictures and links to their other boards. The DM sees a player's board only when the player shares it.
 *
 * Kept in `wiki_boards` (schema v21), archived whole after each save in `wiki/boards/<id>/changes.jsonl` and
 * restored from there. A save names the version it started from: an older one is refused (409) so nobody's
 * moves are lost.
 *
 * Per viewer: a card for a page the viewer can't see (now) is drawn as "gone", with no title or anything else
 * about it; so is a picture or a board they can't see.
 */
import crypto from 'node:crypto';
import { unlink } from '@dndapp/shared/wiki.js';
import { BadRequestError, NotFoundError } from './store.js';
import { ArchiveConflictError } from './archive.js';

export const BOARD_LIMITS = { items: 500, arrows: 500, title: 120, text: 2000, label: 100, coord: 100_000 };
export const BOARD_ITEM_KINDS = ['page', 'note', 'picture', 'board'];
export const BOARD_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'grey'];
export const CARD_SIZES = ['small', 'medium', 'large'];

const isId = (x) => /^[a-f0-9]{10}$/.test(String(x));
const hex6 = (x) => (/^[a-f0-9]{6}$/.test(String(x)) ? String(x) : crypto.randomBytes(3).toString('hex'));
const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);

/** A board read from the database or the archive (or sent by the page), with anything unknown dropped. */
export function normalizeBoard(b = {}) {
  const L = BOARD_LIMITS;
  const items = [];
  const ids = new Set();
  for (const x of Array.isArray(b.items) ? b.items : []) {
    if (!BOARD_ITEM_KINDS.includes(x?.kind)) continue;
    let id = hex6(x.id);
    while (ids.has(id)) id = hex6();
    ids.add(id);
    const ref = x.kind === 'note' ? null : isId(x.ref) ? String(x.ref) : null;
    if (x.kind !== 'note' && !ref) continue;
    items.push({
      id, kind: x.kind, ref,
      x: num(x.x, 0, -L.coord, L.coord), y: num(x.y, 0, -L.coord, L.coord),
      w: num(x.w, 220, 40, 4000), h: num(x.h, 140, 30, 4000),
      ...(x.kind === 'page' && { size: CARD_SIZES.includes(x.size) ? x.size : 'medium' }),
      ...(x.kind === 'note' && { text: String(x.text ?? '').slice(0, L.text), color: BOARD_COLORS.includes(x.color) ? x.color : 'yellow' }),
    });
    if (items.length >= L.items) break;
  }
  const arrows = [];
  for (const a of Array.isArray(b.arrows) ? b.arrows : []) {
    if (!ids.has(String(a?.from)) || !ids.has(String(a?.to)) || a.from === a.to) continue;
    arrows.push({ id: hex6(a.id), from: String(a.from), to: String(a.to), label: String(a.label ?? '').trim().slice(0, L.label) });
    if (arrows.length >= L.arrows) break;
  }
  return {
    id: String(b.id),
    title: String(b.title ?? '').trim().slice(0, L.title) || 'A board',
    owner: Number(b.owner),
    // Made by a DM: every DM of the campaign has it. A player's is theirs, and the DM's only when shared.
    dm: !!b.dm,
    shared_with_dm: !b.dm && !!b.shared_with_dm,
    items,
    arrows,
    version: Number(b.version) || 1,
    created_at: String(b.created_at ?? ''),
    updated_at: String(b.updated_at ?? ''),
    ...(b.removed && { removed: true }),
  };
}

export function createWikiBoards({ db, archive, store, wiki }) {
  const slug = (cid) => store.getCampaign(cid).slug;
  const read = (cid) => db.prepare('SELECT data FROM wiki_boards WHERE campaign_id = ? ORDER BY created_at, id').all(cid)
    .map((r) => normalizeBoard(JSON.parse(r.data))).filter((b) => !b.removed);

  function write(cid, board) {
    db.prepare(`INSERT INTO wiki_boards (id, campaign_id, owner, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(board.id, cid, board.owner, JSON.stringify(board), board.created_at, board.updated_at);
    archive.appendWikiBoard(slug(cid), board.id, board);
    return board;
  }

  /** May this viewer ({ role, userId }) open the board? */
  const opens = (b, viewer) => (viewer.role === 'dm' ? b.dm || b.shared_with_dm : !b.dm && b.owner === viewer.userId);
  /** May they change it? Its owner (any DM, for a DM's board). */
  const owns = (b, viewer) => (viewer.role === 'dm' ? b.dm : !b.dm && b.owner === viewer.userId);

  /** What this viewer can put on a board, and see on one: pages, wiki pictures and their boards, by id. */
  function reach(cid, viewer) {
    const pages = viewer.role === 'dm' ? wiki.list(cid) : wiki.listFor(cid, { userId: viewer.userId, seesAll: false });
    const pageIds = new Set(pages.map((p) => p.id));
    const asViewer = viewer.role === 'dm' ? { seesAll: true } : { userId: viewer.userId, seesAll: false };
    return {
      pages: new Map(pages.map((p) => [p.id, p])),
      page: (id) => pageIds.has(id),
      picture: (id) => wiki.pictureVisible(cid, id, asViewer),
      board: (id) => read(cid).some((b) => b.id === id && opens(b, viewer)),
    };
  }

  function get(cid, id) {
    const row = isId(id) && db.prepare('SELECT data FROM wiki_boards WHERE id = ? AND campaign_id = ?').get(id, cid);
    const b = row && normalizeBoard(JSON.parse(row.data));
    if (!b || b.removed) throw new NotFoundError('No such board');
    return b;
  }

  const ownerName = (cid, b) => {
    if (b.dm) return 'the DM';
    const m = store.roster(cid).find((x) => x.user_id === b.owner);
    return m ? m.character_name || m.name : 'a player';
  };

  /** A board as this viewer gets it: each card with what it shows, or `gone` (and nothing else) when they can't see it. */
  function view(cid, b, viewer) {
    const r = reach(cid, viewer);
    const opening = (p) => unlink(p.sections.find((s) => s.text.trim())?.text ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_>`~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const boards = new Map(read(cid).map((x) => [x.id, x]));
    const items = b.items.map((x) => {
      const place = { id: x.id, kind: x.kind, x: x.x, y: x.y, w: x.w, h: x.h, ...(x.size && { size: x.size }) };
      if (x.kind === 'note') return { ...place, text: x.text, color: x.color };
      if (x.kind === 'page') {
        const p = r.pages.get(x.ref);
        return p ? { ...place, ref: x.ref, title: p.title, page_kind: p.kind, picture: p.picture?.id ?? null, opening: opening(p) } : { ...place, gone: true };
      }
      if (x.kind === 'picture') return r.picture(x.ref) ? { ...place, ref: x.ref } : { ...place, gone: true };
      const other = boards.get(x.ref);
      return other && opens(other, viewer) ? { ...place, ref: x.ref, title: other.title } : { ...place, gone: true };
    });
    // An arrow to a gone card keeps its line, never its label.
    const gone = new Set(items.filter((x) => x.gone).map((x) => x.id));
    const arrows = b.arrows.map((a) => (gone.has(a.from) || gone.has(a.to) ? { ...a, label: '' } : a));
    return { id: b.id, title: b.title, dm: b.dm, owner: b.owner, owner_name: ownerName(cid, b), shared_with_dm: b.shared_with_dm, mine: owns(b, viewer), items, arrows, version: b.version, updated_at: b.updated_at };
  }

  return {
    /** The boards this viewer may open: [{ id, title, dm, owner, owner_name, shared_with_dm, mine, cards, updated_at }]. */
    list: (cid, viewer) => read(cid).filter((b) => opens(b, viewer))
      .map((b) => ({ id: b.id, title: b.title, dm: b.dm, owner: b.owner, owner_name: ownerName(cid, b), shared_with_dm: b.shared_with_dm, mine: owns(b, viewer), cards: b.items.length, updated_at: b.updated_at })),

    /** One board as this viewer gets it (the same 404 for one they may not open as for none). */
    view(cid, id, viewer) {
      const b = get(cid, id);
      if (!opens(b, viewer)) throw new NotFoundError('No such board');
      return view(cid, b, viewer);
    },

    /** A new board: { title, items?, arrows? } for this viewer. */
    create(cid, fields, viewer) {
      const now = new Date().toISOString();
      const board = normalizeBoard({ ...fields, id: crypto.randomBytes(5).toString('hex'), owner: viewer.userId, dm: viewer.role === 'dm', shared_with_dm: false, version: 1, created_at: now, updated_at: now });
      check(cid, board, null, viewer);
      write(cid, board);
      return view(cid, board, viewer);
    },

    /** Save a board (its owner): { title?, items?, arrows?, shared_with_dm? } from `version`; an older version is refused. */
    save(cid, id, fields, viewer, { version }) {
      const before = get(cid, id);
      if (!owns(before, viewer)) throw (opens(before, viewer) ? new BadRequestError("That board isn't yours to change.") : new NotFoundError('No such board'));
      if (version !== before.version) throw new ArchiveConflictError('This board was changed since you opened it. Open it again, then make your changes.');
      // A card the viewer got as "gone" comes back without its ref, and an arrow to it without its label: they keep
      // the ones the board has, so a card hidden for now isn't lost.
      const was = new Map(before.items.map((x) => [x.id, x]));
      const items = fields.items?.map((x) => (x.kind !== 'note' && !x.ref && was.get(x.id)?.kind === x.kind ? { ...x, ref: was.get(x.id).ref } : x));
      const gone = new Set(view(cid, before, viewer).items.filter((x) => x.gone).map((x) => x.id));
      const labels = new Map(before.arrows.map((a) => [a.id, a]));
      const arrows = fields.arrows?.map((a) => (!a.label && labels.has(a.id) && (gone.has(a.from) || gone.has(a.to)) ? { ...a, label: labels.get(a.id).label } : a));
      const next = normalizeBoard({
        ...before,
        ...(fields.title != null && { title: fields.title }),
        ...(items && { items }),
        ...(arrows && { arrows }),
        ...(fields.shared_with_dm != null && { shared_with_dm: fields.shared_with_dm }),
        version: before.version + 1,
        updated_at: new Date().toISOString(),
      });
      check(cid, next, before, viewer);
      write(cid, next);
      return view(cid, next, viewer);
    },

    /** Delete a board (its owner). The archive keeps every version. */
    remove(cid, id, viewer) {
      const b = get(cid, id);
      if (!owns(b, viewer)) throw (opens(b, viewer) ? new BadRequestError("That board isn't yours to delete.") : new NotFoundError('No such board'));
      write(cid, { ...b, removed: true, version: b.version + 1, updated_at: new Date().toISOString() });
    },
  };

  /**
   * Only what the viewer can see goes on a board: a page, picture or board they can't see is refused, the same as
   * one that doesn't exist (so nothing is given away). A card already on the board stays, even if it's gone since.
   */
  function check(cid, board, before, viewer) {
    const r = reach(cid, viewer);
    const had = new Set((before?.items ?? []).map((x) => `${x.kind}:${x.ref}`));
    for (const x of board.items) {
      if (x.kind === 'note' || had.has(`${x.kind}:${x.ref}`)) continue;
      const ok = x.kind === 'page' ? r.page(x.ref) : x.kind === 'picture' ? r.picture(x.ref) : x.ref !== board.id && r.board(x.ref);
      if (!ok) throw new BadRequestError(`There's no such ${x.kind} to put on the board.`);
    }
  }
}
