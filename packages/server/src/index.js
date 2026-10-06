import { createContext } from './context.js';
import { buildApp } from './app.js';

const ctx = await createContext();
const app = buildApp(ctx);

if (ctx.restored.length) app.log.warn(`Restored campaigns from the archive: ${ctx.restored.join(', ')}. Run a rebuild to regenerate their notes.`);
app.log.info(`AI provider: ${ctx.config.llm.provider}`);
if (ctx.config.llm.provider === 'api' && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  app.log.warn('LLM_PROVIDER=api but ANTHROPIC_API_KEY is not set. Unless you have logged in with `ant auth login`, processing and Q&A will fail.');
}

ctx.jobs.start();
// Read the rulebooks in the background so the first spell lookup is quick.
ctx.books.load().then(() => {
  const { books, spells, dir } = ctx.books.status();
  if (books.length) app.log.info(`Books for spell lookups: ${books.map((b) => b.title).join(', ')} (${spells} spells found)`);
  else app.log.info(`No books found in ${dir}; spell lookups use the SRD and the AI.`);
});
await app.listen({ host: ctx.config.host, port: ctx.config.port });
app.log.info(`Player web page: ${ctx.config.publicUrl} (locally: http://${ctx.config.host}:${ctx.config.port})`);
const noPassword = ctx.db.prepare('SELECT name FROM users WHERE password_hash IS NULL AND revoked_at IS NULL').all();
if (noPassword.length) {
  app.log.warn(`These accounts have no password and can't log in: ${noPassword.map((u) => u.name).join(', ')}. Set one with: npm run admin -- set-password "<name>" "<password>"`);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    ctx.db.close();
    process.exit(0);
  });
}
