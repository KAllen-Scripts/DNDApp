/**
 * Server admin commands (run on the host machine):
 *
 *   npm run admin -- init "<campaign name>" "<your name>"   first-time setup
 *   npm run admin -- campaign "<name>" <dm user id>          add another campaign
 *   npm run admin -- list                                   users and campaigns
 *   npm run admin -- reset-token <user id>                  issue a new token
 */
import { createContext } from '../context.js';

const [cmd, ...args] = process.argv.slice(2);
const ctx = await createContext({ embedder: null });
const { db, store, auth } = ctx;

const usage = () => {
  console.log(`Commands:
  init "<campaign name>" "<your name>"   create the admin/DM account and first campaign
  campaign "<name>" <dm user id>         create another campaign
  list                                   list users and campaigns
  reset-token <user id>                  issue a new token for a user`);
  process.exit(1);
};

switch (cmd) {
  case 'init': {
    const [campaignName, userName] = args;
    if (!campaignName || !userName) usage();
    const { user, token } = auth.createUser(userName, { isAdmin: true });
    const campaign = store.createCampaign(campaignName);
    auth.addMember(campaign.id, user.id, 'dm');
    console.log(`Created admin "${user.name}" (id ${user.id}) as DM of "${campaign.name}" (id ${campaign.id}).`);
    console.log(`\nYour token (shown once, keep it safe):\n  ${token}\n`);
    break;
  }
  case 'campaign': {
    const [name, dmId] = args;
    if (!name || !dmId) usage();
    const campaign = store.createCampaign(name);
    auth.addMember(campaign.id, Number(dmId), 'dm');
    console.log(`Created campaign "${campaign.name}" (id ${campaign.id}).`);
    break;
  }
  case 'list': {
    console.table(db.prepare('SELECT id, name, is_admin, revoked_at FROM users').all());
    console.table(
      db
        .prepare(
          `SELECT c.id, c.name, c.slug, (SELECT COUNT(*) FROM sessions s WHERE s.campaign_id = c.id) AS sessions
           FROM campaigns c`,
        )
        .all(),
    );
    break;
  }
  case 'reset-token': {
    const id = Number(args[0]);
    if (!id) usage();
    console.log(`New token for user ${id}:\n  ${auth.resetToken(id)}`);
    break;
  }
  default:
    usage();
}
db.close();
