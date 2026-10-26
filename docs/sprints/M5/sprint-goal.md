# Sprint M5 goal: economy, streaks, Palace Market, reactions

> 2026-10-26 · quest-builder · merged from `plan-architect.md`, `plan-psychologist.md` and `plan-designer.md`, plus the open MUST items in `BACKLOG.md`.
> The user is asleep. Every judgment call the builder made between conflicting plans is marked **PROVISIONAL** and listed at the end.
> Source ids: `A-ACn` = architect, `P-ACn` = psychologist, `D-ACn` = designer.

## Acceptance criteria the builder commits to

### Derivation (pure, `server/src/economy.ts`, no I/O)
1. **One pure ledger function.** `computeEconomy({days, weeks, purchases, today, week, config})` takes no fs, clock or randomness. Every surface that shows coins uses it: `/api/today.economy`, `/api/economy`, `/api/shop`, every quest PATCH response and every purchase/void/wishlist response. Same input → deep-equal output. (A-AC1, P-AC1, D-AC1)
2. **Earnings.** Daily quests use `questEarnings` (snapshot clamped to 0..100; partial = the partial tier). Private days earn normally. Files dated after today (and weeks after this week) earn 0 and add a `future_file` warning. Legacy top-level `coins:`/`streak:` keys are ignored. A hand-edited `coins` > 100 is clamped and adds a `coins_clamped` warning. AI output never sets coins. (A-AC2, P-AC2, P-AC6)
3. **Boss coins: `bossCoinsFor(status, ticked, total, snapshot)`** in `domain.ts`. Done → 100. Partial without checkpoints → 50. Partial with checkpoints → max(50, 15 × ticked). Open or let go → 15 × ticked (max 60). The result is capped by `clamp(snapshot ?? 100, 0, 100)` and is never negative. Table test. (P-AC4; A-AC3's cap; **PROVISIONAL**: psychologist's formula wins over the architect's 15+40)
4. **Idempotent awards.** Earnings are derived from status, so `done` ×3, `done→open→done` and `done→partial→done` change the balance only by the net difference. Every PATCH response carries `changed` and `economy`. The UI plays a reward reaction only when `changed:true`. Test: 10 concurrent `PATCH done` → +tariff once. (A-AC4, P-AC3)
5. **Streak walk, derived by replay, nothing stored.** A logical day *counts* when it has ≥1 daily quest `done|partial`, a non-null `satisfaction`, or any non-empty Highlight/Notes/Gratitude. Energy alone does not count. Private days count. (P-AC7, A-AC5; **PROVISIONAL**: the union of both rules)
   - Each 7th consecutive count gives +`STREAK_BONUS` (25, flat) and +1 preserved herb (cap 2).
   - A past non-counting day during a run uses a herb automatically (the run continues but isn't incremented). With no herb, the run rests (back to 0).
   - Today not counting yet never uses a herb or ends a run. (P-AC8)
   - **A quarantined day file is neutral**: skipped, with a warning. It never breaks a run or uses a herb. (P-AC11 overrides A-AC5, **PROVISIONAL**)
   - Output: `streak, longest_streak, freeze_tokens, streak_bonus_total, next_bonus_in_days, days_logged, days_logged_month, quests_done, bonus_today, events_recent[]`.
   - Fixtures: the P-AC9/P-AC10/P-AC11 tables, A-AC5 (gap of 3 with 2 herbs → rests; 21 days → herbs capped at 2), the 03:59/04:00 boundary, and a DST week.
6. **Invariance.** Starting from a balance of 135, text-only edits (evening saves of 0 and 5k chars, onboarding/profile save, insights PUT, proposal decide) leave every economy field unchanged. Check-in and reroll never add coins. (A-AC6, P-AC5)

### Spending (stored in `purchases.yaml`, serialized)
7. **`purchases.yaml` schema 1.** `purchases[]: {id, request_id, item_id, title, price, at, date, voided_at}`, `adjustments[]: {amount, reason?, at?, date?}` and `wishlist[]: {item_id, added_at}`. `title`/`price` are snapshots. A missing file means empty. Unknown keys are preserved. Writes go through `store.updateYaml` and are block style. (A-AC7)
8. **`POST /api/purchases {item_id, request_id}`.**
   - A non-UUID `request_id` or unknown keys → 400.
   - Inside the `purchases.yaml` mutex the server re-reads, recomputes the balance and appends. Success → 201 `{purchase, economy, changed:true}`.
   - The same `request_id` + same item → 200, the same purchase, `changed:false`, no write and no commit. The same `request_id` + another item → 409 `request_conflict`.
   - Unknown item → 409 `unknown_item`. `balance < price` → 409 `insufficient_funds` `{balance, price}`. Inside the cooldown → 409 `cooldown` `{available_on}`.
   - Two concurrent purchases that the balance covers only once → one 201 and one 409. (A-AC8, P-AC14, P-AC19)
9. **Cooldown in logical days:** `available_on = last non-voided purchase date + cooldown_days`, and `0` means no limit. A purchase at 01:30 belongs to the previous logical date. (A-AC9)
10. **Void.** `POST /api/purchases/:id/void {}`. Unknown id → 404. More than 24 h after `at` → 409 `void_window_closed`. A second void → 200 `changed:false`. A voided purchase no longer counts toward spend or cooldown. Nothing is deleted. (A-AC10, P-AC16)
11. **Broken files fail safe.** An unparseable or invalid `purchases.yaml` gives `economy.balance: null` plus a warning, and `POST /api/purchases` → 422 with `details.raw` + `line`. The bytes stay untouched. A broken `rewards.yaml` makes `GET /api/shop` → 422 (calm quarantine UI). A broken day/week file is skipped with a warning: the balance can be understated, never inflated. (A-AC11)
12. **A negative balance is allowed.** After a `done→open` undo the API returns the true number and refuses purchases. The UI shows `−20` (U+2212), with no red, no icon and no copy. (A-AC12, P-AC3, D-AC5)

### Routes, git, performance
13. **Routes:**
    - `GET /api/economy`.
    - `GET /api/shop` → `{items:[{id,title,price,cooldown_days,tier?,available_on,affordable,wished}], wishlist:{item_id,title,price,have,need,est_days}|null, economy, purchases_error}`.
    - `GET /api/purchases?limit=1..200` (default 50, newest first, else 400), where each purchase carries `voidable`.
    - `PUT`/`DELETE /api/wishlist/:item_id`: idempotent 200 with `changed`. An unknown item → 409 `unknown_item`. At most **one** pin; PUT replaces it. (A-AC13, P-AC17, **PROVISIONAL**: the pin is stored in `purchases.yaml`)
    - `/api/today.economy` is present on every load. Quest PATCH responses carry `economy`. (A-AC13)
14. **Commits:** `qj: purchase <item_id>`, `qj: void <purchase_id>`, `qj: wishlist`. A `changed:false` response never touches git. A hand edit to `purchases.yaml` made before a purchase is committed first (`hand_edit` snapshot), the same way as on the evening path. (A-AC14)
15. **Performance:** with 400 days + 58 weeks + 300 purchases, `GET /api/today` p95 is under 150 ms over 20 runs. The result is logged in PROGRESS. (A-AC15)

### Client (Palace Market, header badge, reactions)
16. **One balance store.** `lib/economy.svelte.ts` is fed from every `{economy}` the API returns. Each tab screen shows one `CoinBadge kind="balance"` in its own header (Today MoonGate trailing, Market hero, Evening/Garden/Notes headers). `earned_today` moves to a muted footer line, "+N today". No delta floats on mount or on a route change. (D-AC1–3, P-AC1)
17. **One announcement per coin event.** `CoinBadge announce` prop: `null` = silent, string = that sentence (pre-approved theme prop). Today announces through its own live region ("Done. Earned 20 silver taels."). A void reads "Put back on the shelf. N taels returned." (D-AC4, P §F)
18. **Cards show real earnings.** `QuestCard showCoins` (pre-approved): no chip on let-go dailies. The chip shows `earned` once done/partial. The boss done note reads "Sealed for the week. +{earned} taels." (D-AC6, P-AC20)
19. **Streak display.**
    - A muted count-up line comes first: "N quests done · N days logged".
    - The streak line is shown only when streak ≥ 2, with 0–2 preserved-herb icons and **no empty slots** (`aria-label="2 preserved herbs"`).
    - The bonus toast "Another week in the ledger. +25 taels" and the `streak` sticker appear once, only on the tap that earned them (never on reload). The streak sticker wins over `quest_done`.
    - Token used yesterday → "A preserved herb kept your streak on {weekday}." Rest yesterday → "The streak rests. {n} days logged this month." Both are dismissible info lines.
    - Gap ≥ 2 days → "Welcome back. The herbs kept." and nothing else about streaks. (D-AC7–9, P-AC12, P-AC21, P-AC23)
20. **Palace Market** (screens §3):
    - Layout: a hero with the drawers photo, the h1 and `CoinBadge size="lg"`; then the wishlist card, items grouped by tier with h2s (when tiers exist), and a collapsible "Recent purchases" list.
    - Unaffordable or cooling rows are never hidden or disabled. They show a muted price and "needs N more taels" / "available again {weekday}".
    - The bottom-sheet dialog has a focus trap, Esc, a scrim and focus return. It shows "Balance after: N" and one seal button "Buy for N taels", with no confirm step.
    - Buying: the button reads "Wrapping it up…", keeps the same `request_id` on retry and retries once on a network error. A 409 shows an inline sunk note ("You have {b} of {p} taels." / "Available again on {weekday}.").
    - After a buy: the 買 seal on the row, the `shop_buy` sticker anchored in the row gutter, "Prescribed. Take as directed.", and a top toast with Undo that lasts 8 s and pauses while focused or hovered.
    - Undo shows only inside the 24 h window. A voided row stays visible, muted, marked "Returned".
    - The wishlist card has a progressbar "245 / 350 taels". The pace hint appears only with ≥7 logged days and a 14-day average > 0. It shows "Ready when you are." when affordable.
    - The purchase log is neutral (no totals). Loading, empty and broken-file states are covered. (D-AC10–16, D-AC19–20, P-AC13–19)
21. **Toggles have a visible pressed state.** A shared `.qj-btn[aria-pressed="true"]` rule (accent fill + ✓) closes the ProposalList Keep/Skip MUST. `.qj-btn:disabled` is dashed and muted in both themes. (D-AC17, designer MUST/SHOULD)
22. **Copy:** all coin and streak strings live in `lib/copy.ts`. The banned-word test is extended with `insufficient|afford|debt|owe|broke|penalt|expire|hurry|last chance|at risk|don't break|keep your streak|you lost|streak (broken|lost|reset)|are you sure`. (D-AC18, P §F)

### Carry-overs (from the M4 review)
23. **(MUST)** `PUT /api/kb/profile|insights` over a hand-edited file commits the on-disk version (`hand_edit`) before writing. Test with `git log -p`. (A-AC16, backlog #182)
24. **(SHOULD)** `GET /api/insights/proposals/:id` returns 404 for an id that isn't a date (traversal regression). (A-AC17)
25. **(SHOULD)** `sanitizeOpText` strips U+00AD, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064 and U+FEFF before the suspicious test. Flagged rejected ops stay out of the `<declined>` prompt block but are still used for the local similarity check. (A-AC18)
26. **(SHOULD)** The care check runs first and everywhere: `maybeReflect` checks care before `ai_off`/`not_recent`/`private` and also scans gratitude. `CARE_PATTERN` is widened, and `blockedTerms` profile exceptions use whole words. (P-AC24, backlog #172–174)
27. **(SHOULD)** `backfilled: true` is written on the first evening save of a past date (backlog #62). Backfilled days count toward streaks (**PROVISIONAL**, lenient by design).

## MUST backlog items taken in
- (quest-architect, M5) Tester MED-1: kb PUT hand-edit snapshot → AC23
- (quest-designer, M5) ProposalList Keep/Skip pressed state → AC21
- (quest-architect → manager, process) No AC writes outside the repo/`DATA_DIR`/scratchpad. Nothing in this sprint does.
- (psych, new) Pure `bossCoinsFor` + `streakWalk` with table tests → AC3/AC5

## Out of scope (stay in the backlog)
Mystery curios, Apothecary's mercy, the real-money guardrail, the monthly market review, rest-day mode, gentle-restart quest mixing and reroll pool honesty.

## PROVISIONAL decisions
1. Boss formula: the psychologist's (done = 100), capped by the architect's snapshot clamp. Partial with checkpoints → max(50, 15 × ticked).
2. A streak day = done/partial **or** a rating **or** any owned evening text (union of the architect's and psychologist's rules).
3. A quarantined day is neutral in the walk (psychologist), not a break (architect).
4. Wishlist: **one** pin (psychologist), stored as `wishlist[]` in `purchases.yaml` (architect: one mutex, app-owned, and the user's commented `rewards.yaml` is never rewritten). Readers tolerate extra entries; the first one counts.
5. Pace hint: `est_days = ceil(need / avg14)`, where avg14 = daily-quest + bonus earnings over the last 14 logical days (zeros included). Shown only with ≥7 logged days in total.
6. Backfilled days count toward the streak and can create a bonus retroactively (deterministic replay).
7. Undo toast: 8 s, paused while focused or hovered.
8. Balance badge per screen header, not a global bar.
9. `quests_done` counts daily done + partial + boss done.
