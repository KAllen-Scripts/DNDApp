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
import { createPipeline } from './pipeline/ingest.js';
import { createJobs } from './jobs.js';
import { createQA } from './qa/agent.js';
import { createBooks } from './sheets/books.js';
import { createSpells } from './sheets/spells.js';
import { createSheets } from './sheets/store.js';
import { createSheetImport } from './sheets/import.js';
import { createMaps } from './maps/store.js';
import { createMapReader } from './maps/read.js';
import { createStatBlocks } from './maps/stats.js';
import { createPictures, createPictureDescriber } from './characters/pictures.js';

export async function createContext({ config = defaultConfig, paths = defaultPaths, llm, embedder, log } = {}) {
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
  // A changed sheet reaches the archivist once the player stops editing for a while.
  const sheets = createSheets({ db, archive, store, onSave: (cid) => jobs.scheduleUpdates(cid) });
  const pictures = createPictures({ db, archive, store });
  const maps = createMaps({ db, archive, store, pictures, sheets });
  // What happened on the maps on a session's day goes to the archivist with the transcript.
  const archivist = createArchivist({ db, store, kb, search, llm, config, mapEvents: (cid, date) => maps.eventsOn(cid, date, config.notes.rolloverHour) });
  const handouts = createHandouts({ db, archive, store });
  handouts.events.on('update', ({ campaign_id }) => jobs.scheduleUpdates(campaign_id));
  // Sheet changes, late note edits and handouts reach the archivist between sessions.
  const updates = createUpdates({ db, store, archive, handoutsBetween: handouts.forArchivist });
  const pipeline = createPipeline({ db, store, archive, search, kb, archivist, updates, config });
  const jobs = createJobs({ db, store, search, pipeline, config, log });
  const books = createBooks({ dir: config.booksDir, log });
  const qa = createQA({ db, store, kb, search, books, llm, config });
  const spells = createSpells({ books, llm });
  const sheetImport = createSheetImport({ llm });
  const pictureDescriber = createPictureDescriber({ llm });
  const mapReader = createMapReader({ llm });
  const statBlocks = createStatBlocks({ llm });

  // If the database was lost or replaced, bring back accounts and campaigns from the archive.
  const restored = store.restoreFromArchive();
  for (const slug of restored) {
    const c = db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(slug);
    await pipeline.reindexNotes(c.id);
  }
  maps.failInterrupted();
  // Changes made while the server was off (or before its last run finished) still reach the archivist.
  for (const { id } of db.prepare('SELECT id FROM campaigns').all()) if (updates.pendingSince(id)) jobs.scheduleUpdates(id);

  return { config, paths, db, archive, store, auth, llm, embedder, search, kb, archivist, updates, handouts, pipeline, jobs, qa, books, spells, sheets, sheetImport, maps, mapReader, statBlocks, pictures, pictureDescriber, restored };
}
