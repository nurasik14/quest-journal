# Sprint M2: review / retro (quest-designer)

> 2026-10-26 · Reviewer: quest-designer. Inputs: `sprint-goal.md`, `plan-architect.md`, `plan-psychologist.md`, `docs/PROGRESS.md`
> (M2 + fix rounds 1–2), test reports `2026-10-26-M2.md`, `-retest1.md`, `-retest2.md` (final verdict **PASS**), all 20 screenshots in
> `docs/test-reports/img/`, and a read of `web/src/App.svelte`, `routes/Today.svelte`, `routes/Evening.svelte`, `lib/components/*` and the
> theme files the builder consumed. I wrote no application code. The user is asleep, so every judgement call is marked **PROVISIONAL**.

## Verdict from the design angle: **ACCEPT, with one MUST follow-up**

The increment looks like the Apothecary Diaries. You can see it in the paper ground, the lacquered scroll rods, the palace-beam band on the boss, the
moon-gate photo header, the 済/半/勝 seals, the outlined herb leaves, and the Jade Pavilion night theme. It never looks like a
generic template. The builder used the theme as-is. The only theme edit was the copy fix in `vocab.ts`, and I approve it below.

There is one MUST. On a phone, a stale (412) save gives sighted users no visible signal (tester R2-BUG-1). The page also still shows the 済 seal
from the earlier save, so it looks sealed when it isn't. The user can then leave the page and lose their text. Everything
else is polish.

> I didn't write a `plan-designer.md` for M2. The sprint goal used `screens.md` §0–§2 and the Implementation notes as the designer-ACs.
> I check those below.

## Designer acceptance criteria

| # | Designer-AC (source) | Result | Evidence / note |
|---|---|---|---|
| D1 | Theme used as-is: `tokens.css`, the font `<link>`s, the no-flash script, components from `lib/theme`, `.qj-btn`/`.qj-chip`/`.qj-input` reused, no new colours (impl-1, impl-9) | **PASS** | App components live in `lib/components/`. Screens use only token colours. Light and dark both render correctly (`M2r2-05`, `M2r1-04`) |
| D2 | Svelte ≥ 5.16, svelte-check clean (impl-2) | **PASS** | Retest 2 S1: 0 errors / 0 warnings |
| D3 | Images gitignored, the app looks fine without them, Sticker falls back to SVG (impl-3) | **PASS** | `M2-07-missing-sticker-fallback`. Photos (moon gate, beams, plum branch, lattice) load from `decor/img`, and stickers are `.webp` in the gitignored folder |
| D4 | Shell: 5-tab bottom nav from `vocab.NAV`, 48px targets, `aria-current`, jade top bar on the active tab, focus to `h1` on route change (§0) | **PASS** | Every screenshot. Active "Today" and "Ledger" show the 3px jade bar |
| D5 | No counts and no red badges (§0) | **PASS** | The header badge is a gold sycee with the number earned today. There are no red counts |
| D6 | Offline / save-failure feedback is calm (§0) | **PASS** | `M2-03-offline-revert`: the top info banner says "Couldn't reach the apothecary. Nothing was lost." The seal reverts |
| D7 | Broken file: calm notice, path in `<code>`, raw text read-only, line highlighted, never blank (§0, §1 "Read-only file") | **PASS** | `M2-06` (light) and `M2r1-05` (dark). Line 5 has a gold outline in a numbered `<pre>`, and the boss still renders below. See the note on the dark header in the "Must / should change" list (S4) |
| D8 | Today, check-in: ScrollCard unroll, LanternScale, primary button disabled until chosen, no preselect (§1) | **PASS** | `M2-01`. The no-preselect PROVISIONAL (psychologist-AC1 over my "default to 2 after a gap") is **accepted**: there's no gap detection yet anyway |
| D9 | Today, generating: HerbLoader + static ghost cards with no shimmer, energy shown read-only, the job store survives navigation (§1, impl-5) | **PASS (code)** | `Today.svelte` renders the `generating` branch as specified. It wasn't visible in screenshots because pool generation is inline in M2 |
| D10 | Today, no-quests: alert ScrollCard + "Try again", no raw codes (§1) | **PASS (code)** | Not screenshotted. The branch is present and the copy comes from `COPY` |
| D11 | Today, ready: 3 QuestCards in an `<ol>`, boss above the dailies Mon/Tue and below from Wed, "Paused today, no penalty." at energy 1 (§1) | **PASS** | `M2r2-01` (Mon, boss first) and `M2-10` (Wed, boss last + paused note) |
| D12 | First-render unroll stagger of 80ms on new cards (§1 Ready) | **NOT DONE** | `QuestCard` doesn't expose `unroll`. That's my component's gap, not the builder's → backlog COULD |
| D13 | Outcomes: 済 seal on done, 半 round seal on partial, strike-through and muted text on let-go with **no seal, no red, no sticker**, Undo, "Suits me" / "Not for me" `aria-pressed` (§1, §7) | **PASS** | `M2r2-01` shows all three outcomes side by side. The let-go reason chips appear under the card with Skip, and there's no dialog |
| D14 | Optimistic seal, then revert on failure (impl-6) | **PASS** | `M2-03`. The seal re-animates correctly after a revert (it animates only on false→true) |
| D15 | One sticker at a time, stable seed, parent owns the 4s timer (impl-4, §1.6) | **PASS** | `flashSticker` keys on `seed+event` with a single slot. **Deviation:** after 4s it goes back to *nothing*, not to `idle` → see C3 |
| D16 | "All three settled" is a gentle card, not a celebration, with a primary link to Evening (§1) | **PASS** | `M2r2-01` bottom |
| D17 | Evening order: header with plum band → lattice-framed HerbRating → mood → highlight → notes → gratitude (§2) | **PASS** | `M2-04`, `M2r2-04`. Gratitude collapses to "+ Add gratitude" on Monday |
| D18 | HerbRating: no preselected leaf, the anchor sentence shows, "no rating" is visibly different from 1 (§2, psych question) | **PASS** | Unselected leaves are outlined ink and selected leaves are filled jade (`M2r1-04` 7/10, `M2-04` 3/10). "Clear rating" exists |
| D19 | Mood chips: 12 neutral tags, hand-written tags shown as selected, custom tag input (§2) | **PASS** | `M2-04` shows "rainy day" as a selected chip next to the 12 suggestions |
| D20 | Seal button: `.qj-btn--seal` block, sticky above the tab bar, enabled once rated/edited, "Sealing…" while saving (§2) | **PARTIAL** | It works, but the sticky bar has **no paper backing**, so fields and the low-rating sticker show through or are cut off behind it (`M2r1-04` at 1280: the Highlight field peeks out under the button; `M2-04`: Luomen's sticker is clipped by the bar) → S1 |
| D21 | Saved: 済 seal on the header, "Sealed in the ledger." toast, rating ≤4 → `low_rating` sticker + "Rest is also medicine.", otherwise no sticker (§2, §7) | **PASS** | `M2-04` |
| D22 | Stale 412: never discard text, show the on-disk version (§2) | **PASS for data / FAIL for visibility** | After fix rounds 1–2 the panel is better than my spec: it rebases, lists only real conflicts, and names the adopted fields (`M2r2-04`). But on a 390px phone it renders at `top:-504px`, focus goes to `<body>`, and the header still shows the 済 seal from the earlier save → **M1** below |
| D23 | Backfill: "Written later" subtitle (§2) | **PASS** | Past dates are labelled. The `backfilled` flag is already in the backlog |
| D24 | Reduced motion is honoured through the tokens (impl-10) | **PASS (static)** | Theme CSS is unchanged. `SealStamp` swaps to `qj-fade-in` under `prefers-reduced-motion`. The tester couldn't emulate media queries, so this wasn't checked live |
| D25 | Contrast: only tokens used (impl-9) | **PASS (by construction)** | No new colours in `web/src` outside the theme. In dark mode the seal button is vermilion-light with dark ink (token pair `--seal`/`--on-seal`, AA-checked in `design-system.md`) |

**Score:** 22 PASS · 1 PARTIAL (D20) · 1 visibility FAIL inside a PASS (D22) · 1 NOT DONE (D12, my own component).

## What's good
- **Distinctive, not generic.** The boss card is the visual high point. The palace-beam photo band, gold trim and parchment-yellow sheet make "weekly
  prescription" feel special without shouting. The moon-gate header gives Today a sense of place.
- **The three outcome states read differently at a glance.** There's the square vermilion 済, the round 半, and the muted strike-through for let-go with no seal. That's exactly
  the "no red failure" rule, and it works in both themes.
- **The calm quarantine screen** is the best error UI in the app. It has a numbered read-only `<pre>` with the bad line outlined, the file path in mono, and the
  rest of the screen still usable. It should be the model for later 422s on Market and Archive.
- **The stale-conflict panel after fix round 2** (lists only real conflicts, plus "Updated from the page on disk: Highlight.") is better than my
  original spec, which asked for "reload and paste it back". I'll update `screens.md` §2 to match it (designer doc task, below).
- **Restraint.** There's no confetti and no balance, and the footer only says "2 stamped today". Stickers appear only on positive events and the ≤4 rating.

## What must / should change

### MUST
- **M1: make the 412 stale state visible where the user is looking** (tester R2-BUG-1, which I raise from Low to MUST). From my angle it badly breaks the
  design's "never discard user text" promise. The screen looks sealed: the 済 seal stays on the header, the button returns to "Seal today's ledger",
  and nothing changes near the thumb. A user who then switches tabs or closes the PWA loses their edits, because there are no drafts by design
  (PROVISIONAL 10). Fix, all inside `Evening.svelte`:
  1. On 412: `scrollIntoView({block:'start', behavior: reduced ? 'auto' : 'smooth'})` the panel, then focus it (`tabindex="-1"`, with the first line as its accessible name).
  2. Hide the header 済 seal (`stamped = false`) while there's an unsaved stale state.
  3. Show a toast with the copy "Not sealed yet. This page changed elsewhere." (polite, 4s). **PROVISIONAL copy.** The psychologist can reword it, but it must
     avoid "failed"/"error".
  4. Use the panel's existing `qj-banner--info` style (calm). I accept info over the `--error` variant I specified.

### SHOULD
- **S1: give the sticky Evening save bar a backing.** Add `background: linear-gradient(to top, var(--bg) 70%, transparent)` (or `var(--bg)` + `--shadow-3`
  upwards) and `margin-inline: calc(var(--gutter) * -1); padding-inline: var(--gutter)`, so content scrolls *under* paper and not under a floating
  button. Also add a bottom spacer of one bar height after Gratitude, so the last field and the low-rating sticker are never covered
  (`M2-04`, `M2r1-04`. The builder flagged this too).
- **S2: put the low-rating sticker next to the seal, not in the scroll flow.** Today it sits just above the save bar and gets clipped. Put it in the header
  card next to the 済 seal (`size=72`) with the caption "Rest is also medicine." below the rating anchor. It's aria-hidden, and the caption stays in the live region.
- **S3: move the boss micro-copy inside the card.** "100 on completion" (open) and "Paused today, no penalty." (energy 1) currently float *outside*
  the boss scroll, as orphan lines between cards (`M2r2-01`, `M2-10`). They belong in the card's meta row, under the checkpoints. `QuestCard`
  needs a `note` snippet/prop for this, which is my component, so I'll add it (designer task) and the builder then passes the strings.
- **S4: check the MoonGate text in dark mode on the quarantine screen.** `M2r1-05` shows the dark header with photo + coin but **no eyebrow, date or
  week line**, while light `M2-06` and dark `M2r2-05` are fine. It's probably the unroll animation caught mid-frame by the screenshot, but the `h1`
  lives in that header, so the tester should re-shoot it after 1s and inspect the computed `color`/`opacity` of `.date`.

### COULD
- **C1: unroll stagger for freshly generated cards** (D12): add `unroll?: boolean` + `delay?: number` to `QuestCard` (theme change, mine), and Today
  passes `unroll={justGenerated}` with `delay={i*80}`.
- **C2: "lift the seal" on Undo.** `SealStamp` removes itself instantly on true→false. A 120ms fade/scale-out (skipped under reduced motion) would make
  Undo feel reversible, which answers the psychologist's question. This is my component.
- **C3: idle sticker.** After the 4s event sticker, the slot goes empty. The spec said "settle to `idle`". PROVISIONAL decision: **keep empty during
  Ready** (calmer, and the user is tapping cards), but show `idle` (size 72, `seed=date`) on the **check-in** and **all-settled** states, where it adds character
  without competing with buttons. I'll update `screens.md` §1.6.
- **C4: header badge legibility.** The sycee shows "20" with only an sr-only label, so sighted users may read it as a balance. Add a visible 11px caption
  "today" under the number until M5 brings the real balance (`CoinBadge` has no caption prop yet, which is mine to add).
- **C5: boss done: the 勝 seal pushes the coin chip onto its own line** (`M2-07`). Reserve the seal's inline-end space on the tag row only, not the
  whole header. This is my `QuestCard` CSS.
- **C6: unselected lanterns look disabled.** The greyscale lantern photos in check-in (`M2-01`) read as "unavailable" rather than "unlit". Use a warm
  desaturated tint (`filter: grayscale(.6) sepia(.25)`) with a lit glow on the chosen ones. This is a theme change (`LanternScale`).
- **Not a bug:** the full-page 375px screenshots look like they have a smaller right gutter. That comes from the scrollbar crop in Playwright full-page
  capture. The ScrollCard rods overhang the sheet by 13px, which still fits inside the 16px gutter. No overflow at 320px follows from the CSS.

## Pending decisions from the backlog
- **The `vocab.ts` copy edit (builder, M2 fix 1):** **APPROVED.** `STATUS.let_go/failed.note` = "No penalty, and that tells the apothecary
  something." The card already shows the label "Let go.", so the repeat was a bug in my file.
- **Theme copy reconciliation (designer, M3):** PROVISIONAL decisions:
  - `LOADING.verySlow` → "Claude is slow today. If it doesn't answer, the apothecary's own shelf has backups." (removes "fails").
  - `STATUS.failed` stays as a **key** (read-side alias for hand-written files). Its user-visible label is already "Let go", and the tester's grep should
    scan rendered text, not identifiers.
  - "Nothing was lost" is reassurance, not a loss message. The grep allowlists the exact phrase `Nothing was lost`.
  These are logged as one backlog item for the builder to apply in M3, since it's a theme file and I'm not writing code in a review.
- **Let-go reason row inside `QuestCard` (COULD):** keep it outside for now. The detached tinted panel under the card reads fine (`M2r2-01`). I'll fold it
  in together with S3's `note` slot when I next touch `QuestCard`, so there's one theme change and not two.

## Answers to the other agents' planning questions
- **Architect: are boss checkpoints ticked one at a time, and does ticking all 4 auto-complete?** One at a time, each undoable, and **no auto-complete**.
  Design reason: the boss's "Done" is a deliberate 勝 moment that the user should choose. "Smaller version" must stay possible even with 4/4 ticks,
  and auto-completion would steal the celebration. When all 4 are ticked, the card may show a quiet hint, "All four marked. Seal the week?", next to
  the Done button (COULD, M5 with the coin rules). This matches what was built (PROVISIONAL 5).
- **Psychologist: does the seal appear on tap (<100 ms), can it be lifted, and is "unrated" distinct from 1?**
  - The seal is optimistic and stamps before the PATCH, so it's well under 100 ms (verified in `M2-03`).
  - Lifting works functionally: Undo → open removes the seal. Today the removal is instant rather than animated, and C2 adds the reverse animation.
  - "Unrated" is distinct: all 10 leaves are outlined with no fill, and the anchor line is empty until a leaf is chosen (D18).

## Process note (next sprint)
1. **The designer should write a `plan-designer.md` every sprint**, even when `screens.md` already covers the screen. Without it this sprint had no
   designer-AC numbers, the tester never checked design items (sticky-bar overlap, orphan boss copy), and I'm reviewing against prose.
   From M3 on, I'll list numbered `designer-AC*` with a screenshot checklist.
2. **The tester should take viewport screenshots at the moment of feedback, not only full-page ones.** Full-page shots hid R2-BUG-1 through two rounds.
   For every async action (save, 412, revert, reroll), the tester should also shoot the viewport *as the user's thumb sees it*. Add this to the tester's checklist.
3. **A small "theme change window" for the designer at the start of each sprint.** Several M2 polish items (C1, C2, C4, C5, S3) are in my
   components, and the builder correctly wouldn't touch them. In M3 planning I'll make those theme edits myself *before* the build starts, so the
   builder only wires props.
4. **Doc debt I owe:** update `screens.md` §1/§2 to match what shipped and was accepted. That covers the stale panel (info style, rebase + conflicts list),
   no "welcome back" default, `earned_today` instead of balance until M5, the idle-sticker rule (C3), no pool-fallback banner when pool is the design, and
   `letGoStatus="let_go"` / `allowPartial` now that the server supports them (impl-8 is outdated).
