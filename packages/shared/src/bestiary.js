/**
 * The DM's bestiary and people (server creatures.js, page creatures.js): a
 * saved creature is either a kind of creature (Goblin, Giant Shore Crab), kept
 * in the bestiary by its type and challenge, or a person (Mira the innkeeper,
 * the villain), kept under People. Friendly or hostile is separate (`kind`).
 */

export const CREATURE_GROUPS = ['creature', 'person'];

/** The 5e creature types, in the order the bestiary lists them. */
export const CREATURE_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];

/** A creature saved before people had their own place: friendly ones were people, the rest creatures. */
export const groupOf = (c) => (CREATURE_GROUPS.includes(c?.group) ? c.group : c?.kind === 'npc' ? 'person' : 'creature');

/**
 * The type a stat block gives on its size line ("*Medium undead, neutral evil*",
 * "Large beast", "Medium swarm of Tiny beasts" → beast), or ''.
 */
export function typeFromStats(text) {
  const head = String(text ?? '').split('\n').slice(0, 6).join(' ').toLowerCase();
  const m = /\b(?:tiny|small|medium|large|huge|gargantuan)(?:\s+or\s+\w+)?\s+(?:swarm of (?:tiny|small|medium|large) )?([a-z]+)/.exec(head);
  if (!m) return '';
  const word = m[1].replace(/s$/, '');
  return CREATURE_TYPES.includes(word) ? word : '';
}

/** The creature's type: the DM's own word, else its stat block's, else ''. */
export const creatureType = (c) => String(c?.type ?? '').trim().toLowerCase() || typeFromStats(c?.stats?.text);

/** A challenge rating as a number to sort by ("1/4" → 0.25, "2 (450 XP)" → 2), or null. */
export function challengeValue(challenge) {
  const m = /^\s*(\d+)(?:\s*\/\s*(\d+))?/.exec(String(challenge ?? ''));
  if (!m) return null;
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
}

/** Its challenge as written on a card ("1/4", "2"), or ''. */
export const challengeLabel = (challenge) => String(challenge ?? '').trim().split(/\s+/)[0] ?? '';
