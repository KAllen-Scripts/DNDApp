/**
 * The example campaign: its name, the test accounts, its settings and glossary.
 * Everything here is setup a DM does before play. Nothing that happens in play is
 * written anywhere but the transcripts (example/transcripts).
 */

export const CAMPAIGN = 'The Lanterns of Saltreach';

/** The admin login for the example data (the DM, test-rowan, uploads the transcripts). */
export const ADMIN = 'test-admin';

/**
 * The accounts. `speaker` is the name each one has in the transcripts (their Discord name);
 * `character` is filled in from the active sheet.
 */
export const ACCOUNTS = [
  { key: 'rowan', name: 'test-rowan', role: 'dm', speaker: 'Rowan' },
  { key: 'mags', name: 'test-mags', role: 'player', speaker: 'Mags', character: 'Wren Ashdown' },
  { key: 'theo', name: 'test-theo', role: 'player', speaker: 'Theo', character: 'Bran Hale' },
  { key: 'jules', name: 'test-jules', role: 'player', speaker: 'Jules', character: 'Pip Thistlewood' },
  { key: 'priya', name: 'test-priya', role: 'player', speaker: 'Priya', character: 'Oriel Vane' },
];

// The Tide Reckoning, the calendar of the Greyhallow Coast. Day 1 of the clock is 3 Rimewane 1147 AR.
const MONTHS = ['Rimewane', 'Saltmoot', 'Gullsfall', 'Kelpwake', 'Tidesong', 'Brightwater', 'Highsun', 'Netmend', 'Stormturn', 'Greyfall', 'Fogmere', 'Deepwinter'];
const YEAR = 1147;
// Hesk, the moon, is new on 11 Rimewane 1147 (Day 9 of the clock), the night the chapel stair shows.
// The calendar counts a moon's days from the first day of year 0: 1147 years of 360 days, plus 10 days, less half a month.
const NEW_MOON_DAY = YEAR * 360 + 10;

export const SETTINGS = {
  edition: '2014',
  weight: 'capacity',
  travel: { time: 'clock', roads: true, terrain: true, vehicles: true, marches: true, encounters: true },
  calendar: {
    preset: 'custom',
    name: 'The Tide Reckoning',
    months: MONTHS.map((name) => ({ name, days: 30 })),
    weekdays: ['Anchorday', 'Netday', 'Sailday', 'Hookday', 'Tideday', 'Restday'],
    weekday: 4,
    start: { year: YEAR, month: 0, day: 3 },
    era: 'AR',
    moons: [{ name: 'Hesk', days: 28, full: NEW_MOON_DAY - 14 }],
    seasons: [
      { name: 'Winter', month: 11, day: 1 },
      { name: 'Spring', month: 2, day: 1 },
      { name: 'Summer', month: 5, day: 1 },
      { name: 'Autumn', month: 8, day: 1 },
    ],
    holidays: [
      { name: 'Lantern Night', month: 10, day: 15 },
      { name: 'The Blessing of the Boats', month: 3, day: 1 },
      { name: 'Reckoning Day', month: 0, day: 1 },
    ],
  },
  backgrounds: [
    {
      name: 'Lamplighter',
      skills: ['investigation', 'religion'],
      tools: "Tinker's tools",
      languages: 'One of your choice',
      equipment: "A hooded lantern, a flask of lamp oil, tinker's tools, a set of common clothes and a belt pouch",
      gold: 10,
      feature: {
        name: 'Keeper of the Flame',
        text: 'Lamplighters, lighthouse keepers and the faithful of Saint Aubrel recognise your oath-mark. They will give you a dry place to sleep, a meal and news of the coast, and will not lie to you about the state of a light.',
      },
    },
  ],
};

/**
 * Spellings that speech-to-text gets wrong. Some names that the transcripts mangle are left out on purpose
 * (Thistlewood, Aubrel, Brask) so we can see how the archivist copes without help.
 */
export const GLOSSARY = [
  { term: 'Saltreach', variants: ['salt reach', 'salt-reach', 'saltreech'] },
  { term: 'Lindqvist', variants: ['lindquist', 'lind quist', 'linkvist'], note: 'Corra Lindqvist, head of the Lamplighters\' Guild' },
  { term: 'Sallowmere', variants: ['shallow mere', 'sallow mere', 'sallowmeer'] },
  { term: 'Greyhallow', variants: ['grey hollow', 'gray hollow', 'greyhollow'] },
  { term: 'Gullwings', variants: ['gull wings', 'gulwings'], note: 'the smugglers' },
  { term: 'Brined Eel', variants: ['brine deal', 'brine eel', 'brined deal'], note: 'the tavern' },
  { term: 'Fenwick', variants: ['fen wick', 'fenwic'] },
  { term: 'Hesk', variants: ['hesque', 'hessk'], note: 'the moon' },
  { term: 'Saltjaw', variants: ['salt jaw', 'salt-jaw'] },
  { term: 'Varrowgate', variants: ['barrow gate', 'varrow gate'] },
];
