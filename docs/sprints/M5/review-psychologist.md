# Sprint M5: review / retro (quest-psychologist)

> 2026-10-26 · quest-psychologist · Inputs: `sprint-goal.md`, `plan-psychologist.md`, `PROGRESS.md` §M5 + fix 1, test reports
> `2026-10-26-M5.md` (PARTIAL) and `2026-10-26-M5-retest1.md` (PASS), `BACKLOG.md`, and the code (`server/src/economy.ts`,
> `server/src/domain.ts`, `web/src/lib/copy.ts`, `web/src/lib/theme/CoinBadge.svelte`, `web/src/lib/ledgerRules.ts`,
> `web/src/routes/Today.svelte`, `Market.svelte`).
> The user is asleep, so open choices are marked **PROVISIONAL**.

## 0. Verdict from my angle

**Accepted.** M5 was the sprint where guilt mechanics could have come in, and they mostly didn't:
- every number comes from one pure replay
- the streak counts showing up, not output
- a YAML typo can't take a streak away
- herbs can't be bought
- spending is never questioned
- a negative balance is shown flat, in the normal ink

The tester checked the server rules against independently hand-computed fixtures, and they all matched.

**Two things are now untrue or unkind, and I'd fix them in M6 (both SHOULD):**
1. **The "welcome back" copy became a false statement.** "Welcome back. The herbs kept." was written as a metaphor ("herbs keep", meaning things wait), echoing the M2 let-go copy. M5 turned "preserved herbs" into literal streak tokens. After a ≥2-day gap the walk has always *used* herbs (to bridge the gap), or used them *and then* rested anyway. So the sentence now reads as "your tokens were saved" at exactly the moments they weren't. (§2.1)
2. **Herbs are burned on gaps they can't bridge.** That's my own spec's flaw (AC10 fixtures), not the builder's. Example: 14 days (2 herbs) followed by a 3-day gap. The walk spends both herbs on days 1–2, rests on day 3, and leaves 0 herbs and streak 0. That's the worst of both: the safety net vanishes in the same break that it didn't save. (§2.2)

## 1. Psychologist acceptance criteria: check by check

| AC | Result | Evidence / comment |
|---|---|---|
| AC1 one balance | **PASS, one gap** | Same number on PATCH/purchase/void/wishlist/economy/today (tester AC1, hand-computed 115). **Gap:** the Evening save can change the economy (a rating makes the day count → bonus) but returns no `economy`, so the Evening badge stays stale (retest NEW-LOW-1). The route list in my AC1 missed it, and so did my AC7, which created the path. See §2.3 |
| AC2 daily earnings | PASS | `questEarnings` clamp 0..100, partial tier; private days earn; `coins: 500` → 100 + `coins_clamped`; future files 0 |
| AC3 idempotent | PASS | done ×3, 10-way race → +once; done→open→partial→done table; bonus undo/redo never doubles |
| AC4 `bossCoinsFor` | PASS | `domain.ts:102` matches my table exactly (done = 100; partial ≥ 50; 15/tick; cap = snapshot). Live: open 3 ticks → 45, partial 2/4 → 50 |
| AC5 never pays | PASS | Byte-identical `/api/economy` across evening 5k chars, profile PUT, reroll, check-in. The only evening-save change is the rating making a day count, which is AC7 working as intended |
| AC6 AI can't mint | PASS | `coins:999,status:"done"` in model output → stored `open` with the tariff; PATCH `{"coins":999}` → 400 |
| AC7 what counts | PASS (more lenient: the union with "any evening text") | I endorse the union. A Highlight-only evening is showing up. Energy-only doesn't count ✓ |
| AC8 today never breaks | PASS | `economy.ts:150`: only `d < today` can use a herb or rest |
| AC9 bonus 25 flat | PASS | 14 days → 50, recompute-stable |
| AC10 herbs | PASS **as specified**, but the spec was wrong for gaps longer than the herbs on hand | See §2.2 |
| AC11 broken = neutral | PASS | `economy.ts:137`; tester fixture d2 |
| AC12 count-up first | PASS | "6 quests done · 6 days logged" before the streak line; streak hidden below 2; herb icons have no empty slots |
| AC13 tiers | PASS | Free permissions · no money needed / Small / Medium / Large / Grand |
| AC14 buy | PASS | One seal button, no confirm, 買 + `shop_buy` + "Prescribed. Take as directed." + Undo toast |
| AC15 can't buy, kindly | PASS | Rows never disabled; "needs 1,255 more taels"; no red; no negative "Balance after" (LOW-3 fixed: that line read like a debt preview) |
| AC16 undo | PASS | "Put back on the shelf. 150 taels returned."; no reason prompt; no "too late" copy |
| AC17 one wishlist pin | PASS | Pace hint only with ≥7 logged days, avg over 14 days including zeros (hand-checked: 10/day → 30 days) |
| AC18 neutral log | PASS | No totals |
| AC19 honest network error | **NOT VERIFIED** | The copy exists and the code keeps `request_id` on retry, but neither test run could drop a request after commit. This is the one money-truth claim that has never been exercised. See backlog |
| AC20 informational reactions | PASS (NIT-2) | "Done. Earned 20 silver taels." Partial shows the partial tier. NIT-2 flashes "+0 taels" for ~20 ms, which nobody sees |
| AC21 one reaction | PASS (code read + live toast) | Bonus toast is once, never on reload. But it is also *never* shown when the bonus comes from an Evening save (§2.3) |
| AC22 journey | Mostly PASS | Covered across the two runs (7 seeded days → bonus → buys → void → wishlist → negative). "Buy the manga when affordable" was shown as "Ready when you are." but the actual 350 buy wasn't walked. Acceptable |
| AC23 welcome back | PASS mechanically, **copy now false** | §2.1 |
| AC24 care first | PASS | Private + care in Gratitude only → `reflect_skip: "care"`, 0 spawns; widened pattern with correct negatives |

**Economy tuning (B8 `econ:sim`):** typical earns 353/week, and a manga takes 3.4 weeks while buying 2 treats + 1 café weekly. That's inside my 2–4 target. Strong takes 1.3 weeks, which is fine because rewards stay finite and prices are fixed. **Low (200/week) never reaches a manga** with that spending pattern. That's arithmetically honest, but it's exactly the person the app most needs to keep. I'm not changing prices blind (PROVISIONAL: keep 50/150/350 until Nurasyl confirms budget, per PROGRESS open question). Instead I'm queueing the low-week answer that was already designed: Apothecary's mercy (backlog), plus a sim row that makes the low-week path visible (COULD below).

## 2. What must change (ranked)

### 2.1 Welcome-back copy truth (SHOULD)
`COPY.welcomeBack = 'Welcome back. The herbs kept.'`. Now that "preserved herbs" is a named counter on the same screen, "the herbs kept" is read literally. With a gap ≥ 2 the herbs were used, or used and the run rested anyway.
**New copy (PROVISIONAL):** "Welcome back. Your page is here." Nothing about streaks, tokens or counts, as AC23 intended. It also keeps the old metaphor ("Set aside. Herbs keep.") apart from the token vocabulary. **Rule for future copy:** once a word becomes a mechanic (herbs, seals, taels), it may only appear in sentences that are literally true about that mechanic.

### 2.2 Don't burn herbs on gaps they can't bridge (SHOULD)
In `streakWalk`, measure the length of the maximal run of past, non-counting, non-neutral days (`d < today`):
- If that length is ≤ `tokens`, each day uses a herb (unchanged).
- If it's longer, the run rests on the first gap day and **no herbs are spent**.

Why this is kinder and still honest:
- Herbs are meant to forgive one or two quiet days. A long break is a different situation, and coming back from it should come with the safety net intact (abstinence-violation / "what-the-hell" effect, Polivy & Herman 1985; Marlatt & Gordon 1985). Losing the streak and the herbs together stacks two losses on one event (loss aversion; Kahneman & Tversky 1979).

It stays deterministic. An open gap ending yesterday may first show `token_used` and then, if one more day is missed, become a `rest` with the herb back. The replay handles this, and a number going *up* needs no announcement.

Fixtures:
- 14 days (2 herbs), gap 3, 1 day → streak 1, herbs 2.
- 7 days (1 herb), gap 2 → rest, herbs 1.
- 7 days, gap 1 → bridged, herbs 0, streak 7 continues.
- 14 days, gap 2 → bridged with 2 herbs (unchanged).
- At `today` = gap day 2 with only 1 herb → `rest` on gap day 1, herbs 1.

### 2.3 The Evening save is a coin event too (SHOULD; tester NEW-LOW-1)
My AC7 made a rating-only evening a counting day, so an Evening save can create the 7th-day bonus. Right now:
- the header badge stays stale
- the bonus is credited silently
- the toast never shows, because Today sees `bonus_today` already set on load and suppresses it, correctly, for reloads

The person gets the reward but never sees it acknowledged. That weakens the informational, competence-supporting side of the reward (Deci, Koestner & Ryan 1999) for no gain.

Fix:
- `PUT /api/days/:date/evening` (and the backfill save) return `economy`. Evening feeds the store.
- If `bonusMoment(prev, next)` is true, Evening shows the same toast "Another week in the ledger. +25 taels" once, through the same memory, so Today won't show it again.
- No sticker on Evening (the seal is the reaction there).

*Backlog:* already filed by quest-designer (merged toast, which I endorse; their streak sticker beside the 済 seal is fine too) and by quest-architect as an "every economy-input mutation returns `economy`" invariant. I didn't add a duplicate.

### 2.4 Info lines: when "once" ends (answers builder #208, SHOULD)
The lines ("preserved herb kept…", "streak rests…", "welcome back") are for the *return moment*. Showing them again on every reload all day turns a quiet note into a reminder of the gap.

**PROVISIONAL rule, derived and without storage:**
- A line is shown only while today doesn't count yet (`!economy.today_counts`, or derived from the day).
- Once anything today counts (a quest done/partial, a rating, any evening text), it's gone for good.
- The memory-only Dismiss stays as it is.

No `localStorage` key is needed, and it can't go stale across days. This is compatible with the designer's overwrite-only `qj.infoDismissed` key for the Dismiss case: both can ship.

### 2.5 Smaller items
- **`bossPaused` (answers builder #207):** reword to **"Paused today. It keeps."** and remove the `penalt` allowlist entry, so the banned-word test has no exceptions.
- **`earned_today` (answers builder #212), PROVISIONAL:** the footer "+N today" should add `bonus_today` (the bonus is credited today, and the balance moved by it). Boss coins stay out, since they belong to the week and show on the boss card. Otherwise "+20 today" next to a +45 balance jump looks like a bookkeeping error.
- **Undo after the bonus tap:** undoing the 7th-day quest floats "−45" (muted, which is right) where the user expected "−20". COULD: a one-time quiet footer line, "The week's +25 returns when today counts." (informational, and true by replay).
- **Pace hint in weeks:** "About 34 days at your recent pace" is honest, but a big day count makes the goal feel far away (goal-gradient: perceived distance matters, Kivetz et al. 2006). COULD: above 14 days, say "About 5 weeks at your recent pace." (ceil).
- **Let-go boss chip "100" (tester NIT-3, already backlogged as COULD):** from my angle it reads like a forfeited payment. It's the same reasoning that took the chip off let-go dailies. Cheap; do it with the boss double-status-line item in M6.
- **Architect's MUST (`crypto.randomUUID` is missing over plain-HTTP Tailscale):** I endorse it as MUST from my side too. A Buy tap that does nothing and says nothing on the phone is the opposite of AC19's "say one true thing" promise. Users read silence as "it didn't work, tap again", or as "the app is broken". After the fix, the failure copy must still be "Couldn't reach the market. Tap again; you won't be charged twice."
- **`gentle_restart` (#117 / builder M5 item):** the copy half shipped. The mechanical half (energy ≤ 2 slots for the first day back) is what actually makes the return easy. I'd take it in M6 as SHOULD.

## 3. What's good (keep doing this)
- **Derivation over storage.** Nothing about streaks or balance is stored, so a hand edit can never leave a number permanently wrong. This is the strongest anti-guilt design decision in the app: nothing is ever "lost", only recomputed.
- **The negative balance is flat.** U+2212, same gold ink, no copy. Purchases are refused without moralizing. That's exactly §3.7.
- **Count-up first:** "N quests done · N days logged" is a number that can't go down by missing a day, so it carries the competence signal (Ryan & Deci 2000).
- **Spending is respected:** no confirm step, Undo with no reason prompt, a neutral log, "Ready when you are." with no nag.
- **The fix round was precise:** one sentence per coin event, and the sheet keeps focus after a 409. These matter for trust: the app says exactly one true thing per event.

## 4. Answers to other agents' questions
- **Builder #207 (`bossPaused`):** "Paused today. It keeps." (§2.5)
- **Builder #208 (info-line persistence):** derived. Hide once today counts, no storage (§2.4).
- **Builder #212 (`earned_today`):** add `bonus_today`, exclude boss (§2.5). PROVISIONAL.
- **Builder #214 / #117 (`gentle_restart`):** SHOULD in M6. One day of energy ≤ 2 slots after a ≥2-day gap, plus "Welcome back. Your page is here."
- **PROGRESS open question (backfill creating a bonus retroactively):** keep it (PROVISIONAL). Writing up a forgotten evening is a real act of reflection. The exploit (rating a year of past days for ~1,300 taels) is a self-cheat in a single-user, self-reported app, and policing it would cost trust. I've filed a COULD so Nurasyl can decide.
- **PROGRESS open question (prices):** keep 50/150/350 until Nurasyl gives a real monthly budget (onboarding Q12 asks for it). Then retune with `econ:sim` so a manga takes about 3 weeks at the typical pace.
- **Tester PROVISIONAL (bonus toast + "Done…" sentence = two coin events):** agreed. They're two true facts, each said once.

## 5. Process note (what to do differently next sprint)
1. **Derived-input × write-route matrix in planning.** My AC7 widened what counts (rating, evening text) without adding the Evening PUT to AC1's list of routes that return `economy`. From M6 on, whoever widens a derivation's inputs also lists every route that writes those inputs. The builder adds `economy` to each of those routes, and the tester checks each one with "badge equals `/api/economy` after this action".
2. **Copy truth is re-checked when vocabulary becomes mechanics.** When a sprint introduces a named mechanic, grep the existing copy for that word and re-validate every hit against the new rule.
3. **Write fixtures for the edges of a rule, not only its happy path.** My AC10 tables never asked "gap longer than herbs, what's left?". From M6, every stateful rule gets one fixture where the resource runs out mid-event.
4. **Untestable live checks need a test seam in the plan.** AC19 (retry after a committed timeout) is unverified two runs in a row. Plans that claim an honest network-failure path must name the seam: a web unit test with a stubbed `fetch` that rejects after a server-side 201, asserting the same `request_id` and one debit.
