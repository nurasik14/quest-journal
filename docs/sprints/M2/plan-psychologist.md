# Sprint M2: planning (quest-psychologist)

> Scope: the first UI. It covers the Svelte SPA, Today (energy check-in, 3 pool quests + boss, outcome, 👍/👎), Evening
> (leaves 1–10, mood, highlight, notes, gratitude), placeholder pages, write routes, and auto-commit.
> My angle: **M2 is where copy and interaction become psychology.** The defaults, button labels and what's shown or
> hidden decide whether this is a kind apothecary or a guilt machine. Refs: `motivation.md` §1.4, §4, §5.
> The user is asleep, so judgment calls are marked **PROVISIONAL**.

## 1. Acceptance criteria

**Energy check-in (Today)**
- **psychologist-AC1:** The check-in shows 5 options with the Maomao labels from §1.4 ("Bedridden patient" … "Ready to
  taste poison"). **None is preselected.** There's no default of 3. Until a choice is made, `energy` stays `null` on disk.
  Test: a fresh day file has no `energy` key, or `null`, after GET /api/today.
- **psychologist-AC2:** Changing energy later the same day updates `energy` but **does not regenerate or reshuffle**
  quests (arch §2.3). Reloading the page never changes the quests. Test: check in at 3, then GET twice and PATCH energy
  to 1. The quest IDs and titles are unchanged.
- **psychologist-AC3:** Pool selection follows the energy → slot table exactly. Energy 1 = easy/easy/easy, 2 =
  easy/easy/medium, 3 = easy/medium/medium, 4 = easy/medium/hard, 5 = medium/medium/hard. Test: a table-driven test of
  the pure selector over energies 1–5 × 20 seeds checks that the difficulties match the slots, that there's never a
  `hard` at energy ≤2, and that there's never more than one `hard`.
- **psychologist-AC4:** Selection constraints: (a) 3 **distinct** categories; (b) energy 1 → at least one `care`;
  energy 2 → at least one `care` or `treat`; (c) at most **one** money-costing quest (`cost` ≠ `free`), and none at
  energy 1; (d) a pool quest used within its `cooldown_days` is skipped. If that leaves a slot empty, relax the
  cooldown first, then the category rules, and **never** relax the difficulty. Test: the same 100-seed property test
  plus a fixture where every `care` quest is on cooldown, which must still return 3 quests.
- **psychologist-AC5:** Coins on each card come from `TARIFF[difficulty]` (10/20/35) and are snapshotted at
  generation. The pool's own `coins:` key is ignored. Test: a pool fixture with `coins: 999` yields a quest worth 10.

**Quest outcomes**
- **psychologist-AC6:** Each open quest offers three outcomes with these exact labels: **"Done"**, **"Smaller
  version"** and **"Let go"**. Statuses are `done|partial|let_go`. The word "fail" or "failed" never appears in the UI.
  PATCH accepts `partial` and `let_go` (and the legacy alias `failed`, mapped to `let_go`). Test: PATCH each status,
  then check the file's `status` value and the card's coin display (35 / 20 / 0 for a hard quest).
- **psychologist-AC7:** "Let go" opens **optional** one-tap reason chips (`no_time | not_feeling_it | not_possible |
  didnt_fit`) labelled "No time", "Not feeling it", "Not possible today" and "Didn't fit". Skipping the chips is one tap.
  There is **no** "Are you sure?" dialog. Test: let go without a reason means no `reason` key. Let go with a chip
  means `reason: no_time`.
- **psychologist-AC8:** An outcome is **reversible the same day** with "Undo" or "Back to open", and that restores
  coins to 0 or recomputes them. Rationale: a mis-tap must never feel final. Test: done → open → `status: open`, and
  the day earns 0 from that quest.
- **psychologist-AC9:** On "Done" or "Smaller version", the seal-stamp acknowledgment appears **on tap** (optimistic,
  under 100 ms, before the server round-trip). If the server then fails, the card goes back to open with the neutral
  copy from §5. Copy is **informational**, not controlling: the coin amount plus at most one short Maomao line. Never
  "Good job!" or "Great work!". Test: grep the SPA for `good job|great job|well done|awesome`.
- **psychologist-AC10:** 👍/👎 is independent of status. It's available on open, done, partial and let-go quests (a 👍
  on a let-go quest means "good idea, bad day"). Tapping the active thumb again clears it (`feedback: null`). Test:
  let go + 👍 persists both. A second 👍 tap gives `null`.

**Weekly boss**
- **psychologist-AC11:** The boss card shows title, why, and its 4 checkpoints as tickable items with **counting-up**
  progress ("2 of 4"), never "2 remaining". The checkpoint `done` state is written to `weeks/YYYY-Www.md`. The boss type
  is never the same as last week's when the pool allows it. At energy 1 the card shows "Paused today, no penalty",
  and checkpoints stay tickable.
- **psychologist-AC12:** The coin display on the boss shows no running coins in M2 (the payout math is M5), or at
  most "100 on completion". It never shows a negative number or a deadline countdown ("3 days left!").

**Evening ledger**
- **psychologist-AC13:** The order is rating → mood → highlight → notes → gratitude. The leaves have **no preselected
  value**. The anchor text for the hovered or selected leaf (the §5.3 table, verbatim) shows under the leaves, and each
  leaf has `aria-label="N: <anchor>"`. Test: unit-test the anchor table (10 entries); the DOM shows the anchor for 7.
- **psychologist-AC14:** **The rating alone is a valid save.** All other fields are optional, and saving
  `{satisfaction: 6}` with empty text works. Clearing a rating (back to null) is allowed. Test: PUT a rating only → 200,
  and the file has the rating and no empty-heading spam beyond the owned sections.
- **psychologist-AC15:** The Evening view shows **no earlier ratings** (no yesterday, no average, no sparkline) until
  today's rating is saved. Anchoring is prevented. Test: the Evening DOM contains no other date's satisfaction value.
- **psychologist-AC16:** Mood tags: the 12 balanced suggestions are *calm, energized, proud, curious, cozy, connected,
  tired, anxious, frustrated, lonely, bored, overwhelmed*, shown in a **neutral, uncoloured** style (no red for
  "negative"). `mood` stays freeform. A hand-written tag (e.g. `rainy`) shows as selected and round-trips. Users can
  add a custom tag.
- **psychologist-AC17:** Gratitude is optional. **PROVISIONAL:** it's expanded on Wednesday and Sunday, and collapsed
  ("+ Add gratitude") on other days. It's never required.
- **psychologist-AC18:** A stale save (412) **never loses the user's text.** The unsaved text stays in the form with a
  calm notice ("This page changed elsewhere. Your text is still here. Review and save again."). Test: edit the file on
  disk between GET and PUT, and the textarea still contains the typed text.
- **psychologist-AC19:** No-op saves are byte-identical and produce no commit (backlog MUST, BUG-2), on a hand-edited
  file with YAML comments.
- **psychologist-AC20:** The rating never touches coins. Test: `satisfaction` 1 vs 10 yields the same day coins.

**Dates, quarantine, tone**
- **psychologist-AC21:** The header shows the **logical** date and weekday ("Tuesday's ledger"), so a 01:30 entry is
  visibly filed under the previous day (rollover 04:00). It shows the tz from `/api/health` in a small footer.
- **psychologist-AC22:** Past days: the evening fields stay editable (arch: any date ≤ today), and quests are read-only
  with neutral copy ("This page is closed; its quests stay as they were."). There's no status badge like
  "missed" or "incomplete" for open quests on past days. They render as plain, unstamped cards.
- **psychologist-AC23:** Quarantined day (422 `unparseable_file|invalid_file|newer_schema`): Today and Evening show
  the raw text read-only, the line number and "Your words are safe. Line N needs a small fix in your editor." The page
  never goes blank or crashes. Test: put a broken fixture at today's date.
- **psychologist-AC24:** Copy table (below) is used verbatim. A grep of `web/dist` user-visible strings for
  `\b(fail|failed|missed|lost|streak broken|invalid|error|wrong|penalt)` finds nothing except "no penalty". Error
  details may go to the console, not the screen.
- **psychologist-AC25:** No guilt surfaces: no red badges or counts, no "0/3" in red, no streak number in M2 (streaks
  are M5), no login bonus, no countdown timers, no loss-framed text. The progress copy counts up ("2 stamped today").

### Copy table (PROVISIONAL, the tester asserts these)
| Situation | Text |
|---|---|
| Check-in prompt | "How's your pulse this morning?" |
| No quests yet (generating from pool) | "Maomao is choosing today's herbs…" |
| Empty evening, before any input | "Even one leaf is enough tonight." |
| Let go (after tap) | "Set aside. Herbs keep." |
| Smaller version stamped | "A smaller dose still counts." |
| Boss at energy 1 | "Paused today, no penalty." |
| Quarantine | "Your words are safe. Line {n} needs a small fix in your editor." |
| Stale 412 | "This page changed elsewhere. Your text is still here. Review and save again." |
| Save failed or offline | "Couldn't reach the apothecary. Nothing was lost. Try again in a moment." |
| 404 day | "No ledger page for this date yet." |
| Placeholder pages | Shop: "The Palace Market opens soon." Archive: "The garden is still growing." Profile: "Your notes come later." |
| Past day quests | "This page is closed; its quests stay as they were." |

## 2. Risks: what the builder will likely get wrong
- **R1: a red "Fail" button**, or "Failed" in the API layer leaking into labels (arch §2.3 still says `failed`). → AC6.
- **R2: preselected defaults**: energy 3, rating 5 or the slider mid-position. These fabricate data, and missing data
  must stay null (§6.2.7). → AC1, AC13.
- **R3: quests reshuffle on reload or energy change** if the selector runs in GET without persisting. That breaks
  trust instantly. → AC2. The selector must be pure with an injected RNG (seed = date) for tests.
- **R4: the pool has no `cost` or `minutes` fields**, so AC4(c) can't be enforced and the builder will skip it.
  → B3 below (a data edit). Note: the "≥1 small win ≤15 min" rule is **waived at energy 5 in pool mode**
  (medium/medium/hard has no easy slot). PROVISIONAL. M3's AI fills `minutes`.
- **R5: a confirmation modal on "Let go"**, or on un-stamping. Friction on honesty encourages rounding up. → AC7, AC8.
- **R6: the evening form showing a history sparkline**, or yesterday's score as a placeholder. → AC15.
- **R7: a 412 handler that reloads and wipes the textarea.** That's the single worst trust failure in a journal. → AC18.
- **R8: the colour semantics of mood chips** (red for anxious/lonely), which moralises feelings. → AC16.
- **R9: an over-celebratory stamp** (confetti, "+20! Amazing!") on every tap. That's controlling feedback (CET). Keep
  it a seal and a number. Save the bigger sticker reactions for the boss (M5).
- **R10: placeholder pages saying "Under construction"** or showing empty broken layouts. → copy table.
- **R11: past-day open quests shown as failures** (grey strike-through, "missed"). → AC22.

## 3. Backlog items for this sprint
- **B1 [MUST]** (psychologist, M2) Calm quarantine UI (already in the backlog). → AC23.
- **B2 [MUST]** (psychologist, M2) The pure fallback selector `selectDaily(pool, energy, history, rng)` implementing
  §1.4 + cooldown + distinct categories + the relaxation order. → AC3–AC5. This partly pulls in the M3 SHOULD
  "fallback honours cooldown_days / boss type rotation". Both belong here, because M2 is when the pool goes live.
- **B3 [SHOULD]** (psychologist, M2) Data edit to `docs/brainstorm/seed/quests.yaml`: add `cost: low` to the
  money-costing pool quests (`adv-new-dish`, `adv-new-cafe`, `adv-museum`, `body-walk-to-cafe`, and any café/treat
  item that implies buying something). Leaving `cost` out means `free`. It's additive, and the loose schema keeps it.
- **B4 [SHOULD]** (psychologist, M2) The copy table above lives in **one** `web/src/lib/copy.ts`, so the tester can
  grep it and the designer can restyle without rewording.
- **B5 [SHOULD]** (psychologist, M2) Read-side caps relaxed (already in the backlog: a 4th quest or a 120-char title
  reads as 200). The UI renders a 4th hand-written quest as a normal card.
- **B6 [SHOULD]** (psychologist, M2) Mood suggestions + rating anchors are exported constants (`MOOD_SUGGESTIONS`,
  `RATING_ANCHORS`) in `domain.ts`, shared with the web build. → AC13, AC16.
- **B7 [COULD]** (psychologist, M3) Gentle "Welcome back. The herbs kept." line when the previous day file is more than
  1 day old (no list of what was missed). It's copy plus one date check. Take it if time allows.
- **Explicitly NOT in M2:** rest-day declaration, reroll UI (M3), streaks and coin balance (M5), rotating prompts.

## 4. Question for the other agents
**To quest-designer:** the seal stamp must appear on tap (under 100 ms), and the outcome must be undoable. Can your
stamp component support a reversible "lift the seal" state (the same element animating back out), instead of a
one-way animation? Also, will the herb-leaf rating render a clear **unselected** state, so "no rating yet" is
visually distinct from 1?
