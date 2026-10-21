/** Wires the server's parts together. Tests pass fakes for llm/embedder. */
import { config as defaultConfig, paths as defaultPaths } from './config.js';
import { openDb } from './db/index.js';
import { createArchive } from './archive.js';
import { createStore } from './store.js';
import { createAuth } from './auth.js';
import { createLLM } from './llm/index.js';
import { createEmbedder } from './embeddings.js';
import { createSearch } from './search.js';
import { createKB } from './kb/store.js';
import { createArchivist } from './kb/archivist.js';
import { createUpdates } from './kb/updates.js';
import { createHandouts } from './handouts.js';
import { createWiki } from './wiki.js';
import { createRolls } from './rolls.js';
import { createRests } from './rests.js';
import { createEditions } from './editions.js';
import { createCreatures } from './creatures.js';
import { createCreatureFinder } from './creatures-find.js';
import { createItems } from './items.js';
import { createItemFinder } from './items-find.js';
import { createMerchants } from './merchants.js';
import { createMapAssets } from './map-assets.js';
import { createMapStamps } from './map-stamps.js';
import { createPipeline } from './pipeline/ingest.js';
import { createJobs } from './jobs.js';
import { createQA } from './qa/agent.js';
import { createBooks } from './sheets/books.js';
import { createSpells } from './sheets/spells.js';
import { createForms } from './sheets/forms.js';
import { createSheetReview } from './sheets/review.js';
import { createSheets } from './sheets/store.js';
import { createSheetImport } from './sheets/import.js';
import { createMaps } from './maps/store.js';
import { createMapReader } from './maps/read.js';
import { createDesignDrafter } from './maps/design-draft.js';
import { createStatBlocks } from './maps/stats.js';
import { createPictures, createPictureDescriber } from './characters/pictures.js';

export async function createContext({ config = defaultConfig, paths = defaultPaths, llm, embedder, log, fetchImage } = {}) {
  const db = openDb(paths.db);
  const archive = createArchive(paths.archive);
  const store = createStore({ db, archive, config });
  const auth = createAuth({ db, archive, ...config.auth });
  llm ??= createLLM({ db, config });
  if (embedder === undefined) {
    embedder = await createEmbedder({ ...config.embeddings, cacheDir: paths.models });
  }
  const search = createSearch({ db, embedder });
  const kb = createKB({ db, search, config });
  // The DM's wiki: beside the knowledge base, not in it. Ask reads it, filtered to the asker.
  const wiki = createWiki({ db, archive, store, search });
  // A changed sheet reaches the archivist once the player stops editing for a while.
  const sheets = createSheets({ db, archive, store, onSave: (cid) => jobs.scheduleUpdates(cid) });
  const pictures = createPictures({ db, archive, store });
  const maps = createMaps({ db, archive, store, pictures, sheets });
  // A character's token shows the sheet's hit points: maps with it are sent again when the sheet changes.
  sheets.events.on('save', ({ campaign_id, user_id }) => maps.sheetChanged(campaign_id, user_id));
  // What happened on the maps on a session's day goes to the archivist with the transcript.
  const archivist = createArchivist({ db, store, kb, search, llm, config, mapEvents: (cid, date) => maps.eventsOn(cid, date, config.notes.rolloverHour) });
  const handouts = createHandouts({ db, archive, store, llm });
  const creatures = createCreatures({ db, archive, store });
  const items = createItems({ db, archive, store });
  const merchants = createMerchants({ db, archive, store });
  const mapAssets = createMapAssets({ db, archive, store });
  const mapStamps = createMapStamps({ db, archive, store });
  handouts.events.on('update', ({ campaign_id }) => jobs.scheduleUpdates(campaign_id));
  // Sheet changes, late note edits and handouts reach the archivist between sessions.
  const updates = createUpdates({ db, store, archive, handoutsBetween: handouts.forArchivist });
  const pipeline = createPipeline({ db, store, archive, search, kb, archivist, updates, config });
  const jobs = createJobs({ db, store, search, pipeline, wiki, config, log });
  const books = createBooks({ dir: config.booksDir, log });
  // The campaign's rules edition (2014 or 2024): rests, Ask and lookups in the books follow it.
  const editions = createEditions({ store, books, config });
  const qa = createQA({ db, store, kb, search, books, creatures, editions, wiki, llm, config });
  const rolls = createRolls({ db });
  const rests = createRests({ db, archive, store, sheets, rolls, books, config, editions });
  // Each long rest the DM calls counts towards merchants restocking.
  rests.events.on('rest', (rest) => {
    if (rest.kind !== 'long') return;
    try {
      merchants.longRest(rest.campaign_id, { at: rest.at });
    } catch (err) {
      log?.error?.(err);
    }
  });
  const spells = createSpells({ books, llm, editions });
  const forms = createForms({ books, llm, editions });
  const sheetImport = createSheetImport({ llm });
  const sheetReview = createSheetReview({ books, llm, editions, config });
  const pictureDescriber = createPictureDescriber({ llm });
  const mapReader = createMapReader({ llm });
  const designDrafter = createDesignDrafter({ llm });
  const statBlocks = createStatBlocks({ llm, books, creatures, editions });
  const creatureFinder = createCreatureFinder({ llm, books, editions, ...(fetchImage && { fetchImage }) });
  const itemFinder = createItemFinder({ llm, books, items, editions, ...(fetchImage && { fetchImage }) });

  // If the database was lost or replaced, bring back accounts and campaigns from the archive.
  const restored = store.restoreFromArchive();
  for (const slug of restored) {
    const c = db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(slug);
    await pipeline.reindexNotes(c.id);
    await wiki.reindex(c.id);
  }
  maps.failInterrupted();
  creatures.failInterrupted();
  items.failInterrupted();
  // Search docs embedded before long text was embedded in windows (only their opening) are embedded again, in the background.
  search.reembedStale().catch((err) => log?.error?.(err));
  // Changes made while the server was off (or before its last run finished) still reach the archivist.
  for (const { id } of db.prepare('SELECT id FROM campaigns').all()) if (updates.pendingSince(id)) jobs.scheduleUpdates(id);

  return { config, paths, db, archive, store, auth, llm, embedder, search, kb, archivist, updates, handouts, wiki, creatures, rolls, rests, items, itemFinder, merchants, mapAssets, mapStamps, pipeline, jobs, qa, books, editions, spells, forms, sheets, sheetImport, sheetReview, maps, mapReader, designDrafter, statBlocks, creatureFinder, pictures, pictureDescriber, restored };
}
