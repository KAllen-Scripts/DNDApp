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
import { narrowest, audienceOf, canSeeAudience, wikiKey, wikiPictures as picturesIn, PICTURE_RE, TONES, unlink, embedNames, openPrepPage, PREP_KIND, kindFamily } from '@dndapp/shared/wiki.js';
import { json } from './db/index.js';
import { CITATION_RE, normalizeSources } from '@dndapp/shared/citations.js';
import { parseWhen, whenText, whenKey } from '@dndapp/shared/wiki-time.js';
import { clockText } from '@dndapp/shared/settings.js';

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

// A relationship (stage 3e): a fact on a page, labelled with the tie, linking the other page. The AI never makes a
// part planned or a player's account; it can only say the records call it a rumour.
const FactSchema = z.object({
  label: z.string().describe('The tie, from this page\'s side: Rival, Ally, Mother, Member of, Owes money to, Lives in…'),
  value: z.string().describe('The other page as a [[link]], e.g. "[[Lord Vex]]", with a few words if needed'),
  tone: z.enum(TONES).nullable().describe('friendly, neutral or hostile; null to let the label decide'),
  canon: z.enum(['true', 'rumour']).describe('rumour when the records call it a rumour, unconfirmed or hearsay; true otherwise'),
  sources: z.array(z.number().int()).describe('Ids of the records this tie comes from'),
});

// A dated line on a page (stage 4d): what happened, when, in the game's own time.
const EventSchema = z.object({
  when: z.string().describe('When it happened in the game\'s time, as the records give it ("Day 12", "Day 12 night", "3 Mirtul 1492", "300 years ago"); "" when they don\'t say'),
  text: z.string().describe('What happened, in a sentence. Link other pages with [[Page title]].'),
  canon: z.enum(['true', 'rumour']).describe('rumour when the records call it a rumour, unconfirmed or hearsay; true otherwise'),
  sources: z.array(z.number().int()).describe('Ids of the records this event comes from'),
});

export const ChangesSchema = z.object({
  changes: z.array(
    z.object({
      action: z.enum(['new_page', 'update_section', 'add_section', 'reveal', 'set_fact', 'set_when', 'add_event']),
      page_id: z.string().nullable().describe('The existing page (update_section, add_section, reveal, set_fact, set_when, add_event); null for new_page'),
      section_id: z.string().nullable().describe('The existing section (update_section, reveal); null otherwise'),
      new_page: z
        .object({
          title: z.string(),
          kind: z.string().describe('npc, place, faction, item, quest, session, lore, …'),
          aliases: z.array(z.string()).describe('Other names and spellings'),
          parent_title: z.string().nullable().describe('An existing page this one belongs inside (a tavern inside its town), or null'),
          sections: z.array(SectionSchema),
          facts: z.array(FactSchema).default([]).describe('Ties to other pages, as on set_fact'),
          when: z.string().nullable().default(null).describe('When it happened, as on set_when, or null'),
          events: z.array(EventSchema).default([]).describe('Dated lines, as on add_event'),
        })
        .nullable()
        .describe('Only for new_page'),
      section: SectionSchema.nullable().describe('The whole new section (update_section: it replaces the old text; add_section: a new one)'),
      fact: FactSchema.nullable().default(null).describe('set_fact: a tie on the page (one with the same label is replaced); null otherwise'),
      when: z.string().nullable().default(null).describe('set_when: when the page happened in the game\'s time; null otherwise'),
      event: EventSchema.nullable().default(null).describe('add_event: the dated line; null otherwise'),
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
- Sections, facts and events marked by="player" are a player's own account of their character's past (their lore): never rewrite, replace or contradict them in place. If the records disagree, propose a section of your own beside it and say so in the reason.

Changes:
- new_page: a page with its sections.
- update_section: rewrite a section with what the records now say (give the whole new section). Sections marked "by dm" are the DM's own writing: only propose a change to one when the records contradict it, and say so in the reason.
- add_section: a new section on an existing page.
- set_fact: a relationship as a fact on an existing page: label it with the tie from that page's side (Rival, Ally, Mother, Member of, Serves, Owes money to, Lives in) and link the other page in the value ("[[Lord Vex]]"). One tie per fact; a fact with the same label is replaced. Set canon to rumour when the records call it a rumour, unconfirmed or hearsay. Give the records in sources. A new page can carry its ties in its facts.
- set_when: when a page happened in the game's own time: a session page gets the in-game span it covered ("Day 3 to Day 5"); a battle, a birth, a founding, a journey get theirs. Write it as the records give it, in the campaign's calendar (see <in_game_time>): "Day 12", "Day 12 night", "3 Mirtul 1492", "1489 DR", "300 years ago". Never a real-world date (the session's date is not the game's).
- add_event: a dated line, for each thing worth remembering, on the page it's most about, linking the others with [[Page title]] ("[[Vex]] burned the [[Hollow Mill]]" goes on the mill's page). Its when as on set_when ("" when the records give none). Set canon to rumour as for facts. Give the records in sources. Don't repeat an event the page already has. A new page can carry its when and events.
- reveal: when a record's known_by now includes players who can't yet see a section holding that same knowledge (its "available to" leaves them out), propose making it available to them. Name only players in that record's known_by, and the record in sources.

Don't propose what's already waiting for the DM, or anything the DM rejected before unless the records have changed since. Return no changes if nothing needs changing.`;

// ---------- the AI as a writing partner (stage 5b): on the DM's button, one call each, as proposals ----------

/** After a session (stage 7c): which of the prep page's clues came out, and what carries over to the next one. */
/** A Home that thinks (stage 8d): after a session, what the DM might want to know. */
export const InsightsSchema = z.object({
  loose_threads: z.array(z.object({
    kind: z.enum(['rumour', 'unseen', 'promise', 'clue', 'other']).describe('rumour: a rumoured quest not followed; unseen: someone not seen for a while; promise: a promise made and not kept yet; clue: a clue not found'),
    text: z.string().describe('One or two sentences for the DM'),
    page_id: z.string().nullable().describe('The wiki page it is about, or null'),
  })).default([]).describe('Loose threads worth picking up; [] when none stand out'),
  previously: z.string().default('').describe('"Previously on…": a short recap of the session just played, for the DM to read aloud at the start of the next one; written for the players, so nothing they did not see'),
  contradictions: z.array(z.object({
    page_id: z.string().describe('The wiki page that disagrees with the records'),
    section_id: z.string().nullable().describe('Its section that says it, or null'),
    text: z.string().describe('What the page says, and what the records say instead'),
    fix: z.string().describe('The section rewritten to agree with the records, keeping everything else; "" when no rewrite is right'),
    sources: z.array(z.number().int()).describe('Ids of the records that disagree'),
  })).default([]).describe('Pages that the session\'s records contradict; [] when none do'),
});
const INSIGHTS_SYSTEM = `You help a Dungeon Master keep track of their campaign after each session. You get the campaign's wiki (its page index, and the pages the session's records seem to be about, in full), the session's records from the archivist, the last session's page if there is one, and what you noticed before.

Return:
- loose threads: rumoured quests the players haven't followed, people not seen for a while, promises made and not kept, clues not found. Only ones the wiki or records show; never invent. Skip any you noticed before.
- previously: a short "Previously on…" recap of this session, to read aloud to the players at the start of the next one. Only what the players saw; no secrets.
- contradictions: a wiki section the records clearly contradict (not just add to). Skip any you noticed before.

The DM decides what to do with each.`;

/** Make a list (stage 8a): which pages fit the DM's words. */
export const ListSchema = z.object({
  name: z.string().describe('A short name for the list, in the words a DM would use'),
  page_ids: z.array(z.string()).describe('The ids of the pages that fit, best first; [] when none do'),
});
const LIST_SYSTEM = `You pick pages from a D&D campaign's wiki for a list the DM asks for. Each page is one line: id | title | kind | tags | facts.
Choose only pages the lines show fit what the DM asked; never guess beyond them. Return their ids and a short name for the list.`;
const LIST_MAX = 30;

export const PrepSchema = z.object({
  clues: z.array(z.object({
    page_id: z.string().describe('The clue page'),
    found: z.boolean().describe('true when the records show the players came across this clue this session'),
    found_by: z.array(z.number().int()).describe('The player user ids who found it or were there; [] when not found'),
    sources: z.array(z.number().int()).describe('Ids of the records showing it; [] when not found'),
    reason: z.string().describe('One sentence for the DM'),
  })),
  strong_start: z.string().describe('A strong start for the next session, from where this one ended (a sentence or two)'),
  scenes_left: z.string().describe('The planned scenes they didn\'t reach, still worth keeping (Markdown, "" for none)'),
  reason: z.string().describe('One sentence for the DM: how the session went against the plan'),
});

const PREP_SYSTEM = `You help a Dungeon Master check their session prep against what happened. You get the prep page they wrote for the session just played, the clue pages it embeds, and the records the archivist made from the session.

For each clue, say whether the records show the players came across it this session: found only when a record shows it (give those records' ids in sources), and found_by only the players those records say know it or were there. Never guess. Then write a strong start for the next session from where this one ended, and list the planned scenes they didn't reach.

Everything you write waits for the DM's approval.`;

const DraftSchema = z.object({
  sections: z.array(SectionSchema).describe('The page\'s sections, under the headings asked for where the records have something for them'),
  facts: z.array(FactSchema).default([]).describe('At a glance facts and ties, as on set_fact'),
  when: z.string().nullable().default(null).describe('When it happened in the game\'s time, or null'),
  events: z.array(EventSchema).default([]).describe('Dated lines, as on add_event'),
  reason: z.string().describe('One sentence for the DM: what the records gave you, and what they lacked'),
});
const ExpandSchema = z.object({ section: SectionSchema, reason: z.string().describe('One sentence for the DM: what you added, from which records') });
const TidySchema = z.object({ heading: z.string(), text: z.string(), reason: z.string().describe('One sentence for the DM: what you changed') });
const MakeUpSchema = z.object({
  title: z.string(),
  kind: z.string().describe('npc, tavern, shop, rumour, lore, …'),
  aliases: z.array(z.string()).default([]),
  sections: z.array(z.object({ heading: z.string(), text: z.string() })),
  facts: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(TONES).nullable().default(null) })).default([]),
  reason: z.string().describe('One sentence for the DM: what it fits with in the wiki'),
});

/** Messy notes sorted into pages (stage 9b): the DM's own notes, so true and theirs. */
const ImportSchema = z.object({
  pages: z.array(z.object({
    title: z.string(),
    kind: z.string().describe('npc, place, tavern, faction, item, quest, lore, …'),
    aliases: z.array(z.string()).default([]),
    parent_title: z.string().nullable().default(null).describe('The page this one is inside (a place in a region, a room in a building), if any'),
    sections: z.array(z.object({ heading: z.string(), text: z.string() })),
    facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  })).default([]),
});
const IMPORT_CHUNK = 24_000;

const IMPORT_SYSTEM = `You sort a Dungeon Master's own campaign notes into wiki pages. The notes are messy: lists, half sentences, a session log, a Word document pasted as text.

Make one page for each person, place, faction, item, quest or piece of lore the notes say something about, with a title (its name), a kind, short sections (Markdown) and at a glance facts (Race, Role, Where they are, Ruler, …). Use only what the notes say, in their words where you can: add nothing, and leave nothing about a page out. Link other pages with [[Page title]], both the ones you make and the ones the wiki already has. When the wiki already has a page, use its exact title: what you write is added to it. Give parent_title when a page is clearly inside another (a tavern in a town). Never write :::for or :::dm blocks.`;

const DRAFT_SYSTEM = `You help a Dungeon Master write their campaign wiki. The DM pressed a button and you do that one thing. What you write waits for the DM's approval.

Write clear, readable Markdown for the DM. Link other pages with [[Page title]] (pages that exist). Never write :::for or :::dm blocks.

When you write from the records (Draft, Expand): use only what the campaign's records (the knowledge base) say, in the names they use, and list the records each section is written from in its sources. The server makes each section available only to the players who know every record in its sources, so keep things different players know in different sections. A heading the records have nothing for is left out.

When you make something up (Make up): invent it, fitting what the wiki already says (its people, places, tone and names), and say nothing that contradicts it. It is the DM's prep, kept from the players until the DM shares it.

When you tidy: improve the wording only. Keep every fact, name, link, picture and block exactly; add and remove nothing.`;

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

  /**
   * How we know it (stage 3b): the transcript citations of the records a section was written from, copied onto it
   * when the DM approves (record ids change as the archivist works; citations don't). The records' sources first,
   * then citations in their text.
   */
  function citationsFrom(cid, ids = []) {
    const recs = [...new Set(ids)].map((id) => kb.get(cid, id)).filter((r) => r && r.kind !== '_guide');
    const inText = (r) => [...String(r.body ?? '').matchAll(CITATION_RE)].map((m) => m[0].slice(1, -1));
    return normalizeSources([...recs.flatMap((r) => r.sources ?? []), ...recs.flatMap(inText)]);
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
    const facts = page.facts.map((f) => `<fact label="${f.label}" by="${f.by ?? 'dm'}"${f.canon !== 'true' ? ` canon="${f.canon}"` : ''}>${f.value}</fact>`);
    const when = page.when ? [`<when>${page.when.text}</when>`] : [];
    const events = [...(page.events ?? [])].sort((a, b) => whenKey(a.when) - whenKey(b.when))
      .map((e) => `<event when="${e.when?.text ?? ''}" by="${e.by ?? 'dm'}"${e.canon !== 'true' ? ` canon="${e.canon}"` : ''}>${e.text}</event>`);
    return [head, ...when, ...facts, ...events, ...secs, '</page>'].join('\n');
  }

  const describe = (p) =>
    p.action === 'new_page'
      ? `new page "${p.title}"`
      : p.action === 'reveal'
        ? `reveal "${p.page_title} › ${p.section_heading}" to ${p.players.join(', ')}`
        : p.action === 'set_fact'
          ? `tie on "${p.page_title}": ${p.fact.label}: ${p.fact.value}`
        : p.action === 'set_when'
          ? `time of "${p.page_title}": ${p.when.text}`
        : p.action === 'add_event'
          ? `event on "${p.page_title}": ${p.event.when?.text ? `${p.event.when.text}: ` : ''}${p.event.text}`
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
    const { calendar, clock } = store.getSettings(cid);
    const days = calendar ? `The calendar: ${calendar.name || 'the DM\'s own'}; months ${calendar.months.map((m) => m.name).join(', ')}${calendar.era ? `; years end in ${calendar.era}` : ''}.` : 'Days are counted Day 1, Day 2… from the start of the campaign.';
    return [
      `<in_game_time>It is now ${clockText(clock, calendar)} in the game. ${days}</in_game_time>`,
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
  /** One of the AI's ties, cleaned: { label, value, tone, canon, available, records }, or null. `available(audience)` narrows it. */
  const cleanFact = (cid, playerIds, f, available) => {
    const label = clean(f?.label, L.label);
    const value = clean(f?.value, L.value);
    if (!label || !value) return null;
    const records = recordIds(f.sources);
    return { label, value, tone: TONES.includes(f.tone) ? f.tone : null, canon: f.canon === 'rumour' ? 'rumour' : 'true', available: available(audienceFrom(cid, records, playerIds)), records };
  };
  /** An approved tie as the page keeps it: the records' citations copied, marked as the AI's. */
  const factOf = (cid, f) => ({ label: f.label, value: f.value, ...(f.tone && { tone: f.tone }), canon: f.canon, available: f.available, sources: citationsFrom(cid, f.records), by: 'ai' });
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

  /** One of the AI's events, cleaned: { when: { text } | null, text, canon, available, records }, or null. */
  const cleanEvent = (cid, playerIds, e, available) => {
    const text = clean(e?.text, L.event);
    if (!text) return null;
    const records = recordIds(e.sources);
    const when = clean(e.when, L.when);
    return { when: when ? { text: when } : null, text, canon: e.canon === 'rumour' ? 'rumour' : 'true', available: available(audienceFrom(cid, records, playerIds)), records };
  };
  /** An approved event as the page keeps it (the server dates it on saving). */
  const eventOf = (cid, e) => ({ when: e.when, text: e.text, canon: e.canon, available: e.available, sources: citationsFrom(cid, e.records), by: 'ai' });
  /** What a time reads as now, for the DM's card. */
  const reads = (cid, text) => {
    const { calendar, clock } = store.getSettings(cid);
    const w = parseWhen(text, calendar, { now: clock });
    return w?.from == null ? null : whenText(w, calendar);
  };

  /** A part's "available to" inside a page: 'all' (as the page) when it's as wide as the page. */
  const asPart = (pageAudience, audience) => {
    const n = narrowest(pageAudience, audience);
    return JSON.stringify(availableOf(n)) === JSON.stringify(availableOf(pageAudience)) ? 'all' : availableOf(n);
  };
  const recordIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))].slice(0, 50);
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
      const sections = n.sections.map((s) => ({ ...cleanSection(s), records: recordIds(s.sources), audience: audienceFrom(cid, s.sources, playerIds) })).filter((s) => s.text);
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
        facts: (n.facts ?? []).map((f) => cleanFact(cid, playerIds, f, (a) => asPart(pageAudience, a))).filter(Boolean),
        when: clean(n.when, L.when) ? { text: clean(n.when, L.when), reads: reads(cid, n.when) } : null,
        events: (n.events ?? []).map((e) => cleanEvent(cid, playerIds, e, (a) => asPart(pageAudience, a))).filter(Boolean),
        sections: sections.map((s) => ({ heading: s.heading, text: s.text, records: s.records, available: JSON.stringify(availableOf(s.audience)) === JSON.stringify(availableOf(pageAudience)) ? 'all' : availableOf(s.audience) })),
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
    if (c.action === 'set_fact') {
      const pageAudience = audienceOf(page.available);
      const was = page.facts.find((f) => wikiKey(f.label) === wikiKey(c.fact?.label));
      // A change never widens: an existing fact keeps the narrowest of what it was and what the records say.
      const fact = cleanFact(cid, playerIds, c.fact, (a) => asPart(pageAudience, was ? narrowest(audienceOf(was.available), a) : a));
      if (!fact || (was && sameText(was.value, fact.value) && (was.tone ?? null) === fact.tone)) return null;
      return { ...base, ...pageBits, action: 'set_fact', key: `${page.id}:fact:${wikiKey(fact.label)}`, fact, sections: [] };
    }
    if (c.action === 'set_when') {
      const text = clean(c.when, L.when);
      if (!text || sameText(page.when?.text, text)) return null;
      return { ...base, ...pageBits, action: 'set_when', key: `${page.id}:when`, when: { text, reads: reads(cid, text) }, sections: [] };
    }
    if (c.action === 'add_event') {
      const event = cleanEvent(cid, playerIds, c.event, (a) => asPart(audienceOf(page.available), a));
      if (!event || page.events.some((e) => sameText(e.text, event.text))) return null;
      if (event.when) event.when.reads = reads(cid, event.when.text);
      return { ...base, ...pageBits, action: 'add_event', key: `${page.id}:event:${wikiKey(event.text).slice(0, 120)}`, event, sections: [] };
    }
    if (!c.section) return null;
    const s = { ...cleanSection(c.section), records: recordIds(c.section.sources) };
    if (!s.text) return null;
    const audience = audienceFrom(cid, c.section.sources, playerIds);
    if (c.action === 'add_section') {
      return { ...base, ...pageBits, action: 'add_section', key: `${page.id}:new:${wikiKey(s.heading)}`, section_id: null, sections: [{ ...s, available: availableOf(narrowest(audienceOf(page.available), audience)) }] };
    }
    if (c.action !== 'update_section') return null;
    const section = page.sections.find((x) => x.id === c.section_id);
    // A player's lore (stage 6c) is theirs: the AI never rewrites it.
    if (!section || section.by === 'player' || (sameText(section.text, s.text) && section.heading === s.heading)) return null;
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
    const same = (a) => (p.action === 'reveal' ? JSON.stringify(a.players) === JSON.stringify(p.players) : p.action === 'set_fact' ? sameText(a.fact?.value, p.fact.value) : p.action === 'set_when' ? sameText(a.when?.text, p.when.text) : p.action === 'add_event' ? sameText(a.event?.when?.text, p.event.when?.text) : a.sections.length === p.sections.length && a.sections.every((s, i) => sameText(s.text, p.sections[i].text)));
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

  /**
   * After a session (stage 7c): the open prep page's clues against the session's records. A clue that came out
   * becomes a reveal of its opening to those who found it (only players the records say know it) and its Found
   * fact; the prep page gets Played; and a next prep page is proposed, carrying the clues not found and the scenes
   * not reached. Everything waits for the DM. Returns how many proposals it made.
   */
  async function afterSession(cid, session, records, playerIds) {
    const pages = wiki.list(cid);
    const prep = openPrepPage(pages);
    if (!prep) return 0;
    const byName = (n) => pages.find((p) => [p.title, ...p.aliases].some((x) => wikiKey(x) === wikiKey(n)));
    const clues = [...new Map(prep.sections.flatMap((s) => embedNames(s.text)).map(byName).filter(Boolean).map((p) => [p.id, p])).values()];
    if (!clues.length) return 0;
    const roster = players(cid);
    const names = new Map(roster.map((m) => [m.user_id, m.character_name ? `${m.character_name} (user ${m.user_id})` : `${m.name} (user ${m.user_id})`]));
    const out = await llm.structured({
      task: 'wiki',
      purpose: 'wiki:prep',
      system: PREP_SYSTEM,
      prompt: [
        `<players>\n${roster.map((m) => `user ${m.user_id}: ${m.character_name || '(no character)'}, played by ${m.name}`).join('\n') || '(none)'}\n</players>`,
        `<session>${session}</session>`,
        `<prep_page>\n${renderPage(prep, names)}\n</prep_page>`,
        `<clues>\n${clues.map((c) => renderPage(c, names)).join('\n\n')}\n</clues>`,
        `<records>\n${records.map(renderRecord).join('\n\n')}\n</records>`,
        'Which clues came out this session, and what carries over to the next?',
      ].join('\n\n'),
      schema: PrepSchema,
      campaignId: cid,
    });
    const who = (ids) => ids.map((id) => roster.find((m) => m.user_id === id)).filter(Boolean).map((m) => m.character_name || m.name).join(', ');
    let made = 0;
    const keep = (p) => { if (add(cid, { run: session, ...p })) made++; };
    const found = new Set();
    for (const c of out.clues) {
      const clue = clues.find((x) => x.id === c.page_id);
      if (!clue || !c.found) continue;
      // Only players the records say know it, and only from records that show it.
      const audience = audienceFrom(cid, c.sources, playerIds);
      const finders = [...new Set(c.found_by)].filter((id) => playerIds.includes(id) && (audience == null || audience.includes(id))).sort((a, b) => a - b);
      if (!finders.length) continue;
      found.add(clue.id);
      const opening = clue.sections[0];
      const pageAudience = audienceOf(clue.available);
      const hidden = opening && finders.filter((id) => !canSeeAudience({ userId: id }, narrowest(pageAudience, audienceOf(opening.available))));
      if (hidden?.length) {
        keep({ reason: clean(c.reason, 1000), page_id: clue.id, page_title: clue.title, action: 'reveal', key: `reveal:${clue.id}:${opening.id}`, section_id: opening.id, section_heading: opening.heading, players: hidden, sections: [] });
      }
      keep({ reason: clean(c.reason, 1000), page_id: clue.id, page_title: clue.title, action: 'set_fact', key: `${clue.id}:fact:found`, fact: { label: 'Found', value: `${session}: ${who(finders)}`, canon: 'true', available: 'dm', records: c.sources }, sections: [] });
    }
    keep({ reason: clean(out.reason, 1000) || `Played in ${session}.`, page_id: prep.id, page_title: prep.title, action: 'set_fact', key: `${prep.id}:fact:played`, fact: { label: 'Played', value: session, canon: 'true', available: 'dm', records: [] }, sections: [] });
    // The next prep page: the clues not found, the scenes not reached.
    const fact = (label) => prep.facts.find((f) => wikiKey(f.label) === wikiKey(label))?.value ?? '';
    const number = Number(/\d+/.exec(session)?.[0]);
    const title = Number.isFinite(number) ? `Session ${number + 1} plan` : `Plan after ${session}`;
    const carried = clues.filter((c) => !found.has(c.id));
    const taken = new Set(pages.flatMap((p) => [p.title, ...p.aliases]).map(wikiKey));
    if (!taken.has(wikiKey(title))) {
      const planned = { available: 'all', canon: 'planned', records: [] };
      const sections = [
        { heading: 'Strong start', text: clean(out.strong_start, 4000), ...planned },
        { heading: 'Scenes', text: clean(out.scenes_left, 20_000), ...planned },
        { heading: 'Clues', text: carried.map((c) => `[[!${c.title}]]`).join('\n\n'), ...planned },
      ].filter((s) => s.text);
      keep({
        reason: `The plan for the next session: ${carried.length ? `${carried.length} clue${carried.length === 1 ? '' : 's'} carried over` : 'every clue came out'}.`,
        action: 'new_page', key: `new:${wikiKey(title)}`, title, kind: PREP_KIND, aliases: [], parent: prep.parent, page_available: 'dm', when: null, events: [],
        facts: [
          { label: 'Session', value: Number.isFinite(number) ? String(number + 1) : '', canon: 'planned', available: 'all', records: [] },
          ...(fact('Arc') ? [{ label: 'Arc', value: fact('Arc'), canon: 'planned', available: 'all', records: [] }] : []),
          { label: 'Played', value: '', canon: 'planned', available: 'all', records: [] },
        ].filter((f) => f.value || f.label === 'Played'),
        sections: sections.length ? sections : [{ heading: 'Scenes', text: 'What could happen next.', ...planned }],
      });
    }
    return made;
  }

  // ---------- a Home that thinks (stage 8d) ----------

  const insightList = (cid) => db.prepare("SELECT * FROM wiki_proposals WHERE campaign_id = ? AND json_extract(data, '$.action') = 'insight' ORDER BY created_at, rowid").all(cid).map(toProposal);

  /**
   * After a session: one more call for the Home's insights (loose threads, "Previously on…", contradictions), kept
   * beside the proposals (`action: 'insight'`, status open, dismissed or done). One the DM saw before (by its key, or
   * the same page and kind) is never made again. Returns how many were made.
   */
  async function insightsAfter(cid, session, records) {
    const pages = wiki.list(cid);
    const roster = players(cid);
    const names = new Map(roster.map((m) => [m.user_id, m.character_name ? `${m.character_name} (user ${m.user_id})` : `${m.name} (user ${m.user_id})`]));
    const related = await relatedPages(cid, records.slice(0, perCall), pages);
    const last = pages.filter((p) => kindFamily(p.kind) === 'session' && wikiKey(p.kind) !== PREP_KIND).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const before = insightList(cid);
    const fact = (p, label) => p.facts.find((f) => wikiKey(f.label) === label)?.value ?? '';
    const out = await llm.structured({
      task: 'wiki',
      purpose: 'wiki:insights',
      system: INSIGHTS_SYSTEM,
      prompt: [
        `<players>\n${roster.map((m) => `user ${m.user_id}: ${m.character_name || '(no character)'}, played by ${m.name}`).join('\n') || '(none)'}\n</players>`,
        `<session>${session}</session>`,
        `<wiki_pages>\n${pages.map((p) => `${p.id} | ${p.title} | ${p.kind || '-'}${fact(p, 'status') ? ` | status: ${unlink(fact(p, 'status'))}` : ''} | last changed ${String(p.updated_at).slice(0, 10)}`).join('\n') || '(the wiki is empty)'}\n</wiki_pages>`,
        related.length ? `<related_pages>\n${related.map((p) => renderPage(p, names)).join('\n\n')}\n</related_pages>` : '',
        last ? `<last_session_page>\n${renderPage(last, names)}\n</last_session_page>` : '',
        before.length ? `<noticed_before>\n${before.slice(-60).map((x) => `- ${x.type}: ${x.text.slice(0, 200)}`).join('\n')}\n</noticed_before>` : '',
        `<records>\n${records.slice(0, 80).map(renderRecord).join('\n\n')}\n</records>`,
        'What should the DM know after this session?',
      ].filter(Boolean).join('\n\n'),
      schema: InsightsSchema,
      campaignId: cid,
    });
    const byId = new Map(pages.map((p) => [p.id, p]));
    const seen = (key, type, pageId) => before.some((x) => x.key === key || (pageId && x.type === type && x.page_id === pageId && x.status !== 'done'));
    const now = new Date().toISOString();
    let made = 0;
    const keep = (x) => {
      if (seen(x.key, x.type, x.page_id)) return;
      before.push(write(cid, { ...x, id: crypto.randomBytes(5).toString('hex'), action: 'insight', status: 'open', run: session, created_at: now, updated_at: now }));
      made++;
    };
    const previously = clean(out.previously, 4000);
    if (previously && !seen(`previously:${wikiKey(session)}`, 'previously', null)) {
      // Only the newest recap is shown.
      for (const old of before.filter((x) => x.type === 'previously' && x.status === 'open')) write(cid, { ...old, status: 'dismissed', updated_at: now });
      keep({ type: 'previously', key: `previously:${wikiKey(session)}`, text: previously, page_id: null, page_title: null });
    }
    for (const t of out.loose_threads.slice(0, 8)) {
      const text = clean(t.text, 1000);
      const page = byId.get(String(t.page_id));
      if (text) keep({ type: 'loose_thread', kind: t.kind, key: `thread:${page?.id ?? ''}:${t.kind}:${wikiKey(text).slice(0, 80)}`, text, page_id: page?.id ?? null, page_title: page?.title ?? null });
    }
    for (const c of out.contradictions.slice(0, 5)) {
      const page = byId.get(String(c.page_id));
      const text = clean(c.text, 1000);
      if (!page || !text) continue;
      const section = page.sections.find((x) => x.id === c.section_id) ?? null;
      keep({ type: 'contradiction', key: `contra:${page.id}:${section?.id ?? ''}`, text, page_id: page.id, page_title: page.title, section_id: section?.id ?? null, fix: section && section.by !== 'player' ? String(c.fix ?? '').slice(0, L.text).trim() : '', sources: c.sources.filter((id) => Number.isInteger(id)) });
    }
    return made;
  }

  const wikiAI = {
    /** Proposals waiting for the DM, oldest first, each with what's there now to compare. */
    pending(cid) {
      return list(cid, 'pending').map((p) => {
        if (p.action === 'new_page') return { ...p, picture: p.from === 'player' ? null : suggestPicture(cid, p) };
        let page = null;
        try {
          page = wiki.get(cid, p.page_id);
        } catch {}
        if (p.action === 'set_when' || p.action === 'add_event') {
          return { ...p, page_title: page?.title ?? p.page_title, ...(p.action === 'set_when' && { current_when: page?.when ?? null }), page_available: page?.available ?? null, gone: !page };
        }
        if (p.action === 'set_fact') {
          const now = page?.facts.find((f) => wikiKey(f.label) === wikiKey(p.fact.label)) ?? null;
          return { ...p, page_title: page?.title ?? p.page_title, current_fact: now, page_available: page?.available ?? null, gone: !page };
        }
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
      // After a session: check the prep page's clues against it (stage 7c).
      const session = runs.find((r) => /^session\s*\d+/i.test(String(r)));
      let prepNote = '';
      if (session && records.length) {
        try {
          made += await afterSession(cid, session, records, playerIds);
        } catch (err) {
          prepNote = ` (the prep page's clues couldn't be checked: ${err.message})`;
        }
      }
      // And the Home's insights (stage 8d): a failure leaves the rest.
      if (session && records.length) {
        try {
          await insightsAfter(cid, session, records);
        } catch (err) {
          prepNote += ` (the Home's insights couldn't be made: ${err.message})`;
        }
      }
      setCursor(cid, upTo);
      progress(1, `${made ? `${made} wiki change${made === 1 ? '' : 's'} waiting for you` : 'Nothing new for the wiki'}${prepNote}`);
      return made;
    },

    /**
     * Approve a proposal, with the DM's edits if any:
     * { title?, kind?, page_available?, sections?: [{ heading, text, available }], players?, use_picture?, fact?, when?, event? }.
     * A new page takes the picture suggested for it unless use_picture is false.
     * A section the DM edited is the DM's. Returns the page.
     */
    async approve(cid, id, edits = {}, { by }) {
      const p = get(cid, id);
      if (p.status !== 'pending') throw new BadRequestError('This proposal was already dealt with.');
      // A player's lore (stage 6c) stays theirs, edited or not: the DM chooses its canon (their account by default,
      // or true, or false with the truth beside it).
      const canon = edits.canon ?? 'told';
      const lore = p.from === 'player' ? { canon, ...(canon === 'false' && { truth: edits.truth ?? '' }), by: 'player', owner: p.by_player } : null;
      const sections = p.sections.map(({ records, ...s }, i) => {
        const e = edits.sections?.[i];
        if (lore) return { heading: (e?.heading ?? s.heading).trim(), text: e?.text ?? s.text, available: e?.available ?? s.available, sources: [], ...lore };
        const sources = citationsFrom(cid, records);
        if (!e) return { ...s, sources, by: p.dm_section ? 'dm' : 'ai' };
        const changed = !sameText(e.text, s.text) || (e.heading ?? s.heading).trim() !== s.heading;
        return { heading: (e.heading ?? s.heading).trim(), text: e.text ?? s.text, available: e.available ?? s.available, ...(s.canon && { canon: s.canon }), sources, by: changed || p.dm_section ? 'dm' : 'ai' };
      });
      let page;
      if (p.action === 'new_page') {
        const parent = p.parent && wiki.list(cid).some((x) => x.id === p.parent) ? p.parent : null;
        const suggested = edits.use_picture === false || lore ? null : suggestPicture(cid, p);
        const picture = suggested ? { id: (await wikiPictures.copy(cid, suggested, { by })).id, caption: '', available: 'all' } : null;
        page = await wiki.create(cid, {
          title: edits.title ?? p.title, kind: edits.kind ?? p.kind, aliases: p.aliases, parent, available: edits.page_available ?? p.page_available, sections, picture,
          facts: (p.facts ?? []).map((f) => factOf(cid, f)),
          when: p.when ? { text: p.when.text } : null,
          events: (p.events ?? []).map((e) => eventOf(cid, { ...e, when: e.when && { text: e.when.text } })),
        }, { by });
      } else {
        const current = wiki.get(cid, p.page_id);
        let fields;
        if (p.action === 'set_fact') {
          // The DM's edits, if any; an existing fact the DM marked (a rumour, false, planned, an account) stays marked so.
          const e = edits.fact ?? {};
          const changed = ['label', 'value', 'tone'].some((k) => e[k] !== undefined && e[k] !== p.fact[k]);
          const fact = { ...factOf(cid, p.fact), ...pick(e, ['label', 'value', 'available']), ...(e.tone !== undefined && { tone: e.tone }), ...(changed && { by: 'dm' }), ...lore };
          // A player's own fact (stage 6c) is never replaced: the AI's, or another player's, goes beside it.
          const i = p.from === 'player' ? -1 : current.facts.findIndex((f) => wikiKey(f.label) === wikiKey(p.fact.label) && f.by !== 'player');
          const facts = [...current.facts];
          if (i < 0) facts.push(fact);
          else facts[i] = { ...fact, ...(facts[i].canon !== 'true' && { canon: facts[i].canon }), ...(facts[i].truth != null && { truth: facts[i].truth }), ...(facts[i].owner != null && { owner: facts[i].owner }), sources: normalizeSources([...fact.sources, ...(facts[i].sources ?? [])]) };
          fields = { facts };
        } else if (p.action === 'set_when') {
          fields = { when: { text: (edits.when ?? p.when.text).trim() } };
        } else if (p.action === 'add_event') {
          const e = edits.event ?? {};
          const changed = ['when', 'text'].some((k) => e[k] !== undefined && e[k] !== (k === 'when' ? p.event.when?.text ?? '' : p.event.text));
          const when = e.when !== undefined ? (e.when.trim() ? { text: e.when.trim() } : null) : p.event.when && { text: p.event.when.text };
          const event = { ...eventOf(cid, p.event), when, ...pick(e, ['text', 'available']), ...(changed && { by: 'dm' }), ...lore };
          fields = { events: [...current.events, event] };
        } else if (p.action === 'reveal') {
          if (!current.sections.some((s) => s.id === p.section_id)) throw new BadRequestError('That section is gone from the page.');
          const who = (edits.players ?? p.players).map(Number).filter((uid) => p.players.includes(uid));
          if (!who.length) throw new BadRequestError('Choose at least one player.');
          fields = reveal(current, p.section_id, who);
        } else if (p.action === 'add_section') {
          fields = { sections: [...current.sections, ...sections] };
        } else {
          if (!current.sections.some((s) => s.id === p.section_id)) throw new BadRequestError('That section is gone from the page.');
          fields = { sections: current.sections.map((s) => (s.id === p.section_id ? { ...s, ...sections[0], text: keepPictures(s.text, sections[0].text), sources: normalizeSources([...sections[0].sources, ...(s.sources ?? [])]) } : s)) };
        }
        page = await wiki.update(cid, current.id, fields, { by, version: current.version });
      }
      const now = new Date().toISOString();
      write(cid, { ...p, status: 'approved', page_id: page.id, decided_by: by, decided_at: now, updated_at: now, ...(Object.keys(edits).some((k) => k !== 'use_picture') && { edited: true }) });
      return page;
    },

    /**
     * A player's lore about their own character (stage 6c), waiting for the DM like the AI's changes: `type`
     * 'section' (on their character's page), 'page' (a page of its own, inside their character's), 'relationship'
     * (a fact on their character's page linking another page) or 'event' (a dated line on it). `available` is who
     * it's for: only the DM ('dm', the default), chosen players, or everyone ('all').
     */
    lore(cid, userId, { type, title = '', kind = '', heading = '', text = '', label = '', value = '', when = '', available = 'dm' }) {
      const me = players(cid).find((m) => m.user_id === userId);
      if (!me) throw new BadRequestError('Only a player of this campaign can add to their story.');
      const pages = wiki.list(cid);
      const character = pages.find((p) => p.player === userId);
      if (!character && type !== 'page') throw new BadRequestError("Your character has no page yet. Ask the DM to make it (it's offered under Waiting).");
      const who = me.character_name || me.name;
      const base = { from: 'player', by_player: userId, reason: `From ${who}'s player.`, run: null, key: `lore:${userId}:${crypto.randomBytes(4).toString('hex')}` };
      const onPage = character && { page_id: character.id, page_title: character.title };
      let p;
      if (type === 'section') {
        if (!clean(text, L.text)) throw new BadRequestError('Write something first.');
        p = { ...base, ...onPage, action: 'add_section', section_id: null, sections: [{ heading: clean(heading, L.heading), text: String(text).slice(0, L.text).trim(), records: [], available }] };
      } else if (type === 'page') {
        const t = clean(title, L.title);
        if (!t || !clean(text, L.text)) throw new BadRequestError('Give the page a title and some words.');
        if (pages.some((x) => [x.title, ...x.aliases].some((n) => wikiKey(n) === wikiKey(t)))) throw new BadRequestError(`There's a page called "${t}" already. Write about it on your character's page, or choose another title.`);
        p = { ...base, action: 'new_page', title: t, kind: clean(kind, L.kind) || 'lore', aliases: [], parent: character?.id ?? null, page_available: available, facts: [], when: null, events: [], sections: [{ heading: '', text: String(text).slice(0, L.text).trim(), records: [], available: 'all' }] };
      } else if (type === 'relationship') {
        if (!clean(label, L.label) || !clean(value, L.value)) throw new BadRequestError('Say who, and what they are to your character.');
        p = { ...base, ...onPage, action: 'set_fact', fact: { label: clean(label, L.label), value: clean(value, L.value), canon: 'told', available, records: [] }, sections: [] };
      } else if (type === 'event') {
        if (!clean(text, L.event)) throw new BadRequestError('Say what happened.');
        const w = clean(when, L.when);
        p = { ...base, ...onPage, action: 'add_event', event: { when: w ? { text: w, reads: reads(cid, w) } : null, text: clean(text, L.event), canon: 'told', available, records: [] }, sections: [] };
      } else {
        throw new BadRequestError('Add a section, a page, a relationship or an event.');
      }
      const now = new Date().toISOString();
      return write(cid, { ...p, id: crypto.randomBytes(5).toString('hex'), status: 'pending', created_at: now, updated_at: now });
    },

    /** A player's own lore and what the DM did with it, newest first (only theirs). */
    loreOf(cid, userId) {
      return db.prepare("SELECT * FROM wiki_proposals WHERE campaign_id = ? AND json_extract(data, '$.by_player') = ? ORDER BY created_at DESC LIMIT 50").all(cid, userId).map(toProposal)
        .map((p) => ({ id: p.id, type: { add_section: 'section', new_page: 'page', set_fact: 'relationship', add_event: 'event' }[p.action], title: p.action === 'new_page' ? p.title : p.action === 'set_fact' ? p.fact.label : p.action === 'add_event' ? p.event.text : p.sections[0]?.heading || p.sections[0]?.text.slice(0, 80), status: p.status, page_id: p.status === 'approved' ? p.page_id : null, created_at: p.created_at }));
    },

    /** Reject a proposal. The AI is told, so it doesn't propose the same again. */
    reject(cid, id, { by }) {
      const p = get(cid, id);
      if (p.status !== 'pending') throw new BadRequestError('This proposal was already dealt with.');
      const now = new Date().toISOString();
      write(cid, { ...p, status: 'rejected', decided_by: by, decided_at: now, updated_at: now });
    },

    /**
     * The AI as a writing partner (stage 5b), on the DM's button: one call, its result as proposals under Waiting.
     * `mode`: 'draft' (fill a page, saved or new { title, kind, sections: [{ heading, prompt }] }, from the
     * records), 'expand' or 'tidy' (a section), 'make_up' (a new planned page: `what` and the DM's `notes`).
     * Returns the proposals made.
     */
    async draft(cid, { mode, page_id = null, section_id = null, page: asked = null, what = '', notes = '' }) {
      const playerIds = players(cid).map((m) => m.user_id);
      const roster = players(cid);
      const names = new Map(roster.map((m) => [m.user_id, m.character_name ? `${m.character_name} (user ${m.user_id})` : `${m.name} (user ${m.user_id})`]));
      const pages = wiki.list(cid);
      const page = page_id ? wiki.get(cid, page_id) : null;
      const section = page && section_id ? page.sections.find((s) => s.id === section_id) : null;
      if (page_id && !page) throw new NotFoundError('No such page');
      if ((mode === 'expand' || mode === 'tidy') && !section) throw new NotFoundError('No such section');
      if ((mode === 'expand' || mode === 'tidy') && section.by === 'player') throw new BadRequestError("That's a player's own account of their character: the AI doesn't rewrite it.");
      if (mode === 'draft' && !page && !clean(asked?.title, L.title)) throw new BadRequestError('Give the page a title first.');
      if (mode === 'make_up' && !clean(what, 200) && !clean(notes, 2000)) throw new BadRequestError('Say what to make up.');
      const about = page ? [page.title, ...page.aliases].join(', ') : mode === 'draft' ? asked.title : `${what}\n${notes}`;
      // The records and pages it's about, found by search (no AI).
      const records = mode === 'tidy' || mode === 'make_up' ? [] : (await search.search(cid, `${about}\n${section?.text ?? ''}`.slice(0, 2000), { kinds: ['kb'], limit: 25 }))
        .map((hit) => kb.get(cid, hit.ref_id)).filter((r) => r && r.kind !== '_guide');
      const relatedIds = new Set((await search.search(cid, about.slice(0, 2000), { kinds: ['wiki'], limit: 8 })).map((x) => x.ref_id));
      const related = pages.filter((p) => relatedIds.has(p.id) && p.id !== page?.id).slice(0, 8);
      const { calendar, clock } = store.getSettings(cid);
      const context = [
        `<in_game_time>It is now ${clockText(clock, calendar)} in the game.</in_game_time>`,
        `<players>\n${roster.map((m) => `user ${m.user_id}: ${m.character_name || '(no character)'}, played by ${m.name}`).join('\n') || '(none)'}\n</players>`,
        `<wiki_pages>\n${pages.map((p) => `${p.title} | ${p.kind || '-'}`).join('\n') || '(the wiki is empty)'}\n</wiki_pages>`,
        related.length ? `<related_pages>\n${related.map((p) => renderPage(p, names)).join('\n\n')}\n</related_pages>` : '',
        records.length ? `<records>\n${records.map(renderRecord).join('\n\n')}\n</records>` : '',
      ];
      const call = (schema, ask) => llm.structured({ task: 'wiki_draft', purpose: `wiki:${mode}`, system: DRAFT_SYSTEM, prompt: [...context, ask].filter(Boolean).join('\n\n'), schema, campaignId: cid });
      const made = [];
      const keep = (p) => {
        const saved = p && add(cid, p);
        if (saved) made.push(saved);
      };
      const run = { draft: 'Draft from the records', expand: 'Expand', tidy: 'Tidy', make_up: 'Make up' }[mode];

      if (mode === 'draft') {
        const shape = page ? page.sections.map((s) => s.heading).filter(Boolean) : (asked.sections ?? []).map((s) => `${s.heading}${s.prompt ? ` (${s.prompt})` : ''}`);
        const out = await call(DraftSchema, [
          page ? `<page_to_fill>\n${renderPage(page, names)}\n</page_to_fill>` : `<new_page title="${asked.title}" kind="${asked.kind ?? ''}" />`,
          shape.length ? `<headings>\n${shape.map((x) => `- ${x}`).join('\n')}\n</headings>` : '',
          `Draft this page from the records: its sections${shape.length ? ' under these headings' : ''}, its facts and ties, its time and events.${page ? ' A section that already has text is rewritten whole with what the records add; leave out one the records add nothing to.' : ''}`,
        ].filter(Boolean).join('\n\n'));
        if (!page) {
          keep(proposalOf(cid, { action: 'new_page', new_page: { title: asked.title, kind: asked.kind ?? '', aliases: [], parent_title: null, sections: out.sections, facts: out.facts, when: out.when, events: out.events }, reason: out.reason }, run, playerIds));
        } else {
          for (const s of out.sections) {
            const same = page.sections.find((x) => wikiKey(x.heading) === wikiKey(s.heading));
            keep(proposalOf(cid, same ? { action: 'update_section', page_id: page.id, section_id: same.id, section: s, reason: out.reason } : { action: 'add_section', page_id: page.id, section: s, reason: out.reason }, run, playerIds));
          }
          for (const f of out.facts) keep(proposalOf(cid, { action: 'set_fact', page_id: page.id, fact: f, reason: out.reason }, run, playerIds));
          if (out.when) keep(proposalOf(cid, { action: 'set_when', page_id: page.id, when: out.when, reason: out.reason }, run, playerIds));
          for (const e of out.events) keep(proposalOf(cid, { action: 'add_event', page_id: page.id, event: e, reason: out.reason }, run, playerIds));
        }
      } else if (mode === 'expand') {
        const out = await call(ExpandSchema, `<page>\n${renderPage(page, names)}\n</page>\n\nExpand the section "${section.heading || '(the opening section)'}" (id ${section.id}) with more from the records: give the whole section, its text kept and added to.`);
        keep(proposalOf(cid, { action: 'update_section', page_id: page.id, section_id: section.id, section: { ...out.section, heading: section.heading, sources: [...out.section.sources] }, reason: out.reason }, run, playerIds));
      } else if (mode === 'tidy') {
        const out = await call(TidySchema, `<section heading="${section.heading}">\n${section.text}\n</section>\n\nTidy this section's wording on the page "${page.title}". Keep every fact, name, [[link]], picture and :::block exactly.`);
        const text = String(out.text ?? '').slice(0, L.text).trim();
        // The same parts, so it stays available to whoever it was; the DM's own section stays theirs.
        if (text && !sameText(text, section.text)) {
          keep({ reason: clean(out.reason, 1000), run, page_id: page.id, page_title: page.title, action: 'update_section', key: `${page.id}:${section.id}`, section_id: section.id, dm_section: section.by === 'dm', sections: [{ heading: section.heading, text, records: [], available: section.available }] });
        }
      } else if (mode === 'make_up') {
        const out = await call(MakeUpSchema, `Make up ${clean(what, 200) || 'something'} for this campaign${clean(notes, 2000) ? `. The DM says: ${clean(notes, 2000)}` : ''}. Give it a page: a title not already in the wiki, its kind, sections and at a glance facts (ties to existing pages as [[links]]).`);
        const title = clean(out.title, L.title);
        const taken = new Set(pages.flatMap((p) => [p.title, ...p.aliases]).map(wikiKey));
        const sections = (out.sections ?? []).map((s) => ({ heading: clean(s.heading, L.heading), text: String(s.text ?? '').slice(0, L.text).trim(), records: [], available: 'all', canon: 'planned' })).filter((s) => s.text);
        if (title && !taken.has(wikiKey(title)) && sections.length) {
          keep({
            reason: clean(out.reason, 1000), run, action: 'new_page', key: `new:${wikiKey(title)}`, title, kind: clean(out.kind, L.kind),
            aliases: [...new Set((out.aliases ?? []).map((a) => clean(a, L.alias)).filter((a) => a && !taken.has(wikiKey(a)) && wikiKey(a) !== wikiKey(title)))].slice(0, L.aliases),
            parent: null, page_available: 'dm', made_up: true,
            facts: (out.facts ?? []).map((f) => ({ label: clean(f.label, L.label), value: clean(f.value, L.value), tone: f.tone ?? null, canon: 'planned', available: 'all', records: [] })).filter((f) => f.label && f.value),
            when: null, events: [], sections,
          });
        }
      } else {
        throw new BadRequestError('Unknown way to write.');
      }
      return made;
    },

    /**
     * Messy notes (stage 9b): the AI sorts the DM's text into pages, one call per piece of about 24,000 characters.
     * A new page waits under Waiting as a new page (the DM's only, true: they're the DM's own notes); a page the
     * wiki already has gets its sections as additions. Returns the proposals made.
     */
    async importNotes(cid, text, { name = '' } = {}) {
      const all = String(text ?? '').replace(/\r\n/g, '\n').trim();
      if (!all) throw new BadRequestError('There is nothing in those notes.');
      const pieces = [];
      for (let at = 0; at < all.length;) {
        let end = Math.min(all.length, at + IMPORT_CHUNK);
        if (end < all.length) {
          const cut = all.lastIndexOf('\n\n', end);
          if (cut > at + IMPORT_CHUNK / 2) end = cut;
        }
        pieces.push(all.slice(at, end));
        at = end;
      }
      const run = `Import${name ? `: ${clean(name, 100)}` : ''}`;
      const made = [];
      for (const [i, piece] of pieces.entries()) {
        const pages = wiki.list(cid);
        const out = await llm.structured({
          task: 'wiki_draft', purpose: 'wiki:import', system: IMPORT_SYSTEM, campaignId: cid, schema: ImportSchema,
          prompt: [
            `<wiki_pages>\n${pages.map((p) => `${p.title} | ${p.kind || '-'}`).join('\n') || '(the wiki is empty)'}\n</wiki_pages>`,
            `<notes${pieces.length > 1 ? ` part="${i + 1} of ${pieces.length}"` : ''}>\n${piece}\n</notes>`,
            'Sort these notes into pages.',
          ].join('\n\n'),
        });
        const byKey = new Map(pages.flatMap((p) => [p.title, ...p.aliases].map((t) => [wikiKey(t), p])));
        const waiting = new Set(list(cid, 'pending').filter((p) => p.action === 'new_page').map((p) => wikiKey(p.title)));
        for (const n of out.pages) {
          const title = clean(n.title, L.title);
          const sections = (n.sections ?? []).map((s) => ({ heading: clean(s.heading, L.heading), text: String(s.text ?? '').slice(0, L.text).trim(), records: [], available: 'all' })).filter((s) => s.text);
          if (!title || !sections.length) continue;
          const facts = (n.facts ?? []).map((f) => ({ label: clean(f.label, L.label), value: clean(f.value, L.value), tone: null, available: 'all', records: [] })).filter((f) => f.label && f.value);
          const page = byKey.get(wikiKey(title));
          const keep = (p) => {
            const saved = add(cid, p);
            if (saved) made.push(saved);
          };
          if (page) {
            // Added to a page the wiki has: only the DM's until they share it (the page may be the players' already).
            for (const s of sections) keep({ reason: 'From your notes.', run, page_id: page.id, page_title: page.title, action: 'add_section', key: `${page.id}:import:${wikiKey(s.heading || s.text.slice(0, 60))}`, section_id: null, dm_section: true, sections: [{ ...s, available: 'dm' }] });
            continue;
          }
          if (waiting.has(wikiKey(title))) continue;
          waiting.add(wikiKey(title));
          const parent = n.parent_title && byKey.get(wikiKey(n.parent_title));
          keep({
            reason: 'From your notes.', run, action: 'new_page', key: `new:${wikiKey(title)}`, title, kind: clean(n.kind, L.kind),
            aliases: [...new Set((n.aliases ?? []).map((a) => clean(a, L.alias)).filter((a) => a && !byKey.has(wikiKey(a)) && wikiKey(a) !== wikiKey(title)))].slice(0, L.aliases),
            parent: parent?.id ?? null, page_available: 'dm', facts, when: null, events: [], sections,
          });
        }
      }
      return made;
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

    // ---------- the Home's insights (stage 8d) ----------

    /** The insights still open, newest first (the DM's alone). */
    insights: (cid) => insightList(cid).filter((x) => x.status === 'open').reverse()
      .map(({ id, type, kind, text, page_id, page_title, section_id, fix, run, created_at }) => ({ id, type, kind: kind ?? null, text, page_id, page_title, section_id: section_id ?? null, can_fix: !!fix, run, created_at })),

    /** Dismiss one: it's never shown, or made, again. */
    dismissInsight(cid, id) {
      const x = get(cid, id);
      if (x.action !== 'insight') throw new NotFoundError('No such insight');
      write(cid, { ...x, status: 'dismissed', updated_at: new Date().toISOString() });
    },

    /** A contradiction's fix: its rewrite becomes a change waiting for the DM, like the AI's others. Returns the proposal. */
    fixInsight(cid, id) {
      const x = get(cid, id);
      if (x.action !== 'insight' || x.type !== 'contradiction' || !x.fix) throw new BadRequestError('There is no fix to propose for that.');
      const page = wiki.get(cid, x.page_id);
      const section = page.sections.find((s) => s.id === x.section_id);
      if (!section) throw new BadRequestError('That section is gone from the page.');
      const p = proposalOf(cid, { action: 'update_section', page_id: page.id, section_id: section.id, section: { heading: section.heading, text: x.fix, sources: x.sources ?? [] }, reason: x.text }, x.run, players(cid).map((m) => m.user_id));
      if (!p) throw new BadRequestError('The page already says that.');
      const made = add(cid, p);
      write(cid, { ...x, status: 'done', updated_at: new Date().toISOString() });
      return made;
    },

    // ---------- the DM's saved lists (stage 8a) ----------
    // Kept beside the proposals (action 'list', status 'saved' or 'removed') so the archive keeps them, and never in
    // the campaign's settings, which every player gets: a list's name can give a secret away.

    /** The DM's lists, oldest first: { id, name, filter }. */
    lists: (cid) => list(cid, 'saved').filter((p) => p.action === 'list').map(({ id, name, filter }) => ({ id, name, filter })),

    /** Save a list (a new one, or `id` renamed or refiltered). */
    saveList(cid, { id = null, name, filter }) {
      const now = new Date().toISOString();
      const old = id ? get(cid, id) : null;
      if (old && (old.action !== 'list' || old.status !== 'saved')) throw new NotFoundError('No such list');
      if (!old && wikiAI.lists(cid).length >= LIST_MAX) throw new BadRequestError(`A wiki keeps up to ${LIST_MAX} lists. Remove one first.`);
      const p = write(cid, { ...(old ?? { id: crypto.randomBytes(5).toString('hex'), created_at: now }), action: 'list', status: 'saved', name, filter, updated_at: now });
      return { id: p.id, name: p.name, filter: p.filter };
    },

    /** Remove a list (the archive keeps it). */
    removeList(cid, id) {
      const old = get(cid, id);
      if (old.action !== 'list' || old.status !== 'saved') throw new NotFoundError('No such list');
      write(cid, { ...old, status: 'removed', updated_at: new Date().toISOString() });
    },

    /**
     * Make a list (stage 8a): the DM's words ("hostile NPCs in Millbrook") and the pages to pick from (the DM's; the
     * route filters what comes back for whoever views it). One quick call on Ask's model: { name, ids }.
     */
    async makeList(cid, words, pages) {
      const index = pages.filter((p) => !p.template).slice(0, 600).map((p) => {
        const facts = p.facts.filter((f) => f.value.trim()).slice(0, 8).map((f) => `${f.label}: ${unlink(f.value).slice(0, 80)}`).join('; ');
        return `${p.id} | ${p.title} | ${p.kind || '-'}${p.tags.length ? ` | #${p.tags.join(' #')}` : ''}${facts ? ` | ${facts}` : ''}`;
      });
      const out = await llm.structured({
        task: 'qa', purpose: 'wiki:list', effort: config?.qa?.quickEffort, system: LIST_SYSTEM, schema: ListSchema, campaignId: cid,
        prompt: `<wiki_pages>\n${index.join('\n') || '(the wiki is empty)'}\n</wiki_pages>\n\n<asked_for>${words}</asked_for>`,
      });
      const known = new Set(pages.map((p) => p.id));
      return { name: clean(out.name, 80) || clean(words, 80), ids: [...new Set(out.page_ids.filter((id) => known.has(id)))].slice(0, 100) };
    },
  };
  return wikiAI;
}
