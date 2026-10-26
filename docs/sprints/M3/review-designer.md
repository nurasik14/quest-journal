# Sprint M3: review / retro (quest-designer)

> 2026-10-26 · Author: quest-designer. Inputs: `sprints/M3/{plan-*,sprint-goal,review-psychologist}.md`, `PROGRESS.md` §M3 (including "Theme edits"),
> `test-reports/2026-10-26-M3.md` (PASS, 6 low, 4 nits), the 12 `M3-*` screenshots, and the code (`routes/Today.svelte`, `theme/{HerbLoader,QuestCard}.svelte`,
> `lib/copy.ts`, `theme/vocab.ts`). I wrote no application code. I did update my own doc, `docs/design/screens.md` (§1, §2, Implementation notes 7, 8, 13 and 14).
> The user is asleep, so every judgement call is marked **PROVISIONAL**.

## Verdict from the design angle: **Accepted, with 4 SHOULD fixes for M4**

The main risk this sprint was "the phone waits up to 2 minutes", and the builder handled it well. The check-in answers with a 202 in about 0.26 s. Maomao starts
grinding right away. The phases are timed from the server's `started_at`, so they survive a remount (`M3-08` shows the 15 s phase still there after
Market → Today). The fallback banner appears only when AI was actually tried. Reroll stays inside its card, and the boss slot never swaps under the thumb.
Nothing I found blocks the user, corrupts coins, or badly breaks the art direction, so **I'm adding no MUST**.

What's left is about **placement**. Three kinds of feedback (the fallback banner, toasts, the event sticker) show up where the user isn't looking, or on top of
what they're trying to tap. That goes against the brief's rule that decoration never hides content.

## 1. Designer acceptance criteria

| AC | Result | Evidence / note |
|---|---|---|
| AC1 generating state within 300 ms, 202 | **PASS** | Check-in → 202 in 0.259 s. `M3-05`: HerbLoader "Maomao is grinding herbs…", "Energy: Weak pulse", 3 static ghost cards. 🌙 not shot |
| AC2 phases 15 s / 45 s, announced once | **PARTIAL** | The 15 s phase passes (`M3-08`). The 45 s phase wasn't shot. `role="status"` is on the loader, and `{#key genJob.id}` stops re-announcing on every poll. **N2:** "herbs……" (the copy's `…` plus the animated dots) |
| AC3 survives navigation / visibility | **PASS** | Ledger → Today keeps the loader, with exactly 1 check-in POST. `visibilitychange` → `load()` |
| AC4 in-place replace, no jump, live "ready" | **PARTIAL** | `COPY.ready` goes to a polite region, and the MoonGate doesn't move. The 80 ms unroll stagger (COULD C1) wasn't done |
| AC5 reduced motion | **PARTIAL** | The `@media` block stops the pestle, flakes and dots. **The `[data-motion=reduce]` override is ignored** (LOW-6), so the Profile "Reduced motion" switch won't calm the loader. Not emulated by the tester |
| AC6 worst-case card at 320 px | **NOT VERIFIED** | `overflow-wrap:anywhere` is on the title and why (`QuestCard.svelte:249,266`) and the seal has `padding-right:64px`, so it's probably fine. No 320 px shot (already in the tester's M3 checklist item) |
| AC7 text-only AI content | **PASS** | `grep "{@html" web/src` matches only a comment in `QuestCard.svelte:4` |
| AC8 source tags | **PASS** | AI cards have no tag, and pool cards say "from the shelf". There's no robot badge |
| AC9 fallback banner only on attempted-AI | **PASS (logic) / SHOULD (placement)** | Count = 1, keyed on `fallback_reason`. But on Mon/Tue the banner is rendered *after* the ~600 px boss card, so at 390×844 it sits below the fold (`M3-06`: it starts at y≈900). A notice nobody sees doesn't do its job |
| AC10 "Try again" state | **PASS** (copy nit) | `M3-07`. No raw codes. The helper line misstates the order (N1). I adopt the psychologist's wording, now in `screens.md` |
| AC11 hang → result within timeout + 4 s | **PASS** | `AI_TIMEOUT_MS` = 60 s per attempt plus a 5 s kill grace and 1 retry, so the worst case is ~130 s (PROGRESS). The hang test with a 1 s timeout went to the pool. The loader copy after 45 s covers the long tail |
| AC12 in-card reroll loader | **PASS** | `M3-03`. `aria-busy` on the card, and the other cards stay usable |
| AC13 replace + cat + live text, no Swap after | **PARTIAL** | Same slot, "New prescription: …" announced, 0 Swap buttons. **No fade** on the new card (it remounts because it's keyed on the new id). The cat sticker wasn't seen within the 4 s window |
| AC14 failed reroll | **PASS (logic) / SHOULD (placement)** | The card is restored and Swap stays. But the toast covers that card's **Done** button for 4 s (`M3-10`) |
| AC15 boss loader | **PASS** | `M3-01` "Consulting the Jade Pavilion…". The placeholder is hidden while `boss_pending` |
| AC16 boss micro-copy in the card | **PARTIAL** | The `note` snippet works: "Paused today, no penalty." (`M3-12`), "N of 4", the seal offer, "Sealed for the week.". But (a) the open boss still shows a **"100"** chip although a done boss adds 0 to `earned_today` until M5. (b) The 勝 seal **covers the "100" chip** (`M3-11`: C5 not done). (c) The done card prints the status twice ("Sealed for the week." + "Done. Sealed in the le…") |
| AC17 Evening 412 visible | **PASS** | `M3-04`: the panel is at the top and focused, and the toast is right. The toast overlaps the Seal bar (N4, see the toast item) |
| AC18 draft survives navigation | **PASS** | No storage keys. `beforeunload` at `Evening.svelte:85` |
| AC19 save-bar backing + low-rating sticker | **NOT DONE** | Explicitly not committed in the sprint goal. The existing SHOULDs stay open |
| AC20 banned words in rendered text | **PASS (unit) / not re-run in the browser** | The psychologist confirms the scan runs in tests. New M3 strings ("didn't grind", "couldn't find another one", "couldn't be reached") are clean |

**Theme edits review (my PROVISIONAL delegation rule):** all three logged edits are within scope and **approved**: the `vocab.ts` copy, `HerbLoader startedAt`, and
`QuestCard note` with the boss "+N taels" removal. No new tokens or colours (I checked `tokens.css` usage in the diffed files). The builder correctly declined the
let-go badge change because no prop was allowed. I'm now pre-approving that prop (see §3).

## 2. What's good
- **The wait is a scene now, not a spinner.** A real mortar photo, Maomao's line, and calm static ghost cards, with an idle Maomao sticker in the corner (`M3-05`).
  It reads as "she's working on it", which is exactly the brief.
- **Loader keyed on the job, timed on the server clock.** This was my main risk (#2) and it's solved properly, not patched.
- **The boss "brewing" slot (option b)** is the right call. The psychologist endorses it too, and it never invites a tick that then gets swapped.
- **Reroll is local.** The loader sits inside one card, and the other cards and the boss keep working. That's what makes Swap feel cheap and safe.
- **Copy discipline.** Every new string is in Maomao's voice. There's no "error", no robot badge, and no "+100" promise in the done note.
- **Dark mode holds up** (`M3-09`): the boss gold trim, light-jade primary buttons with dark text, and readable muted copy, with no new colours.

## 3. What must change (M4), in priority order
1. **SHOULD: async feedback must appear where the eye and thumb are.**
   - (a) **The fallback banner** goes directly under the MoonGate, above any boss-first card.
   - (b) **Toasts** move to the top of the viewport (under the safe area and the offline banner), so they never cover Done or Seal (`M3-10`, `M3-04`, N4).
   - (c) **The event sticker** stops being `position:fixed` bottom-right. It covered the boss status line, the caption covered the buttons (`M3-11`),
     and on a daily card it lands on Done/Swap. New rule (screens §1 item 7): it sits on the right gutter of the card that triggered it, aligned to the title row,
     72 px under 400 px wide, and may overlap only the card's band or rods. The caption is announced rather than floated.
   - I've written all three into `screens.md` §1 items 2, 7 and 8 and Implementation note 14.
2. **SHOULD: boss-first only on Monday.** PROVISIONAL change to my own M1 rule. At 390 px the boss card with 4 checkpoints is ~600 px, so boss-first on Tuesday
   too means two of seven days start with zero dailies visible. Monday alone is enough to introduce the boss.
3. **SHOULD: `QuestCard showCoins?: boolean` (pre-approved theme prop).** Today passes `showCoins={false}` for let-go dailies (the existing psychologist item) **and for
   the boss until M5** (the psychologist's COULD, which I fold in). With the chip gone, the 勝 seal overlap in `M3-11` goes away on the boss. Still reserve the seal
   width on the tag row for M5 (existing C5 COULD). Also drop the duplicate "Done. Sealed in the ledger." line on the boss: let the `note`'s "Sealed for the week."
   be the only status (`QuestCard` already special-cases `isBoss` there).
4. **SHOULD: HerbLoader motion and ellipsis.** Honour `:root[data-motion=reduce]` (LOW-6) with the same rules as the media query, and strip a trailing `…` from
   `message` when the dots animate (N2). It's a theme edit, pre-approved, about 5 lines.
5. COULD: the reroll fade-in (AC13) and the 80 ms unroll stagger (AC4) share the same `unroll`/`delay` props. Do them together.
6. COULD: the "Ledger date 2026-10-27 · day starts 04:00 · Asia/Hong_Kong" footer is useful but reads like a debug line on every Today. Move it to Profile once
   Profile exists (M4/M6), and keep only "Evening ledger →" in the Today footer. PROVISIONAL: it stays until Profile can show it.

## 4. Answers to other agents' questions
- **Architect (boss swap a/b/c):** **(b)**, as shipped. A brewing loader while `boss_pending`, then the AI boss or the pool boss. I agree with the psychologist's condition:
  `boss_pending` must flip to false after 3 preemptions or a failure, and that needs a regression test. Small extra: if the boss loader has been up for more than 60 s, show the pool boss
  (it's already on disk) so the slot doesn't look stuck. PROVISIONAL, COULD-level, not added as a separate item.
- **Psychologist (fallback copy by cause):** **approved.** `vocab.FALLBACK_NOTE` becomes a 2-key map (`unreachable` / `rejected`) with your exact strings. I own the
  file and delegate the edit to the builder under the theme-edit rule (it's already your backlog item, so I'm not duplicating it).
- **Psychologist (`minutes` / `done_when` on cards):** **yes, your layout.** It's specified in `screens.md` §1 Ready: the "~15 min" chip after the coin chip on the
  tag row, wrapping before the seal space, and "Done when: …" as one muted line under `why` with a 2-line clamp and `overflow-wrap:anywhere`. That's a new
  `QuestCard` rendering of two optional view fields, pre-approved as a theme edit.
- **Psychologist (try-again copy):** your wording wins: "Try again asks Claude first, then the apothecary's own shelf."
- **Builder (let-go badge prop):** `showCoins?: boolean`, default `true`. See §3.3.
- **Tester LOW-4 (404 vs 409):** no design impact. 404 is fine.

## 5. Process notes (what to do differently next sprint)
1. **The screenshot checklist must be scripted, not sampled by hand.** 14 shots were planned, and the 45 s phase, 320 px card, reduced motion, dark generating state
   and cat sticker were all missed, mostly because of timing (a 4 s sticker, a 46 s phase). Next sprint the tester runs a small Playwright script with
   `reducedMotion`, `colorScheme`, a fixed viewport list and `page.clock` (or a `QJ_FAKE_NOW`-driven job `started_at`) to fast-forward loader phases. The
   existing tester checklist item covers the missing shots, so I'm not filing a duplicate.
2. **Every designer AC about a message now also states *where* it appears and what it must not cover.** I checked that the fallback banner, toast and sticker
   *existed*, but not that they were *visible and non-blocking at 390×844*. From M4, the ACs say "in the first viewport" / "doesn't cover any button" explicitly.
3. **Pre-approve theme props in the plan, by name.** The delegation rule worked: 3 clean edits and a correct refusal. Keep it, and list the M4 props up front
   (`showCoins`, `unroll`/`delay`, the `minutes`/`doneWhen` view fields, the HerbLoader motion fix). That's recorded in `screens.md` Implementation note 13.
4. My doc debt is cleared: `screens.md` §1, §2 and the Implementation notes now match M2–M3 as shipped (backlog item ticked).

## 6. PROVISIONAL decisions in this review
- No MUST items. Placement issues are SHOULD because they're transient (4 s) or below the fold, not data or coin risks.
- Boss-first moves from Mon/Tue to Monday only.
- Toasts move to the top of the viewport on every screen (this changes shell §0 "bottom above the nav"; it now applies app-wide, see screens §1 item 8).
- The boss coin chip is hidden until M5 through `showCoins={false}`, rather than shown without a number.
- The time-zone footer stays on Today until Profile exists.

## 7. Backlog items added
See `docs/BACKLOG.md` → "Added by quest-designer in the M3 review".
