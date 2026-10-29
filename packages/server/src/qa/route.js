/**
 * Which way Ask answers a question, decided without the AI (owner, 2026-10-21:
 * "Ask is way too slow… Maybe it is being too thorough for some stuff?").
 *
 *   quick: a general D&D lookup ("What's that dnd item that is a bag you can
 *          pull summons out of?", "What does Bless do?"). Lower effort, no
 *          archivist guide or pinned records, a small search of the records,
 *          the books only when the exact wording or numbers matter, a short
 *          answer.
 *   full:  anything about the campaign, or that might be: the old way.
 *
 * Quick only when something says it's a D&D question (a rules word such as
 * "spell", "item" or "stat block", or "what is a…", "how does … work", "what
 * does … do") and nothing points at the campaign: no "we", "our", "party",
 * "session", "the DM"…, no "I did / my …" ("can I", "do I" are rules
 * questions), no who / where / when / why, nothing in the past tense, and no
 * name of a record, wiki page, character or creature this asker can see.
 * When unsure it goes the full way, so a campaign question never loses its
 * research; the asker can also pick either way themselves.
 */

// Words that point at the group's game.
const CAMPAIGN_WORDS = /\b(we|we're|we've|we'd|us|our|ours|ourselves|party|party's|session|sessions|campaign|last time|earlier|yesterday|tonight|remember|recap|dm|dm's|dungeon master|npc|npcs|quest|quests|owe|owes|owed|everyone|guys)\b/i;
// First person in a rules question ("can I", "do I", "if I") is about the rules, not the campaign.
const RULES_FIRST_PERSON = /\b(can|could|do|does|may|might|must|should|would|will|am|if|when|how|what|whether|so|once|before|after|while|until|unless|then)\s+(i|i'm)\b/gi;
const FIRST_PERSON = /\b(i|i'm|i've|i'd|me|my|mine|myself)\b/i;
// About people, places and things that happened: rules questions are in the present tense.
const WHO_WHERE = /^\W*(who|whom|whose|where|when|why)\b/i;
const PAST = /\b(was|were|did|didn't|had|happened|said|told|gave|took|went|found|met|saw|left|killed|fought|bought|sold|got|asked|promised|ago)\b/i;

// Something that says it's a D&D question.
const DND_WORDS = new RegExp(
  `\\b(${[
    "d&d", 'dnd', '5e', '5\\.5e', '2014', '2024', 'rules?', 'ruling', 'rulebooks?', 'phb', "player's handbook", 'players handbook', 'dmg', 'monster manual',
    'spells?', 'cantrips?', 'ritual', 'concentration', 'spell ?slots?', 'feats?', 'conditions?', 'monsters?', 'creatures?', 'stat ?blocks?', 'challenge rating', 'cr',
    'class(es)?', 'subclass(es)?', 'races?', 'species', 'backgrounds?', 'weapons?', 'armou?r', 'mastery', 'masteries', 'magic items?', 'items?', 'potions?',
    'bonus actions?', 'actions?', 'reactions?', 'attacks?', 'damage', 'saving throws?', 'saves?', 'ability checks?', 'skill checks?', 'checks?', 'advantage', 'disadvantage',
    'proficiency', 'proficient', 'hit points?', 'hp', 'hit dice', 'ac', 'dc', 'levels?', 'level up', 'multiclass(ing)?', 'initiative', 'grappl(e|ed|ing)', 'prone',
    'exhaustion', 'opportunity attacks?', 'cover', 'short rest', 'long rest', 'summon(s|ed|ing)?', 'familiars?', 'wild shape', 'sneak attack', 'rage', 'smite',
    'inspiration', 'darkvision', 'resistance', 'immunity', 'vulnerability',
  ].join('|')})\\b`,
  'i',
);
// "What is a beholder?", "What does Bless do?", "How does grappling work?"
const DND_SHAPES = /^\W*(what(?:'s| is| are)\s+(a|an)\b|what\s+(does|do)\b.+\bdo\b|how\s+(does|do)\b.+\bwork\b)/i;

/** A name's words, for matching it in a question. */
const words = (s) => ` ${String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').trim()} `;

/** Names this short would match everything. */
const usableName = (name) => words(name).trim().length >= 4;

/**
 * @param {string} question
 * @param {{ names?: string[], mode?: 'auto' | 'quick' | 'thorough', previous?: string | null }} [opts]
 *   names: records, wiki pages, characters and the DM's creatures the asker can see;
 *   mode: the asker's own pick (auto unless they pressed one of the buttons);
 *   previous: how the last question in this conversation was answered.
 * @returns {{ path: 'quick' | 'full', reason: string }}
 */
export function routeQuestion(question, { names = [], mode = 'auto', previous = null } = {}) {
  if (mode === 'thorough') return { path: 'full', reason: 'asked for a thorough answer' };
  if (mode === 'quick') return { path: 'quick', reason: 'asked for a quick answer' };
  const q = String(question ?? '');
  const full = (reason) => ({ path: 'full', reason });
  // A follow-up in a campaign conversation stays there ("and what did he want?").
  if (previous === 'full') return full('follows a campaign question');
  if (CAMPAIGN_WORDS.test(q)) return full(`campaign word "${CAMPAIGN_WORDS.exec(q)[0]}"`);
  if (FIRST_PERSON.test(q.replace(RULES_FIRST_PERSON, ' '))) return full('about the asker');
  if (WHO_WHERE.test(q)) return full('who, where, when or why');
  if (PAST.test(q)) return full('about something that happened');
  const text = words(q);
  const named = names.find((n) => usableName(n) && text.includes(words(n)));
  if (named) return full('names something in the campaign');
  if (DND_WORDS.test(q) || DND_SHAPES.test(q)) return { path: 'quick', reason: 'general D&D question' };
  return full('not clearly a general D&D question');
}

/**
 * Which model answers (owner, 2026-10-28: "could we quickly decide if it's
 * stored in the data we have, or needs looking up, then assign a fast model
 * if we have it, or more intelligent model if we don't?"). Decided without
 * the AI, after the automatic search, so it costs nothing:
 *
 *   fast: the quick way (a general D&D lookup), or a campaign question that
 *         names something the automatic search found a record or wiki page
 *         for ("What does Brother Hal want?" with Brother Hal's record in
 *         front of the model).
 *   main: anything else (it needs digging: transcripts, several records, the
 *         books), and whenever the asker pressed "Look it up properly".
 *
 * The fast model still has every tool, so it can look further when the
 * record isn't enough.
 *
 * @param {string} question
 * @param {{ path: 'quick' | 'full' }} route  routeQuestion's answer
 * @param {{ mode?: 'auto' | 'quick' | 'thorough', found?: string[], fast?: string | null }} [opts]
 *   found: titles of the records and wiki pages the automatic search put in front of the model;
 *   fast: the fast model (config.qa.fastModel), null when it's turned off.
 * @returns {{ model: 'fast' | 'main', reason: string }}
 */
export function pickModel(question, route, { mode = 'auto', found = [], fast = null } = {}) {
  if (!fast) return { model: 'main', reason: 'no fast model set' };
  if (mode === 'thorough') return { model: 'main', reason: 'asked for a thorough answer' };
  if (route.path === 'quick') return { model: 'fast', reason: 'general D&D question' };
  const text = words(question);
  const hit = found.find((t) => usableName(t) && text.includes(words(t)));
  if (hit) return { model: 'fast', reason: 'the records have it' };
  return { model: 'main', reason: 'needs looking up' };
}
