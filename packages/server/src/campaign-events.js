/**
 * Things that happen in a campaign that other parts of the server react to,
 * so the part that makes them doesn't need to know who listens.
 *
 *   long-rest { campaignId, userIds, by, at }
 *     Characters finished a long rest (userIds: whose; at: ISO time).
 *     Merchants count it for restocking (merchants.js), treating rests close
 *     together as one party rest.
 */
import { EventEmitter } from 'node:events';

export function createCampaignEvents({ log = console } = {}) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  // A listener that throws mustn't break the request that emitted the event.
  const emit = events.emit.bind(events);
  events.emit = (name, payload) => {
    try {
      return emit(name, payload);
    } catch (err) {
      log.error?.(err);
      return true;
    }
  };
  return events;
}
