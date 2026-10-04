/**
 * Server admin commands (run on the host machine). Everything else (accounts,
 * campaigns, who's the DM) is done on the web page after logging in as admin.
 *
 *   npm run admin -- init "<admin name>" "<password>"          create the admin login (first-time setup)
 *   npm run admin -- set-password "<name or id>" "<password>"  e.g. if the admin password is lost
 *   npm run admin -- list                                     accounts and campaigns
 */
import { createContext } from '../context.js';

const [cmd, ...args] = process.argv.slice(2);
const ctx = await createContext({ embedder: null });
const { db, auth } = ctx;

const usage = () => {
  console.log(`Commands:
  init "<admin name>" "<password>"
      create the admin login. Then open the web page, log in with it, and set everything else up there
      (including a separate player account for yourself if you play).
  set-password "<name or id>" "<password>"
      set a new password (logs them out everywhere; unblocks a blocked account)
  list
      list accounts and campaigns`);
  db.close();
  process.exit(1);
};

const fail = (message) => {
  console.error(message);
  db.close();
  process.exit(1);
};

const findUser = (nameOrId) => {
  const user = /^\d+$/.test(nameOrId ?? '')
    ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(Number(nameOrId))
    : db.prepare('SELECT id, name FROM users WHERE name = ? COLLATE NOCASE').get(nameOrId);
  return user ?? fail(`No account "${nameOrId}". See: npm run admin -- list`);
};

try {
  switch (cmd) {
    case 'init': {
      const [name, password] = args;
      if (!name || !password) usage();
      if (db.prepare('SELECT 1 FROM users WHERE is_admin = 1').get()) {
        fail('There is already an admin account. Use set-password if you have lost its password.');
      }
      const user = await auth.createUser(name, { password, isAdmin: true });
      console.log(`Created the admin login "${user.name}". Start the server, open the web page and log in with it.`);
      break;
    }
    case 'set-password': {
      const [who, password] = args;
      if (!who || !password) usage();
      const user = findUser(who);
      await auth.setPassword(user.id, password);
      console.log(`Password set for "${user.name}". They've been logged out everywhere.`);
      break;
    }
    case 'list': {
      console.table(
        db
          .prepare(
            `SELECT id, name, is_admin, CASE WHEN password_hash IS NULL THEN 'NOT SET' ELSE 'set' END AS password, revoked_at AS blocked
             FROM users ORDER BY id`,
          )
          .all(),
      );
      console.table(
        db
          .prepare(
            `SELECT c.name AS campaign, u.name, m.role, m.character_name FROM memberships m
             JOIN users u ON u.id = m.user_id JOIN campaigns c ON c.id = m.campaign_id ORDER BY c.name, m.role, u.name`,
          )
          .all(),
      );
      break;
    }
    default:
      usage();
  }
} catch (err) {
  fail(err.message);
}
db.close();
