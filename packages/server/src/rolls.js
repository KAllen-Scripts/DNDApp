/**
 * Dice rolls: the server decides every roll (a secure random number) and keeps
 * it in the campaign's roll log; `events` sends it live to whoever may see it
 * (routes/table.js). Rolls the server makes for something else, like spending
 * a hit die (rests.js), go through here too, so they're shared like any other.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { parseRoll, rollDice } from '@dndapp/shared/dice.js';
import { BadRequestError } from './store.js';

export const ROLL_VISIBILITY = ['party', 'dm', 'self'];

/** Who sees a roll: party = everyone in the campaign; dm = the DM (and whoever rolled); self = only whoever rolled. */
export const canSeeRoll = (r, a) => r.user_id === a.userId || r.visibility === 'party' || (r.visibility === 'dm' && a.role === 'dm');

export function createRolls({ db }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);

  const rollName = (cid, userId) =>
    db.prepare('SELECT COALESCE(m.character_name, u.name) AS name, m.role FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.campaign_id = ? WHERE u.id = ?').get(cid, userId) ?? {};

  return {
    events,

    /** A roll as the page gets it. */
    view(cid, r) {
      const who = rollName(cid, r.user_id);
      return { id: r.id, user_id: r.user_id, name: who.name ?? '?', from_dm: who.role === 'dm', visibility: r.visibility, label: r.label, result: typeof r.result === 'string' ? JSON.parse(r.result) : r.result, rolled_at: r.rolled_at };
    },

    /**
     * Roll, log and send it live. Returns what POST /roll returns: rollDice's
     * result plus `roll` (the logged roll as the page gets it).
     */
    roll(cid, userId, { notation, mode = 'normal', label = '', visibility = 'party' }) {
      let parsed;
      try {
        parsed = parseRoll(notation);
      } catch (err) {
        throw new BadRequestError(err.message);
      }
      const result = rollDice(parsed, { mode, random: (sides) => crypto.randomInt(1, sides + 1) });
      const rolled_at = new Date().toISOString();
      const id = Number(
        db.prepare('INSERT INTO rolls (campaign_id, user_id, visibility, label, result, rolled_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(cid, userId, visibility, label.trim(), JSON.stringify(result), rolled_at).lastInsertRowid,
      );
      const roll = { id, campaign_id: cid, user_id: userId, visibility, label: label.trim(), result, rolled_at };
      events.emit('roll', roll);
      return { ...result, roll: this.view(cid, roll) };
    },
  };
}
