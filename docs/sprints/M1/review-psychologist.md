# Sprint M1: review / retro (quest-psychologist)

> 2026-10-26 · async (the user is asleep). Inputs: `plan-psychologist.md`, `sprint-goal.md`, `PROGRESS.md`,
> `test-reports/2026-10-26-M1.md`, and the code in `server/src/{domain,schemas,init,app,store}.ts` and `docs/brainstorm/seed/quests.yaml`.
> There's no UI in M1, so I have no screenshots to review. I judged the increment as the **vocabulary freeze**: are the
> enums, defaults, seeds and copy that become permanent in the user's files right?

## Verdict: **accepted.** All 15 psychologist ACs are met. Three items need follow-up before M2/M3 build on them (see §3).

## 1. Psychologist acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1: 8 categories, single constant, aliases | PASS | `domain.ts` `CATEGORIES` has the right order. `CATEGORY_ALIASES` maps outside/rest/chores. `categorySchema` is derived from it and used by the day, boss and pool schemas |
| AC2: `open\|done\|partial\|let_go`, `failed` normalized | PASS | `STATUS_ALIASES` (also covers `fail` and `skipped`, which is a good addition). The tester saw `readDay` leave the file byte-identical and `updateDay` write `let_go`. `reason` is either a chip or free text ≤60 |
| AC3: tariff + `coinsFor` partial, never negative | PASS | `TARIFF` 10/20/35/100, `PARTIAL_TARIFF` 5/10/20, and `default → 0`. The tests are table-driven |
| AC4: `STREAK_BONUS` = 25 | PASS | `DEFAULT_STREAK_BONUS = 25`, and the config caps it at 0–1000 |
| AC5: seeds copied byte-for-byte | PASS | `COPYFILE_EXCL`, tester `cmp` |
| AC6: seeds parse, 48 / 6 per category / easy in each / prices | PASS | Tester: 48 quests, 6×8, an easy quest in every category, 10 bosses × 4 checkpoints, prices 50/150/350 |
| AC7: re-init never overwrites user prices or profile | PASS | `wx` / `COPYFILE_EXCL` |
| AC8: neutral templates | PASS | `INSIGHTS_TEMPLATE` is the heading only. `PROFILE_TEMPLATE` has 4 neutral headings, makes no claims about the user, and says "Written by you" (good for autonomy) |
| AC9: journal round-trip | PASS | Tester probe: Japanese text, emoji, `---`, a custom section and an unknown key all survive. A second save is a no-op *when the file is canonical* (see BUG-2 below) |
| AC10: missing → null, never clamped | PASS | `nullish()` gives null. `satisfaction: 11` → `invalid_file`. `mood` defaults to `[]` |
| AC11: optional psych fields, never auto-added | PASS | `mode`, `backfilled`, `prompt_id`, `minutes`, `cost`, `done_when` and `reason` are all `.optional()` without a default, so no keys get injected |
| AC12: boss `type` / `checkpoints ≤4` / `shrunk` | PASS | `bossSchema`. The tester round-tripped type and checkpoints |
| AC13: no `streak` / `coins_total` written | PASS | Tester grep |
| AC14: neutral 404 copy | PASS | "No ledger page for this date yet." contains none of missed/failed/streak/lost. "yet" works as a soft invitation to backfill |
| AC15: privacy-safe commit messages | PASS | Typed `{kind, ref}` reasons and sanitized refs. The injection test dropped the ref |

R7 (judgmental defaults) is also clean: `status` defaults to `open`, `energy`/`satisfaction` to `null`, and `feedback` to `null`.

## 2. What's good
- **Tolerant enums** (PROGRESS decision 1). This is the right answer to my question to the architect: a legacy word in a hand edit doesn't take the whole day offline.
- **The quarantine response returns the raw text** (B6). The user's words are never hidden behind a parse error. This is the backbone of trust in a journal.
- **The boss seed is in good shape.** Checkpoints are evenly sized and count up ("1 of 3"), which is the goal-gradient structure from motivation.md §2.1. Exam Antidote ends with a rest evening, so recovery is built into the exam week.
- **Hand-written quests get a coin snapshot** (decision 6). This respects autonomy: quests the user writes count as much as AI quests.
- **The builder didn't over-build.** No economy, streak or UI code leaked into M1.

## 3. What must change (ranked)

1. **Strict caps quarantine whole journal pages for trivial hand edits** (SHOULD, M2). `quests.max(3)`, `title.max(80)`,
   `reason.max(60)`, `rerolls_used.max(1)` and `mood[].max(24)` are all enforced **on read**. One long title written in
   Obsidian turns the whole day into `invalid_file`, which takes away the evening form and that day's coins.
   These caps protect *generation* quality (the job of the AI output schema), but they shouldn't decide
   whether a page the user wrote is readable. They also block motivation.md's planned 4th "curiosity" card (§4.5) and a
   possible paid second reroll (§8 #28) without a schema bump. **Proposal:** read-side schemas accept any length/count
   (they keep only type checks and the 1–10/1–5 rating ranges, which carry meaning). Write routes and the AI-output validation
   enforce the caps. Rating ranges stay strict on purpose (AC10).
2. **The UI for quarantined days needs a calm presentation** (MUST, M2). M2 is the first time the user can *see* a quarantined day.
   If today's page shows a crash, an empty screen or red "INVALID FILE" copy, the user is blocked from their main
   use of the app and their notes look lost. The read-only raw text plus "Your words are safe. Line N needs a fix in your
   editor." is required. Copy must avoid error/invalid/broken.
3. **BUG-2 (no-op save strips YAML comments)** should be fixed before the M2 evening form ships (SHOULD, M2). The
   evening form re-sends every field, so every unchanged save would rewrite an Obsidian-edited page. To the user, an
   app that silently rewrites their journal feels like it's grading their handwriting.
4. **Boss checkpoint payout isn't in the vocabulary module yet** (SHOULD, M5). motivation.md §2.1 specifies
   `15 × checkpoints_done + 40 on completion = 100`. Add a pure `bossCoinsFor(checkpointsDone, total, completed)`
   next to `coinsFor` so the tariff lives in one place. The fallback for a boss with 0 checkpoints (hand-written) is a flat
   100 on `done` and 0 otherwise. `partial` on a boss with no checkpoints gives 50.
5. **There are two reason vocabularies, and only one is typed** (SHOULD, M3). The let-go `REASON_CHIPS` exist, but the
   *reroll* reasons from §4.3 (too long / costs money / not today / boring / not me) don't, and `rejectedSchema` has
   no `reason` key (passthrough keeps it, but nothing is typed). Rerolls are the strongest personalization signal (§6),
   so add `REROLL_REASONS = too_long|costs_money|not_today|boring|not_me` and an optional `rejected[].reason`.
6. **Doc drift (minor).** motivation.md says `mood_tags[]`, and the code and architecture say `mood`. **PROVISIONAL:** `mood` is canonical, and I'll
   align motivation.md at the next brainstorm touch. No code change.

Seed content nits (COULD, user-editable data, so no code is needed): "Five Morning Tonics" is typed `restore`, but it's really
a body/effort boss. `make` or a future `move` type fits better. The rest-type boss rotation should get a truly restorative boss
(the seed has none apart from Exam Antidote's last step). "Yonkoma Week" checkpoint 4 bundles "show a friend" into the
last step, which gates boss completion on social exposure. That last part should be optional.

The tester's BUG-1 (DST), BUG-3 (CRLF) and BUG-4 (env) are architecture issues with no psychological impact for this user
(Asia/Almaty has no DST). I'm leaving them to the architect's review.

## 4. Answers to the other agents' planning questions

**Architect: "is `open|done|partial|let_go` final?"** Yes, final for schema 1. No status bump is expected in M5.
Streak-freeze, rest day and backfill are modelled as **day-level** `mode`/`backfilled` fields and as derived economy,
never as new quest statuses. The one thing I may add later is a reroll's `rejected[].reason`, and that's additive and optional.

**Architect: "boss pool in `quests.yaml` under `boss:` or a separate file?"** `quests.yaml` under `boss:`, as built.
One file to hand-edit keeps the user's mental model simple.

**My own question (tolerant enums vs migrate-only):** the builder answered it as tolerant (PROVISIONAL decision 1). I accept this.
I'd like the architect to confirm in their review that aliases stay a read-side rule and don't need a schema bump.

**For M5 (economy), raised now:** coins are derived from files, so a status flipped to `done` by hand in Obsidian
will earn coins. **PROVISIONAL position:** that's fine and intended. An honor system respects autonomy, and
policing a single-user journal would turn the reward into surveillance (motivation.md §4). Don't add anti-cheat.

## 5. Process note
- **What worked:** the vocabulary conflicts (C1–C7) were found during *planning* and resolved in `sprint-goal.md` with
  AC-level traceability. I want to keep that format.
- **Change next sprint:** M2 is the first sprint with UI, and **copy is psychology**. I'd like the M2 sprint goal to contain a
  short **copy table** (empty states, the quarantine notice, the let-go confirmation, the evening prompts and the 404/offline text)
  for the tester to assert strings against, the way AC14 did. I'll put the strings in my M2 plan. The tester should
  also grep the built SPA for banned words (`failed`, `missed`, `lost`, `streak broken`, `invalid`, `error` in
  user-visible text).
- **Schema caps:** caps like the ones in §3.1 should be listed in the plans as either a *read rule* or a *write rule*.
  This sprint didn't make that distinction, and that's how journal pages could end up quarantined over a long title.
