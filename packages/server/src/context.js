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
import { createPipeline } from './pipeline/ingest.js';
import { createJobs } from './jobs.js';
import { createQA } from './qa/agent.js';
import { createBooks } from './sheets/books.js';
import { createSpells } from './sheets/spells.js';
import { createSheets } from './sheets/store.js';
import { createSheetImport } from './sheets/import.js';
import { createMaps } from './maps/store.js';
import { createMapReader } from './maps/read.js';

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
  const archivist = createArchivist({ db, store, kb, search, llm, config });
  const pipeline = createPipeline({ db, store, archive, search, kb, archivist, config });
  const jobs = createJobs({ db, store, search, pipeline, log });
  const books = createBooks({ dir: config.booksDir, log });
  const qa = createQA({ db, store, kb, search, books, llm, config });
  const spells = createSpells({ books, llm });
  const sheets = createSheets({ db, archive, store });
  const sheetImport = createSheetImport({ llm });
  const maps = createMaps({ db, archive, store });
  const mapReader = createMapReader({ llm });

  // If the database was lost or replaced, bring back accounts and campaigns from the archive.
  const restored = store.restoreFromArchive();
  for (const slug of restored) {
    const c = db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(slug);
    await pipeline.reindexNotes(c.id);
  }
  maps.failInterrupted();

  return { config, paths, db, archive, store, auth, llm, embedder, search, kb, archivist, pipeline, jobs, qa, books, spells, sheets, sheetImport, maps, mapReader, restored };
}
