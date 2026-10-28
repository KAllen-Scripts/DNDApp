/**
 * The DM's wiki, part 1: the world (places, factions, lore). Written before play: nothing here happens in a
 * session. The seed makes the pages in order, so a parent comes before its children.
 *
 * `available`: 'all', 'dm', or account keys (['theo']), for a page, a section, a fact or an event. Sections and
 * facts default to "as the page". `:::for <character>` and `:::dm` blocks narrow a part of a section.
 * `canon`: true (default), rumour, false (with `truth`, what really happened), planned (the DM's prep: never
 * players'). `picture`: a file in example/pictures. Times (`when`) are in the Tide Reckoning, Day 1 being
 * 3 Rimewane 1147 AR.
 */

export const WORLD = [
  // ---------- the realm ----------
  {
    title: 'Varrow', kind: 'kingdom', available: 'all', picture: 'varrow.jpg', tags: ['realm'],
    facts: [
      { label: 'Ruler', value: 'Queen Isolde II' },
      { label: 'Capital', value: '[[Varrowgate]]' },
      { label: 'Faith', value: '[[Saint Aubrel and the Lantern]], and the old sea-gods in the fishing villages' },
    ],
    sections: [
      { heading: 'Overview', text: 'A small, damp kingdom of moors, river valleys and a long grey coast, held together by the Crown, the roads and the Lamplighters\' lights. Varrow lives on wool, salt fish and the trade that passes along [[The Greyhallow Coast]] to the southern ports.\n\nThe Crown is far away and mostly interested in taxes. Each harbour town is run by a harbourmaster appointed from [[Varrowgate]].' },
      { heading: 'History in brief', text: 'The kingdom dates its years from [[The Reckoning]], the great flood that drowned the old coast 1,147 years ago. Its first queens rebuilt on higher ground, and the lighthouses were raised along the new coast in the centuries after, most of them in Saint Aubrel\'s time, three to four hundred years ago.' },
    ],
    events: [
      { when: { text: '1147 years ago' }, text: 'The Reckoning: the sea drowns the old coast. Year 1 of the Tide Reckoning.' },
      { when: { text: '400 years ago' }, text: 'Queen Maudra I founds the Lamplighters\' Guild and orders a light on every headland.' },
    ],
  },
  {
    title: 'Varrowgate', kind: 'city', parent: 'Varrow', available: 'all',
    facts: [{ label: 'Population', value: 'About 30,000' }, { label: 'Region', value: '[[Varrow]], two days east along the Old Coast Road' }],
    sections: [
      { heading: 'Overview', text: 'The capital, two days\' ride east of [[Saltreach]] along the Old Coast Road. The road off the eastern edge of the coast map leads there; there is no map of the city itself (yet).' },
      { heading: 'Secrets', available: 'dm', text: 'The [[The Choir of the Deep|Choir]] has a second cell in Varrowgate, in the cellars under the Guild\'s great hall. Corra\'s ledger shipments marked "on to Varrowgate" go there. This is where the campaign goes after Saltreach.' },
    ],
  },
  {
    title: 'The Greyhallow Coast', kind: 'region', parent: 'Varrow', available: 'all', aliases: ['Greyhallow'],
    facts: [
      { label: 'Type', value: 'Coast, cliffs and marsh' },
      { label: 'Region', value: '[[Varrow]]' },
      { label: 'Map', value: 'The Greyhallow Coast (region map, 1 square = 1 mile)' },
    ],
    sections: [
      { heading: 'Overview', text: 'Thirty miles of grey cliffs, shingle and fog between the moors and the sea, with [[Saltreach]] at the head of its one good bay. North of the bay is [[Lamplight Point]] and its lighthouse; south, the sea caves of [[The Gull Steps]]; inland, the reed-marsh of [[The Sallowmere]] and the eel-catchers\' village of [[Fenwick]].\n\n[[map:The Greyhallow Coast]]' },
      { heading: 'Roads', text: '- **The Old Coast Road** runs east from Saltreach to [[Varrowgate]] (two days on foot).\n- **The lighthouse track** climbs north-west from the harbour to Lamplight Point (about an hour\'s walk).\n- **The cliff path** runs south to the Gull Steps. Dangerous in the dark.\n- **The Fenwick causeway** leaves the Coast Road for Fenwick and on into the marsh. Locals say never to step off it.' },
      { heading: 'Weather and the Teeth', text: 'Fog comes in most nights in winter. The **Teeth** are a line of rocks across the mouth of the bay that have wrecked more ships than anyone can count; the lighthouse on Lamplight Point exists to guide ships between them.' },
    ],
  },
  // ---------- Saltreach ----------
  {
    title: 'Saltreach', kind: 'town', parent: 'The Greyhallow Coast', available: 'all', picture: 'saltreach.jpg', banner: 'saltreach.jpg', tags: ['town'],
    facts: [
      { label: 'Type', value: 'Harbour town' },
      { label: 'Population', value: 'About 1,800' },
      { label: 'Ruler', value: 'Harbourmaster [[Odile Brask]], for the Crown' },
      { label: 'Region', value: '[[The Greyhallow Coast]]' },
    ],
    sections: [
      { heading: 'Overview', text: 'A grey stone town stacked up the slope of a deep bay, smelling of tar, smoke and fish. Fishing boats, a few coastal traders and (everyone knows, nobody says) the smugglers\' boats of [[The Gullwings]] work out of its harbour.\n\nTwo parts: [[Saltreach Harbour]] down by the water, and the [[Upper Town]] on the hill, where the guild houses, the [[The Chapel of the Lantern|chapel]] and the better families are.\n\n[[map:Saltreach Harbour]]' },
      { heading: 'Who runs it', text: '- Harbourmaster [[Odile Brask]] runs the port and the town for the Crown.\n- Sergeant [[Dunstan Reeve]] and the [[The Harbour Watch|Harbour Watch]] keep the peace, more or less.\n- The [[Lamplighters\' Guild]] keeps the lighthouse and is the richest guild in town.\n- [[House Crane]] lends money to everyone who needs it.' },
      { heading: 'Where to buy things', text: '- [[merchant:Teague\'s Provisions]]\n- [[merchant:Holt & Daughter]]\n- [[merchant:The Green Bottle]]\n- Food, drink and rooms at [[The Brined Eel]].' },
      { heading: 'What the DM knows', available: 'dm', text: 'Saltreach is the Choir\'s first town. A dozen of its people sing for the Saint Beneath, most of them in the Guild. The wrecks of the last month were their doing; see [[What Sleeps Under Lamplight Point]].' },
    ],
    events: [
      { when: { text: '1020 years ago' }, text: 'Saltreach founded as a fishing village on the new coast.' },
      { when: { text: '3 Rimewane 1147' }, text: 'The party arrives in Saltreach.', canon: 'planned' },
    ],
  },
  {
    title: 'Saltreach Harbour', kind: 'district', parent: 'Saltreach', available: 'all',
    sections: [
      { heading: 'Overview', text: 'The quays, piers and warehouses along the water, under the sea wall. The fish market, [[The Brined Eel]], the harbourmaster\'s office, the Crane counting house and the shops of [[Marisol Teague]], [[Garrick Holt]] and [[Auntie Brine]] are all here.' },
      { heading: 'The Guild warehouse', text: 'A big slate-roofed warehouse at the end of the north pier with the Lamplighters\' lantern painted over the door, where the lamp oil comes in.\n\n:::dm\nThe Choir meets here. Silas Gorm, the warehouse keeper, is one of Corra\'s two tide-priests. The "sea-grade lamp oil" the Gullwings bring in is cut with seawater here before it goes up to the lighthouse.\n:::' },
    ],
  },
  {
    title: 'Upper Town', kind: 'district', parent: 'Saltreach', available: 'all',
    sections: [{ heading: 'Overview', text: 'The quieter, richer part of Saltreach up the hill: the [[The Chapel of the Lantern|Chapel of the Lantern]], the Lamplighters\' guildhall, the Brask house and the tall narrow houses of the merchant families. The streets are steep and stepped; carts go round by the Coast Road.' }],
  },
  {
    title: 'The Brined Eel', kind: 'tavern', parent: 'Saltreach Harbour', available: 'all', picture: 'brined-eel.jpg', aliases: ['Brined Eel', 'the Eel'],
    facts: [{ label: 'Type', value: 'Tavern and inn' }, { label: 'Keeper', value: '[[Gaffer Pell]]' }],
    sections: [
      { heading: 'Overview', text: 'A low, crooked, smoky tavern on the harbour front with a stuffed conger eel over the bar, run by [[Gaffer Pell]] since before anyone can remember. Fishermen, dockhands and (quietly, in the back room) Gullwings drink here.\n\n[[merchant:The Brined Eel bar]]' },
      { heading: 'The back room', text: 'Through the kitchen, a room with one table, one lamp and no windows, where business is done.\n\n:::for Pip Thistlewood\nYou know this room. You and Nell used to sleep under the kitchen step, and Gaffer Pell would leave the crusts from the eel pies out for you. The back room is where the Gullwings pay their people.\n:::' },
    ],
  },
  {
    title: 'The Crane counting house', kind: 'building', parent: 'Saltreach Harbour', available: 'all',
    sections: [
      { heading: 'Overview', text: 'A narrow stone house on the quay with iron bars on every window and a brass crane over the door. [[Ilsabet Crane]] lends money here at "fair rates", as the sign says.' },
      { heading: 'Inside', available: 'dm', text: 'Two clerks, two large doorkeepers (use **Harbour Watch Guard** stats with clubs), and a strongroom in the cellar. Ilsabet keeps her ledgers in a cipher only she and her son Aldric can read.' },
    ],
  },
  {
    title: 'The Chapel of the Lantern', kind: 'church', parent: 'Upper Town', available: 'all', picture: 'chapel-of-the-lantern.jpg',
    facts: [{ label: 'Priest', value: '[[Brother Aldous]]' }, { label: 'Faith', value: '[[Saint Aubrel and the Lantern]]' }],
    sections: [
      { heading: 'Overview', text: 'A whitewashed chapel at the top of the town with a lantern on its spire that is lit every night from the lighthouse\'s own flame. Sailors leave a candle here before a voyage. Brother Aldous keeps it.' },
      { heading: 'The lantern on the spire', text: 'By custom the chapel lantern is lit each dusk by a lamplighter who brings a taper down from Lamplight Point. It has been lit from an ordinary match for the last three nights, which Brother Aldous finds deeply upsetting.' },
    ],
  },
  // ---------- around the bay ----------
  {
    title: 'Lamplight Point', kind: 'landmark', parent: 'The Greyhallow Coast', available: 'all', picture: 'lamplight-point.jpg', aliases: ['the lighthouse', 'Lamplight Point lighthouse'],
    facts: [
      { label: 'Type', value: 'Lighthouse on a headland' },
      { label: 'Keeper', value: '[[Tamsin Rook]] (missing)' },
      { label: 'Owned by', value: '[[Lamplighters\' Guild]]' },
    ],
    sections: [
      { heading: 'Overview', text: 'A white stone tower ninety feet high on the headland north of the bay, built in Saint Aubrel\'s time. Its great lamp guides ships between the Teeth. Three floors are mapped: the ground floor (the keeper\'s quarters and oil store), the lamp room at the top and the cellar.\n\n[[map:Lamplight Point, ground floor]]' },
      { heading: 'Gone dark', text: 'The light has been dark for three nights. The keeper, [[Tamsin Rook]], has not been seen since. The Guild says she was ill and has sent for a new keeper from [[Varrowgate]].' },
      { heading: 'The cellar', available: 'dm', text: 'Under the oil store is a cellar older than the tower, with the barnacled sigil (see [[Clue: the barnacled sigil]]) scratched on its door. A secret door in its back wall opens on the **chapel stair**, a spiral stair down through the rock into [[The Drowned Chapel]]. At most tides the stair is flooded; at the low tide of a new moon it is clear for about two hours.' },
    ],
    events: [{ when: { text: '340 years ago' }, text: 'Lamplight Point lighthouse built over the ruins of an older shrine.' }],
  },
  {
    title: 'The Drowned Chapel', kind: 'dungeon', parent: 'Lamplight Point', available: 'dm', picture: 'drowned-chapel.jpg',
    facts: [{ label: 'Type', value: 'Flooded chapel from before the Reckoning' }, { label: 'Danger', value: 'High' }],
    sections: [
      { heading: 'Overview', text: 'A chapel of the old coast, drowned in [[The Reckoning]], under Lamplight Point. Saint Aubrel\'s first keepers found it and sealed it; the lighthouse was built on top to keep watch on what sleeps beneath. [[The Choir of the Deep]] opened it again.\n\n[[map:The Drowned Chapel]]' },
      { heading: 'Rooms', text: '1. **The stair foot.** Weed, crabs, the smell of the sea.\n2. **The narthex.** The [[Clue: the chapel inscription|inscription]] over the inner door.\n3. **The nave.** Half flooded (difficult terrain). [[creature:Swarm of Eels]] in the deep water. The Bell-Warden stands by the dais.\n4. **The vestry.** The Choir\'s things: robes, the [[item:Tidecaller Conch]], 140 gp in a sea chest, Corra\'s letters.\n5. **The sanctum.** The altar sunk in a pool that goes down into the dark. The [[item:Lantern of Saint Aubrel]] hangs over it, unlit, in a cage of coral.' },
      { heading: 'The finale', canon: 'planned', text: 'At the new moon Corra and the Choir sing in the sanctum and lower the Lantern into the pool. If it is drowned, the Saint wakes enough to take the whole bay. Lifting the lit Lantern over the deepest water (the riddle\'s answer) breaks the song.\n\n[[!Clue: the chapel inscription]]' },
    ],
  },
  {
    title: 'The Gull Steps', kind: 'sea caves', parent: 'The Greyhallow Coast', available: 'all', picture: 'gull-steps.jpg',
    facts: [{ label: 'Type', value: 'Sea caves under the south cliffs' }, { label: 'Who uses it', value: '[[The Gullwings]]', available: 'dm' }],
    sections: [
      { heading: 'Overview', text: 'A staircase of ledges down the south cliffs where the gulls nest, and below them a warren of sea caves that only show at low tide. Children are told never to go there.' },
      { heading: 'What locals know', text: 'Everyone in Saltreach knows the smugglers use the caves, and nobody says so to the Watch.\n\n:::for Pip Thistlewood\nYou ran messages down here as a child. The chalk signs on the rocks are Gullwing marks: a gull\'s foot means "safe way", a circle with a line through means "watch posted", three dots means "ask for the captain".\n:::' },
      { heading: 'Inside', available: 'dm', text: 'The way in floods at high tide. A flooded passage with eels leads to the smugglers\' hall, a dry cave with boats drawn up, crates, a fire, and Ferret Lusk\'s corner. The lower passages belong to the [[creature:Giant Shore Crab|giant crabs]].\n\n[[map:The Gull Steps]]' },
    ],
  },
  {
    title: 'The Sallowmere', kind: 'region', parent: 'The Greyhallow Coast', available: 'all', picture: 'sallowmere.jpg', aliases: ['Sallowmere', 'the mere'],
    facts: [{ label: 'Type', value: 'Reed-marsh and mere' }, { label: 'Danger', value: 'Getting lost, marsh hounds, the mud' }],
    sections: [
      { heading: 'Overview', text: 'Fifteen square miles of reeds, black water and fog east of Saltreach, with the river Sallow winding through it to the bay. The eel-catchers of [[Fenwick]] know its paths; nobody else should go in off the causeway.' },
      { heading: 'Stories', text: 'Lights on the water at night that lead travellers into the mud. Hounds that are not quite dogs. And an old woman, [[Mother Sallow]], who will help you for a price.' },
      { heading: 'Encounters', available: 'dm', text: 'The Sallowmere area on the region map has its own table (one in four every 4 hours): [[creature:Marsh Hound|marsh hounds]], a [[creature:Fen Lantern]], a lost eel-catcher, a [[creature:Giant Shore Crab]], two Choir cultists in a punt, or nothing but a heron.' },
    ],
  },
  {
    title: 'Fenwick', kind: 'village', parent: 'The Sallowmere', available: 'all', picture: 'fenwick.jpg',
    facts: [{ label: 'Type', value: 'Eel-catchers\' village on stilts' }, { label: 'Population', value: 'About 90' }, { label: 'Headman', value: '[[Hobb Fenn]]' }],
    sections: [{ heading: 'Overview', text: 'A village of thatched houses on stilts at the edge of the Sallowmere, joined by plank walks. They catch eels, cut reeds and keep to themselves. Strangers are given one meal and asked when they are leaving.\n\n[[map:Fenwick]]' }],
  },
  // ---------- factions ----------
  {
    title: 'Lamplighters\' Guild', kind: 'guild', available: 'all', aliases: ['the Guild', 'Lamplighters'],
    facts: [
      { label: 'Leader', value: 'Guild Mistress [[Corra Lindqvist]] (in Saltreach)' },
      { label: 'Base', value: 'The guildhall in the [[Upper Town]]; the warehouse on the north pier' },
      { label: 'Goals', value: 'Keep every light on the coast burning' },
      { label: 'Goals', value: 'Wake the Saint Beneath', available: 'dm' },
    ],
    sections: [
      { heading: 'Overview', text: 'The old royal guild that keeps the lighthouses of Varrow, buys their oil, trains their keepers and lights the town lamps. Its members swear the Lamplighter\'s Oath and wear grey hoods. In Saltreach it is the richest guild and the biggest employer after the fishing fleet.' },
      { heading: 'The Lamplighter\'s Oath', text: '> I will keep the light. I will not let it fail for wind or for want, for fear or for favour. What the light shows, I will not hide. So help me the Saint.' },
      { heading: 'The rot', available: 'dm', text: 'Corra Lindqvist has turned the Saltreach chapter. About a third of its members are in [[The Choir of the Deep]]; the rest suspect nothing.' },
    ],
  },
  {
    title: 'The Gullwings', kind: 'faction', available: 'all', aliases: ['Gullwings'],
    facts: [
      { label: 'Leader', value: 'Captain [[Captain Saltjaw Merrow|Saltjaw Merrow]]' },
      { label: 'Base', value: '[[The Gull Steps]]' },
      { label: 'Goals', value: 'Money, and not being hanged' },
      { label: 'Enemies', value: '[[The Harbour Watch]], the Crown\'s revenue cutters' },
    ],
    sections: [
      { heading: 'Overview', text: 'The smugglers of Saltreach: thirty-odd sailors and dockhands who bring in brandy, silk and southern spice without the Crown\'s tax. Half the town buys from them and the Watch mostly looks the other way.' },
      { heading: 'Lately', text: 'They have lost two boats on the Teeth since the light went out, and people say they did it themselves to cover a landing. See [[Rumours in Saltreach]].' },
      { heading: 'The truth', available: 'dm', text: 'The Gullwings had nothing to do with the light. They have been carrying "sea-grade lamp oil" for the Guild for months without knowing what was done with it, and two of their own boats went down because of it. Saltjaw suspects the Guild but has no proof.' },
    ],
  },
  {
    title: 'The Harbour Watch', kind: 'faction', available: 'all', aliases: ['the Watch'],
    facts: [{ label: 'Leader', value: 'Sergeant [[Dunstan Reeve]]' }, { label: 'Base', value: 'The watch house on the sea wall' }],
    sections: [{ heading: 'Overview', text: 'Twelve guards in blue tabards who keep order in Saltreach for the harbourmaster. Underpaid, bored, and fond of an easy answer.' }],
  },
  {
    title: 'House Crane', kind: 'family', available: 'all',
    facts: [{ label: 'Leader', value: '[[Ilsabet Crane]]' }, { label: 'Base', value: '[[The Crane counting house]]' }],
    sections: [{ heading: 'Overview', text: 'A family of moneylenders with offices in Saltreach and Varrowgate. Respectable, rich and feared: a Crane debt is never forgotten, and they employ large men to remember it.' }],
  },
  {
    title: 'The Choir of the Deep', kind: 'cult', available: 'dm', aliases: ['the Choir'],
    facts: [
      { label: 'Leader', value: '[[Corra Lindqvist]]' },
      { label: 'Base', value: 'The Guild warehouse; [[The Drowned Chapel]]' },
      { label: 'Goals', value: 'Wake the Saint Beneath, who has promised to give back everyone the sea has taken' },
      { label: 'Allies', value: 'The drowned' },
    ],
    sections: [
      { heading: 'Overview', text: 'A cult of the [[The Saint Beneath|Saint Beneath]], begun in Saltreach six years ago by Corra Lindqvist. Its people are mostly those who lost someone to the sea. They sing to the Saint at the turn of the tide; each has the [[Clue: the barnacled sigil|barnacled sigil]] tattooed inside the lower lip.' },
      { heading: 'Members', text: '- [[Corra Lindqvist]], the Voice.\n- Silas Gorm, warehouse keeper, a tide-priest.\n- "The Cantor", a tide-priest whose face nobody sees.\n- About a dozen lamplighters and dockhands ([[creature:Choir Cultist]]).' },
      { heading: 'What they are doing', text: 'Cutting the lighthouse oil with seawater so the light fails, so ships wreck, so the drowned feed the Saint. At the new moon they will drown the [[item:Lantern of Saint Aubrel]] in the chapel and wake it.' },
    ],
    events: [{ when: { text: '6 years ago' }, text: 'Corra Lindqvist hears the Saint sing for the first time, on the anniversary of her husband\'s drowning.' }],
  },
  // ---------- lore ----------
  {
    title: 'The Reckoning', kind: 'history', available: 'all',
    when: { text: '1147 years ago' },
    sections: [
      { heading: 'What everyone knows', text: 'Eleven and a half centuries ago the sea rose in a single night and drowned the old coast of Varrow, its towns and its temples. The years are counted from it. Reckoning Day, the first of Rimewane, is the new year, kept with bonfires on the beaches.' },
      { heading: 'What the old songs say', canon: 'rumour', text: 'The fishing villages sing that the sea didn\'t rise by itself: that something under it turned over in its sleep.' },
      { heading: 'The truth', available: 'dm', text: 'The songs are right. [[The Saint Beneath]] stirred, and the old coast went under. Saint Aubrel\'s keepers learned, centuries later, that light kept it sleeping.' },
    ],
  },
  {
    title: 'Saint Aubrel and the Lantern', kind: 'religion', available: 'all', aliases: ['Saint Aubrel', 'Aubrel', 'the Lantern faith'],
    facts: [{ label: 'Symbol', value: 'A lantern with a white flame' }, { label: 'Feast', value: 'Lantern Night, 15 Fogmere' }],
    sections: [
      { heading: 'The saint', text: 'Aubrel was a lighthouse keeper three and a half centuries ago who, the story goes, kept his light burning through the Long Storm for forty days without oil, by prayer. Sailors pray to him; lamplighters swear by him. He is said to have walked into the sea with his lantern when he was old and not come back.' },
      { heading: 'The faith', text: 'Not much of a church: a chapel in each port, a priest or two, candles for the lost. Its one great relic, the **Lantern of Saint Aubrel**, was kept at Lamplight Point and lit the great lamp there each winter. It was "lent to the Guild for safekeeping" years ago.' },
      { heading: 'Aubrel today', available: 'dm', text: 'Aubrel is real and still watching, a minor celestial power of lights at sea. He is Oriel Vane\'s patron. He can\'t act in the world himself; he chose Oriel because the Saint Beneath is stirring and his Lantern has been taken.' },
    ],
    events: [
      { when: { text: '350 years ago' }, text: 'The Long Storm: Aubrel keeps the light at Lamplight Point for forty days.' },
      { when: { text: '310 years ago' }, text: 'Aubrel walks into the sea with his lantern.', canon: 'rumour' },
    ],
  },
  {
    title: 'The Saint Beneath', kind: 'deity', available: 'dm', picture: 'saint-beneath.jpg', aliases: ['the Saint', 'the Drowned Saint'],
    facts: [{ label: 'Type', value: 'An ancient thing asleep under the sea' }, { label: 'Danger', value: 'Beyond the party for now' }],
    sections: [
      { heading: 'What it is', text: 'Something very old and very large asleep in the deep water under Lamplight Point. It doesn\'t have a name; the Choir calls it a saint because it promises to give the drowned back. It dreams, and its dreams leak out as the voice in the tide and as the drowned walking.' },
      { heading: 'Wren', text: 'The Saint took Wren Ashdown when she was nine, tasted her and gave her back. It has been calling her since, and wants her as its voice. Corra knows nothing about her, and would be jealous.' },
    ],
  },
  {
    title: 'Hesk and the tides', kind: 'lore', available: 'all', aliases: ['Hesk'],
    facts: [{ label: 'Next new moon', value: '11 Rimewane 1147' }],
    sections: [
      { heading: 'The moon', text: 'Hesk, the moon, goes round in 28 days. The fishermen time everything by it: the biggest tides come at the full and the new moon, and the lowest water of the year is at the new moon of Rimewane.' },
      { heading: 'The chapel stair', available: 'dm', text: 'Only at the low tide of a new moon is the chapel stair under Lamplight Point clear of water, for about two hours from midnight. The next is the night of **11 Rimewane** (Day 9 of the clock).' },
    ],
    events: [{ when: { text: '11 Rimewane 1147' }, text: 'New moon. The lowest tide of the year.' }],
  },
];
