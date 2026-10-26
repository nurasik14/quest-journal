# H1 review / retro: quest-psychologist

> 2026-10-26 · async (the user is asleep, so every judgment call is **PROVISIONAL**)
> Read: `sprints/H1/sprint-goal.md`, `PROGRESS.md` §H1 + §H1 fix, `test-reports/2026-10-26-H1.md` + `-H1-retest.md`, `BACKLOG.md`, and the code: `server/src/economy.ts` (`streakWalk`, `gapAhead`), `server/src/fallback.ts` (`mentionedMinutes`, `estimateMinutes`, `fitsTooLong`, `selectReroll`), `web/src/lib/ledgerRules.ts` (`todayCounts`, `infoLineFor`, `sealedToast`, `sheetMode`), `web/src/lib/copy.ts`, and the seed `quests.yaml`.
> Hardening sprints skip the planning step, so there's no `plan-psychologist.md`. "My ACs" below are the backlog items I wrote, plus the items I endorsed, as the sprint goal narrowed them.

## 0. Verdict from my angle
**Accepted.** This is the sprint I asked for: the return-after-a-gap set went first, and every one of those items is now literally true.
- Herbs aren't burned on a gap they can't bridge.
- The info lines belong to the return moment and then go away.
- The one unprompted resurfacing card is read-only and counts up only.
- The garden caption no longer judges days.
- The new failure copy ("may not have saved", "Can't reach your laptop") tells the truth instead of reassuring.

One thing is left from my side, and it doesn't block use: **a "Too long" swap can still return a longer quest** (LOW-3). That breaks a small promise. Each broken promise costs trust in the swap chip, and the swap is the app's main pressure valve (motivation.md §4.3). `gentle_restart` (#215) is still unbuilt. It's the other half of the return experience.

## 1. Psychologist acceptance criteria

| Source (mine) | Sprint item | Result | Evidence |
|---|---|---|---|
| #236 herbs never burned on a gap they can't bridge | H1-1 | **MET** | `streakWalk` l.150–160: tokens are spent only if `gapAhead(...) <= tokens`. Live: on 10-29, 3 gap days > 2 herbs → streak 0, longest 20, **herbs 2 kept**. All 5 fixtures pass, and the tester's extra probes (14 + 1 + 1 + 8) behave too. The narrowed "today = gap day 2" fixture is correct, see §3 |
| #236 the `token_used` → `rest` flip is never announced | H1-1 | **MET** | The flipped rest is dated on the first gap day, which is outside `events_recent` (today/yesterday). On the return day `welcomeBack` wins: "Welcome back. Your page is here." There's no loss message. That's the kind and true outcome |
| #237 info line hidden once today counts, survives reload | H1-2 | **MET** | `infoLineFor` returns null when `todayCounts(day)`. Live on `d2`: the line still shows after check-in (a check-in alone isn't reflection, which is right), is gone after one Done, and stays gone after a reload |
| #228/#208 Dismiss persists per date, memory fallback | H1-2 | **MET** (after the fix) | Key `"<date>:<kind>"`. NIT-3 is fixed: memory now wins over a stale stored value (retest, live, quota-throwing `setItem`) |
| #266 "A month ago today" read-only + count-up only | H1-3 | **MET** | JSON has done/partial only. The link is `/archive?date=…`, "Open that page", the read-only sheet, and no `/evening/` link |
| #249 garden caption without "Good days" | H1-4 | **MET** | Live caption is exact. The banned-word scan has no garden allowlist any more. The only exception left is "Nothing was lost" |
| #238 / psych-AC19 purchase retry charged once | H1-9 | **MET** (finally, after two unverified runs) | Live: the first answer was dropped after commit, the retry reused the same `request_id` → 200 `changed:false`, one debit, one row, and the toast "Bought". The copy matches the outcome |
| #124 a "too long" reroll never returns something longer | H1-11 | **PARTIAL** | The original repro is fixed (no more "4 Pomodoros"), and nothing fits → honest null with the swap **not consumed** (good). But LOW-3 (retest) is open: the rejected quest's length is inflated by incidental words ("office **hours**" → 60, "all **day**" in a why → 480), so a 5-min quest was swapped for a 40-min one. The AI path's `validateReroll` shares the bug. See §2.1 |
| #270 "Merged / narrowed ACs" table | H1-P | **MET** | Present, specific, and the tester verified it. Every narrowing has a reason I agree with |
| Endorsed: #227 evening bonus moment | H1-8 | **MET** | One merged toast, the sticker is `aria-hidden`, and there's no replay on Today. The reward is now *noticed* on the screen where it was earned, which matters: an unnoticed contingency doesn't reinforce anything (Skinner; Ryan & Deci 2017 on informational rewards). Copy nit in §2.4 |
| Endorsed: truth rule for new copy | H1-5/6 | **MET** | `maybeSaved` admits uncertainty instead of claiming safety. `offlineCard` says "Can't reach your laptop", not "offline". NIT-2 is fixed, so the "Nothing was lost" banner no longer contradicts a "may not have saved" toast |
| Endorsed: unaffordable sheet has no Buy | H1-10 | **MET** | No false-promise button. "Save toward this" is primary, so the action available is goal-setting, not failure (goal-gradient: Kivetz, Urminsky & Zheng 2006). NIT-1 is fixed (no "Balance after" for an impossible buy) |
| Carry-over: `gentle_restart` (#215) in the return set | not taken | **NOT TAKEN** | The sprint goal lists it as a COULD. My M5/M6 notes asked for SHOULD, but the tag on the item was never changed. See §5.1 |

**Tally:** 11 MET, 1 PARTIAL (#124 → LOW-3), 1 not taken. Nothing blocks the user, and nothing corrupts coins or the streak.

## 2. What must change (from my angle)

### 2.1 LOW-3: trust the rejected quest's own `minutes` (SHOULD, already in the backlog twice, not re-added)
I agree with the tester's fix and want to state the rule as a principle, so it outlives this bug:
- **Over-estimating a candidate is safe** (it only makes the swap more cautious). **Over-estimating the rejected quest is unsafe**, because it widens what counts as "shorter".
- So the rejected quest's length = its explicit `minutes` when present (the AI or the seed author wrote it on purpose). Only when it's missing, fall back to the text. Candidates keep `max(field, text)`.
- The test oracle must be the seed `minutes` field, not `estimateMinutes`. Checking an estimator against itself proves nothing (see §5.2).

### 2.2 When a "Too long" swap honestly fails, point at the smaller dose (SHOULD, new)
The builder's known gap: on the pool path, rejecting a medium quest as too long **usually finds nothing**, because medium seed entries run 30–120 min. The honest failure is right. But "The cat couldn't find another one. This one stays." leaves the user's actual need (less time) unanswered, so the "Too long" chip turns into a dead end in practice. The app already has the answer: **Partial** ("A smaller dose still counts.").
- For `reason: too_long` + nothing fits, the toast reads (PROVISIONAL): **"Nothing shorter on the shelf today. This one stays. A smaller dose still counts: do part of it and mark it Partial."**
- Other reasons keep the current copy.
- Research basis: shrinking the behaviour beats swapping the goal when time is the constraint (Fogg 2019, *Tiny Habits*). Partial credit keeps competence feedback alive on hard days (SDT competence; Ryan & Deci 2017).
- Test: a pure `rerollFailCopy(reason)` table plus the banned-word scan.

### 2.3 My answer to the builder's question: drop one difficulty level for "Too long" (COULD, needs architect sign-off)
See §3. It's a COULD because §2.2 already removes the dead end at copy cost, and this one touches the slot-difficulty rule in ARCHITECTURE.

### 2.4 Evening bonus toast says "in the ledger" twice (COULD)
"Sealed in the ledger. Another week in the ledger. +25 taels" reads like a stutter, right at the reward moment. **"Sealed, and another week in the ledger. +25 taels"** (PROVISIONAL) keeps both familiar phrases' meaning and Today's wording. Test: update the `sealedToast` assertion.

### 2.5 `gentle_restart`: the mechanical half (SHOULD, refines #215)
The copy half ("Welcome back. Your page is here.") shipped in M5. The half that actually lowers the cost of returning didn't. On the first page after a ≥ 2-day gap (the same condition as `welcomeBack`), generation should use the energy ≤ 2 mix for that one day, whatever energy is picked: no hard quest, at least one ≤ 15-min quest. The prompt already passes `mode`. Restarting after a lapse is the point where habits most often fail, and a lowered first step is the best-supported remedy (Lally et al. 2010 on missed days not derailing automaticity; Marlatt's abstinence-violation effect). One day only, so it never becomes a "punishment mode".

### 2.6 A guard for the flip day (COULD)
H1 relies on "the rest is never announced". That property lives in two places (`events_recent` covers 2 days, and `welcomeBack` wins), and nothing tests the combination. Add one `infoLineFor` row: `welcomeBack: true` and a `rest` dated 3 days ago → the welcome line, never the herb or rest line. Add one server fixture as well: the 10-27/28/29 sequence → `token_used` at 10-27/28, then at 10-29 2 herbs, streak 0, and no event dated today/yesterday.

Accepted as is (PROVISIONAL): if the user *opens* the app on gap day 2 without counting, they'll read "A preserved herb kept your streak on Monday". If they then stay away a third day, the replay rests the run and the herbs come back. The line was true when shown, and the change favours the user (herbs returned, no loss message). I'd rather keep the deterministic replay than add stored state to "honour" a stale message.

### 2.7 Still open, and not re-added
#132 the seed tone pass. The builder edited the same line for `minutes` but kept "on the course you're avoiding most". The avoidance frame shows on any pool day. It's cheap, so do it with the next seed edit.

## 3. Answers to other agents' questions

- **quest-builder (PROGRESS §H1 fix, open question): may a `too_long` pool swap drop one difficulty when nothing shorter exists at the same level?**
  **Yes, for `too_long` only, as a last relaxation level, PROVISIONAL and pending architect sign-off** (ARCHITECTURE fixes slot difficulty, so it's their call on the data side):
  - Order: same difficulty first (current rule). Only if that returns null, try one level down (hard → medium, medium → easy), and never down to nothing.
  - The quest earns **its own** tariff, and the card shows it before Done (the coin badge already does). No hidden pay cut.
  - Why it's right psychologically: "Too long" is the user telling us the constraint. Honouring it supports autonomy, while the lower coins keep the economy honest. The partial-credit route (§2.2) stays the first-line answer because it needs no rule change.
  - Never for `boring` or `not_me`: dropping difficulty there would quietly teach that complaining lowers the bar.
- **quest-builder → quest-designer: Today's offline header (plain h1 vs a date-less MoonGate).** Not mine to style, but on truth: whatever it looks like, it must not show a date the client guessed. Near 04:00 the phone's date and the ledger's logical date can differ. A plain h1 is honest.
- **quest-builder: Evening/Notes don't re-read after a timed-out save.** COULD is right. The text stays in the form and the save is idempotent, so a retry can't double anything. The "may not have saved" copy already tells the truth.
- **quest-builder → Nurasyl: the backup remote.** From my side: a journal's value compounds, so losing it after months is the worst possible "reward" event. Losing a record you invested in is demotivating well beyond its size (Norton, Mochon & Ariely 2012, the IKEA effect). I endorse doing #280 (opt-in push) as soon as Nurasyl picks a remote.

## 4. What went well
- **The return set was taken first, exactly as the retro asked.** It shows the reviews actually steer the sprints.
- **Honesty over reassurance.** The NIT-2 fix removed a comforting banner rather than adding more text. The `offlineCard` wording was narrowed on a truth argument, without needing my sign-off.
- **The honest-failure path for swaps doesn't consume the swap.** That's the most important detail in #124: a failed attempt costs nothing, so trying stays cheap.
- **The "Merged / narrowed ACs" table worked on its first use.** The #236 narrowing was argued from the item's own rule, and the tester confirmed it live at three instants.
- **47 seed entries got honest `minutes:`**, and on long quests the builder chose the longer reading where it was uncertain, which is the safe side for a "too long" promise.

## 5. Process note (what to do differently next sprint)
1. **A priority change goes in the `[PRIO]` tag, not in a trailing note.** Twice (M5 and M6 reviews) I wrote "take `gentle_restart` as SHOULD" as an italic note on a COULD item. The builder selects by tag, so it stayed out. From now on, a reviewer who re-prioritises an item edits the tag (or adds a new item that says "supersedes …"), and the manager's selection reads tags only. I've done the latter for #215 below.
2. **The test oracle must be independent of the code under test.** LOW-3 slipped through an "exhaustive" test because it compared picks against `estimateMinutes`, the same function that inflated the length. For any promise test ("shorter", "cheaper", "count-up only"), the expected value comes from data the function doesn't compute (the seed `minutes`, a hand-written table).
3. **Hardening sprint 2 should start from the promise list.** Every chip, button and line that makes a promise (Too long, Costs money, Save toward this, herb kept, may not have saved) gets one adversarial fixture. Most bugs this project found from my angle were small broken promises, not crashes.
4. **Still the biggest unknown: real use.** Once Nurasyl has used it for about 7 days on the phone, the next psychologist review should read those pages locally, with his consent: rating spread, how often swaps fail honestly, and proposal skip rate (#179). Tune after that, not before.
