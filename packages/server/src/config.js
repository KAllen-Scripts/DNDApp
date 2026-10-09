import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// Load .env from the repo root if present (Node's built-in loader).
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // no .env file - rely on real environment variables
}

const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

/**
 * Bump this whenever chunking, prompts, schemas or the memory design change.
 * Every generated output is tagged with it so we know which approach made it.
 */
export const PIPELINE_VERSION = 12;

const DEFAULT_MODEL = env.MODEL || 'claude-opus-5-5';

export const config = {
  // The address players open in their browser. THE one place the public URL is set
  // (placeholder until the domain is bought). The web page itself uses relative
  // paths, so it works at whatever address the server is reached on.
  publicUrl: env.PUBLIC_URL || 'https://dnd.example.xyz',
  host: env.HOST || '127.0.0.1',
  port: num(env.PORT, 4400),
  dataDir: path.resolve(repoRoot, env.DATA_DIR || 'data'),
  // The player web page, served by this server at "/".
  webDir: path.resolve(repoRoot, env.WEB_DIR || 'packages/web/public'),
  // Largest upload (transcripts, sheet files, maps). Other requests are limited to 1 MB.
  maxUploadBytes: num(env.MAX_UPLOAD_MB, 50) * 1024 * 1024,
  // Which proxies to believe about the caller's real address (X-Forwarded-For), for
  // limiting password guesses. 'loopback' suits a tunnel or reverse proxy running on
  // this machine; it can't be faked by anyone connecting from outside.
  trustProxy: env.TRUST_PROXY || 'loopback',
  // Live streams (map moves, job progress) one account may have open at once.
  maxStreamsPerUser: num(env.MAX_STREAMS_PER_USER, 20),
  // The group's rulebooks (PDFs), used to look up spells for character sheets.
  // Next to the repo by default: Desktop/Code/DND books.
  booksDir: path.resolve(repoRoot, env.BOOKS_DIR || '../DND books'),

  auth: {
    // A login ends after this many days without being used.
    loginDays: num(env.LOGIN_DAYS, 30),
    // Failed logins allowed per name in 15 minutes.
    maxFailedLogins: num(env.MAX_FAILED_LOGINS, 10),
    // Failed logins allowed from one network address (whatever the names) in 15 minutes.
    maxFailedLoginsPerAddress: num(env.MAX_FAILED_LOGINS_PER_ADDRESS, 30),
  },

  llm: {
    // 'claude-code' (your Claude subscription, via Claude Code on this machine) or 'api' (ANTHROPIC_API_KEY).
    provider: env.LLM_PROVIDER || 'claude-code',
    // Per-task model + effort. All tasks use the same model unless overridden.
    tasks: {
      archivist: { model: env.MODEL_ARCHIVIST || DEFAULT_MODEL, effort: env.EFFORT_ARCHIVIST || 'high' },
      qa: { model: env.MODEL_QA || DEFAULT_MODEL, effort: env.EFFORT_QA || 'medium' },
      // Character sheets: reading an uploaded sheet, and tidying a spell from a book.
      import: { model: env.MODEL_IMPORT || DEFAULT_MODEL, effort: env.EFFORT_IMPORT || 'medium' },
      spells: { model: env.MODEL_SPELLS || DEFAULT_MODEL, effort: env.EFFORT_SPELLS || 'low' },
      // Maps: reading an imported map (kind, grid, scale).
      maps: { model: env.MODEL_MAPS || DEFAULT_MODEL, effort: env.EFFORT_MAPS || 'medium' },
      // Maps: drafting walls and doors (two looks: a draft, then checking it). The most effort: a map is set up once, and closing every room takes care.
      walls: { model: env.MODEL_WALLS || env.MODEL_MAPS || DEFAULT_MODEL, effort: env.EFFORT_WALLS || 'max' },
    },
    // API provider only: re-run refused requests on Anthropic's recommended fallback model.
    fallbacks: env.LLM_FALLBACKS !== 'off',
    // USD per million tokens (API provider). Used for cost logging and the spending cap.
    pricing: {
      'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
      'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
      'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    },
  },

  pipeline: {
    chunkTargetTokens: num(env.CHUNK_TARGET_TOKENS, 1200),
    chunkOverlapUtterances: num(env.CHUNK_OVERLAP_UTTERANCES, 2),
  },

  archivist: {
    // Generous: processing time doesn't matter, thoroughness does.
    maxToolCalls: num(env.ARCHIVIST_MAX_TOOL_CALLS, 250),
    maxCostUsd: num(env.ARCHIVIST_MAX_COST_USD, 25),
    maxToolResultTokens: num(env.ARCHIVIST_MAX_TOOL_RESULT_TOKENS, 8000),
    // Transcripts up to this size are given in full; longer ones are read in parts.
    inlineTranscriptTokens: num(env.ARCHIVIST_INLINE_TRANSCRIPT_TOKENS, 200_000),
    // Sheet changes, late note edits and handouts reach the archivist this long after the last one (a quiet spell).
    updatesDelayMinutes: num(env.ARCHIVIST_UPDATES_DELAY_MINUTES, 10),
  },

  kb: {
    // Pinned records are shown with every question, so they share a budget.
    pinnedTokens: num(env.KB_PINNED_TOKENS, 6000),
    maxRecordTokens: num(env.KB_MAX_RECORD_TOKENS, 4000),
  },

  notes: {
    // Notes written before this hour count towards the previous day's session.
    rolloverHour: num(env.NOTES_ROLLOVER_HOUR, 6),
  },

  embeddings: {
    // 'local' (transformers.js, runs on this machine) or 'none' (keyword search only).
    provider: env.EMBEDDINGS || 'local',
    model: env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
  },

  qa: {
    maxToolCalls: num(env.QA_MAX_TOOL_CALLS, 12),
    maxToolResultTokens: num(env.QA_MAX_TOOL_RESULT_TOKENS, 2500),
    // Search results included with the question before the model is called (0 to disable).
    preSearchTokens: num(env.QA_PRESEARCH_TOKENS, 3000),
    maxCostUsd: num(env.QA_MAX_COST_USD, 0.5),
    historyTurns: num(env.QA_HISTORY_TURNS, 3),
    questionsPerUserPerHour: num(env.QA_RATE_PER_HOUR, 30),
  },

  sheets: {
    // AI calls (sheet uploads, spell lookups outside the SRD) per player per hour.
    aiPerHour: num(env.SHEET_AI_PER_HOUR, 60),
    // Which rules rests follow: 2014 or 2024. Empty: the edition of the group's Player's Handbook in BOOKS_DIR, else 2014.
    restRules: ['2014', '2024'].includes(env.REST_RULES) ? env.REST_RULES : '',
  },

  maps: {
    // AI reads of imported maps per DM per hour.
    aiPerHour: num(env.MAP_AI_PER_HOUR, 20),
  },

  dice: {
    // How rolled dice are shown on everyone's page (each player can still pick the other in the dice tray):
    // deluxe (glossy, metal and see-through dice with reflections and sounds, ~1.7 s) or classic (the
    // original 3D dice with physics and shadows, ~3.5 s). Without WebGL the result just appears.
    roller: env.DICE_ROLLER || 'deluxe',
  },

  // Applies to the API provider only (Claude Code runs on the subscription).
  monthlySpendCapUsd: num(env.MONTHLY_SPEND_CAP_USD, 50),
};

export const paths = {
  archive: path.join(config.dataDir, 'archive'),
  db: path.join(config.dataDir, 'dndapp.sqlite'),
  models: path.join(config.dataDir, 'models'),
};

/** Rough token estimate (~4 chars per token for English). */
export function estimateTokens(text) {
  return Math.ceil((text?.length ?? 0) / 4);
}
