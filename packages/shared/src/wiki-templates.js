/**
 * The wiki's starter templates (wiki space stage 5a): one per family, plus Clue and Arc for session prep. A
 * template gives a new page its kind, its sections (each with a writing prompt, shown as a placeholder) and its
 * facts (the prompt as the value's placeholder). The DM can make their own from these; theirs are wiki pages with
 * `template: true` (DM only, never in Ask, the views or a player's wiki).
 *
 * The Person template leads with the table card: what the DM needs while playing them.
 */
import { kindFamily, wikiKey } from './wiki.js';

const s = (heading, text, more = {}) => ({ heading, text, available: 'all', canon: 'true', ...more });
const f = (label, value, more = {}) => ({ label, value, available: 'all', canon: 'true', ...more });
const dm = { available: 'dm', canon: 'planned' };

export const STARTER_TEMPLATES = [
  {
    id: 'starter-person', title: 'Person', kind: 'npc',
    sections: [
      s('At the table', 'Voice and manner: how they talk, a habit, a look. What they want right now. What they know. What they would trade, and for what.', dm),
      s('', 'Who they are, as the players would describe them.'),
      s('Story', 'Where they came from and what has happened to them.'),
      s('Secrets', 'What they hide, and who else knows.', dm),
    ],
    facts: [f('Race', 'Half-elf, dwarf…'), f('Role', 'Innkeeper, priest, spy…'), f('Where they are', '[[A place]]'), f('Allegiance', '[[A faction]]'), f('Status', 'Alive, missing, dead…')],
  },
  {
    id: 'starter-place', title: 'Place', kind: 'place',
    sections: [s('', 'What the players see, hear and smell when they arrive.'), s('People', 'Who lives or works here: [[links]] to their pages.'), s('History', 'What happened here before.'), s('Hidden', 'What is here that the players haven\'t found.', dm)],
    facts: [f('Type', 'Town, ruin, tavern…'), f('Region', '[[A region]]'), f('Ruler', '[[Someone]]'), f('Population', 'About how many')],
  },
  {
    id: 'starter-faction', title: 'Faction', kind: 'faction',
    sections: [s('', 'What they are known for, in a line or two.'), s('Goals', 'What they want, and what they\'ll do to get it.'), s('Members', 'Who is in it: [[links]].'), s('Plans', 'What they are doing now, out of sight.', dm)],
    facts: [f('Leader', '[[Someone]]'), f('Base', '[[A place]]'), f('Goals', 'In a few words'), f('Allies', '[[Another faction]]'), f('Enemies', '[[Another faction]]')],
  },
  {
    id: 'starter-item', title: 'Item', kind: 'item',
    sections: [s('', 'What it looks like and what it does.'), s('History', 'Who made it and who has carried it.'), s('Secrets', 'What it really does, or what it costs.', dm)],
    facts: [f('Type', 'Weapon, ring, tome…'), f('Rarity', 'Common to legendary'), f('Owner', '[[Someone]]'), f('Where it is', '[[A place]]')],
  },
  {
    id: 'starter-creature', title: 'Creature', kind: 'creature',
    sections: [s('', 'What it looks like and how it behaves.'), s('Lore', 'What the stories say about it.'), s('In a fight', 'How it fights and what it fears.', dm)],
    facts: [f('Type', 'Beast, undead, fiend…'), f('Habitat', '[[A place]]'), f('Danger', 'How deadly')],
  },
  {
    id: 'starter-quest', title: 'Quest', kind: 'quest',
    sections: [s('', 'What the party was asked to do, and by whom.'), s('Leads', 'What they know so far and where it points.'), s('The truth', 'What is really going on.', dm)],
    facts: [f('Given by', '[[Someone]]'), f('Status', 'Open, done, failed…'), f('Reward', 'What was promised')],
  },
  {
    id: 'starter-session', title: 'Session', kind: 'session',
    sections: [s('', 'What happened, in a few lines.'), s('Highlights', 'The moments worth remembering.'), s('Loose ends', 'What is still open after tonight.')],
    facts: [f('Played on', 'The real date'), f('Where', '[[A place]]'), f('Who was there', 'The players')],
  },
  {
    id: 'starter-lore', title: 'Lore', kind: 'lore',
    sections: [s('', 'The story, as people tell it.'), s('What is true', 'What really happened.', dm)],
    facts: [f('When', 'Long ago, 300 years ago…'), f('Related to', '[[A page]]')],
  },
  {
    id: 'starter-clue', title: 'Clue', kind: 'clue',
    sections: [s('', 'What the players find: the clue itself, as they would see it.', dm), s('Points to', 'What it reveals, and which [[pages]] it leads to.', dm), s('Where to find it', 'Every place it could turn up (three is safer than one).', dm)],
    facts: [f('Found', 'Not yet, or when and by whom', dm), f('Leads to', '[[A page]]', dm)],
  },
  {
    id: 'starter-arc', title: 'Arc', kind: 'arc',
    sections: [s('', 'The story this arc tells, in a line.', dm), s('Beats', 'What could happen, in roughly the order it might.', dm), s('Clues', '[[Clue pages]] that lead the players through it.', dm), s('How it could end', 'The endings you can see, good and bad.', dm)],
    facts: [f('Status', 'Not started, under way, done', dm), f('Villain', '[[Someone]]', dm)],
  },
].map((t) => ({ ...t, template: true, builtin: true, family: kindFamily(t.kind) }));

/** The starter or DM template that a new page of this kind starts from: theirs first, then the starter for the family. */
export function templateFor(kind, own = []) {
  const k = wikiKey(kind);
  if (!k) return null;
  const family = kindFamily(kind);
  return own.find((t) => wikiKey(t.kind) === k)
    ?? STARTER_TEMPLATES.find((t) => wikiKey(t.kind) === k)
    ?? own.find((t) => kindFamily(t.kind) === family)
    ?? STARTER_TEMPLATES.find((t) => t.family === family)
    ?? null;
}

/** A new page's fields from a template: its kind, its sections and facts empty with the prompts beside them. */
export function fromTemplate(t) {
  return {
    kind: t.kind,
    sections: t.sections.map((x) => ({ heading: x.heading, text: '', prompt: x.text, available: x.available, canon: x.canon, from_template: true })),
    facts: t.facts.map((x) => ({ label: x.label, value: '', prompt: x.value, available: x.available, canon: x.canon })),
  };
}
