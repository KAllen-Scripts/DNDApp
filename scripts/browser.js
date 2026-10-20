/**
 * Try the real page in a real browser, for what jsdom can't show (layout, the
 * canvas fog, WebGL dice, console errors), without touching the live site.
 *
 *   import { openTable } from '../scripts/browser.js';
 *   const table = await openTable({ accounts: ['dm-name', 'player-name'] });
 *   const [dm, player] = table.pages;          // Playwright pages, logged in
 *   await dm.click('[data-tab=map]');
 *   await player.screenshot({ path: 'player.png' });
 *   console.log(table.errors);                 // console errors and uncaught exceptions, per page
 *   await table.close();
 *
 * It starts a throwaway server on a copy of data/ (the database copied with
 * SQLite's backup, the archive copied; the originals are only read), with the
 * tests' fake AI and no job runner, so nothing costs credits, and sets every
 * named account's password on the copy. Chrome is the one installed on this
 * machine (playwright-core, no browser download); each account gets its own
 * browser context (its own storage), like separate people.
 *
 * Options: accounts (names in the copy), port (4401), dataDir (data), headless (true), viewport.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = (p) => pathToFileURL(path.join(root, 'packages/server', p)).href;
const PASSWORD = 'browser test';

export async function openTable({ accounts = [], port = 4401, dataDir = path.join(root, 'data'), headless = true, viewport = { width: 1600, height: 1000 } } = {}) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'dndapp-browser-'));
  const Database = createRequire(path.join(root, 'packages/server/package.json'))('better-sqlite3');
  const live = new Database(path.join(dataDir, 'dndapp.sqlite'), { readonly: true, fileMustExist: true });
  await live.backup(path.join(copy, 'dndapp.sqlite'));
  live.close();
  if (fs.existsSync(path.join(dataDir, 'archive'))) fs.cpSync(path.join(dataDir, 'archive'), path.join(copy, 'archive'), { recursive: true });

  const { config } = await import(server('src/config.js'));
  const { createContext } = await import(server('src/context.js'));
  const { buildApp } = await import(server('src/app.js'));
  const { createFakeLLM, fakeEmbedder } = await import(server('test/helpers.js'));
  const ctx = await createContext({
    config: { ...config, port, booksDir: path.join(copy, 'books') },
    paths: { archive: path.join(copy, 'archive'), db: path.join(copy, 'dndapp.sqlite'), models: path.join(copy, 'models') },
    llm: createFakeLLM(),
    embedder: fakeEmbedder,
    log: { error() {} },
  });
  const app = buildApp({ ...ctx, logger: false });
  await app.listen({ host: '127.0.0.1', port });
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ channel: 'chrome', headless });
  const errors = [];
  const pages = [];
  for (const name of accounts) {
    const user = ctx.db.prepare('SELECT id FROM users WHERE name = ?').get(name);
    if (!user) throw new Error(`No account "${name}" in the copy`);
    await ctx.auth.setPassword(user.id, PASSWORD);
    const { token } = await ctx.auth.login(name, PASSWORD);
    const context = await browser.newContext({ viewport });
    await context.addInitScript((t) => localStorage.setItem('dndapp.token', t), token);
    const page = await context.newPage();
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`[${name}] console.${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[${name}] uncaught: ${e.stack ?? e.message}`));
    page.on('requestfailed', (r) => errors.push(`[${name}] request failed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
    await page.goto(base);
    pages.push(page);
  }

  return {
    base,
    pages,
    errors,
    ctx,
    async close() {
      await browser.close();
      await app.close();
      ctx.jobs.stop();
      ctx.db.close();
      fs.rmSync(copy, { recursive: true, force: true });
    },
  };
}
