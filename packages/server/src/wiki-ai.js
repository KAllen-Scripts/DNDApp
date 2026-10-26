/**
 * The AI's side of the DM's wiki (owner, 2026-10-20: "AI page changes wait
 * for approval"; "The AI suggests [reveals]").
 *
 * After the archivist changes the knowledge base (a session, a correction,
 * sheets and handouts), the AI reads the records it changed and proposes
 * changes to the wiki: new pages, changed or added sections, and reveals
 * (making a section available to players the records say now know it).
 * Nothing reaches a page until the DM approves it; the DM can edit a
 * proposal first, which makes the section the DM's.
 *
 * Who a proposed section is available to is worked out here, never by the
 * AI: the players who know every record it was written from (known_by). A
 * change to an existing section never widens it; only a reveal does, and a
 * reveal reaches only players who know the records behind it.
 *
 * Proposals are source data (the DM's decisions on them matter): archived
 * whole after each change in wiki/proposals.jsonl. How far the AI has read
 * the archivist's journal is derived (wiki_chronicle); a rebuild moves it to
 * the end, so replaying every session proposes nothing new.
 */
import crypto from 'node:crypto';
import { z } from 'zod';
import { renderRecord } from './kb/store.js';
import { BadRequestError, NotFoundError } from './store.js';
import { WIKI_LIMITS as L } from './wiki.js';
import { narrowest, audienceOf, canSeeAudience, wikiKey, wikiPictures as picturesIn, PICTURE_RE } from '@dndapp/shared/wiki.js';
import { json } from './db/index.js';

const isProposalId = (id) => /^[a-f0-9]{10}$/.test(String(id));

/** An audience (null = everyone, [] = the DM) as an "available to" setting. */
const availableOf = (audience) => (audience == null ? 'all' : audience.length ? [...audience].sort((a, b) => a - b) : 'dm');

/** The widest of two audiences. */
const widest = (a, b) => (a == null || b == null ? null : [...new Set([...a, ...b])]);

const sameText = (a, b) => String(a ?? '').replace(/\s+/g, ' ').trim() === String(b ?? '').replace(/\s+/g, ' ').trim();

const SectionSchema = z.object({
  heading: z.string().describe('The section heading (can be empty for an opening section)'),
  text: z.string().describe('Markdown for the DM to read. Link pages with [[Page title]]. No :::for or :::dm blocks.'),
  sources: z.array(z.number().int()).describe('Ids of the records this section is written from (every fact in it must come from one of them)'),
});

export const ChangesSchema = z.object({
  changes: z.array(
    z.object({
      action: z.enum(['new_page', 'update_section', 'add_section', 'reveal']),
      page_id: z.string().nullable().describe('The existing page (update_section, add_section, reveal); null for new_page'),
      section_id: z.string().nullable().describe('The existing section (update_section, reveal); null otherwise'),
      new_page: z
        .object({
          title: z.string(),
          kind: z.string().describe('npc, place, faction, item, quest, session, lore, …'),
          aliases: z.array(z.string()).describe('Other names and spellings'),
          parent_title: z.string().nullable().describe('An existing page this one belongs inside (a tavern inside its town), or null'),
          sections: z.array(SectionSchema),
        })
        .nullable()
        .describe('Only for new_page'),
      section: SectionSchema.nullable().describe('The whole new section (update_section: it replaces the old text; add_section: a new one)'),
      players: z.array(z.number().int()).describe('reveal: the player user ids to make the section available to; [] otherwise'),
      sources: z.array(z.number().int()).describe('reveal: the records showing those players now know it; [] otherwise'),
      reason: z.string().describe('One sentence for the DM: why this change'),
    }),
  ),
});

const SYSTEM = `You keep a Dungeon Master's campaign wiki up to date from the campaign's knowledge base, which another AI (the archivist) builds from session transcripts, the players' notes, sheets and handouts.

You only propose changes. The DM approves, edits or rejects each one, so propose what a careful assistant would, and nothing you aren't sure the records support.

The wiki is for the DM to read: clear, well organised Markdown pages, one per person, place, faction, item, quest or idea worth a page, and one page per session (kind "session", titled "Session N") with a readable recap. Prefer changing an existing page to making a new one. Use the names the records use. Link other pages with [[Page title]] (existing pages, or ones you propose in this same answer).

Who can see what matters. Each record has known_by: everyone, or the user ids of the players who know it. The server makes each section you write available to the players who know every record in its sources, so:
- Keep facts that different players know in different sections. A section mixing a fact everyone knows with one only Thorin knows is available only to Thorin.
- Always list the records a section is written from in its sources. A section with no valid sources stays with the DM.
- Never write :::for or :::dm blocks; the DM uses those.

Changes:
- new_page: a page with its sections.
- update_section: rewrite a section with what the records now say (give the whole new section). Sections marked "by dm" are the DM's own writing: only propose a change to one when the records contradict it, and say so in the reason.
- add_section: a new section on an existing page.
- reveal: when a record's known_by now includes players who can't yet see a section holding that same knowledge (its "available to" leaves them out), propose making it available to them. Name only players in that record's known_by, and the record in sources.

Don't propose what's already waiting for the DM, or anything the DM rejected before unless the records have changed since. Return no changes if nothing needs changing.`;

/**
 * @param {object} o
 * @param {object} o.wiki   src/wiki.js
 * @param {object} o.kb     the knowledge base (src/kb/store.js)
 */
export function createWikiAI({ db, archive, store, kb, wiki, wikiPictures = null, search, llm, config }) {
  /**
   * A picture the app already has for a new page (the DM's creature, item,
   * merchant, map or handout with the page's name), offered beside the
   * proposal for the DM to take or leave. Matched by name on the server: no AI call.
   */
  const suggestPicture = (cid, p) => (p.action === 'new_page' && wikiPictures ? wikiPictures.match(cid, [p.title, ...(p.aliases ?? [])]) : null);

  /** A new text for a section keeps the pictures the DM put in the old one (the AI never sees them as pictures to keep). */
  const keepPictures = (oldText, newText) => {
    const missing = [...String(oldText ?? '').matchAll(PICTURE_RE)].filter((m) => !picturesIn(newText).includes(m[2])).map((m) => m[0]);
    return missing.length ? `${newText.trimEnd()}\n\n${[...new Set(missing)].join('\n')}` : newText;
  };

  const perCall = config?.wiki?.recordsPerCall ?? 25;

  const players = (cid) => store.roster(cid).filter((m) => m.role === 'player');

  const toProposal = (r) => r && { ...json.parse(r.data, {}), status: r.status };

  // In the order they were made (rowid): several are made in the same millisecond, and their ids are random.
  const list = (cid, status) =>
    db
      .prepare(`SELECT * FROM wiki_proposals WHERE campaign_id = ? ${status ? 'AND status = ?' : ''} ORDER BY created_at, rowid`)
      .all(...[cid, status].filter((x) => x != null))
      .map(toProposal);

  function write(cid, p) {
    archive.appendWikiProposal(store.getCampaign(cid).slug, p);
    db.prepare(
      `INSERT INTO wiki_proposals (id, campaign_id, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at`,
    ).run(p.id, cid, p.status, JSON.stringify(p), p.created_at, p.updated_at);
    return p;
  }

  const get = (cid, id) => {
    if (!isProposalId(id)) throw new NotFoundError('No such proposal');
    const p = toProposal(db.prepare('SELECT * FROM wiki_proposals WHERE id = ? AND campaign_id = ?').get(id, cid));
    if (!p) throw new NotFoundError('No such proposal');
    return p;
  };

  // ---------- reading the journal ----------

  const cursor = (cid) => db.prepare('SELECT journal_id FROM wiki_chronicle WHERE campaign_id = ?').get(cid)?.journal_id ?? 0;
  const setCursor = (cid, id) =>
    db.prepare('INSERT INTO wiki_chronicle (campaign_id, journal_id) VALUES (?, ?) ON CONFLICT (campaign_id) DO UPDATE SET journal_id = excluded.journal_id').run(cid, id);
  const lastJournalId = (cid) => db.prepare('SELECT MAX(id) AS id FROM kb_journal WHERE campaign_id = ?').get(cid).id ?? 0;

  /** What the archivist changed since the AI last read: { records, removed, runs, upTo }. */
  function news(cid) {
    const from = cursor(cid);
    const rows = db.prepare('SELECT id, run, op, record_id, before FROM kb_journal WHERE campaign_id = ? AND id > ? AND record_id IS NOT NULL ORDER BY id').all(cid, from);
    const records = new Map();
    const removed = new Map();
    for (const r of rows) {
      const now = kb.get(cid, r.record_id);
      if (now && now.kind !== '_guide') records.set(now.id, now);
      else if (!now && r.op === 'delete') removed.set(r.record_id, json.parse(r.before, {})?.title ?? `record ${r.record_id}`);
    }
    return { records: [...records.values()], removed: [...removed.entries()], runs: [...new Set(rows.map((r) => r.run))], upTo: rows.at(-1)?.id ?? from };
  }

  /** The players who know a record (null = all of them), never the DM. */
  function knowers(cid, record, playerIds) {
    if (!record) return [];
    if (record.known_by == null) return null;
    return record.known_by.map(Number).filter((id) => playerIds.includes(id));
  }

  /** The audience of something written from these records: players who know all of them; no known record means the DM's alone. */
  function audienceFrom(cid, ids, playerIds) {
    const recs = [...new Set(ids)].map((id) => kb.get(cid, id)).filter((r) => r && r.kind !== '_guide');
    if (!recs.length) return [];
    return recs.reduce((a, r) => narrowest(a, knowers(cid, r, playerIds)), null);
  }

  // ---------- the prompt ----------

  function renderAvailable(a, names) {
    if (a === 'all') return 'all';
    if (a === 'dm') return 'DM only';
    return a.map((id) => names.get(id) ?? `user ${id}`).join(', ');
  }

  function renderPage(page, names) {
    const head = `<page id="${page.id}" title="${page.title}" kind="${page.kind}" available="${renderAvailable(page.available, names)}"${page.aliases.length ? ` aliases="${page.aliases.join('; ')}"` : ''}>`;
    const secs = page.sections.map(
      (s) => `<section id="${s.id}" heading="${s.heading}" by="${s.by}" available="${s.available === 'all' ? 'as the page' : renderAvailable(s.available, names)}">\n${s.text}\n</section>`,
    );
    return [head, ...secs, '</page>'].join('\n');
  }

  const describe = (p) =>
    p.action === 'new_page'
      ? `new page "${p.title}"`
      : p.action === 'reveal'
        ? `reveal "${p.page_title} › ${p.section_heading}" to ${p.players.join(', ')}`
        : `${p.action === 'add_section' ? 'new section' : 'change to'} "${p.page_title} › ${p.sections[0]?.heading ?? ''}"`;

  /** Pages the changed records seem to be about: named in them, or found by searching the wiki for each record. */
  async function relatedPages(cid, batch, pages) {
    const text = batch.map((r) => `${r.title}\n${r.body}`).join('\n').toLowerCase();
    const ids = new Set(pages.filter((p) => [p.title, ...p.aliases].some((n) => n.length > 2 && text.includes(n.toLowerCase()))).map((p) => p.id));
    for (const r of batch) {
      if (ids.size >= 15) break;
      for (const hit of await search.search(cid, `${r.title}\n${r.body}`.slice(0, 2000), { kinds: ['wiki'], limit: 3 })) ids.add(hit.ref_id);
    }
    return pages.filter((p) => ids.has(p.id)).slice(0, 15);
  }

  async function prompt(cid, batch, removed, runs) {
    const roster = players(cid);
    const names = new Map(roster.map((m) => [m.user_id, m.character_name ? `${m.character_name} (user ${m.user_id})` : `${m.name} (user ${m.user_id})`]));
    const pages = wiki.list(cid);
    // Pages the changed records seem to be about are shown whole; the rest by title.
    const related = await relatedPages(cid, batch, pages);
    const pending = list(cid, 'pending');
    const rejected = list(cid, 'rejected').slice(-30);
    return [
      `<players>\n${roster.map((m) => `user ${m.user_id}: ${m.character_name || '(no character)'}, played by ${m.name}`).join('\n') || '(none)'}\n</players>`,
      `<changed_by>${runs.join(', ') || 'the DM asked'}</changed_by>`,
      `<wiki_pages>\n${pages.map((p) => `${p.id} | ${p.title} | ${p.kind || '-'}${p.aliases.length ? ` | also: ${p.aliases.join(', ')}` : ''}`).join('\n') || '(the wiki is empty)'}\n</wiki_pages>`,
      related.length ? `<related_pages>\n${related.map((p) => renderPage(p, names)).join('\n\n')}\n</related_pages>` : '',
      pending.length ? `<waiting_for_the_dm>\n${pending.map((p) => `- ${describe(p)}`).join('\n')}\n</waiting_for_the_dm>` : '',
      rejected.length ? `<rejected_by_the_dm>\n${rejected.map((p) => `- ${describe(p)}${p.sections?.[0] ? `: ${p.sections[0].text.slice(0, 200)}` : ''}`).join('\n')}\n</rejected_by_the_dm>` : '',
      `<changed_records>\n${batch.map(renderRecord).join('\n\n')}\n</changed_records>`,
      removed.length ? `<deleted_records>\n${removed.map(([id, title]) => `#${id} ${title}`).join('\n')}\n</deleted_records>` : '',
      'Propose the wiki changes these records call for.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  // ---------- turning the AI's answer into proposals ----------

  const clean = (s, max) => String(s ?? '').trim().slice(0, max);
  const cleanSection = (s) => ({ heading: clean(s.heading, L.heading), text: String(s.text ?? '').slice(0, L.text).trim() });

  /** A proposal from one change, or null when it doesn't hold up. Who it's available to is worked out here. */
  function proposalOf(cid, c, run, playerIds) {
    const pages = wiki.list(cid);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const base = { reason: clean(c.reason, 1000), run };
    if (c.action === 'new_page') {
      const n = c.new_page;
      const title = clean(n?.title, L.title);
      if (!title || !n.sections?.length) return null;
      const taken = new Set(pages.flatMap((p) => [p.title, ...p.aliases]).map(wikiKey));
      if (taken.has(wikiKey(title))) return null;
      const sections = n.sections.map((s) => ({ ...cleanSection(s), audience: audienceFrom(cid, s.sources, playerIds) })).filter((s) => s.text);
      if (!sections.length) return null;
      const pageAudience = sections.reduce((a, s) => (a === undefined ? s.audience : widest(a, s.audience)), undefined);
      const parent = n.parent_title && pages.find((p) => [p.title, ...p.aliases].some((x) => wikiKey(x) === wikiKey(n.parent_title)));
      return {
        ...base,
        action: 'new_page',
        key: `new:${wikiKey(title)}`,
        title,
        kind: clean(n.kind, L.kind),
        aliases: [...new Set((n.aliases ?? []).map((a) => clean(a, L.alias)).filter((a) => a && !taken.has(wikiKey(a)) && wikiKey(a) !== wikiKey(title)))].slice(0, L.aliases),
        parent: parent?.id ?? null,
        page_available: availableOf(pageAudience),
        // A section as wide as the page is "as the page".
        sections: sections.map((s) => ({ heading: s.heading, text: s.text, available: JSON.stringify(availableOf(s.audience)) === JSON.stringify(availableOf(pageAudience)) ? 'all' : availableOf(s.audience) })),
      };
    }
    const page = byId.get(String(c.page_id));
    if (!page) return null;
    const pageBits = { page_id: page.id, page_title: page.title };
    if (c.action === 'reveal') {
      const section = page.sections.find((s) => s.id === c.section_id);
      if (!section) return null;
      const now = narrowest(audienceOf(page.available), audienceOf(section.available));
      const know = audienceFrom(cid, c.sources, playerIds);
      const who = [...new Set(c.players.map(Number))].filter((id) => playerIds.includes(id) && (know == null || know.includes(id)) && !canSeeAudience({ userId: id }, now));
      if (!who.length) return null;
      return { ...base, ...pageBits, action: 'reveal', key: `reveal:${page.id}:${section.id}`, section_id: section.id, section_heading: section.heading, players: who.sort((a, b) => a - b), sections: [] };
    }
    if (!c.section) return null;
    const s = cleanSection(c.section);
    if (!s.text) return null;
    const audience = audienceFrom(cid, c.section.sources, playerIds);
    if (c.action === 'add_section') {
      return { ...base, ...pageBits, action: 'add_section', key: `${page.id}:new:${wikiKey(s.heading)}`, section_id: null, sections: [{ ...s, available: availableOf(narrowest(audienceOf(page.available), audience)) }] };
    }
    if (c.action !== 'update_section') return null;
    const section = page.sections.find((x) => x.id === c.section_id);
    if (!section || (sameText(section.text, s.text) && section.heading === s.heading)) return null;
    // A change never widens who a section is available to; only a reveal does.
    const was = narrowest(audienceOf(page.available), audienceOf(section.available));
    const next = narrowest(was, audience);
    return {
      ...base,
      ...pageBits,
      action: 'update_section',
      key: `${page.id}:${section.id}`,
      section_id: section.id,
      dm_section: section.by === 'dm',
      sections: [{ ...s, available: section.available === 'all' && JSON.stringify(next) === JSON.stringify(was) ? 'all' : availableOf(next) }],
    };
  }

  /** Save a new proposal; it replaces one still waiting for the same thing. Skipped if the DM already rejected the same. */
  function add(cid, p) {
    const same = (a) => (p.action === 'reveal' ? JSON.stringify(a.players) === JSON.stringify(p.players) : a.sections.length === p.sections.length && a.sections.every((s, i) => sameText(s.text, p.sections[i].text)));
    if (list(cid, 'rejected').some((r) => r.key === p.key && same(r))) return null;
    const now = new Date().toISOString();
    for (const old of list(cid, 'pending').filter((x) => x.key === p.key)) write(cid, { ...old, status: 'replaced', updated_at: now });
    return write(cid, { ...p, id: crypto.randomBytes(5).toString('hex'), status: 'pending', created_at: now, updated_at: now });
  }

  // ---------- approving ----------

  /** Make a section available to more players, keeping everything else on the page as it was. */
  function reveal(page, sectionId, who) {
    const pageAudience = audienceOf(page.available);
    const available = pageAudience == null ? 'all' : availableOf(widest(pageAudience, who));
    const widened = JSON.stringify(available) !== JSON.stringify(page.available);
    const sections = page.sections.map((s) => {
      if (s.id === sectionId) return { ...s, available: availableOf(widest(narrowest(pageAudience, audienceOf(s.available)), who)) };
      // When the page widens, a section "as the page" keeps what the page was.
      return widened && s.available === 'all' ? { ...s, available: page.available } : s;
    });
    return { available, sections };
  }

  const wikiAI = {
    /** Proposals waiting for the DM, oldest first, each with what's there now to compare. */
    pending(cid) {
      return list(cid, 'pending').map((p) => {
        if (p.action === 'new_page') return { ...p, picture: suggestPicture(cid, p) };
        let page = null;
        try {
          page = wiki.get(cid, p.page_id);
        } catch {}
        const section = page?.sections.find((s) => s.id === p.section_id) ?? null;
        return { ...p, page_title: page?.title ?? p.page_title, current: section && { heading: section.heading, text: section.text, available: section.available, by: section.by }, page_available: page?.available ?? null, gone: !page || (p.section_id != null && !section) };
      });
    },

    count: (cid) => db.prepare("SELECT COUNT(*) AS n FROM wiki_proposals WHERE campaign_id = ? AND status = 'pending'").get(cid).n,

    /** Has the archivist changed anything the AI hasn't read yet? */
    hasNews: (cid) => !!db.prepare('SELECT 1 FROM kb_journal WHERE campaign_id = ? AND id > ? AND record_id IS NOT NULL LIMIT 1').get(cid, cursor(cid)),

    /** After a rebuild replays every session: nothing in the journal is news. */
    skipToEnd: (cid) => setCursor(cid, lastJournalId(cid)),

    /**
     * Read what the archivist changed and propose wiki changes, a batch of
     * records at a time. Returns how many proposals were made.
     */
    async chronicle(cid, progress = () => {}) {
      const { records, removed, runs, upTo } = news(cid);
      if (!records.length && !removed.length) {
        setCursor(cid, upTo);
        return 0;
      }
      const playerIds = players(cid).map((m) => m.user_id);
      const batches = [];
      for (let i = 0; i < records.length; i += perCall) batches.push(records.slice(i, i + perCall));
      if (!batches.length) batches.push([]);
      let made = 0;
      for (const [i, batch] of batches.entries()) {
        progress(i / batches.length, `Reading ${batch.length} records for the wiki${batches.length > 1 ? ` (${i + 1} of ${batches.length})` : ''}`);
        const out = await llm.structured({
          task: 'wiki',
          purpose: `wiki:${runs.join(', ') || 'asked'}`,
          system: SYSTEM,
          prompt: await prompt(cid, batch, i === 0 ? removed : [], runs),
          schema: ChangesSchema,
          campaignId: cid,
        });
        for (const c of out.changes) {
          const p = proposalOf(cid, c, runs.join(', '), playerIds);
          if (p && add(cid, p)) made++;
        }
      }
      setCursor(cid, upTo);
      progress(1, made ? `${made} wiki change${made === 1 ? '' : 's'} waiting for you` : 'Nothing new for the wiki');
      return made;
    },

    /**
     * Approve a proposal, with the DM's edits if any:
     * { title?, kind?, page_available?, sections?: [{ heading, text, available }], players?, use_picture? }.
     * A new page takes the picture suggested for it unless use_picture is false.
     * A section the DM edited is the DM's. Returns the page.
     */
    async approve(cid, id, edits = {}, { by }) {
      const p = get(cid, id);
      if (p.status !== 'pending') throw new BadRequestError('This proposal was already dealt with.');
      const sections = p.sections.map((s, i) => {
        const e = edits.sections?.[i];
        if (!e) return { ...s, by: p.dm_section ? 'dm' : 'ai' };
        const changed = !sameText(e.text, s.text) || (e.heading ?? s.heading).trim() !== s.heading;
        return { heading: (e.heading ?? s.heading).trim(), text: e.text ?? s.text, available: e.available ?? s.available, by: changed || p.dm_section ? 'dm' : 'ai' };
      });
      let page;
      if (p.action === 'new_page') {
        const parent = p.parent && wiki.list(cid).some((x) => x.id === p.parent) ? p.parent : null;
        const suggested = edits.use_picture === false ? null : suggestPicture(cid, p);
        const picture = suggested ? { id: (await wikiPictures.copy(cid, suggested, { by })).id, caption: '', available: 'all' } : null;
        page = await wiki.create(cid, { title: edits.title ?? p.title, kind: edits.kind ?? p.kind, aliases: p.aliases, parent, available: edits.page_available ?? p.page_available, sections, picture }, { by });
      } else {
        const current = wiki.get(cid, p.page_id);
        let fields;
        if (p.action === 'reveal') {
          if (!current.sections.some((s) => s.id === p.section_id)) throw new BadRequestError('That section is gone from the page.');
          const who = (edits.players ?? p.players).map(Number).filter((uid) => p.players.includes(uid));
          if (!who.length) throw new BadRequestError('Choose at least one player.');
          fields = reveal(current, p.section_id, who);
        } else if (p.action === 'add_section') {
          fields = { sections: [...current.sections, ...sections] };
        } else {
          if (!current.sections.some((s) => s.id === p.section_id)) throw new BadRequestError('That section is gone from the page.');
          fields = { sections: current.sections.map((s) => (s.id === p.section_id ? { ...s, ...sections[0], text: keepPictures(s.text, sections[0].text) } : s)) };
        }
        page = await wiki.update(cid, current.id, fields, { by, version: current.version });
      }
      const now = new Date().toISOString();
      write(cid, { ...p, status: 'approved', page_id: page.id, decided_by: by, decided_at: now, updated_at: now, ...(Object.keys(edits).some((k) => k !== 'use_picture') && { edited: true }) });
      return page;
    },

    /** Reject a proposal. The AI is told, so it doesn't propose the same again. */
    reject(cid, id, { by }) {
      const p = get(cid, id);
      if (p.status !== 'pending') throw new BadRequestError('This proposal was already dealt with.');
      const now = new Date().toISOString();
      write(cid, { ...p, status: 'rejected', decided_by: by, decided_at: now, updated_at: now });
    },

    /** Approve everything waiting, as it is. Returns { approved, failed: [{ id, error }] }. */
    async approveAll(cid, { by }) {
      let approved = 0;
      const failed = [];
      for (const p of list(cid, 'pending')) {
        try {
          await wikiAI.approve(cid, p.id, {}, { by });
          approved++;
        } catch (err) {
          failed.push({ id: p.id, error: err.message });
        }
      }
      return { approved, failed };
    },
  };
  return wikiAI;
}
