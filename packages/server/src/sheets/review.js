/**
 * Review a character sheet: is it valid for its level, class, race and the
 * campaign's rules edition? Run only when the player asks (a button), since
 * the second half costs an AI call.
 *
 *   1. Rules checks worked out here, free and instant (sheetChecks): levels,
 *      XP, ability scores, multiclass prerequisites, spells above the
 *      character's slots, expertise, and numbers the player typed over the
 *      automatic ones (proficiency bonus, slots, saves, hit points).
 *   2. The AI reads the rest of the sheet (class features by level, subclass,
 *      racial traits, skill and spell counts, feats and ability increases,
 *      gear proficiencies) against the group's books, and looks things up
 *      online only when the books don't cover them (a few searches at most).
 *
 * Only the player's own sheet is read, and nothing is saved.
 */
import { z } from 'zod';
import { ABILITIES, ABILITY_NAMES, CLASSES, SKILLS, abilityMod, classKey, computeSheet } from '@dndapp/shared/sheet.js';
import { MULTICLASS } from '@dndapp/shared/level-up.js';
import { bookTools } from '../qa/tools.js';

/** Total XP needed for each level (PHB, both editions). */
export const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const RULES = "The sheet's rules";

/**
 * The checks that need no AI. Each finding: { severity: 'problem' (against
 * the rules as written) | 'check' (may be fine: a feat, item or the DM may
 * explain it), area, message, source }.
 */
export function sheetChecks(sheet) {
  const calc = computeSheet(sheet);
  const out = [];
  const add = (severity, area, message) => out.push({ severity, area, message, source: RULES });
  const classes = (sheet.classes ?? []).filter((c) => c.name?.trim()).map((c) => ({ ...c, level: c.level || 1, key: classKey(c.name) }));
  const total = classes.reduce((n, c) => n + c.level, 0);

  if (!classes.length) add('problem', 'Class', 'No class is filled in, so nothing can be worked out for its level.');
  if (total > 20) add('problem', 'Level', `The class levels add up to ${total}; a character can't go past level 20.`);

  // XP (only when it's a number: groups that level by milestones leave it empty or write "milestone").
  const xp = /^\s*[\d,. ]+\s*(xp)?\s*$/i.test(sheet.xp ?? '') ? Number(String(sheet.xp).replace(/[^\d]/g, '')) : null;
  if (xp != null && total >= 1 && total <= 20) {
    const earned = XP_FOR_LEVEL.findLastIndex((need, l) => l >= 1 && xp >= need);
    if (earned !== total) {
      add('check', 'Experience', earned > total
        ? `${xp.toLocaleString('en')} XP is enough for level ${earned}, but the sheet is level ${total}. Time to level up?`
        : `Level ${total} needs ${XP_FOR_LEVEL[total].toLocaleString('en')} XP; the sheet has ${xp.toLocaleString('en')}. Fine if your group levels by milestones.`);
    }
  }

  for (const a of ABILITIES) {
    const score = Number(sheet.abilities?.[a] ?? 10);
    if (score > 20) add('check', 'Ability scores', `${ABILITY_NAMES[a]} is ${score}. Scores stop at 20 unless a feature or item says otherwise (a magic item worn is counted for you, so type the score without it).`);
    else if (score < 3) add('check', 'Ability scores', `${ABILITY_NAMES[a]} is ${score}, lower than any way of making a character gives.`);
  }

  // Multiclassing: 13 in the abilities of every class the character has.
  if (classes.length > 1) {
    for (const c of classes) {
      const need = c.key && MULTICLASS[c.key];
      if (!need) continue;
      const score = (a) => Number(sheet.abilities?.[a] ?? 10);
      const ok = need.all ? need.all.every((a) => score(a) >= 13) : need.any.some((a) => score(a) >= 13);
      if (!ok) {
        const names = (need.all ?? need.any).map((a) => ABILITY_NAMES[a]).join(need.all ? ' and ' : ' or ');
        add('problem', 'Multiclassing', `Multiclassing with ${CLASSES[c.key].name} needs ${names} of 13 or more.`);
      }
    }
  }

  // Spells above anything the character can cast (a feat, race or item can still give one).
  const slotLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => calc.auto[`slots.${n}`] > 0);
  const highest = Math.max(0, ...slotLevels, calc.auto.pact_level ?? 0);
  const tooHigh = (sheet.spells ?? []).filter((s) => s.level > highest);
  if (tooHigh.length) {
    const names = tooHigh.slice(0, 5).map((s) => `${s.name || 'an unnamed spell'} (${ordinal(s.level)})`).join(', ');
    add('check', 'Spells', `${highest ? `The highest spell slots are ${ordinal(highest)} level` : 'The character has no spell slots'}, but the sheet has ${names}${tooHigh.length > 5 ? ` and ${tooHigh.length - 5} more` : ''}. Fine only if a feat, race or item gives ${tooHigh.length === 1 ? 'it' : 'them'}.`);
  }

  // Expertise: rogues and bards (and a few features and feats).
  const expert = Object.entries(sheet.skills ?? {}).filter(([, p]) => p === 'expertise').map(([k]) => SKILLS[k].name);
  if (expert.length && !classes.some((c) => (c.key === 'rogue') || (c.key === 'bard' && c.level >= 3) || (c.key === 'ranger' && c.level >= 9))) {
    add('check', 'Skills', `Expertise in ${expert.join(', ')}, but none of the classes give expertise at these levels. Fine if a feat or feature does (Skill Expert, Prodigy).`);
  }

  // Numbers typed over the automatic ones.
  const own = sheet.overrides ?? {};
  if ('proficiency_bonus' in own && own.proficiency_bonus !== calc.auto.proficiency_bonus) {
    add('problem', 'Proficiency bonus', `The sheet says +${own.proficiency_bonus}; at level ${calc.level} it is +${calc.auto.proficiency_bonus}.`);
  }
  const slotDiffs = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => `slots.${n}` in own && own[`slots.${n}`] !== calc.auto[`slots.${n}`]);
  if (slotDiffs.length) {
    add('check', 'Spell slots', `Typed-in slots differ from the class tables: ${slotDiffs.map((n) => `${ordinal(n)} level ${own[`slots.${n}`]} (the table gives ${calc.auto[`slots.${n}`]})`).join(', ')}.`);
  }
  if ('pact_slots' in own && own.pact_slots !== calc.auto.pact_slots) {
    add('check', 'Spell slots', `Pact Magic slots typed as ${own.pact_slots}; the warlock table gives ${calc.auto.pact_slots}.`);
  }
  const saves = ABILITIES.filter((a) => `save_prof.${a}` in own && own[`save_prof.${a}`] !== calc.auto[`save_prof.${a}`]);
  if (saves.length) {
    add('check', 'Saving throws', `Saving throw proficiencies changed by hand: ${saves.map((a) => `${ABILITY_NAMES[a]} ${own[`save_prof.${a}`] ? 'added' : 'removed'}`).join(', ')}. Your first class gives the saves; a feat (Resilient) or feature can add one.`);
  }
  if ('hp_max' in own && classes.length) {
    // The most the dice can give: the biggest roll on every hit die, plus Constitution.
    const con = abilityMod(calc.scores.con) + (/hill\s*dwarf/i.test(sheet.race ?? '') ? 1 : 0);
    const most = classes.reduce((n, c) => n + c.level * Math.max(1, (CLASSES[c.key]?.hitDie ?? 8) + con), 0);
    if (own.hp_max > most) {
      add('check', 'Hit points', `Maximum hit points are ${own.hp_max}, more than the most the hit dice can give (${most}). Fine if a feat or feature adds some (Tough, Draconic Resilience).`);
    }
  }
  return out;
}

/** The parts of the sheet that rules apply to, as text for the AI (not the backstory or looks). */
export function sheetForReview(sheet) {
  const calc = computeSheet(sheet);
  const classes = (sheet.classes ?? []).filter((c) => c.name?.trim());
  const line = (label, v) => (v && String(v).trim() ? `${label}: ${String(v).trim()}` : '');
  const skills = Object.entries(sheet.skills ?? {}).map(([k, p]) => `${SKILLS[k].name}${p === 'expertise' ? ' (expertise)' : ''}`);
  const own = Object.keys(sheet.overrides ?? {}).filter((k) => k in calc.auto);
  return [
    line('Name', sheet.name),
    line('Race', sheet.race),
    line('Background', sheet.background),
    `Classes: ${classes.map((c) => `${c.name} ${c.level || 1}${c.subclass ? ` (${c.subclass})` : ''}`).join(' / ') || 'none'}; level ${calc.level}`,
    line('XP', sheet.xp),
    `Ability scores (as typed, before magic items): ${ABILITIES.map((a) => `${ABILITY_NAMES[a]} ${sheet.abilities?.[a] ?? 10}`).join(', ')}`,
    `Saving throw proficiencies: ${ABILITIES.filter((a) => calc.values[`save_prof.${a}`]).map((a) => ABILITY_NAMES[a]).join(', ') || 'none'}`,
    `Skill proficiencies: ${skills.join(', ') || 'none'}`,
    `Hit points: max ${calc.values.hp_max ?? '?'}; hit dice ${calc.values.hit_dice || '?'}; AC ${calc.values.ac}; speed ${calc.values.speed} ft.`,
    own.length ? `Numbers the player typed over the automatic ones: ${own.map((k) => `${k} ${JSON.stringify(sheet.overrides[k])} (automatic ${JSON.stringify(calc.auto[k])})`).join('; ')}` : '',
    line('Proficiencies and languages', sheet.proficiencies_languages),
    line('Features and traits', sheet.features),
    line('More features', sheet.additional_features),
    sheet.spells?.length
      ? `Spells (${sheet.spellcasting?.class ? `casting as ${sheet.spellcasting.class}` : 'spellcasting class not chosen'}):\n${sheet.spells.map((s) => `- ${s.name} (${s.level ? `${ordinal(s.level)} level` : 'cantrip'}${s.prepared ? ', prepared' : ''}${s.source === 'custom' ? ", the player's own homebrew" : ''})`).join('\n')}`
      : 'Spells: none',
    sheet.inventory?.length
      ? `Gear:\n${sheet.inventory.map((g) => `- ${g.name}${g.qty > 1 ? ` ×${g.qty}` : ''}${g.equipped ? ', equipped' : ''}${g.weapon || g.armor ? (g.proficient ? ', proficient' : ', not proficient') : ''}${g.attuned ? ', attuned' : ''}`).join('\n')}`
      : line('Equipment', sheet.equipment),
    sheet.attacks?.length ? `Attacks typed in: ${sheet.attacks.map((a) => a.name).filter(Boolean).join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

const Finding = z.object({
  severity: z.enum(['problem', 'check']).describe('problem: against the rules as written. check: might be fine (a feat, item, house rule or the DM could explain it), worth a look'),
  area: z.string().describe('A word or two: Class features, Spells, Skills, Race, Feats, Equipment…'),
  message: z.string().describe("One or two plain sentences: what's wrong and what the rules say instead"),
  source: z.string().describe('Where the rule is: "Player\'s Handbook (2014) p. 72", a web page\'s address, or "AI\'s knowledge"'),
});
const Review = z.object({
  summary: z.string().describe('One or two sentences: does the sheet look valid overall?'),
  findings: z.array(Finding).max(30).describe("Every problem found, most important first. Empty if it's all fine."),
});

const SYSTEM = `You check a player's D&D 5th edition character sheet against the rules, for the group's online table. Find what isn't valid for the character's level, classes, subclass, race and background, so the player can fix it before the DM finds it.

Check, as far as the sheet says: class and subclass features for each class level (missing ones, ones from a higher level, a subclass picked too early); racial traits; skill proficiencies (how many the class, background and race give, and from which lists); saving throws; armour and weapon proficiencies, and gear used without them; feats and ability score increases for the level; ability scores that couldn't come from the standard ways of making a character; spells (on the class's list, how many cantrips and spells known or prepared for the level, spells above what the character can cast); anything else a careful DM would notice.

How to work:
- Some checks have already been done by the server (listed in <already_checked>); don't repeat them.
- When the group's books are listed, look the rules up in them with search_books, read_book and book_contents; they're what the group plays by, and your memory mixes editions. Search for several things in one turn.
- Only when the books don't cover something (a class or race from a book they don't have), use look_up_online, sparingly: it's slow. With no books, use your own knowledge and look_up_online only for what you aren't sure of.
- Use the group's rules edition (below). The 2014 and 2024 rules differ (2024 backgrounds give the ability increases and an origin feat; species don't), so never mix them.
- Be fair: a sheet doesn't have to write every feature down, and homebrew marked as the player's own is the DM's business. Only report what's actually wrong or worth checking, never things that are fine, and never style.
- Finish by calling submit_review once, with every finding. Give the book and page (or web address) for each one.`;

/**
 * @param {object} opts
 * @param {object} opts.books  the group's rulebooks (sheets/books.js)
 * @param {object} opts.llm
 * @param {object} [opts.editions]  editions.js
 * @param {object} opts.config
 */
export function createSheetReview({ books, llm, editions = null, config }) {
  const S = config.sheets;

  return {
    checks: sheetChecks,

    /**
     * The AI half. Returns { summary, findings, lookups: { books, web } }.
     * beforeAi runs before the AI is called (a rate limit; throw to stop).
     */
    async ai(sheet, { campaignId, userId, beforeAi } = {}) {
      beforeAi?.();
      await books?.load();
      const shelf = books?.status().books ?? [];
      const edition = editions ? await editions.of(campaignId) : '2014';
      const already = sheetChecks(sheet);

      let submitted = null;
      let web = 0;
      const lookups = { books: 0, web: 0 };
      const tools = [
        ...(shelf.length ? bookTools(books).map((t) => ({ ...t, run: (input) => { lookups.books++; return t.run(input); } })) : []),
        {
          name: 'look_up_online',
          description: `Search the web for a rule the group's books don't cover (a class, subclass, race or feat from another book). Slow: at most ${S.reviewWebLookups} per review. Ask one precise question.`,
          schema: z.object({ question: z.string().min(3).max(300).describe('e.g. "D&D 5e 2014 Echo Knight fighter features by level"') }),
          run: async ({ question }) => {
            if (web >= S.reviewWebLookups) return `No more web lookups for this review. Use what you have and say where you're unsure.`;
            web++;
            lookups.web++;
            return llm.research({
              task: 'review',
              purpose: 'sheet-review:web',
              campaignId,
              userId,
              system: 'Find the D&D 5th edition rule asked about on the web. Answer briefly with the rule as published and the address of the page you found it on. Say if you found nothing reliable.',
              prompt: question,
              maxSearches: 3,
            });
          },
        },
        {
          name: 'submit_review',
          description: 'Give your review. Call once, at the end.',
          schema: Review,
          run: async (input) => {
            submitted = input;
            return 'Review received. Stop now.';
          },
        },
      ];

      const prompt = [
        shelf.length
          ? `<books note="The group's own rulebooks.">\n${shelf.map((b) => `- ${b.title} (${b.year ? `first printed ${b.year}, ` : ''}pages ${b.range})`).join('\n')}\n</books>`
          : '<books>The group has no rulebooks on the server: use your own knowledge, and look_up_online for what you aren\'t sure of.</books>',
        `The group's rules edition: ${edition}. (The sheet's automatic numbers follow the 2014 Player's Handbook.)`,
        `<already_checked>\n${already.map((f) => `- ${f.area}: ${f.message}`).join('\n') || 'Nothing found.'}\n</already_checked>`,
        `<sheet>\n${sheetForReview(sheet)}\n</sheet>`,
        'Review this sheet, then call submit_review.',
      ].join('\n\n');

      const { answer } = await llm.agent({
        task: 'review',
        purpose: 'sheet-review',
        campaignId,
        userId,
        system: SYSTEM,
        prompt,
        tools,
        limits: { maxToolCalls: S.reviewMaxToolCalls, maxCostUsd: S.reviewMaxCostUsd },
      });
      const review = submitted ? Review.parse(submitted) : { summary: (answer || '').trim().slice(0, 2000), findings: [] };
      return { ...review, lookups };
    },
  };
}
