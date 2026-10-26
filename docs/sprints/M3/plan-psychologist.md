# Sprint M3: planning (quest-psychologist)

> Scope: `server/ai.ts` (`claude -p` runner, context builder, daily 3 + weekly boss, reroll, pool fallback) and the async loading UI.
> My angle: **M3 is when the quests start talking back.** The prompt and its validation now decide whether quests are feasible, varied,
> safe and kind. The context builder decides what the AI "knows" about Nurasyl. Refs: `motivation.md` §1.4, §2, §4.3, §6, §7 and
> the canonical prompt template (Seed data). The user is asleep, so judgment calls are marked **PROVISIONAL**.
> Per my M2 retro, the ACs are **journeys and hostile fixtures**, and every displayed number must equal the derived number.

## 1. Acceptance criteria

**A. Generated output: server-side business rules** (the stub returns the fixture, and the rule failure → `invalid_output` → 1 retry → pool)
- **psychologist-AC1 (slots):** The difficulties the AI returns must equal `ENERGY_SLOTS[energy]` **in order**. The server reads the slots
  from the energy at job start, so a mid-job energy change doesn't change them. Hostile fixture: energy 2 and the AI returns a `hard` → retry.
  The second bad reply → pool, with `generation.source: pool`.
- **psychologist-AC2 (coins):** `coins` always comes from `TARIFF[difficulty]`. Fixture: the AI adds `"coins": 500` → either rejected by the
  strict schema (and retried) or dropped. Either way the stored value is 10/20/35. No AI field can change the economy.
- **psychologist-AC3 (variety):** There are 3 distinct categories. No title case-insensitively equals, or has a normalized Levenshtein similarity
  above 0.8 to, a title from the last 14 days (motivation §7.5). Fixture: "Visit a cafe you've never tried" vs the stored
  "Visit a café you've never tried." → rejected.
- **psychologist-AC4 (money):** At most 1 quest has `cost ≠ free`. At energy 1, every quest is `free`. A missing `cost` counts as `free`. Fixture:
  two `low` → retry.
- **psychologist-AC5 (feasibility):** `minutes` must fit the difficulty: easy ≤ 20, medium ≤ 60, hard ≤ 180. At least one quest has
  `minutes ≤ 15`, except at energy 5 (the waiver from the M2 plan R4, PROVISIONAL). `done_when` isn't empty. Fixture: an easy quest at 45 min → retry.
- **psychologist-AC6 (safety blocklist):** A case-insensitive word-boundary regex over `title + why + done_when` triggers a retry. The list:
  `fast(ing)?|calorie|diet|alcohol|beer|wine|vodka|sake|drunk|all-nighter|no sleep|skip (a )?meal|taste (the )?(poison|plant|herb|mushroom)|forage|weigh yourself`.
  It lives as one exported constant in `domain.ts`, and the table tests cover it. Fixture: "Taste a wild mushroom like Maomao" → retry, then pool.
  The false-positive check: "Breakfast" must **not** match (word boundary).
- **psychologist-AC7 (title form):** The title is ≤ 70 chars (the prompt) and ≤ 80 (the hard cap), and has no emoji (`\p{Extended_Pictographic}`). `why` is ≤ 160
  chars (the prompt) and ≤ 240 (the cap). **Soft tone check (logged, no retry, PROVISIONAL):** `\b(should|must)\b` in `why` adds a
  `tone_warning` to `/api/debug/ai`. A 30 s retry for one word costs more than the word does.

**B. Context builder: what the AI may and may not see** (the tests assert on the prompt string the stub received)
- **psychologist-AC8:** The prompt follows the canonical template. It includes the energy, weekday, `mode` (default `normal`), slots + slot rules,
  the 14-day history lines (energy, status, 👍/👎, let-go reason), `category_counts` for the last 7 days, recent titles and `rejected[]` (with reasons).
- **psychologist-AC9 (exclusions):** **Gratitude is never in the prompt. `private: true` days are never in the prompt.** Missing days are
  **omitted**, not rendered as "missed" or "no data". Fixtures: a private day containing the marker `ZZPRIVATE`, and a gratitude containing `ZZGRAT`.
  Neither string appears in the captured prompt.
- **psychologist-AC10 (decay):** `rejected` entries and 👎 older than 30 days are left out of "Avoid". A single 👎 adds that *title* to Avoid,
  never its category.
- **psychologist-AC11 (empty profile, the M3 reality):** `kb/profile.md` is still the neutral template until M4. Empty blocks render
  `(none)`, and the prompt adds: "If the profile is empty, write general quests for a university student. Never claim to know Nurasyl's likes,
  places or schedule." Real-call check: `why` texts mention no invented specifics (no named café, course or friend that isn't in context).
- **psychologist-AC12 (no surveillance voice):** The rule added to the prompt is: "Never quote ratings, mood tags or notes back in `why`, and never comment on
  health or mood." Fixture: a history line with `S=2 mood=[lonely]`. A `why` that contains a digit rating or a mood word from history → soft
  `tone_warning` (logged). PROVISIONAL: soft, not a retry.

**C. Reroll: cheap, informative, never punishing**
- **psychologist-AC13:** Tapping Swap opens the 5 reason chips (`too_long | costs_money | not_today | boring | not_me`) and "Just swap". That's one
  tap, with no confirm dialog. `rejected[]` gets `{title, category, difficulty, reason?}`, with `reason` typed from `REROLL_REASONS` in `domain.ts`.
- **psychologist-AC14:** The replacement keeps the **slot difficulty** and the coins, and its category is ≠ the rejected one and ≠ the other two. Reason rules:
  `costs_money` → the replacement is `free`. `too_long` → its `minutes` are < the rejected quest's `minutes` (when known). Fixtures for both.
- **psychologist-AC15:** A reroll never changes coins, streaks or other quests. The other two cards keep their IDs and status (the journey: mark quest 1
  done → reroll quest 2 → quest 1 is still done and `earned_today` is unchanged). When the reroll is used, Swap **disappears**, with no "0 left" text.
  The rejected quest is never shown as "let go".
- **psychologist-AC16:** A pool-day reroll works the same way (from the pool, honoring the same rules), and so does a reroll whose AI call falls back. The UI
  doesn't distinguish the two beyond the existing "from the shelf" tag.

**D. Weekly boss**
- **psychologist-AC17:** The AI boss has a `type` ≠ last week's type, exactly 4 independently checkable checkpoints, an artifact, and
  `cost ≤ low`. Its `why` (≤ 200) is in Maomao's voice. In exam mode the type is `learn` or `restore`. Fixtures: the same type as last week → retry;
  3 checkpoints → retry.
- **psychologist-AC18 (never swap under the user's thumb):** An AI boss may replace the pool placeholder **only** while it's untouched (status open,
  0 checkpoints done, no feedback, ETag unchanged). Journey: tick checkpoint 1 on the placeholder → the AI job finishes → the placeholder is kept and the AI
  result is discarded. While `generate_boss` is running, the boss card shows a loading state (`LOADING.boss`), not a tickable placeholder
  (PROVISIONAL, see the question below).
- **psychologist-AC19:** Boss copy: progress reads "N of 4" (counting up, never "remaining"). Ticking all 4 offers "All four ticked. Seal the
  week?" (no auto-complete). "Done" shows "Sealed for the week." with **no +100 promise** until M5's `bossCoinsFor`.

**E. Waiting and falling back: the phone never hangs**
- **psychologist-AC20:** `POST /api/today/checkin` returns 202 while the job is `running`, in under 500 ms with a stub that sleeps 30 s. The UI shows
  HerbLoader (`LOADING.generate`, then `slow` at 15 s and `verySlow` at 45 s). Journey: check in → tap Evening → write a note → back to Today
  → the quests are there and the note draft survives (see B1).
- **psychologist-AC21:** On fallback, the day shows pool quests with the "from the shelf" tag and the `FALLBACK_NOTE` banner once. The banner is
  neutral, with no red. There's **no** "regenerate the whole day" button once any quest has been touched (reshuffling is a trust break, M2-AC2).
  PROVISIONAL: no regenerate button in M3 at all. The reroll covers single misses.
- **psychologist-AC22 (honest displayed numbers):** Each card shows `earned` from the server (`questEarnings`). A partial hard card shows 20, and a let-go
  card has no coin badge and no strike-through. The header total equals the sum of the cards. Test: the DOM sum = `earned_today`.

**F. Copy (verbatim, with the file owner named)**
| Where | Text | File / owner |
|---|---|---|
| Generating | "Maomao is grinding herbs…" (replaces "choosing today's herbs") | `vocab.LOADING.generate` / designer |
| Very slow | "Claude is slow today. If there's no answer, the apothecary's own shelf has backups." | `vocab.ts` / designer |
| Reroll running | "Fetching another prescription…" | `vocab.ts` / designer |
| Partial note | "+{n} taels. A smaller dose still counts." | `copy.ts` / builder |
| Boss done (until M5) | "Sealed for the week." | `copy.ts` / builder |
| All checkpoints | "All four ticked. Seal the week?" | `copy.ts` / builder |
| Evening 412 toast | "Not sealed yet. This page changed elsewhere; your text is still here." | `copy.ts` / builder |

The banned-word grep (rendered text only) is the M2 pattern plus `\b(should|must|hurry|last chance)\b`. "Nothing was lost" is allowlisted.

## 2. Risks: what the builder will likely get wrong
- **R1: Trusting the model's numbers or labels.** It's easy to save `coins` or `difficulty` straight from the JSON. The slots and tariff are server truth (AC1–2).
- **R2: Validation that only checks shape.** Zod passes, but the energy-2 day contains a 2-hour hike. The business rules (AC1–7) are where the psychology lives.
  Write the hostile fixtures **first**.
- **R3: Leaking gratitude or private days** through a generic "last 14 days" serializer that dumps the whole file. → AC9 marker test.
- **R4: Hallucinated intimacy.** With an empty profile, Sonnet invents "your favourite café on Main St". It feels creepy, and it isn't true. → AC11.
- **R5: Reroll implemented as "regenerate the day".** It reshuffles completed quests and destroys trust. → AC15 journey.
- **R6: The boss swaps after the user has read it or ticked it.** → AC18.
- **R7: Inline awaiting slipping back in** (M2 awaited the job). A 60–125 s HTTP request on a phone over Tailscale = "the app is broken". → AC20.
- **R8: Retry storms.** Soft tone issues triggering retries can double the latency for no user benefit. Keep tone checks logged-only (AC7, AC12).
- **R9: A fallback that reads like a failure** ("Error: Claude unavailable", red banner). The pool is a feature. → AC21.
- **R10: The prompt template drifting** into a second copy inside `ai.ts` that diverges from motivation.md. Keep one template file
  (`server/src/prompts/daily.md` or similar), filled by placeholder replacement, with a test that every `{{placeholder}}` gets filled.
- **R11: Real-`claude` smoke runs on real data.** Any real call must use a scratch `DATA_DIR` with a synthetic profile. Never `~/quest-data`.

## 3. Backlog items I think belong in M3
**MUST**
- **B1** (psych, M2 review) The Evening draft survives in-app navigation and a 412: a memory-only `$state` store, `beforeunload` while dirty, and the 412
  panel scrolled into view and focused, with the toast. M3's async loading makes the user jump between pages more often, so this is now the default path.
  It merges with the designer's 412 MUST.
- **B2** (psych) The AI business-rule validator + hostile fixture suite (AC1–7, AC14, AC17), as a pure function `validateDay(output, ctx)`
  that returns violations. Pure, so the tester can table-test it without spawning anything.
- **B3** (psych) The context builder's exclusion rules (AC9–12) as a pure `buildContext(...)` → string, snapshot-tested with marker fixtures.
- **B4** (builder backlog) Async check-in (202 while running). → AC20.

**SHOULD**
- `REROLL_REASONS` + a typed `rejected[].reason` in `domain.ts`/schemas (existing). → AC13.
- `questEarnings(q)` + a server-derived `earned` per quest (architect + psych items, merged). → AC22. **My answer to the architect's open question
  (PROVISIONAL):** a hand-edited `coins:` **counts**, clamped to 0..100. It's Nurasyl's own ledger and there's no one to cheat. Ignoring his
  edit would be paternalistic, and the clamp limits accidents.
- The boss "Done" note, "N of 4", and the seal-the-week offer (existing). → AC19.
- The architect's boss placeholder vs AI decision, with my "untouched only + loading state" condition. → AC18.
- `childEnv()` allowlist for the `claude` spawn (architect). It's privacy-relevant, because no stray secrets go into the AI subprocess.
- Theme copy fixes (`LOADING.verySlow`, `STATUS.partial.note`, HerbRating hint): designer-owned, needed for the F table.
- `backfilled: true` on past-date evening saves (existing, tiny).

**COULD**
- The "Welcome back. The herbs kept." line after a gap of 2 or more days, plus `mode: gentle_restart` for that day's generation (slots forced to energy-2 style). The
  context builder already passes `mode`, so this is one date check. (Existing B7.)
- Boss seed nits (re-type "Five Morning Tonics", add one restorative boss, make "show a friend" optional). These are data-only edits.
- `/api/debug/ai` shows `tone_warning` counts, so prompt drift is visible over weeks without logging any content.

**Not in M3:** rest-day declaration, curiosities, streaks/balance (M5), reflect/insights (M4).

## 4. Question for the other agents
**To quest-architect:** for AC18, can `GET /api/today` expose a `boss_pending: true` flag (the week was created with a pool placeholder *and*
a `generate_boss` job is queued or running), so the UI shows the boss as "brewing" instead of a tickable card that might be swapped
seconds later? And if the AI job finishes after the user has already ticked the placeholder, should the discarded AI boss be kept anywhere (e.g. as
a spare for next week's pool), or just dropped? My PROVISIONAL view is to drop it, because a boss nobody chose shouldn't haunt the next week.
