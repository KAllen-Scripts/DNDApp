/**
 * The DM's wiki, part 3: the plot. Quests (with a Status for the quest board), the clues waiting to be found,
 * the rumours (true, rumour and false), and the DM's prep: one arc and the plan for the first session. Nothing
 * here says what happened in play.
 */

/** Tamsin's last log entry, word for word (the transcript of session 1 reads it out). */
export const LOG_ENTRY = [
  '30th Deepwinter. Wind south-west, fog from the second bell. Burned four gallons. No ships seen.',
  'The oil is wrong again. Third cask from the Guild this month that smokes green and gutters by midnight. Seawater in it, I would swear to it, but the seals were whole. Silas Gorm brought it up himself.',
  'Heard the singing under the floor again at the turn of the tide. It is not the wind and it is not the pipes. There are words in it and I do not know them.',
  'Mistress Lindqvist says I am tired and ought to rest. Perhaps. But the cellar door has that mark on it again, the one like barnacles, and I scraped it off only yesterday.',
  'If anything happens to me: the Lantern is not where it should be. Ask the old woman in the mere. Wick, if you read this, go home to your mother.',
].join('\n\n');

/** The inscription over the inner door of the Drowned Chapel, in Old Varrish (read out in session 4). */
export const INSCRIPTION = [
  'I am lit by no hand and quenched by no sea.',
  'The drowned cannot see me; the lost look for me.',
  'Lift me up, keeper, where the water is deepest,',
  'and the stair that went down will give back what it keeps.',
].join('\n');

export const PLOT = [
  // ---------- prep ----------
  {
    title: 'Arc: Lanterns Out', kind: 'arc', available: 'dm',
    facts: [{ label: 'Status', value: 'Not started' }, { label: 'Sessions', value: 'About four' }],
    sections: [
      { heading: 'The arc', text: 'The party is hired to find out why the lighthouse at [[Lamplight Point]] went dark. They follow the trail from the lighthouse to the smugglers, from the smugglers to the marsh, and from the marsh back under the lighthouse, where the Choir means to wake the Saint Beneath at the new moon (11 Rimewane, Day 9).' },
      { heading: 'Beats', canon: 'planned', text: '1. Saltreach, the job, the empty lighthouse, the drowned. ([[The Missing Lamplighter]])\n2. The Gull Steps: the smugglers are victims too. ([[The Gullwing Bargain]])\n3. The Sallowmere: Tamsin, Mother Sallow and the truth about the chapel stair. ([[Mother Sallow\'s Price]])\n4. Under Lamplight Point at the new moon. ([[What Sleeps Under Lamplight Point]])' },
      { heading: 'Personal threads', canon: 'planned', text: '- **Bran:** [[Bran\'s Debt]] to Ilsabet Crane, due at the same new moon.\n- **Pip:** his sister Nell is a Gullwing.\n- **Wren:** the voice in the tide is the Saint Beneath, and it wants her.\n- **Oriel:** Saint Aubrel sent her for his Lantern.' },
    ],
  },
  {
    title: 'Session plan: The lights go out', kind: 'session plan', parent: 'Arc: Lanterns Out', available: 'dm',
    facts: [{ label: 'Played', value: '' }, { label: 'Where', value: '[[Saltreach]], [[Lamplight Point]]' }],
    sections: [
      { heading: 'Strong start', canon: 'planned', text: 'The party comes down the Old Coast Road at dusk on 3 Rimewane and sees the lighthouse dark, and a ship\'s lantern out on the bay heading for the Teeth.' },
      { heading: 'Scenes', canon: 'planned', text: '- Harbourmaster Brask and the job.\n- Shopping on the quay.\n- The Brined Eel: rumours, Crane\'s man finds Bran.\n- Wick on the harbour wall.\n- The empty lighthouse.\n- The drowned on the lighthouse track.' },
      { heading: 'Clues to give', canon: 'planned', text: '[[!Clue: Tamsin\'s last log entry]]\n\n[[!Clue: the barnacled sigil]]' },
    ],
  },
  // ---------- quests ----------
  {
    title: 'The Missing Lamplighter', kind: 'quest', parent: 'Arc: Lanterns Out', available: 'dm',
    facts: [{ label: 'Given by', value: '[[Odile Brask]]' }, { label: 'Status', value: 'Not started' }, { label: 'Reward', value: '25 gp each now, 100 gp each when done' }],
    sections: [
      { heading: 'The job', text: 'Find out why the light at Lamplight Point has gone dark, get it burning again, and find [[Tamsin Rook]], alive or dead.' },
      { heading: 'Leads', canon: 'planned', text: '- The lighthouse itself: the logbook, the bad oil, the sigil on the cellar door.\n- [[Wick]], who saw the lamp go green.\n- [[Gaffer Pell]], who heard Silas Gorm drunk.\n- The Watch blame the Gullwings (wrong).' },
    ],
  },
  {
    title: 'Bran\'s Debt', kind: 'quest', available: ['theo'],
    facts: [{ label: 'Given by', value: '[[Ilsabet Crane]]' }, { label: 'Status', value: 'Active' }, { label: 'Owed', value: '120 gp, due at the new moon (11 Rimewane)' }],
    sections: [
      { heading: 'The debt', text: 'Bran borrowed 120 gold pieces from Ilsabet Crane three years ago to pay the families of the *Kestrel*\'s crew. It falls due at the next new moon.' },
      { heading: 'What Crane will do', available: 'dm', text: 'Accept part payment, give a week\'s grace for a favour, and send two large men to collect if neither.' },
    ],
  },
  {
    title: 'The Gullwing Bargain', kind: 'quest', parent: 'Arc: Lanterns Out', available: 'dm',
    facts: [{ label: 'Given by', value: '[[Captain Saltjaw Merrow]]' }, { label: 'Status', value: 'Not offered yet' }, { label: 'Reward', value: 'One passage anywhere on the coast' }],
    sections: [
      { heading: 'The offer', canon: 'planned', text: 'If the party comes to the Gull Steps and doesn\'t start a fight they can\'t win, Saltjaw offers: **"Find who\'s putting out the light, and the Gullwings carry you anywhere on this coast, once, no coin and no questions."** As earnest he tears a page out of his ledger: [[!Clue: the Gullwing ledger page]]' },
    ],
  },
  {
    title: 'Mother Sallow\'s Price', kind: 'quest', parent: 'Arc: Lanterns Out', available: 'dm',
    facts: [{ label: 'Given by', value: '[[Mother Sallow]]' }, { label: 'Status', value: 'Not offered yet' }],
    sections: [
      { heading: 'The price', canon: 'planned', text: 'For Tamsin, her medicine and what Tamsin knows, Sallow asks: **"a lock of hair from each of you, and the next dream you have of the sea, Wren-child."** She has noticed the Saint\'s mark on Wren; she wants to know what it dreams.' },
      { heading: 'If they refuse', canon: 'planned', text: 'She lets them leave with Tamsin but no cure, and the hounds follow them to the edge of the mere.' },
    ],
  },
  {
    title: 'What Sleeps Under Lamplight Point', kind: 'mystery', parent: 'Arc: Lanterns Out', available: 'dm',
    facts: [{ label: 'Status', value: 'Not started' }, { label: 'Deadline', value: 'The new moon, 11 Rimewane (Day 9)' }],
    sections: [
      { heading: 'The truth', text: 'The [[The Choir of the Deep|Choir]] has been cutting the lighthouse oil with seawater so the light fails and ships wreck; the drowned feed the [[The Saint Beneath|Saint Beneath]]. At the new moon Corra will drown the [[item:Lantern of Saint Aubrel]] in [[The Drowned Chapel]] and wake it.' },
      { heading: 'How it can end', canon: 'planned', text: '- The party lifts the lit Lantern over the deepest water: the song breaks, the Saint sleeps, the drowned fall.\n- Corra, beaten, is taken by the Saint into the pool. Her fate is left open.\n- If the party fails, the whole bay floods on the next high tide.' },
    ],
    events: [{ when: { text: '11 Rimewane 1147' }, text: 'The Choir means to drown the Lantern at midnight.', canon: 'planned' }],
  },
  {
    title: 'The Wreck of the Merriweather', kind: 'hook', available: 'dm',
    facts: [{ label: 'Status', value: 'Rumoured' }, { label: 'Reward', value: 'The Merriweather\'s strongbox, if it\'s still there' }],
    sections: [{ heading: 'The hook', text: 'Twelve years ago the merchant galleon *Merriweather* went down off the Teeth with a strongbox of the Queen\'s silver. Divers have tried for it every summer since. An old diver in the Eel says he\'s found where she lies. (A spare hook, not part of the arc.)' }],
    events: [{ when: { text: '12 years ago' }, text: 'The Merriweather sinks off the Teeth.' }],
  },
  // ---------- clues ----------
  {
    title: 'Clue: Tamsin\'s last log entry', kind: 'clue', available: 'dm', picture: 'tamsins-logbook.jpg',
    facts: [{ label: 'Where', value: 'The lamp-room desk, [[Lamplight Point]]' }, { label: 'Points to', value: '[[Lamplighters\' Guild]], [[Mother Sallow]]' }],
    sections: [{ heading: 'The entry', text: LOG_ENTRY }],
  },
  {
    title: 'Clue: the barnacled sigil', kind: 'clue', available: 'dm',
    facts: [{ label: 'Where', value: 'The cellar door at Lamplight Point; inside the lower lip of every Choir member' }, { label: 'Points to', value: '[[The Choir of the Deep]]' }],
    sections: [{ heading: 'The sigil', text: 'A closed eye inside a ring of small barnacle-like circles, scratched into the wood. A DC 13 Intelligence (Religion) check: it is the sign of something worshipped on the old coast before the Reckoning, a "saint beneath the sea". Brother Aldous can say the same.' }],
  },
  {
    title: 'Clue: the Gullwing ledger page', kind: 'clue', available: 'dm', picture: 'gullwing-ledger.jpg',
    facts: [{ label: 'Where', value: 'Saltjaw\'s ledger, [[The Gull Steps]]' }, { label: 'Points to', value: '[[Corra Lindqvist]], [[Varrowgate]]' }],
    sections: [{ heading: 'The page', text: 'Six shipments since Greyfall of "lamp oil, sea-grade, 10 casks", delivered to the Guild warehouse on the north pier, paid in Guild silver and signed **C.L.** Two more, in Tidesong and Netmend last year, marked "on to Varrowgate, the hall cellars".' }],
  },
  {
    title: 'Clue: the chapel inscription', kind: 'clue', available: 'dm',
    facts: [{ label: 'Where', value: 'Over the inner door of [[The Drowned Chapel]]' }, { label: 'Language', value: 'Old Varrish' }],
    sections: [
      { heading: 'The words', text: INSCRIPTION },
      { heading: 'The answer', text: 'A light: the Lantern of Saint Aubrel. Lift it, lit, over the pool in the sanctum (the deepest water) and the Choir\'s song breaks.' },
    ],
  },
  // ---------- rumours ----------
  {
    title: 'Rumours in Saltreach', kind: 'lore', available: 'all', tags: ['rumours'],
    facts: [
      { label: 'Saltjaw', value: 'Saltjaw Merrow killed Tamsin to keep the light dark for a landing.', canon: 'false', truth: 'Saltjaw lost two boats himself and liked Tamsin.' },
      { label: 'Lindqvist', value: 'Mistress Lindqvist has never told a lie in her life.', canon: 'false', truth: 'She misleads constantly; she just avoids outright lies.' },
      { label: 'The cellar', value: 'The lighthouse cellar floods at the new moon.', canon: 'true' },
      { label: 'The drowned', value: 'Dead sailors have been seen walking out of the fog on the lighthouse track.', canon: 'true' },
      { label: 'The Watch', value: 'Sergeant Reeve takes Gullwing money.', canon: 'rumour' },
      { label: 'The Lantern', value: 'The Lantern of Saint Aubrel was stolen from the lighthouse years ago.', canon: 'rumour' },
      { label: 'The witch', value: 'The witch of the mere eats children.', canon: 'false', truth: 'She doesn\'t, though she has threatened to.' },
    ],
    sections: [{ heading: 'What people say', text: 'What the fishermen, dockhands and drinkers of Saltreach say about the dark lighthouse and everything else. Some of it is true.' }],
  },
];
