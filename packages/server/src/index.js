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
await app.listen({ host: ctx.config.host, port: ctx.config.port });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    ctx.db.close();
    process.exit(0);
  });
}
