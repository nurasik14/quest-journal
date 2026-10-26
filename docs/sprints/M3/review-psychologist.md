# Sprint M3: review / retro (quest-psychologist)

> 2026-10-26 · Author: quest-psychologist · Inputs: `sprint-goal.md`, `plan-psychologist.md`, `PROGRESS.md` §M3,
> `test-reports/2026-10-26-M3.md` (PASS, 6 low + 4 nits), code (`server/src/{prompts,quest-rules,domain,generation}.ts`,
> `web/src/lib/{copy,theme/vocab}.ts`) and screenshots `M3-06`, `M3-11`.
> The user is asleep, so judgment calls are marked **PROVISIONAL**.

## Verdict
**Accepted, with three trust issues to fix before M4 makes the AI more personal.** The core is right: the server owns the economy,
gratitude and private days never reach the prompt, the phone never hangs, reroll is cheap and doesn't touch other quests, and the boss is never swapped under the user's thumb.
The two real Sonnet calls passed every rule on the first attempt in about 10 s. So the prompt and the validator agree, and the validator isn't doing all the work.

The problems are all about **honesty of explanation**. In each one, the app tells the user something that isn't true:
1. The fallback banner says "Claude couldn't be reached" even when Claude answered and our own rules rejected the reply.
2. A `too_long` reroll can come back *longer* when it falls back to the pool (tester N3).
3. The "Try again" helper promises the shelf when Claude is actually called first (tester N1).

None of these corrupts data. But they are exactly the small lies that teach a user to stop trusting the app's words, and Maomao's whole voice depends on blunt accuracy.

## 1. Acceptance criteria check (psychologist-AC1…AC22)

| AC | Result | Evidence / note |
|---|---|---|
| AC1 slots in order | PASS | `validateDay` `slot:i`. Tester live fixture `slot:0\|slot:1` → pool |
| AC2 coins from tariff | PASS | `coins:9999` stripped, stored 10/20/20 (G6). Strip-not-reject (PROVISIONAL 21) is the better call: no 60 s retry for a field we ignore |
| AC3 variety / similarity | PASS | `normalizeTitle` strips accents, café/cafe unit test, 14-day window includes `rejected[]` and private titles (avoided locally, never sent: good) |
| AC4 money | PASS | `money` violation. Energy 1 all free |
| AC5 feasibility | PASS | `MAX_MINUTES`, `small_win` with the energy-5 waiver, `done_when` required in the JSON schema |
| AC6 safety blocklist | PASS, **over-broad** | "Breakfast" is OK. But bare `sake`, `fast`, `diet`, `wine`, `drunk` also match ordinary English that Maomao would plausibly write: "for its own **sake**", "walk **fast**", "a varied **diet** of genres", "**wine**-red", "tea **drunk**" (LOW-1). Each false positive costs about 20 s (two real calls) plus a fallback banner that blames Claude. See must-change #1 |
| AC7 title form + soft tone | PASS | emoji → retry. `should\|must` → `tone_warnings` counted in `/api/health`, no retry |
| AC8 canonical template | PASS | One template in `prompts.ts`, single-pass fill, a test that no `{{` is left. `mode` is passed, but nothing sets it yet (always `normal`) |
| AC9 exclusions | PASS | `ZZGRAT`/`ZZPRIVATE`/`ZZPRIVTITLE` absent from the real stdin. Missing days are omitted, and the header says "days not listed carry no meaning" (good: no "missed" framing reaches the model) |
| AC10 decay | PASS (unit) | 30-day avoid window. 👎 → title, never category ("avoid the kind, not the whole category") |
| AC11 empty profile | **PARTIAL** | The rule is in the prompt. But the real boss smoke returned "Make a one-page manga about a day in **your favorite café**" with an empty profile. That isn't a named place, but it's still a claim to know a preference. Nobody did a systematic real-call check (2 calls total). See should-change #5 |
| AC12 no surveillance voice | **PARTIAL** | The prompt rule is present (rule 9). The soft check for quoted mood words or ratings isn't implemented (existing COULD). Acceptable for M3, but it should land before M4 adds insights |
| AC13 reroll chips | PASS | 5 chips + "Just swap", typed `reason`, parity test |
| AC14 replacement rules | **PARTIAL** | AI path: PASS (`same_category`, `money`, `too_long`). Pool path: `too_long` can't be honoured, because pool items have no `minutes` (N3: "Study for an hour at a café" offered after "too long"). Also, the reroll validator doesn't preserve the **small win**: rerolling the only ≤15-min quest can leave a day of three 40-minute quests at energy 2 |
| AC15 reroll never punishes | PASS | Other IDs and statuses untouched, `earned_today` unchanged, Swap disappears with no "0 left" text, and the rejected quest is never shown as let go |
| AC16 pool reroll | PARTIAL | Same N3 issue. Otherwise identical UI |
| AC17 boss contract | PASS | 4 checkpoints, artifact, type rotation, cost ≤ low. Exam-mode type restriction isn't enforced, but no mode is ever set, so nothing is lost yet |
| AC18 never swap under the thumb | PASS | Ticked placeholder kept (tester G18). Loader instead of a tickable placeholder (`M3-01`) |
| AC19 boss copy | PASS, nit | "N of 4", seal offer, "Sealed for the week.", no "+100" text. Nits from `M3-11`: (a) the coin chip still reads **100** on the boss tag row, which is a softer form of the same promise; (b) "Sealed for the week." and "Done. Sealed in the le…" are shown twice in a row |
| AC20 never hangs | PASS | 202 in 0.26 s while hung. The loader survives navigation, and the Evening draft survives too (the main M2 MUST is closed) |
| AC21 fallback reads as a feature | **PARTIAL** | One neutral banner, no red, no regenerate button: good. But the copy `FALLBACK_NOTE` ("Claude couldn't be reached") is shown for *every* `fallback_reason`, including `invalid_output` from our own rule rejections and `rate_limited`. That's false in the most common fallback case. See must-change #2 |
| AC22 honest numbers | PARTIAL | Partial tier shown, and the DOM sum = `earned_today` (PASS). The let-go card still has a coin badge (known, needs a designer prop) |

Score: 15 PASS, 7 PARTIAL, 0 FAIL. None of the partials corrupts coins or data.

## 2. What went well
- **Validator-first design paid off.** Business rules are pure, table-tested, and each has a hostile fixture. The tester could break every rule live through the real spawn path. This is the most important psychological guarantee in the app: the AI *cannot* make an energy-2 day contain a 2-hour hike.
- **The economy is out of the model's reach.** Strip, then map explicitly, then tariff. `questEarnings` clamps hand edits to 0..100 and honours them. That's the PROVISIONAL decision I asked for: Nurasyl's own ledger counts.
- **The privacy boundary is real.** Gratitude is never read. Private days are dropped from the prompt but still used for local similarity, which is a clever split: the AI won't repeat a quest it never saw. Canaries were verified in the real stdin.
- **Async with no thumb-swaps.** Boss preemption keeps the check-in instant. The loader keeps its phase across navigation, there's no duplicate POST, and the placeholder swap is guarded by the ETag + untouched check. This removes the "app is broken" moment that would otherwise kill a daily habit in its first week (habit formation depends on low friction at the cue: Lally et al. 2010; Fogg 2019).
- **Reroll is cheap.** One tap, an optional reason, no confirm dialog, and a failed reroll doesn't consume the swap. Autonomy-supportive (Deci & Ryan, SDT), and it gives us honest 👎-style signal without a guilt cost.
- **Copy discipline held.** The banned-word scan runs in tests. "Paused today, no penalty." at energy 1 is exactly right.

## 3. Must change (before or during M4)
1. **Narrow `SAFETY_BLOCKLIST` to unambiguous forms (SHOULD, top of the list; raises LOW-1).** It isn't a backlog MUST by definition, because no data or coins are at risk and the pool still serves a day. It's raised because every false positive turns a *good* AI day into a fallback with a false "Claude couldn't be reached" banner and about 20 s of extra waiting. `sake` alone will fire on "for its own sake", a very natural Maomao phrase. PROVISIONAL replacement rules:
   - drop bare `sake|wine|drunk|fast|diet`
   - use phrase forms: `\b(get|getting) drunk\b`, `\b(drink|drinking|have|having|try|order) (a |some )?(beer|wine|sake|vodka|alcohol|cocktail)s?\b`, `\balcohol(ic)?\b`, `\bfasting\b`, `\b(intermittent|water|juice) fast\b`, `\b(go|going|be|start|try) on a diet\b`, `\bdiet(ing)?\b(?! of)`, `\bcalorie(s)?\b`
   - keep `all-nighter`, `no sleep`, skip-meal, taste/eat-plant, forage, weigh-yourself as they are

   Table test, positive cases: "Get drunk at karaoke", "Order a beer", "Try a juice fast", "Count calories". Negative cases: "for its own sake", "wine-red notebook", "tea drunk slowly", "walk fast to the library", "a varied diet of manga genres", "Breakfast". The prompt's rule 8 remains the first line of defence. The regex is a backstop and should only catch clear violations.
2. **Fallback copy must match the cause (SHOULD, honesty).** `fallback_reason` is already stored. Map it:
   - `claude_missing | claude_not_logged_in | timeout | exit_* | rate_limited` → "From the apothecary's own shelf today: Claude couldn't answer, so these come from your saved pool."
   - `invalid_output | ai_error` → "From the apothecary's own shelf today: Claude's draft didn't fit your rules, so these come from your saved pool."

   Both are neutral and true. They're designer-owned strings in `vocab.ts` (`FALLBACK_NOTE` becomes a 2-key map). The builder selects by code.
3. **A reroll must respect what the user just said (SHOULD).**
   - (a) Seed pool quests get an optional `minutes`. Until a quest has one, the `too_long` pool path excludes any pool quest whose title or `why` matches `\b(hour|hours|\d{2,} ?min)\b` and prefers `easy`-length candidates in the same slot. If nothing fits, fail the reroll honestly ("The cat couldn't find another one. This one stays.") rather than return something longer.
   - (b) `validateReroll` and `selectReroll` keep the **small win**: if the rejected quest was the day's only quest with `minutes ≤ 15` and energy < 5, the replacement must also be ≤ 15 min.

## 4. Should change
4. **Show `minutes` and `done_when` on the card (answers the builder's open question).** Yes, show both. `done_when` is an implementation intention in all but name: a concrete, checkable end state roughly doubles follow-through on average (Gollwitzer & Sheeran 2006, d≈0.65). `minutes` lets a low-energy user pick the right quest in under a second, which is the whole point of the slots.
   - PROVISIONAL layout (designer owns it): a muted "~15 min" chip on the tag row, and `done_when` as one muted line "Done when: …" under `why`, clamped to 2 lines and expandable on tap.
   - Shorten `done_when` at the source: the prompt says "≤ 90 characters, one clause", and the JSON schema stays at 160 as a cap.
5. **Real-call quality check for hallucinated intimacy (AC11).** Before M4 fills the profile, run a small offline audit: 5 real daily + 2 boss calls on a scratch `DATA_DIR` with an empty profile (budget: the tester's smoke allowance, spread across sprints). Grep `why|title|checkpoints` for `\byour (favou?rite|usual|regular|go-to)\b` and for proper nouns that aren't in the context. Add `your (favou?rite|usual|regular|go-to)` to the soft `tone_warning` set when the profile is empty (logged only, no retry). Also add to the prompt: "With an empty profile, say *a* café, never *your* café."
6. **Gentle restart should land with M4, not "later".** Now that real AI days exist, coming back after 2+ missed days is the highest-risk moment for abandonment (the "what-the-hell effect": Polivy & Herman 1985; missed days don't damage habit formation unless they become a stop: Lally et al. 2010). The existing COULD (gap detection + `mode: gentle_restart`) is cheap because `mode` is already plumbed. I recommend the builder take it as SHOULD in M4. No new item: it's a priority note on the existing one.
7. **Boss tag-row "100" chip.** Until M5's `bossCoinsFor`, show the chip without a number on the boss card (or hide it). This matches the "no +100 promise" decision. Merge with the designer's "boss done 勝 seal pushes coin chip" COULD if convenient. Also drop the duplicate "Done. Sealed in the ledger…" line when the in-card note already says "Sealed for the week.".
8. **Soften one seed quest.** "Do 4 Pomodoros on the course you're **avoiding most**" with "the one you keep putting back on the shelf" (`M3-06`) has a mild shame frame: it names avoidance. Prefer "Do 4 Pomodoros (25/5) on the course that feels heaviest right now" with the why "Bitter medicine goes down easier in small cups." This is a data edit in `docs/brainstorm/seed/quests.yaml`. Fold it into the existing boss-seed-nits COULD pass.
9. **Try-again helper copy (tester N1).** `copy.noQuestsDetail` → "Try again asks Claude first, then the apothecary's own shelf."
10. **Tone check visibility.** `tone_warnings` is a single counter in `/api/health`. Split it by rule (`should_must`, `quoted_mood`, `your_favorite`), so prompt drift is visible over weeks without logging any content.

## 5. Answers to other agents' questions
- **Architect (boss swap UX: a / b / c):** what shipped is effectively **(b)**: a brewing loader in the boss slot while `boss_pending`, with the pool boss written underneath as the fallback. I endorse it over (a). A visible pool boss with a "still drafting" note invites a tick and then a swap, or teaches the user to ignore the first boss they see. (b) costs about 10 s on one open per week. The discarded AI boss is dropped (PROVISIONAL 31), as I proposed. One condition: if `generate_boss` is preempted 3 times or fails, `boss_pending` must flip to false so the pool boss appears. The tester saw that path work. Keep a regression test.
- **Builder (Sonnet vs Haiku):** **keep Sonnet for the daily and boss calls** (PROVISIONAL). They run once a day or once a week behind an async loader, and personalization quality is what M4 is about. 10 s is fine. For **reroll**, the user waits in-card, so latency matters more. Keep Sonnet for now and log reroll `elapsed_ms`. If the p50 is over 15 s across a week of real use, try `AI_MODEL_REROLL=haiku` and compare the first-attempt pass rate (`attempts == 1`). Decide on data, not taste.
- **Builder (show `minutes`/`done_when`?):** yes. See §4.4.
- **Tester LOW-4 (404 vs 409 for an unknown reroll ID):** 404 is correct. Fix the AC text, not the code. No user-facing impact.
- **Designer (let-go coin badge):** still my SHOULD. The let-go card should look settled, not like an unpaid debt. Needs the `QuestCard` prop (the existing item stays).

## 6. Process note (what to do differently next sprint)
- **My ACs need a "copy truth table" for every state that explains a cause.** I specified *that* a fallback banner shows, but not that its words must match `fallback_reason`. Next sprint, every explanatory string gets a row of the form "state/code → exact text → why it's true".
- **Safety and quality regexes need negative fixtures from real model prose**, not only the one famous false positive ("Breakfast"). I'll ship a 10-positive / 10-negative table in my plan, and the tester adds every false positive they find.
- **Real-call budget:** plan it explicitly per sprint (e.g. "tester: ≤3 real calls, boss included"). The tester's accidental second call came from the auto-queued boss job, not from carelessness. A `AI_BOSS_ON_OPEN=false` switch for smoke runs (or the tester using `AI_ENABLED=false` after the first call) would make the limit enforceable. Flagged for the architect.
- **Pool content is now the fallback voice of the app.** It should get the same tone review as the AI output. I'll review `quests.yaml` copy in the M4 planning pass.

## 7. PROVISIONAL decisions in this review
- The blocklist narrowing is SHOULD, not MUST: it fails safe (to the pool), and nothing is corrupted.
- Keep Sonnet for every call kind for now. Revisit reroll latency with a week of real data.
- Boss UX: endorse the shipped loader (option b) over the architect's default (a).
- Show `minutes` and `done_when` on cards. The layout is the designer's call.

## 8. Backlog items added
See `docs/BACKLOG.md` → "Added by quest-psychologist in the M3 review".
