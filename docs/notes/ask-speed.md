# Making Ask faster (2026-10-21)

Kenny: "Ask is way too slow. Research how we can make this faster. The example was me asking 'What's that dnd item that is a bag you can pull summons out of?', and it took too long to respond. Maybe it is being too thorough for some stuff? We don't need to know how the editions differ, for example. Just what is relevant to the edition we are playing."

The rule stays: **the Q&A model wasn't changed** (only Kenny can change it). Everything below runs on the same model. The model suggestion at the end needs his yes.

## Where the time went, for Kenny's question

There's no server log from Kenny's machine here, so this is from reading the code, plus what could be timed offline (the fake AI shows no model time). From the next restart on, every answer logs its own timings (see "Reading the log" below), so the next look has real numbers.

Before this change, a question like Kenny's went like this, with the group's books on the shelf:

1. **Claude Code starts** (the default provider runs every AI call as a new Claude Code process). Measured here: **~2.9 s** before it's ready to send anything, of which ~2.3 s was Claude Code's own telemetry, error reporting and update checks (see the measurements).
2. **Turn 1.** The prompt said "Look up every rules question in them [the books]… Search in your first turn", including items. So the model thinks (effort `medium`) and calls `search_books`. A model turn is a second or two before anything happens, plus its thinking.
3. **Turn 2.** "Snippets are only a few lines: read_book the best page before you answer." So it reads a page. If the hit was an index line, another turn to read the page it points to.
4. **Both editions.** `search_books` searched every book, whatever the campaign's edition (the spell and creature lookups already preferred the campaign's edition; Ask's book search didn't). With a 2014 and a 2024 Dungeon Master's Guide on the shelf, both pages come back, the model often reads both, and with two Player's Handbooks and no edition set, the prompt even said "give both where they differ". More reading, and a longer answer about how the editions differ: what Kenny saw.
5. **The answer turn**, written at `medium` effort, with the archivist's guide, up to 6,000 tokens of pinned records and up to 5,000 tokens of transcript and record search results in front of it, none of which an item lookup needs.

So: a Claude Code start, at least three model turns (often four or five), each with medium-effort thinking, and a longer answer than needed. The book searches themselves are not the problem (10 to 50 ms, below).

## Measurements (offline, in the cloud container)

| What | Measured | Notes |
|---|---|---|
| Claude Code start, to "ready" (its init message), with our locked-down options and MCP server | **2,793–3,146 ms** (5 runs) | No model call: the runs were stopped at init. The container's traffic goes through a proxy, so on Kenny's home connection it may be less. |
| The same with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` | **551–706 ms** (5 runs, interleaved with the above) | ~2.3 s less on every AI call, not just Ask. Now the default (`CLAUDE_CODE_QUIET_START`). |
| `search_books`, 6 books of 320 pages | 10 ms for one term, 47 ms for four | 17 ms for four when preferring one edition (half the books). Not worth caching. |
| Reading those 6 books at start-up | ~10 s | Once per restart, in the background. A question asked meanwhile used to wait for all of it; a quick question no longer does. Real scanned PDFs are bigger, so this is likely longer on Kenny's machine. |
| Pre-search (record, transcript, note and wiki search) | 5–15 ms | Local. |
| Fixed instructions | full way 7,778 characters, quick way 3,554 | Plus, the full way only: the archivist's guide, pinned records (up to ~24,000 characters) and the pre-search (up to ~20,000). The quick way sends at most ~6,000 characters of records. |

How the start-up was timed: a script in the scratchpad called the Agent SDK's `query()` with the provider's options and a dead API address, and stopped at the `system/init` message, so no model was called and nothing was spent.

## What changed

1. **A quick way for general D&D lookups** (`packages/server/src/qa/route.js`). No AI decides it: a rules word ("item", "spell", "stat block", "dnd"…) or the shape "what is a…", "what does … do", "how does … work", and nothing pointing at the campaign (we, our, party, session, the DM, "my character", who / where / when / why, the past tense, or the name of a record, wiki page, character or DM's creature the asker can see). When in doubt it goes the full way. The quick way:
   - runs at effort `low` (`EFFORT_QA_QUICK`) instead of `medium`, same model;
   - has a short prompt: no archivist's guide, no pinned records, a pre-search of the records and wiki only (1,500 tokens), so a house rule or homebrew version still shows;
   - answers from the model's knowledge of the group's edition and uses the books **only when the exact wording or numbers matter** (the rule from before the books were added, now one line in the prompt), at most 4 lookups;
   - asks for a short answer (what it is, what it does, the numbers that matter);
   - is marked "Quick answer" on the page, with **Look it up properly**, which asks the same question the full way.
   Kenny's question goes the quick way. Expected: one model turn at low effort instead of three or more at medium.
2. **The campaign's edition only, both ways.** One prompt line: answer for the group's edition, don't say how the other edition differs or compare them unless asked. The prompt always says the edition now (before, only when there were books or the DM had set one), and with two Player's Handbooks and nothing set it picks the fallback edition instead of "give both".
3. **`search_books` prefers the campaign's edition** (when it's known for sure: the DM's setting, `REST_RULES`, or one Player's Handbook): the other edition's books are left out unless nothing else has it. A bug fix, with a regression test.
4. **Claude Code starts quietly**: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` for every run (~2.3 s here). It turns off Claude Code's telemetry, error reporting, bug command and update checks; none of those matter to the server. `CLAUDE_CODE_QUIET_START=off` brings them back.
5. **A quick question doesn't wait for the books** while they're still being read after a restart.
6. **Timings in the log** for every answer.

## Reading the log

`data/server.log` gets one line per answer, like:

```
"ask":{"path":"quick","why":"general D&D question","effort":"low","system_chars":3554,"prompt_chars":427,"prep_ms":15,"books_wait_ms":0,"first_turn_ms":900,"first_text_ms":2400,"turns":1,"tools":[],"total_ms":4100},"msg":"Ask answered (quick) in 4100 ms"
```

- `prep_ms`: everything before the model is called (books, pre-search). Should be tens of ms; much more means the books were still loading (`books_wait_ms`).
- `first_turn_ms`: when the model's first reply started. Minus `prep_ms`, that's Claude Code's start plus the model's first response.
- `first_text_ms`: when the first words streamed.
- `turns` and `tools` (`at_ms`, `ms` each): how many round trips, and when each lookup ran. A tool's `ms` should be small; the gaps between `at_ms` values are model time.
- No question text is logged (questions can be private).

`GET /campaigns/:cid/usage` still averages `duration_ms` and `first_text_ms`; `qa_log.path` says which way each went.

## Looked at, not done

- **A warm Claude Code process** (the SDK's `prewarm()`, which starts a process ahead and hands it the next query). It's marked alpha, and the MCP servers and system prompt are fixed when the process starts, while Ask's tools are made for each asker (privacy filters) and the prompt names them. It would need a single shared tool server that looks up who's asking per call. The 2026-10-03 measurement put the saving at ~0.6 s, which matches the quiet start above (~0.65 s left). Not worth the risk for now; worth another look if the SDK makes it stable.
- **Caching book searches**: they take 10 to 50 ms.
- **Starting Claude Code while the pre-search runs**: the pre-search takes 5 to 15 ms, so there's nothing to overlap.
- **An AI classifier** for quick or full: it would cost a model call (a second or more) to save one.
- **A Quick / Thorough switch by the question box**: the automatic choice plus "Look it up properly" under a quick answer seemed less fiddly. Easy to add if Kenny wants one.

## What's left that only a model change would fix

The quick way still runs the Q&A model (the large default model) for one turn. Most of what's left of a quick answer is that model's time to first words and to write the answer.

**Suggestion for Kenny (needs his yes; done 2026-10-28, see below):** try a faster model for the quick way only, keeping the full way (campaign questions, rules looked up in the books) on today's model. This is the parked "faster model for Ask" experiment, narrowed to where it's safest: general lookups, where a smaller model's D&D knowledge is enough and "Look it up properly" is one press away. It would need a small code change: a `MODEL_QA_QUICK` setting, empty by default so nothing changes until he sets it. To decide, compare `total_ms` and `first_text_ms` in the log for ~10 quick questions on each. The full way's own experiment (`MODEL_QA=…` or `EFFORT_QA=low` in `.env`) is unchanged and still parked.

## A faster model, picked per question (2026-10-28)

Kenny: "Can we use a faster model for asking questions? Or more so, could we quickly decide if it's stored in the data we have, or needs looking up, then assign a fast model if we have it, or more intelligent model if we don't? Would this be faster and/or save tokens?"

Built, as `pickModel` in `qa/route.js`, run after the automatic search (no AI: an AI deciding would be a model call of its own, a second or more and its tokens, which is about what it saves):

- **Faster model** (`MODEL_QA_FAST`, default `claude-sonnet-5-5`): the quick way (general D&D lookups), and full-way questions that name a record or wiki page the automatic search put in front of the model ("What does Brother Hal want?" with Brother Hal's record found). The answer is already in the prompt, so the job is reading and writing it up.
- **Main model** (`MODEL_QA`, Opus by default): everything else, where it has to dig (transcripts, several records, the books, nothing named), and every **Look it up properly**, which now also shows under a faster model's full-way answers ("Quick answer from the records").
- The faster model keeps all the tools, so it can still look further.
- `MODEL_QA_FAST=off` puts everything back on `MODEL_QA`.

Faster and cheaper? Faster: a smaller model starts writing sooner and writes faster; not yet timed with the real AI. Tokens: about the same number per answer, but Sonnet's weigh less against the plan's limits than Opus's (on the API, half the price: $2/$10 against $4/$20 per million). The log line now has `model` and `model_why`; compare `total_ms` and `first_text_ms` before and after.
