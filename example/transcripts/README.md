# Feeding in the example sessions

Four made-up sessions of *The Lanterns of Saltreach*, written to look like a real recording run through
speech-to-text: people talk over each other, get rules wrong and correct them, misremember things in the
recaps, go off topic, and the transcription mishears names now and then ("Salt Reach", "Lindquist",
"Ren", "rhyme wane"). Session 3 uses the other timestamp style (`0:01:30 - Name: text`) to test the parser.

| File | Length | In-game days | Who's there |
|---|---|---|---|
| `session-1.txt` | 2 h 54, ~19k words | 3 to 4 Rimewane 1147 | everyone |
| `session-2.txt` | 2 h 29, ~17k words | 4 to 5 Rimewane | everyone |
| `session-3.txt` | 2 h 06, ~15k words | 5 to 7 Rimewane | **Theo (Bran) is away** and never speaks |
| `session-4.txt` | 2 h 09, ~14k words | 8 to 12 Rimewane | everyone |

## How to upload them

1. Run the server on the example data (see [../README.md](../README.md)) and log in as `test-rowan` (the DM).
   Open the **Sessions** tab (it is for the campaign you're in, *The Lanterns of Saltreach*).
2. Upload them in order, numbers 1 to 4, each with a played date **after** the day you seeded the example
   and later than the one before (for example the next four days, or four weeks in a row). Sessions take
   the map and sheet changes made on or before their date, and the seed made lots on its day.
3. On the first upload, link the speakers yourself. They're left unlinked on purpose so you can see what
   the upload screen guesses: **Rowan** → `test-rowan` (the DM), **Mags** → `test-mags`, **Theo** →
   `test-theo`, **Jules** → `test-jules`, **Priya** → `test-priya`. Later uploads should remember them.
4. Let each one finish processing before the next.

Nothing else in the data says what happened in play, so everything below has to come from the
transcripts.

## What each session covers

**Session 1: The dark lighthouse.** The party arrives on the coach from Varrowgate. Harbourmaster Brask
hires them to find out why the Lamplight Point light keeps going out and where keeper Tamsin Rook went:
25 gp each now, 100 gp each when it's done. Shopping, Wick the boy who
helped Tamsin ("It went green, then out"), rumours at the Brined Eel, and Hosk calling on Bran in front of
the whole pub: 120 gp owed to Mistress Crane, due at the new moon on 11 Rimewane. The lighthouse: Tamsin's
log, read out word for word; the drowned on the track (a fifth comes out of the surf). Gorm's warehouse,
then a long rest. Pip finds the old Gullwing chalk mark ("ask for Nell").

**Session 2: The Gull Steps.** The recap gets things wrong (Brask's "50 gp", the light going "red") and
is corrected. Jory Cotter's widow, the Guild hall (Corra Lindqvist away; a letter to "the Guild House,
Varrowgate. The Cellars"), Brother Aldous says she prays facing the sea. Sergeant Reeve, Bran's old
corporal, plans to raid the smugglers. A **private scene between Pip and Nell** (Nell is Pip's sister;
nobody else is told). The wet way: eels and crabs, and the DM rules a giant crab form isn't allowed yet.
Captain Saltjaw Merrow's bargain (one free passage anywhere on the coast) and a ledger page signed C.L.
The Driftglass Lens bought with pooled money; a cultist ambush; a house rule (drinking a potion is a bonus
action). Outside the Eel, Wren tells Oriel "Mine's a voice". Level 4.

**Session 3: The Sallowmere.** Without Bran. Marsh hounds, Fenwick, and Mother Sallow's stilt-house,
where they find Tamsin. Sallow's price, word for word: a lock of hair from each of them and "the next
dream you have of the sea, Wren-child". **The dream is private to Mags** ("Come home, little drowned
one."). The cultists' punt: "The Voice has the Lantern… midnight on the eleventh." Tamsin hidden at
Auntie Brine's and kept from Brask; Reeve's raid finds nothing. Corra Lindqvist visits, gives 50 gp and
lies about Gorm and the Lantern.

**Session 4: The Drowned Chapel.** The others catch Bran up but leave out Wren's voice and the dream; he
gives a lock of hair. Bran paid Crane 40 and owes 80. Water Breathing potions, the night of the new moon,
the secret stair, the inscription over the chapel door (read word for word) and its riddle, the
Tidecaller Conch, the Bell-Warden (the DM corrects its hit points from 45 to 60 mid-fight). Corra is the
Voice. The Saint Beneath calls Wren; Oriel lifts the Lantern and **only she hears her patron's words**.
Corra goes into the pool, fate unknown. The great lamp is relit, Brask pays 100 gp each, and a letter
points to the Choir in Varrowgate. The debt to Crane is still unpaid at the end. Level 5 next time.

## What to check after each one

- **Processing:** every session finishes; attendance shows Theo absent from session 3 and everyone else
  present; the misheard names end up as the right people and places.
- **Ask:** the questions in [../ask-checks.md](../ask-checks.md), asked as the player named, with the
  answer it should give and what must **not** come out. Try a few with `quick` and `thorough` as well as
  the default.
- **Corrections:** the later version wins: Brask pays 25 now and 100 later (not 50), the light went green
  (not red), the Bell-Warden had 60 hit points (not 45), drinking a potion is a bonus action (house rule).
- **Wiki:** the AI's proposals in the review queue after each session (new people like Nell, Hobb and Ebb,
  quests moving on, the Lantern found); nothing private (Nell being Pip's sister, the dream, the patron's
  words) proposed on a page players can see.
- **Timeline:** the in-game days land on 3 to 12 Rimewane 1147, and the new moon on the 11th.
- **Sheets and money:** nothing changes on its own; the transcripts only say what people meant to write
  down (gold, the conch, the Lantern), so that's for the players to do, as in a real game.
