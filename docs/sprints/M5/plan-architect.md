# M5 sprint plan: architect

> 2026-10-26 · `quest-architect` · async (the user is asleep). Every judgment call marked **PROVISIONAL** needs Nurasyl's confirmation.
> Scope (builder-common): coin values, idempotent awards, ledger, streaks + streak bonus + freeze token, Palace Market (buy, insufficient funds,
> purchase log, wishlist), coin badge in the header, seal-stamp + sticker reactions.
> Inputs: ARCHITECTURE.md §Economy, brainstorm §2.1/§2.3–2.5, motivation §3.1–3.7, M4 reviews, BACKLOG, `server/src/{domain,schemas,store,today,init,git}.ts`.
> Current state: `TARIFF`, `PARTIAL_TARIFF`, `questEarnings()` and `earned_today` exist. `rewardsFileSchema` reads the seed (`rewards:`/`title`).
> There's no `purchases.yaml` schema, no balance, no streak code, and `Market.svelte` is a placeholder. `git.ts` already knows the `purchase` kind.

## Why M5 is an integrity sprint
This is the first time the app holds a **number that the user can spend**. The rule from brainstorm §2.4 stays: **earnings are derived, spending is
stored**. So a wrong balance can only come from (a) a derivation bug, (b) a race on the spend side, or (c) a broken file being read as "zero".
Each AC below closes one of these. The asymmetry matters most: if an *earning* file is broken, the balance comes out **too low**, which is safe.
If the *spending* file is broken and gets read as empty, the balance comes out **too high**, which is unsafe. Never treat it as zero.

## 1. Acceptance criteria (explicit `code → status` pairs; fixtures first)

**Derivation (pure, no I/O)**
- **architect-AC1 One pure ledger function.** `computeEconomy({days, weeks, purchases, today, config}) → Economy` in `server/src/economy.ts`. No fs, no
  clock and no randomness inside it. Every route that shows coins (`/api/today`, `/api/economy`, `/api/shop`, every PATCH/purchase response) uses it.
  `earned_today` and the balance both go through `questEarnings()`. Table test: the same inputs → a deep-equal output, run twice.
- **architect-AC2 Earnings.** `earned_total` = Σ `questEarnings(q)` over daily quests in parseable day files with `date ≤ logical today`
  + Σ boss earnings over parseable week files whose week ≤ the current ISO week + `streak_bonus_total`. **Future-dated files (hand-made) earn 0** and
  add a `future_file` warning. Legacy `coins:`/`streak:` keys in day frontmatter are ignored (PROGRESS PROVISIONAL 7).
- **architect-AC3 Boss earnings.** A pure `bossCoinsFor(done, total, completed)` (psychologist backlog item): 15 per ticked checkpoint + 40 on
  completion = 100. With no checkpoints: done 100, partial 50, otherwise 0. The result is capped by the snapshot `min(…, clamp(boss.coins ?? 100, 0, 100))`.
  Never negative. Table test including 0/4, 4/4 not sealed (60), 4/4 sealed (100), a hand-edited `coins: 500` (capped at 100), and `coins: -5` (0).
- **architect-AC4 Idempotent awards.** Because earnings are derived from status, `PATCH done` ×3, `done→open→done`, and `done→partial→done` each
  change the balance exactly by the net difference. A same-value PATCH returns 200 with `changed:false`. The UI uses `changed` to decide on the seal or sticker
  reaction, so a retried or duplicate request **never replays the reward animation**. Test: 10 concurrent `PATCH done` → balance +tariff once.
- **architect-AC5 Streak + freeze tokens, derived by replay (nothing stored).** Walk logical dates from the first counting day to today:
  a day *counts* if ≥1 daily quest is `done|partial`, **or** its ledger is saved (`satisfaction != null` or any owned section is non-empty) (PROVISIONAL, motivation §3.5).
  On every 7th consecutive day: +`STREAK_BONUS` (default 25), and +1 token (held max 2). A non-counting day **before today** uses one token if one is held
  (the streak survives, but the day isn't added to the count), otherwise the streak resets. **Today not counting yet never uses a token or resets the streak.** Broken
  day files count as non-counting, with a warning. Output: `streak, longest_streak, freeze_tokens, streak_bonus_total, next_bonus_in_days, days_logged,
  quests_done`. Table fixtures: a 7-day run (bonus + token), a gap of 1 with a token (survives), a gap of 3 with 2 tokens (resets), a 14-day run (tokens capped at 2
  after 21), a 03:59 vs 04:00 boundary, and a DST week (Europe/Berlin).
- **architect-AC6 Invariance.** Text-only edits (evening notes of any length, onboarding save, proposal decide, kb PUT) never change any economy
  field, on a fixture where the balance is non-zero (e.g. 135) (closes psychologist backlog "coin invariance with non-zero earnings").

**Spending (stored, serialized)**
- **architect-AC7 `purchases.yaml` schema** (brainstorm §2.1, `schema: 1`): `purchases[]: {id, request_id, item_id, title, price, at, date, voided_at}`,
  `adjustments[]: {amount, reason, at, date}`, `wishlist[]: {item_id, added_at}` (PROVISIONAL: the wishlist lives here, so one mutex covers all shop state).
  `title`/`price` are **snapshots**, so a later `rewards.yaml` edit never rewrites history. A missing file = empty (init doesn't need to seed it). Unknown keys are
  preserved. Writes go through `store.updateYaml` (comment-preserving). Appended entries are **block-style**, not one flow line (lesson from M2 R-BUG-1).
- **architect-AC8 `POST /api/purchases {item_id, request_id}`.** `request_id` must be a UUID, else → **400** `bad_request`. Unknown keys → 400.
  Under the `purchases.yaml` mutex: re-read the file, recompute the balance, then append. Success → **201** `{purchase, economy, changed:true}`. A repeated
  `request_id` with the same item → **200**, the same purchase, `changed:false`, no write and no commit (this survives a restart because the id is persisted).
  The same `request_id` with another item → **409** `request_conflict`. Unknown item → **409** `unknown_item`. `balance < price` → **409**
  `insufficient_funds` with `details:{balance, price}`. Within the cooldown → **409** `cooldown` with `details:{available_on}`. Test: two concurrent purchases with
  different ids and a balance that covers only one → exactly one 201 and one 409.
- **architect-AC9 Cooldown in logical days.** `available_on = date(last non-voided purchase of item) + cooldown_days`. `cooldown_days: 0` means no limit.
  A purchase at 01:30 belongs to the previous logical date. The fake-clock test covers that.
- **architect-AC10 Void (undo a purchase).** `POST /api/purchases/:id/void {}`: unknown id → **404**. More than 24 h after `at` (injected clock) →
  **409** `void_window_closed`. A second void → **200** no-op `changed:false`. A voided purchase stops counting toward the spend **and** the cooldown.
  Nothing is ever deleted.
- **architect-AC11 Broken files fail safe.** `purchases.yaml` unparseable or invalid → `economy.balance: null` + a warning. `POST /api/purchases` → **422**
  `unparseable_file`/`invalid_file` with `details.raw` + `line` (parity with day files; closes the `updateYaml` parity COULD for this file). The file is never
  rewritten, so its bytes stay identical. `rewards.yaml` broken → `GET /api/shop` → 422 with the same calm contract (the existing quarantine UI). A broken day or week
  file → skipped + a warning, and the balance is understated, never inflated.
- **architect-AC12 Balance may go negative after an undo (PROVISIONAL).** `done→open` after a purchase can leave `balance < 0`. The API returns the true
  number, and purchases are refused until it's back above the price. How it's *shown* is the psychologist's and designer's call (see the question below).

**Routes, shape, git, performance**
- **architect-AC13 Routes.** `GET /api/economy`; `GET /api/shop` → `{items:[{id,title,price,cooldown_days,tier?,available_on,affordable,wished}], economy}`;
  `GET /api/purchases?limit=1..200` (default 50, newest first, 400 outside that range); `PUT /api/wishlist/:item_id` and `DELETE /api/wishlist/:item_id` →
  idempotent 200 with `changed`. Unknown item → 409 `unknown_item`. `/api/today.economy` is present on every load (feeds the header coin badge).
  Every quest PATCH response gains `economy`, so the badge never needs a second request.
- **architect-AC14 Commits.** Labels: `qj: purchase <item_id>`, `qj: void <purchase_id>`, `qj: wishlist`. A `changed:false` response never calls `git.touch`.
  A hand edit to `purchases.yaml` made before a purchase ends up in a commit **before or with** the purchase (the `(+hand edits)` label), checked with `git log -p`.
- **architect-AC15 Performance budget.** With a temp `DATA_DIR` holding 400 synthetic days + 58 weeks + 300 purchases, `GET /api/today` p95 is under 150 ms over 20 runs
  (logged in PROGRESS). Exceeding it → add an mtime-keyed cache (not before).

**Carry-overs from the M4 review (MUST/SHOULD, in my lane)**
- **architect-AC16 (MUST, tester MED-1).** `PUT /api/kb/profile|insights`: if the on-disk etag ≠ `store.lastWrittenEtag(rel)`, `git.touch({detail:"hand_edit"})` + flush
  **before** the write (as `today.ts:366-377`). Test: hand edit → PUT with the fresh etag → `git log -p -- kb/profile.md` contains the hand text (same for insights).
- **architect-AC17 (SHOULD).** `GET /api/insights/proposals/:id` → `isValidDate(id)` else **404**, plus a `..%2F..%2Fquests` regression case.
- **architect-AC18 (SHOULD).** `sanitizeOpText` strips U+00AD, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064 and U+FEFF **before** the `SUSPICIOUS_OP` test (`"ig­nore previous"` → flagged).
  Ops flagged `suspicious` are left out of the reflect prompt's `<declined>` block, but kept for the local similarity check (canary `ZZFLAGDECL` absent from stdin).

## 2. Risks: what the builder will likely get wrong
1. **Reading a broken `purchases.yaml` as `{purchases: []}`** (e.g. a `?? []` fallback on a caught error). This inflates the balance and lets the user overspend. Test it explicitly (AC11).
2. **Balance check outside the mutex.** Checking the balance and *then* taking the lock lets two taps both pass. The check, the `request_id` lookup and the append must all happen inside one `withFileLock`.
   Take **only** the purchases lock there. Never nest a day lock inside it, or the PATCH path (day lock) and the purchase path can deadlock.
3. **A stored streak or token counter.** Tempting, but it drifts the first time a past day is hand-edited or backfilled. Replay from the files every time (AC5). Backfilling can
   *retroactively* join two runs and create a bonus. That's deterministic and accepted (PROVISIONAL), but it needs a fixture so it's a known behavior.
4. **Using wall-clock dates.** `completed_at`/`at` must never decide the day. Only the logical date does (cooldown, streak, purchase `date`). 24 h void is the one wall-clock rule.
5. **The client generating a new `request_id` on retry.** Generate it once per *tap*, keep it across the network retry/offline banner, and replace it only after a definitive answer.
   Otherwise idempotency exists only on paper.
6. **Reward animation on every response.** It has to be driven by `changed:true` (AC4/AC8), or a slow-network double tap shows two seals for one award.
7. **Seed `rewards.yaml` uses `title`, while brainstorm §2.1 uses `name`.** Snapshot whichever the loader normalizes (`title`), and don't add a second field.
8. **Scanning everything on every PATCH** without measuring. Measure first (AC15). Don't cache before then, because a cache adds invalidation bugs with hand edits.
9. **Tester budget:** M5 needs **zero** real `claude` calls. Run with `AI_ENABLED=false` / the fake bin. Every economy test uses `fakeClock` + `makeTempDataDir` and never touches `~/quest-data`.

## 3. Backlog items I want in this sprint
**MUST**
- (architect, M5) MED-1 kb PUT hand-edit snapshot → AC16.
- (architect → manager) No AC may require writing outside the repo/`DATA_DIR`/scratchpad. **None of mine do this sprint** (all git checks use temp repos).
- (psychologist) `bossCoinsFor` → AC3. Coin invariance with non-zero earnings → AC6.

**SHOULD**
- (architect) Proposal id validation → AC17. Invisible-char strip + flagged ops kept out of `<declined>` → AC18.
- (architect) `updateYaml` parity (`raw` + `line` in `unparseable_file` details) for `purchases.yaml`/`rewards.yaml` → AC11.
- (architect, carried since M2) **Vite-proxy dev loop smoke, run by the tester *first*:** `bun run dev:server` + `bun run dev:web` with a scratch `DATA_DIR`, then a check-in, a quest done
  and one purchase through the proxy, with no 421/403. Skipped for 3 sprints, and the purchase POST adds a new Origin-checked mutation.
- (builder, M2→M3) Write `backfilled: true` on evening saves for past dates. It's needed so the psychologist's answer below can be implemented without a migration later.

**COULD**
- (psychologist) `bun run econ:sim`. It runs cheaply on top of the pure `computeEconomy`, and I'd like it if time allows (it validates the motivation §3.1 numbers).
- (architect) Decide crash window (an identical-text bullet means already applied). Proposal YAML decide via `updateYaml` (tester LOW-4).
- Out of scope for M5 (not in the milestone text): mystery curios, Apothecary's mercy, the monthly real-money budget. These go to the backlog, and I won't stub them.

## 4. PROVISIONAL decisions in this plan
P1 wishlist stored in `purchases.yaml` · P2 the streak counts done/partial **or** a saved ledger · P3 a negative balance is allowed in the API, and purchases are refused ·
P4 future-dated files earn 0 · P5 unknown item → 409 (brainstorm §2.3), not 404 · P6 void window is 24 h wall-clock · P7 nothing economy-related is sent to Claude
in M5 (the `balance`/`wishlist_top` prompt placeholders stay unfilled. Purchases are never sent, per brainstorm §2.12).

## 5. Question for the other agents (review)
**quest-psychologist:** should a ledger written *after* its logical day (`backfilled: true`) count as a streak day, and if it does, may it retroactively
create a streak bonus and a freeze token? Derived replay makes either answer cheap. "Yes" rewards honest catch-up writing, and "no" stops the bonus being
gamed through backfilling. Also: when an undo makes the true balance negative, should the badge show the real number, or "0" with no debt framing?
