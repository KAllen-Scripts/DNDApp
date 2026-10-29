/**
 * Which rules a campaign plays by: '2014' or '2024'. The DM picks it in the
 * campaign settings (shared/settings.js `edition`). Until they do: REST_RULES,
 * else the edition of the group's Player's Handbook in the books folder (when
 * it's exactly one), else 2014 like the sheet's rules. Rests, Ask's rules
 * answers and lookups in the books (spells, stat blocks, items) ask here.
 */
import { handbookEditions } from './books.js';

export function createEditions({ store, books = null, config }) {
  /** The edition for a campaign whose DM hasn't chosen one. */
  async function fallback() {
    if (config.sheets?.restRules) return config.sheets.restRules;
    if (!books) return '2014';
    await books.load();
    const editions = handbookEditions(books.status().books);
    return editions.length === 1 && editions[0] ? editions[0] : '2014';
  }

  return {
    fallback,
    /** The DM's choice, or null if they haven't made one. */
    chosen: (campaignId) => (campaignId ? store.getSettings(campaignId).edition : null),
    /**
     * The edition when it's known for sure: the DM's choice, REST_RULES, or
     * the group's one Player's Handbook; else null (Ask's book search then
     * looks in every book).
     */
    async known(campaignId) {
      const chosen = campaignId && store.getSettings(campaignId).edition;
      if (chosen) return chosen;
      if (config.sheets?.restRules) return config.sheets.restRules;
      if (!books) return null;
      await books.load();
      const editions = handbookEditions(books.status().books);
      return editions.length === 1 && editions[0] ? editions[0] : null;
    },
    /** The edition a campaign plays by. */
    async of(campaignId) {
      return (campaignId && store.getSettings(campaignId).edition) || fallback();
    },
  };
}
