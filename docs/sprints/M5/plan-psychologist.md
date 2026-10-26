# Sprint M5: planning (quest-psychologist)

> Scope (builder-common M5): coin values, idempotent awards, ledger, streaks + streak bonus + freeze token, Palace Market (buy,
> insufficient funds, purchase log, wishlist), coin badge in the header, seal-stamp + sticker reactions.
> Refs: `motivation.md` §3 (economy), §4.1–4.2, §4.5; `architecture.md` §2.1 `purchases.yaml`/`rewards.yaml`, §2.3–2.5; `screens.md` §0, §1.6, §3;
> my M4 review §5. The user is asleep, so open choices are marked **PROVISIONAL**.
> My angle: **M5 is where guilt mechanics usually come in.** Streaks, balances and prices can make an app feel like a debt collector.
> Every AC below either (a) makes a number honest and stable, or (b) stops a number from turning into loss, shame or pressure.
> As promised in M4: every coin/streak string has a copy-truth row (§F), and every rule comes with fixtures that test it from both directions.

## 1. Acceptance criteria

**A. Earning (all derived; one function, one number everywhere)**
- **psychologist-AC1 (one balance):** the header `CoinBadge`, `/api/economy`, `/api/shop` and the post-purchase/post-PATCH responses all
  come from one pure derivation, so they always show the same `balance`. Test: after each step of the journey (AC22), all four surfaces are equal.
  The header now shows the **balance**, not `earned_today`. Its accessible label is "N silver taels" (no "today").
- **psychologist-AC2 (daily earnings):** `questEarnings` stays the only rule (done = snapshot clamped to 0..100, partial = `min(PARTIAL_TARIFF, snapshot)`,
  let_go/open = 0). **Private days earn normally.** `private` only keeps the day from the AI and doesn't take coins away. Quarantined day files are skipped and
  listed in `warnings[]`. Test: a private day with 2 done quests adds 30. A broken day adds 0 and produces 1 warning.
- **psychologist-AC3 (idempotent, state-based):** `PATCH done` ×2 → balance +once. done→open→done → the same balance. Undo after spending can
  take the balance negative. It is shown as "−20" with no warning colour and no copy. Test: three-step table.
- **psychologist-AC4 (boss coins, `bossCoinsFor`, PROVISIONAL; replaces my old backlog formula):** done → **100** (a sealed boss is
  trusted the same way a self-reported quest is; checkpoints are scaffolding, not an audit, §4.2). Not done → **15 × ticked checkpoints** (max 60),
  earned when each one is ticked (immediate acknowledgement, Woolley & Fishbach 2016). A boss without checkpoints that is `partial` → 50. Otherwise 0. Never negative.
  Coins stay after the week ends. Table test: (done,0/4)=100, (done,4/4)=100, (open,2/4)=30, (open,4/4)=60, (partial,no cps)=50, (let_go,3/4)=45.
  Copy: "Sealed for the week. +100 taels." is now true. Each checkpoint tick floats "+15".
- **psychologist-AC5 (things that never pay):** opening the app, check-in, rerolls, evening saves (any length), onboarding, insight decisions
  and voids never add coins. There are no login bonuses (§3.6). **Coin-invariance fixture with a non-zero balance** (carried from M4): starting from
  balance 135, an onboarding save, a proposal decide and evening saves of 0/5k chars all leave it at 135.
- **psychologist-AC6 (AI can't mint coins):** AI/pool output `coins` is ignored (already true). Hand-edited `coins: 9999` is clamped to 100 and adds
  a warning. Hand-written legacy `streak:`/`coins:` keys at the day top level are ignored by the economy. Fixture for each.

**B. Streaks (lenient: they measure showing up)**
- **psychologist-AC7 (what counts, PROVISIONAL, overrides arch §2.4's "≥1 done"):** a logical day counts if it has ≥1 daily quest
  `done` **or `partial`**, **or** a non-null `satisfaction` (the ledger was sealed). Private days count. A smaller version is still showing up (§4.2).
  Table test: partial-only counts. A rating with all quests let go counts. Energy-only with nothing else does not.
- **psychologist-AC8 (today never breaks anything):** `streak` ends at today if today counts, otherwise at yesterday. A not-yet-counting today
  is never shown as a gap and never uses a token. Test: 6 counting days + today empty at 10:00 → streak 6, tokens unchanged.
- **psychologist-AC9 (bonus):** +`STREAK_BONUS` (default **25**, flat, never escalating; loss aversion, Kahneman & Tversky 1979) each time the
  running count reaches a multiple of 7. It is derived, so it isn't double-counted on recompute. Test: 14 counting days → 50. Recomputing ×3 → still 50.
- **psychologist-AC10 (freeze tokens, "preserved herbs"):** derived by one pure, chronological walk. Each completed 7-run → +1 token
  (cap **2**). A past non-counting day with a token → the token is used **automatically**, the day is *bridged* (the run continues but doesn't
  increment). With no token → the run resets to 0. There's no button and no prompt, and **tokens can't be bought**: no shop item or API route touches them.
  Fixtures: 7 days, gap 1, 3 days → streak 10, tokens 0. 7 days, gap 2 → reset. 14 days (2 tokens), gap 2, 1 day → 15. 21 days → tokens 2 (cap).
- **psychologist-AC11 (a broken file is not a missed day, PROVISIONAL, overrides arch §2.4 "a broken day breaks"):** a quarantined
  day is **neutral**. It's skipped by the walk (it doesn't count, doesn't break and doesn't use a token) and is listed in `warnings`. A YAML typo must never
  take away a streak or a past bonus. Fixture: 6 days, broken, 1 day → streak 7, bonus 25.
- **psychologist-AC12 (display: counting-up numbers first):** where streaks show (Today footer, header toast), the order is
  "**N quests done in total · N days logged**" first and the current streak after it, smaller. A streak of 0 shows **nothing** about streaks (no "0 days").
  Tokens show as a quiet "Preserved herbs: 1" with a one-line explanation, never as a warning.

**C. Palace Market (spending is celebrated, never questioned)**
- **psychologist-AC13 (prices/cooldowns from seed):** the shop reads the seed `rewards.yaml` shape (`rewards:` / `title` / `tier`, 15 items,
  50/150/350…) and the arch shape. Tiers are grouped Free permissions · Small · Medium · Large · Grand. The free tier's heading says
  "no money needed". Prices never change on their own (§3.4).
- **psychologist-AC14 (buy):** the sheet shows the title, the price and the balance after purchase, plus one seal button "Buy for N taels". There's **no confirm
  dialog** and no "that's N days of work" (§3.7). Bought → 買 stamp + `shop_buy` sticker + "Prescribed. Take as directed." + toast Undo.
- **psychologist-AC15 (can't buy, said kindly):** an insufficient balance or a cooldown keeps the row visible and tappable (never hidden or greyed into
  shame). It explains with the exact §F text, with no red and no countdown timer.
- **psychologist-AC16 (undo):** a void within 24 h returns the coins with "Put back on the shelf. N taels returned." There's no reason prompt.
  After 24 h the Void button simply isn't there (no "too late" copy).
- **psychologist-AC17 (wishlist = one goal):** at most **one** pinned item (goal gradient, Kivetz, Urminsky & Zheng 2006; several
  targets dilute it, PROVISIONAL). The progress bar shows "245 / 350 taels". The pace hint "about N days at your recent pace" appears
  **only** with ≥7 logged days and an average > 0 (the average is over the last 14 logical days, with zero days included, so it's never optimistic). Otherwise there's no hint.
  Never use "good days" (it implies the others were bad). When the item is affordable, show "Ready when you are." with no auto-buy and no nag.
- **psychologist-AC18 (spend log is neutral):** the purchase log lists title · price · date, newest first. There are no totals like "spent this
  month", no streaks of spending and no judgment copy (§3.7 "don't moralize spending"). The real-money budget comes later (COULD).
- **psychologist-AC19 (honest network error):** "Nothing was spent" is only true if the server never committed. On a timeout the client
  retries once with the **same** `request_id`. If the result is still unknown, the copy is "Couldn't reach the market. Tap again; you won't be charged twice."
  Test: a timeout after the commit → retry → 200 with the same purchase, and the balance is debited once.

**D. Reactions (seal-stamp + stickers)**
- **psychologist-AC20 (immediate, informational):** the seal stamps and the "+N" floats on tap (optimistic), and the number shown equals the server's
  `earned` (partial shows the partial tier). Reaction copy is informational ("Done. Earned 20 silver taels."), never evaluative ("Great
  job!"), with no should/must (CET).
- **psychologist-AC21 (one reaction per action):** at most one sticker per user action, by priority streak bonus > boss done > quest done.
  There are no confetti, sounds or streak-loss warnings (screens §0). The streak toast "Another week in the ledger. +25 taels" shows **once**,
  only on the day the bonus is reached (from server data, not a client counter). Test: a reload doesn't show it again.

**E. Journey and wellbeing carry-overs**
- **psychologist-AC22 (journey):** a fresh data dir → 7 seeded counting days (one partial-only, one rating-only) → today done hard + partial medium →
  balance = Σ + 25 → buy the treat (50) → void → buy the manga-volume when it's affordable. Every surface equals AC1, and `purchases.yaml` is hand-readable
  with comments preserved.
- **psychologist-AC23 (welcome back, explicitly IN):** after a gap of ≥2 logical days with no day file, Today shows "Welcome back. The herbs kept."
  It never shows a missed-days count, a streak reset or a token-spent notice on that screen (what-the-hell effect, Polivy & Herman 1985; Lally et
  al. 2010). Setting `mode: gentle_restart` is SHOULD (below).
- **psychologist-AC24 (care check first):** the M4 review gap. `hasCareLanguage` runs before the `ai_off`/`not_recent`/`private` gates and
  scans the gratitude field too, and the care card renders in those cases. Fixtures: private+care, AI-off+care, an old date+care → card shown, 0 spawns.

**F. Copy truth table (verbatim; the tester greps rendered strings)**
| Moment | Exact text | True because |
|---|---|---|
| quest done | "Done. Earned {n} silver taels." | n = server `earned` |
| partial | "+{n} taels. A smaller dose still counts." | PARTIAL tier |
| boss sealed | "Sealed for the week. +100 taels." | AC4 done=100 |
| streak bonus | "Another week in the ledger. +{bonus} taels" | bonus credited today |
| token used (Today footer, next counting day) | "A preserved herb kept your streak on {weekday}." | walk event |
| streak rests | "The streak rests. {n} days logged this month." | count-up only |
| insufficient | "You have {b} of {p} taels." | live balance |
| cooldown | "Available again on {weekday}." (≤6 days) / "on {d MMM}" | logical dates |
| bought | "Prescribed. Take as directed." | |
| void | "Put back on the shelf. {p} taels returned." | |
| unknown result | "Couldn't reach the market. Tap again; you won't be charged twice." | request_id idempotency |
| welcome back | "Welcome back. The herbs kept." | |
Banned in rendered text (on top of the M3/M4 lists): `streak (broken|lost|reset)|don'?t break|at risk|keep your streak|you lost|debt|owe|penalt|are you sure|
expires?|hurry|last chance`.

## 2. Risks: what the builder will likely get wrong
- **R1 Two balance formulas.** The header keeps `earned_today` or the client sums its own number, and they drift from `/api/economy`. → AC1.
- **R2 Streak = arch §2.4 verbatim** (≥1 done only; a broken file breaks it). A partial day or a YAML typo silently resets the streak. → AC7/AC11.
- **R3 Today counted as a gap** before the evening, so the token count flickers or the UI says "streak 0" at 09:00. → AC8.
- **R4 Token as a purchasable item or a "Use token?" button.** That's pay-to-protect anxiety. → AC10.
- **R5 Partially credited boss lost at week end**, or done-with-0-ticks paid 40. → AC4 table.
- **R6 "Nothing was spent" lie** on a timeout that did commit. → AC19.
- **R7 Wishlist pace from the best days only** ("2 more good days") sets an optimistic, then guilt-inducing target. → AC17.
- **R8 Reaction stacking** (quest + streak + boss sticker at once). It reads like a slot machine. → AC21.
- **R9 Mystery coins sneaking in.** They're **out of M5** (PROVISIONAL): variable payouts need an injected RNG and a tuning pass, and they're the riskiest
  mechanic to tune blind. Vary decoration later, never the payout.
- **R10 Monotonic-looking numbers moving backwards** after a hand edit to an old day (e.g. a past bonus disappearing). That's acceptable and honest. Just
  never animate a decrease or announce it.

## 3. Backlog items I think belong in M5
**MUST**
- (psych, new) Pure `bossCoinsFor` + `streakWalk(days, today) → {streak, longest, tokens, bonus_total, events[]}` in `domain.ts`
  with the AC4/AC7–AC11 table tests (supersedes backlog #37's formula).
- (psych #175) Non-zero coin-invariance fixture → AC5.
- (psych #172, raised from SHOULD) Care check first and everywhere → AC24. It's small, and it's a wellbeing gap.
- (arch #182) PUT kb hand-edit snapshot before overwrite (authorship; I endorse).
**SHOULD**
- (psych B8 #23, raised from COULD) `bun run econ:sim`: 4 weeks of fake days at the §3.1 rates (low 50% / typical 70% / strong 85%) on a temp
  `DATA_DIR`, through the real economy derivation. Assert typical ≈ 300–400 taels/week and weeks-to-manga (350) with 2 treats + 1 café/week
  in **2–4**. This turns "a manga every 2–4 weeks" into a test.
- (psych #173/#174) Widen `CARE_PATTERN` + whole-word `blockedTerms`: both come with fixtures already specified.
- (builder #117) `mode: gentle_restart` after a ≥2-day gap: the slot mix uses energy 2's at most, for one day (AC23 is the copy half).
- (psych #78 / designer #152) `showCoins=false` on let-go cards. With a real balance, a coin chip on a let-go card reads like a lost payment.
**COULD**
- Real-money guardrail (`approx_cost`, `monthly_reward_budget`, one neutral warning).
- (psych #83) Intermittent `quest_done` sticker, seeded per quest id: decoration only.
**Explicitly OUT of M5** (so they don't slip silently): reroll pool honesty #124/#125 (→ M6, SHOULD), mystery rewards/curios, Apothecary's
mercy, rest-day mode, monthly market review.

## 4. Question for the other agents
**To quest-architect:** can the economy be one pure `streakWalk` over `{date, counts | "unknown"}[]` that also returns per-day `events`
(`bonus`, `token_earned`, `token_used`), exposed as `economy.events_today`? Then the "+25" toast and the "preserved herb" line are
derived truths shown once, with no client counter. And where should the single wishlist pin live: a `wishlist: <item_id>` key in `rewards.yaml`
(hand-editable, my PROVISIONAL preference) or in `purchases.yaml`?
