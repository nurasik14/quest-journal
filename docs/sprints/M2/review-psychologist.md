# Sprint M2: review / retro (quest-psychologist)

> 2026-10-26 · async (the user is asleep, so judgment calls are marked **PROVISIONAL**).
> Inputs: `plan-psychologist.md`, `sprint-goal.md` (incl. fix rounds 1–2), `PROGRESS.md`, the test reports
> `2026-10-26-M2.md` / `-retest1.md` / `-retest2.md` (final: PASS), and the code: `web/src/routes/{Today,Evening}.svelte`,
> `web/src/lib/{copy,questView}.ts`, `web/src/lib/theme/{QuestCard,HerbRating,vocab}.*`. I also reviewed the screenshots
> `M2r2-01-today-settled-390.png` and `M2-10-today-wed-energy1-390.png`.
> My lens: M2 is the first sprint where **copy and interaction are psychology**. Does the app read as a kind apothecary, or as a guilt machine?

## Verdict: **accepted, with follow-ups.**
21 of 25 psychologist ACs pass. 4 pass only partly, and none of the gaps blocks M3. The core is right: no preselected
defaults, no "fail" wording, a one-tap let-go, undo, a rating-only save, neutral mood chips and a calm quarantine view.
The no-op and minimal-diff work (fix rounds 1–2) is excellent for journal trust.

One gap needs action before the user writes real entries: **unsaved evening text vanishes when you leave the page** (§3.1).

## 1. Psychologist acceptance criteria

| AC | Result | Evidence / note |
|---|---|---|
| AC1: no preselected energy, `energy` null until chosen | PASS | Retest 2, AC12: 0 radios checked, button disabled |
| AC2: energy change never reshuffles | PASS | `today.test.ts` "no reshuffle". The UI also offers no way to change energy after check-in, which is fine |
| AC3: energy → slot table | PASS | `fallback.test.ts` 5 energies × 20 seeds. Screenshot M2-10: energy 1 gives easy/easy/easy |
| AC4: distinct categories, care rules, ≤1 costly quest, cooldown, relaxation order | PASS | Property test (100 seeds) plus the "every care quest on cooldown" fixture |
| AC5: coins from `TARIFF`, pool coins ignored | PASS | `coins:999` → 10 |
| AC6: labels Done / Smaller version / Let go, no "fail" | **PARTIAL** | The labels are exact, and `failed` → 400 on PATCH (PROVISIONAL, accepted). **But the card's coin badge always shows the full tariff.** A partial medium quest shows 🪙20 while it earns 10, and a let-go card still shows 🪙20 (screenshot M2r2-01). The header total (20) is correct, so the card disagrees with it. → §3.2 |
| AC7: optional reason chips, no confirm dialog | PASS | Chips + Skip, and "Set aside. Herbs keep." |
| AC8: same-day undo | PASS | "Undo" on every settled card |
| AC9: stamp on tap, informational copy | PASS | Optimistic seal, then "+10 taels. Sealed in the ledger." No praise words |
| AC10: 👍/👎 independent of status, toggle clears | PASS | "Suits me" / "Not for me" stay available on let-go cards |
| AC11: boss checkpoints tickable, "2 of 4" counting up, paused at energy 1 | **PARTIAL** | Ticking, persistence, type rotation and "Paused today, no penalty." all work. **There's no counting-up progress text** ("1 of 4"), only bare checkboxes. → §3.4 |
| AC12: no running boss coins / no countdown | **PARTIAL** | Open boss: "100 on completion" ✔ and no countdown ✔. **But "Done" on a boss with 1 of 4 checkpoints reads "+100 taels. Sealed in the ledger."** (screenshot M2-10) while `earned_today` stays 0. It promises a payout that M5 won't make (`bossCoinsFor` = 15/checkpoint + 40). → §3.3 |
| AC13: order, no preselected leaf, anchor shown | PASS | Unselected leaves are outlined, not filled, so "no rating" is clearly different from 1 (this answers my designer question). Each leaf's aria text is "7 of 10: Good; …", which is equivalent |
| AC14: rating-only save, clearing allowed | PASS | "Clear rating" button. Rating-only PUT → 200 |
| AC15: no earlier ratings shown | PASS | Only a "Yesterday's ledger" link. It's the user's choice to open it (see §2 note) |
| AC16: 12 neutral mood chips, freeform, custom tags | PASS | All chips use one `qj-chip` style. A hand-written `Rainy` stays as written |
| AC17: gratitude Wed/Sun, else collapsed | PASS | `gratitudeDay()` |
| AC18: a 412 never loses text | **PARTIAL** | The rebase logic is very good (R-BUG-3 fixed). **But on a phone the notice renders off-screen** (tester R2-BUG-1), with no toast and focus on `<body>`. A user who sees nothing happen will think it saved and may leave, and then the text is lost. → §3.1 |
| AC19: no-op saves byte-identical, no commit | PASS | S7: a CRLF file with comments stays byte-identical, and HEAD is unchanged |
| AC20: rating never touches coins | PASS | S11: ratings 7 and 3 give the same `earned_today` |
| AC21: logical date + tz visible | PASS | "Monday's prescriptions" and the footer "Ledger date … · day starts 04:00 · Asia/Almaty" |
| AC22: past days read-only, no "missed" badges | PASS | Open past quests render as plain cards with the neutral "This page is closed…" line. (Let-go cards still get a strike-through, see §3.2) |
| AC23: calm quarantine | PASS | "Your words are safe. Line N…" plus the raw text with numbered lines |
| AC24: verbatim copy, banned-word grep | PASS* | *Small deviations: the card says "An honest dose still counts." (theme vocab) and never uses `COPY.smallerStamped` ("A smaller dose still counts."). The HerbRating hint says "Only this is required.", which is wrong because a notes-only save is allowed. → §3.5. "Nothing was lost" is allowlisted (see §4) |
| AC25: no guilt surfaces | PASS | No streaks, no red, no "0/3". The footer counts up ("2 stamped today"). The header badge shows "0" before anything is done, which is acceptable because it isn't red and isn't framed as a deficit |

## 2. What's good
- **The defaults are honest.** Energy, rating and feedback all start as null, so the app never fabricates data. This is the most important decision in the sprint.
- **Let-go has very little friction.** It takes one tap, the reason chips are optional, nothing asks for confirmation, and Undo is always there. Making honesty cheap is what keeps "Done" meaningful (motivation.md §4).
- **"Suits me / Not for me" stays on let-go cards.** That means you can say "good idea, bad day", which is the most useful personalization signal for M3.
- **The rating doesn't reward high scores.** The leaves are the same colour at any value, and only low ratings get a sticker ("Rest is also medicine."). That's compassionate, and it adds no incentive to inflate ratings.
- **The energy-1 day works as designed** (M2-10). It gives three easy quests including a care one, the boss is paused with "no penalty", and checkpoints stay tickable. This is the anti-burnout design from §1.4, made real.
- **Trust engineering:** after a stale save the form is rebased instead of overwritten, and the overwritten hand edit is still in git (`hand_edit` snapshot). A journal that never silently loses or rewrites your words is the basis of every intrinsic-motivation claim we make.
- **Process:** the copy table in the sprint goal worked. The tester asserted strings and grepped banned words, which is exactly the traceability I asked for at the M1 retro.

Note (no action needed): the "Yesterday's ledger" link sits at the top of the Evening page, before the rating. That makes anchoring on yesterday's score possible, but only if you choose it, and the autonomy is worth more. **PROVISIONAL:** keep it.

## 3. What must change (ranked)

1. **Unsaved evening text is silently lost** (MUST, M3).
   - **(a) No navigation guard.** Typing notes and then tapping the "Today" tab unmounts Evening, and the text is gone. There's no
     `beforeunload` handler and no in-memory draft store (I grepped `web/src` for guard/confirm/unsaved: 0 hits). On a phone this is the normal way
     to check a quest name mid-entry. I called this "the single worst trust failure in a journal" (R7).
   - **(b) The 412 notice is invisible** (tester R2-BUG-1).
   - **Fix, PROVISIONAL and privacy-safe:** keep the draft in a module-level `$state` store (memory only, **not** `localStorage`,
     which respects architect risk 11), so it survives in-app navigation. Add `beforeunload` while dirty. On a 412, scroll to and focus the panel and also show a
     toast: "Not sealed yet. This page changed elsewhere; your text is still here."
   - **Tests:** type → navigate to Today → back, and the text is still there. Trigger a 412 at 390×844, and the notice is in the viewport.
2. **Card coins should show what the quest actually earns** (SHOULD, M3).
   - **Partial:** show the partial tier (20 → 10), and add the number to the note ("+10 taels. A smaller dose still counts.").
   - **Let go:** hide the coin badge. Showing the coins you *didn't* get is loss framing (Kahneman & Tversky: losses loom larger than gains).
   - **Let-go strike-through:** drop it, and keep only the muted title. A strike-through reads as "crossed out" and turns a choice into a verdict.
   - **Technical (architect):** the server should send an `earned` value per quest from `coinsFor`, so the client never does tariff math.
3. **The boss "Done" note promises +100 regardless of checkpoints** (SHOULD, M3).
   - Until M5, show "Sealed for the week." with no number. From M5, show `bossCoinsFor(done, total, completed)`, which is already in the backlog.
   - A promised reward that then shrinks is a broken contract, and that hurts more than a smaller honest number.
4. **Boss progress should count up** (SHOULD, M3). Add "1 of 4" next to the checkpoint list. It's the goal-gradient effect
   (Kivetz et al. 2006: effort speeds up as a goal comes into view), and it was in AC11. Never show "3 remaining".
5. **Copy drift** (COULD, M3). The theme's `STATUS.partial.note` "An honest dose still counts." should become "A smaller dose still counts."
   "Honest" implies the alternative would be dishonest. The HerbRating hint "Tap a leaf. Only this is required." should become
   "Tap a leaf, or just write." "Required" is controlling language (cognitive evaluation theory, CET), and it's also false, because a notes-only save works.
   Both are theme files, so the designer makes the change.
6. **Done sticker on every tap** (COULD, later). A 96 px sticker on every Done will habituate within a week or two. Make it
   intermittent, seeded per quest (about 1 in 3), so it stays a pleasant surprise. Keep the seal and the number deterministic, so the informational
   feedback never varies and only the decoration does (variable decoration, never variable *payout*).

## 4. Answers to the other agents' questions and sign-off requests

- **Architect, "auto-complete the boss when all 4 checkpoints are ticked?"** **No** (confirming builder PROVISIONAL 5).
  Completion stays a user act, because it's their call that the week's goal was met. Two additions:
  - When the 4th checkpoint is ticked, show an inline one-tap button "All four ticked. Seal the week?". It's an offer, not an automatic action.
  - For M5, coins come from `bossCoinsFor(checkpoints_done, total, status)`, so ticking without sealing still pays 15 per checkpoint and nothing is lost.
- **Backlog (tester), quarantine "around line N":** **approved.** New verbatim copy: "Your words are safe. Something around
  line {n} needs a small fix in your editor." Highlight lines N-1 and N.
- **Backlog (tester), past-day legend:** **approved.** Use "How was that day, overall?" when `isPast`. The anchors are unchanged.
- **Backlog (designer), banned-word grep:** allowlist "Nothing was lost". It's a negated reassurance, and it stays verbatim. Change
  `LOADING.verySlow` to "Claude is slow today. If there's no answer, the apothecary's own shelf has backups." The `STATUS.failed`
  *key* can stay, because the grep should target rendered strings, not identifiers.
- **Backlog (builder), the theme `vocab.ts` let-go note edit:** psychologically fine. "No penalty, and that tells the apothecary
  something." is transparent about personalization. The designer still owns the file. Note that the Today screen also shows
  "Set aside. Herbs keep." below it, which is slightly redundant but harmless.
- **Designer (my M2 question):** answered by the code. `SealStamp` lifts back out on Undo, and HerbRating has a distinct
  unselected state. Thank you.

## 5. Process note
- **What worked:** the copy table plus the banned-word grep, and AC-level traceability. Keep both.
- **Change next sprint:**
  1. **Test journeys, not just screens.** The two biggest gaps (text lost on navigation, and the off-screen 412) only show up when
     you *move* through the app on a phone viewport. For M3 I'll write my ACs as journeys ("type a note → check
     Today → come back"), and the tester should use viewport-sized screenshots, not only full-page ones.
  2. **Numbers on cards are copy too.** Every coin number the UI shows must equal what the economy will pay. M3/M5 plans should
     list "displayed amount = derived amount" as an explicit AC.
  3. **Theme copy is in scope for the copy table.** Two strings drifted because they live in `vocab.ts`, which the table didn't cover.
     From M3 my copy table will name the file for each string, so the designer and builder know who owns it.
