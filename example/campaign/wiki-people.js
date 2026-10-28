/**
 * The DM's wiki, part 2: the people of the coast. Public faces are open to the players; motives and secrets
 * are the DM's. See wiki-world.js for the fields.
 */

const person = (title, { race, role, where, allegiance, status = 'Alive', ...rest }) => ({
  title,
  kind: 'npc',
  ...rest,
  facts: [
    { label: 'Race', value: race },
    { label: 'Role', value: role },
    { label: 'Where they are', value: where },
    ...(allegiance ? [{ label: 'Allegiance', value: allegiance }] : []),
    { label: 'Status', value: status },
    ...(rest.facts ?? []),
  ],
});

export const PEOPLE = [
  person('Odile Brask', {
    race: 'Human', role: 'Harbourmaster of Saltreach', where: 'The harbourmaster\'s office, [[Saltreach Harbour]]', allegiance: 'The Crown',
    available: 'all', picture: 'odile-brask.jpg', aliases: ['Harbourmaster Brask', 'the harbourmaster'],
    sections: [
      { heading: 'Who she is', text: 'A square, weathered woman of fifty in a salt-stained blue coat, who was a ship\'s mate for twenty years before the Crown gave her the harbour. Blunt, fair, short of patience and short of money.' },
      { heading: 'What she wants', text: 'The light burning again before another ship goes onto the Teeth. She doesn\'t trust the Guild\'s explanation and has no one she can spare to look into it.' },
      { heading: 'The job she\'ll offer', canon: 'planned', text: 'She hires the party: **25 gp each up front, and 100 gp each when the light burns again or Tamsin Rook is found**. She will haggle up to 120 if pushed hard.' },
    ],
  }),
  person('Tamsin Rook', {
    race: 'Human', role: 'Keeper of Lamplight Point', where: 'Missing', status: 'Missing', allegiance: '[[Lamplighters\' Guild]]',
    available: 'all', picture: 'tamsin-rook.jpg',
    sections: [
      { heading: 'Who she is', text: 'The keeper of the lighthouse for the last six years: thirty, sharp-tongued, freckled, good with engines and bad with people. Third generation of keepers. She has an apprentice, [[Wick]].' },
      { heading: 'Missing', text: 'Not seen since the night the light went out, three nights before the party arrives. Her logbook is still on the lamp-room desk.' },
      { heading: 'Where she really is', available: 'dm', text: 'She found the Choir out, scraped their sigil off the cellar door, and when Silas Gorm came for her she ran into the Sallowmere to the only person she thought could help, [[Mother Sallow]]. She is hiding in Sallow\'s stilt-house, sick with **fog-lung** (one level of exhaustion that won\'t go until she\'s back in dry air for a day). She knows about the chapel stair and the new moon.' },
    ],
    events: [{ when: { text: '30 Deepwinter 1146' }, text: 'Tamsin writes her last log entry and flees into the Sallowmere.', available: 'dm' }],
  }),
  person('Corra Lindqvist', {
    race: 'Human', role: 'Guild Mistress of the Lamplighters in Saltreach', where: 'The guildhall, [[Upper Town]]', allegiance: '[[Lamplighters\' Guild]]',
    available: 'all', picture: 'corra-lindqvist.jpg', aliases: ['Guild Mistress Lindqvist', 'Mistress Lindqvist', 'Corra'],
    facts: [{ label: 'Secretly', value: 'The Voice of [[The Choir of the Deep]]', available: 'dm', tone: 'hostile' }],
    sections: [
      { heading: 'Who she is', text: 'A tall grey-haired widow of sixty with a soft voice, a lamp-headed cane and a kind word for everyone. She runs the Guild in Saltreach, feeds the fishermen\'s widows from her own purse every Restday and is much loved.' },
      { heading: 'A living saint', canon: 'false', truth: 'She is the leader of the Choir of the Deep and is wrecking ships on purpose.', text: 'People in town say she is a living saint: that she has never told a lie and that the Lantern itself chose her.' },
      { heading: 'The truth', available: 'dm', text: 'Her husband Pieter drowned on the Teeth twenty years ago. Six years ago, on the anniversary, she heard the Saint Beneath sing his name, and it promised to give him back. She has led the Choir since. She wrecked the ships, took the Lantern, and plans to drown it at the new moon.\n\nShe doesn\'t lie when she can mislead. She will be gracious to the party, thank them, pay them, and try to send them after the Gullwings.' },
    ],
  }),
  person('Ilsabet Crane', {
    race: 'Human', role: 'Moneylender', where: '[[The Crane counting house]]', allegiance: '[[House Crane]]',
    available: 'all', picture: 'ilsabet-crane.jpg',
    sections: [
      { heading: 'Who she is', text: 'A thin, beautifully dressed woman in black with a voice like a closing ledger. Never raises it. Lends to fishermen, merchants and the Guild alike, and collects from all of them.' },
      { heading: 'Bran\'s debt', text: ':::for Bran Hale\nYou owe her 120 gold pieces, borrowed three years ago, due at the next new moon (11 Rimewane). Her collectors know your face.\n:::\n\n:::dm\nShe will send a man to remind Bran publicly the first evening. She will accept part payment and grant a week\'s grace for a favour: finding out what the Guild is spending so much money on.\n:::' },
    ],
  }),
  person('Nell Thistlewood', {
    race: 'Lightfoot halfling', role: 'Lieutenant of the Gullwings', where: '[[The Gull Steps]]', allegiance: '[[The Gullwings]]',
    available: ['jules'], picture: 'nell-thistlewood.jpg', aliases: ['Nell'],
    sections: [
      { heading: 'Your sister', text: 'Pip\'s older sister by six years, who raised him on the docks after their mother was lost. Quick, stubborn and funny. Her last letter, two years ago, said she had "a proper place with the Gullwings, with a share".' },
      { heading: 'What she thinks of Pip', available: 'dm', text: 'She thinks he ran off with a wizard and left her. She is angry, and very glad he is alive, in that order. She will help him once, privately, and won\'t let Saltjaw know he is her brother unless she has to.' },
    ],
  }),
  person('Captain Saltjaw Merrow', {
    race: 'Human', role: 'Captain of the Gullwings', where: '[[The Gull Steps]]', allegiance: '[[The Gullwings]]',
    available: 'all', picture: 'saltjaw-merrow.jpg', aliases: ['Saltjaw', 'Saltjaw Merrow', 'Captain Merrow'],
    sections: [
      { heading: 'Who he is', text: 'A big, bald, grey-bearded sailor with a hinged iron plate where his lower jaw used to be (the navy took it). Everyone in Saltreach knows who he is, and nobody says it to the Watch.' },
      { heading: 'Murderer?', canon: 'rumour', text: 'The talk in town is that Saltjaw killed Tamsin Rook to keep the light dark for a landing.' },
      { heading: 'What he wants', available: 'dm', text: 'He lost two boats and five sailors on the Teeth this month and wants whoever did it. He liked Tamsin. He will make a bargain with the party (see [[The Gullwing Bargain]]) and give them the ledger page.' },
    ],
  }),
  person('Gaffer Pell', {
    race: 'Human', role: 'Keeper of the Brined Eel', where: '[[The Brined Eel]]', available: 'all', picture: 'gaffer-pell.jpg',
    sections: [
      { heading: 'Who he is', text: 'An enormous, slow, white-whiskered man of seventy who has kept the Eel for fifty years and hears everything said in it. Calls everyone "my bird".' },
      { heading: 'What he knows', available: 'dm', text: 'He knows the Gullwings use the back room, knows Nell Thistlewood well, and will recognise Pip after a minute. He saw Silas Gorm drinking alone and very drunk two nights ago, saying "she\'ll have them all back, every one".' },
    ],
  }),
  person('Dunstan Reeve', {
    race: 'Human', role: 'Sergeant of the Harbour Watch', where: 'The watch house on the sea wall', allegiance: '[[The Harbour Watch]]',
    available: 'all', picture: 'dunstan-reeve.jpg', aliases: ['Sergeant Reeve'],
    sections: [
      { heading: 'Who he is', text: 'A thick-necked, red-faced man who served under Bran Hale in the Coast Guard and has done well since by never asking a difficult question.' },
      { heading: 'His theory', canon: 'false', truth: 'The Gullwings had nothing to do with it.', text: 'He is sure the Gullwings put the light out for a landing and did away with Tamsin.' },
    ],
  }),
  person('Mother Sallow', {
    race: 'Sea hag (looks like an old eel-wife)', role: 'Witch of the Sallowmere', where: 'Her stilt-house deep in [[The Sallowmere]]',
    available: 'all', picture: 'mother-sallow.jpg', aliases: ['the old woman in the mere', 'Sallow'],
    sections: [
      { heading: 'The stories', canon: 'rumour', text: 'An old woman lives in the middle of the mere in a house on stilts. She will cure a fever, find a lost ring or curse a cheating husband, for a price. Never eat what she gives you. Never promise her anything.' },
      { heading: 'The truth', available: 'dm', text: 'A sea hag who moved inland a century ago when she felt the Saint Beneath stir; she hates and fears it. She is hiding Tamsin and will help the party against the Choir, but her price is real (see [[Mother Sallow\'s Price]]). [[creature:Mother Sallow]]' },
    ],
  }),
  person('Brother Aldous', {
    race: 'Human', role: 'Priest of the Chapel of the Lantern', where: '[[The Chapel of the Lantern]]', available: 'all', picture: 'brother-aldous.jpg',
    sections: [
      { heading: 'Who he is', text: 'A gentle, absent-minded priest of seventy with ink on his fingers who knows everything about Saint Aubrel and very little about anything else. He reads Old Varrish.' },
      { heading: 'What he can tell', available: 'dm', text: 'That the Lantern of Saint Aubrel was "lent to the Guild for safekeeping" by his predecessor; that Mistress Lindqvist asked him last year about the old chapel under the lighthouse; and the first two lines of the chapel inscription, which are in an old book of his (he doesn\'t know what they mean).' },
    ],
  }),
  person('Wick', {
    race: 'Human', role: 'Tamsin Rook\'s apprentice, aged 11', where: 'His mother\'s house in [[Saltreach Harbour]]', available: 'all', picture: 'wick.jpg',
    sections: [
      { heading: 'Who he is', text: 'A skinny, serious boy who worships Tamsin and has been sitting on the harbour wall every night since she vanished, watching the dark lighthouse.' },
      { heading: 'What he saw', available: 'dm', text: 'The night she vanished he was walking up to the lighthouse with her supper. He saw the lamp **go green, then out**, and a light moving down the track toward the marsh. He has told no one but his mother, who told him to keep quiet.' },
    ],
  }),
  person('Hobb Fenn', {
    race: 'Human', role: 'Headman of Fenwick', where: '[[Fenwick]]', available: 'all', picture: 'hobb-fenn.jpg',
    sections: [
      { heading: 'Who he is', text: 'A short, bow-legged eel-catcher with a voice like a bittern, suspicious of everyone from more than a mile away.' },
      { heading: 'What he knows', available: 'dm', text: 'Tamsin Rook came through Fenwick the night the lighthouse went dark, soaked and coughing, and asked the way to Mother Sallow\'s. He gave it to her. He will tell the party if they are polite and bring something for the village (tobacco, salt or news).' },
    ],
  }),
  person('Marisol Teague', {
    race: 'Human', role: 'Shopkeeper', where: '[[merchant:Teague\'s Provisions]], [[Saltreach Harbour]]', available: 'all', picture: 'marisol-teague.jpg',
    sections: [{ heading: 'Who she is', text: 'Brisk, sunburnt and forty, a former boat-builder\'s wife who sells rope, oil and rations and tells you the weather whether you ask or not.' }],
  }),
  person('Garrick Holt', {
    race: 'Human', role: 'Smith', where: '[[merchant:Holt & Daughter]], [[Saltreach Harbour]]', available: 'all', picture: 'garrick-holt.jpg',
    sections: [{ heading: 'Who he is', text: 'A huge, quiet smith who makes anchors and nails, and his daughter **Bess**, who makes swords, and better ones. He served in the Coast Guard twenty years ago.' }],
  }),
  person('Auntie Brine', {
    race: 'Human', role: 'Apothecary', where: '[[merchant:The Green Bottle]], [[Saltreach Harbour]]', available: 'all', picture: 'auntie-brine.jpg',
    sections: [
      { heading: 'Who she is', text: 'A tiny, ancient, cheerful woman in a shawl covered in stains, who brews potions behind the shop and calls everyone "duck".' },
      { heading: 'Her past', available: 'dm', text: 'Apprenticed to Mother Sallow sixty years ago. Still sends her a jar of pickled eels every Lantern Night. Can tell the party how to reach the stilt-house and what Sallow likes (pickled eels, gossip, and hair).' },
    ],
  }),
  person('Ferret Lusk', {
    race: 'Human', role: 'Fence', where: '[[The Gull Steps]]', allegiance: 'Himself', available: 'dm', picture: 'ferret-lusk.jpg',
    sections: [{ heading: 'Who he is', text: 'A thin man with a moustache like a dropped comma who fences for the Gullwings from a side cave. Prices are whatever he thinks you\'ll pay. [[merchant:Ferret Lusk, fence]]' }],
  }),
];
