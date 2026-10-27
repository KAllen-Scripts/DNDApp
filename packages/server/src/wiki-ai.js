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
import { narrowest, audienceOf, canSeeAudience, wikiKey, wikiPictures as picturesIn, PICTURE_RE, TONES } from '@dndapp/shared/wiki.js';
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

  const wikiAI = {
    /** Proposals waiting for the DM, oldest first, each with what's there now to compare. */
    pending(cid) {
      return list(cid, 'pending').map((p) => {
        if (p.action === 'new_page') return { ...p, picture: suggestPicture(cid, p) };
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
      setCursor(cid, upTo);
      progress(1, made ? `${made} wiki change${made === 1 ? '' : 's'} waiting for you` : 'Nothing new for the wiki');
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
      const sections = p.sections.map(({ records, ...s }, i) => {
        const e = edits.sections?.[i];
        const sources = citationsFrom(cid, records);
        if (!e) return { ...s, sources, by: p.dm_section ? 'dm' : 'ai' };
        const changed = !sameText(e.text, s.text) || (e.heading ?? s.heading).trim() !== s.heading;
        return { heading: (e.heading ?? s.heading).trim(), text: e.text ?? s.text, available: e.available ?? s.available, ...(s.canon && { canon: s.canon }), sources, by: changed || p.dm_section ? 'dm' : 'ai' };
      });
      let page;
      if (p.action === 'new_page') {
        const parent = p.parent && wiki.list(cid).some((x) => x.id === p.parent) ? p.parent : null;
        const suggested = edits.use_picture === false ? null : suggestPicture(cid, p);
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
          const fact = { ...factOf(cid, p.fact), ...pick(e, ['label', 'value', 'available']), ...(e.tone !== undefined && { tone: e.tone }), ...(changed && { by: 'dm' }) };
          const i = current.facts.findIndex((f) => wikiKey(f.label) === wikiKey(p.fact.label));
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
          const event = { ...eventOf(cid, p.event), when, ...pick(e, ['text', 'available']), ...(changed && { by: 'dm' }) };
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
