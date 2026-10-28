/**
 * The example data switched on (DATA_SET=example): the first time the server starts on an empty example folder,
 * it seeds the example campaign (seed.js) before it opens. The accounts' password is EXAMPLE_PASSWORD, or one
 * made up and written to example-accounts.txt in the data folder (and the log).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { seedExample } from './seed.js';

export async function seedIfEmpty(ctx, app, log) {
  if (ctx.db.prepare('SELECT 1 FROM campaigns LIMIT 1').get()) return null;
  const password = process.env.EXAMPLE_PASSWORD || crypto.randomBytes(9).toString('base64url');
  log.info('Example data: seeding the example campaign (first start on an empty example folder)');
  const { accounts } = await seedExample(ctx, app, { password, log: (step) => log.info(`Example data: ${step}`) });
  const note = path.join(ctx.config.dataDir, 'example-accounts.txt');
  fs.writeFileSync(note, `The example campaign's accounts (all with the same password):\n\n${accounts.join('\n')}\n\nPassword: ${password}\n`);
  log.info(`Example data: accounts ${accounts.join(', ')}; the password is in ${note}`);
  return { accounts, password };
}
