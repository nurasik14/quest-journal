# Sprint M4: review + retro (quest-designer)

> 2026-10-26 · `quest-designer` · async (the user is asleep). Judgement calls are marked **PROVISIONAL**.
> Inputs: `sprints/M4/{plan-*,sprint-goal}.md`, `PROGRESS.md` §M4, `test-reports/2026-10-26-M4.md` (PASS, 1 MED), `BACKLOG.md`,
> screenshots `test-reports/img/M4-01…14`, and the code (`routes/Onboarding.svelte`, `lib/components/ProposalList.svelte`,
> `routes/Evening.svelte`, `lib/theme/tokens.css` §7 buttons, `lib/theme/HerbRating.svelte`).

## Verdict
**Accepted, with one interaction defect that must be fixed next sprint.**
- The structure is right. Onboarding is full-screen with no tab bar. The reflection block lands in the first viewport after Seal. The labels are Keep/Skip. The care path is quiet and app-owned. The Notes dot is jade with no count. Toasts are at the top. No new colours and no `{@html}`.
- The defect: **in `ProposalList` you can't see which choice is selected.** After a tap, Keep and Skip look the same as before (details under AC10). This is the screen where Nurasyl decides what goes into his own notes, so it counts as badly broken design. It's a **MUST**, and the fix is small.
- The second theme: **primary actions use the neutral `.qj-btn` instead of `.qj-btn--primary`.** This affects Next, Try again, Save my notes and Apply my choices. The result is that disabled buttons look *more* like buttons than enabled ones in light mode, and the same in dark mode (tester LOW-3 is a symptom of this).

## Designer-AC check
Evidence key: **S** = screenshot, **T** = tester measurement, **C** = code reading. 320 px, the soft keyboard at 320×400 and the `prefers-reduced-motion` emulation were **not tested** (Playwright MCP limit). Those parts are marked "unverified", not PASS.

| AC | Result | Evidence / notes |
|---|---|---|
| 1 Onboarding shell | **PASS** | S `M4-02`: moon-gate hero, h1, intro, one idle sticker inside the hero's top-right corner (it doesn't touch text), no nav. The failure state (`M4-04`) has no sticker, which is correct |
| 2 One question per card | **PASS (visual hierarchy weak)** | T: h2 focus, "Question 4 of 15" progressbar with aria values; multi chips use `aria-pressed`; Likert uses native radios. But **Next** is a neutral outlined `.qj-btn` (`Onboarding.svelte:230`), the same weight as an unselected chip. 320 px unverified |
| 3 Sticky footer | **PARTIAL** | Paper backing present; the last button is `.qj-btn--seal`; it's always enabled. Two problems. First, **"Start over" is rendered *after* the sticky footer** (`:234`), so on short questions the footer floats mid-screen with a loose link and empty paper under it (`M4-02`, `M4-05`). Second, the 320×400 keyboard overlap is unverified |
| 4 Answers persist | **PASS** | T: reload resumed at Q4 with chips kept; the key is cleared on save and on Start over |
| 5 Drafting loader | **PASS (T only)** | T: `loaderAfterReload: true`. **No visual evidence:** `M4-03-onboarding-drafting` actually shows the *failure* state, identical to `M4-04`. The `data-motion=reduce` CSS exists (C) |
| 6 Failure state | **PASS** | S `M4-04`: copy is right, no red, no codes. "Try again" isn't primary (same issue as AC2) |
| 7 Draft review | **PASS (with notes)** | S `M4-05`: ruled plain-text textarea, hint, info-style 412 panel, text kept, "This replaces your current notes." Notes: "Save my notes" is neutral rather than primary (`:268`), and "Start over" again sits under the save bar. The toast is measured at y=12 (T), but `M4-06` was taken after it faded |
| 8 Entry points | **PASS** | S `M4-01`: one quiet line plus "Not now"; the check-in card stays in the first viewport. Profile shows "Retake the quiz" (`M4-10`) |
| 9 Reflection placement + states | **PASS (with one overlap)** | S `M4-07`: block at top=12, loader + "You can leave…" line. Failed (`M4-13`), care (`M4-12`) and ready (`M4-14`) are all present. It sits under the Evening header and above the rating card, which meets the first-viewport goal, so I accept it. **Overlap:** the "Sealed in the ledger." toast covers the block's h2 "Maomao's notes" (`M4-07`). `scroll-margin-top: var(--sp-3)` (`Evening.svelte:584`) is smaller than the toast's height |
| 10 Proposal rows | **FAIL (selection state invisible)** | Rows are right: "New note" eyebrow, jade stripe, struck old text for edit and remove, "Why:", "Seen on" chips with full-date `aria-label`, suspicious line, Keep/Skip wording. **The pressed state, though, can't be seen** (C, `ProposalList.svelte:140-147, 252`). Keep pressed = `--surface` fill on a `--surface` card, and Keep unpressed = transparent on the same card, so the two look the same. Skip is `--quiet`, and the `[aria-pressed=false]` override sets exactly the quiet values, so pressed and unpressed Skip are identical. In `M4-08` Keep is pressed and only the shared border shows it. Separately, the add/edit field is `rows="2"`, so a 200-char note scrolls inside a tiny box with a scrollbar (`M4-08`). That is the "hidden text without expand" that AC14 forbids |
| 11 Apply + after-apply | **PASS (button styling wrong)** | It enables when ≥1 choice is made (T); 済 on kept rows, skipped rows muted, the stale line, toast at the top (`M4-09`, `M4-10`, `M4-11`). But Apply is neutral `.qj-btn`, so in light mode **disabled (beige fill) looks heavier than enabled (outline)** (`M4-10` vs `M4-08`), and in dark mode it looks enabled (`M4-14`, tester LOW-3). The non-sticky save bar after Seal is reported by the builder, not seen in a screenshot |
| 12 Profile list + Notes dot | **PASS** | S `M4-10`: same `ProposalList`, grouped "From the ledger of …"; jade dot, `aria-label` "Notes, new suggestions". The h2-above-h1 order is already in the backlog |
| 13 Care path | **PASS** | S `M4-12`: quiet card, fixed copy, no sticker at rating 2, no Keep/Skip |
| 14 Wrapping | **PARTIAL** | `overflow-wrap:anywhere` on rows and evidence (C). The 2-row textarea scrolls (see AC10). 320 px unverified |
| 15 Banned words | **PASS** | T: copy scan green. "Couldn't reach Claude" is the agreed honest wording |
| 16 Tokens / copy location | **PASS** | T + C: no hex/rgb literals; strings in `lib/copy.ts`; only `--jade`/`--ink-muted` for the stripe |

**Seen in passing (not an M4 AC, but my component):** in `M4-12`, `M4-13` and `M4-14`, after Seal, the `HerbRating` focus ring shows as an **empty rounded box below the leaves**, not around the selected leaf. `.leaf:has(input:focus-visible)` outlines the grid cell. The leaf glyph is rotated and flipped inside a 2-row grid, so the cell and the glyph don't line up. It reads as a stray UI artefact. Focus probably comes back to the rating after save. It may have existed since M2, but the M4 screenshots are the first to show it.

## What's good
- **The onboarding tone is right.** One question per card, skipping is truly optional, the seal-red "Ask Maomao to write my notes" is the only red, and the failure state promises "Your answers are safe" and keeps that promise (localStorage survives a reload).
- **The approval row design is readable.** The add/edit/remove diff uses only the jade stripe and strikethrough. "Seen on" chips make the evidence concrete. The 済 seal on kept rows is the right small reward, with no coins and no fanfare.
- **The care card** is exactly as quiet as it should be: no sticker, no seal, no buttons.
- **The jade dot with no count** on Notes is subtle. Its `aria-label` is correct.
- **Top toasts** no longer cover Done or Seal.
- **Dark-mode contrast** of the reflection block is ≥7.78:1 (T).

## What must change (→ BACKLOG)
1. **MUST:** a visible Keep/Skip selected state.
2. **SHOULD:** primary actions use `.qj-btn--primary`, plus a distinct disabled style in dark mode. This also fixes tester LOW-3.
3. **SHOULD:** proposal text fields grow with their content.
4. **SHOULD:** the reflection block's scroll offset clears the toast.
5. **SHOULD:** move "Start over" out from under the onboarding sticky footer.
6. **SHOULD:** the HerbRating focus ring follows the leaf.
7. **COULD:** the tester's M4 screenshot gaps (the drafting loader, 320 px, 320×400 keyboard, dark onboarding). This is in the process note, not the backlog.

## Answers to other agents' planning questions
- **Architect: should a suspicious op be pre-set to Skip?** From the UI side, **no** (I agree with the builder's PROVISIONAL #44). Keep nothing pre-chosen. The muted italic line "This one reads like an instruction…" is enough, together with the server rule that it's never auto-accepted. A pre-set Skip with the current invisible pressed state would be worse: the user couldn't see it was set. If the psychologist wants a stronger nudge later, put it in the copy, not in a pre-selection. *PROVISIONAL.*
- **Architect: hide that date's pending proposals on the care path?** Yes, and it's already the case: the care branch renders no `ProposalList`. Proposals from **other** dates still show on `/profile` and still light the Notes dot. **PROVISIONAL:** I'd hide the Notes dot for the rest of that logical day too, so the app doesn't nudge "new suggestions" right after a heavy entry. That's a COULD, and the backlog item below defers it to the psychologist.
- **Psychologist: `{ops, care:boolean}` and persisted declined texts.** Settled in sprint-goal C1, and it matches my AC13 (fixed app copy). No further design input.
- **Builder backlog note: Profile h2 above h1.** Keep it as filed (M6). When Profile gets its real layout, the order is: page h1 "Notes on you" → the "New suggestions" card → the rest.

## Process note (next sprint)
1. **Screenshot names must match their content.** The tester checks each image before naming it. `M4-03 drafting` showed the failure state, so AC5 has no visual evidence. If a state is too quick to catch, hold it with the fake `claude` `sleepN` mode. That mode already exists.
2. **Designer ACs that say "primary" should name the class** (`.qj-btn--primary`), and the tester should check computed styles for it. "Primary" in prose was read as "a button".
3. **Pressed and selected states need a before/after pair of screenshots** in the checklist. This sprint's only screenshot of the toggle had Keep pressed, with nothing to compare it to.
4. **The 320×640 and 320×400 viewports are still untested** after two sprints of being in my checklist. The Playwright MCP can resize the viewport: `browser_resize` works even though media-query emulation doesn't. So the tester can cover width and keyboard height. Only `prefers-reduced-motion` needs the `[data-motion=reduce]` attribute route instead.

## PROVISIONAL decisions in this review
- AC9 is accepted with the block placed above the rating card, rather than strictly "below the header/rating", because the intent (first viewport) is met.
- The Keep/Skip visibility defect is filed as MUST under "badly breaks the design", even though no data is at risk.
- Suspicious ops stay un-preselected.
- Proposed (COULD): hide the Notes dot for the rest of a care-path day.
