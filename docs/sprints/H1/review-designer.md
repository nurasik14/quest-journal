# H1 review / retro: quest-designer

> 2026-10-26 · async (the user is asleep, so every judgment call is **PROVISIONAL**).
> Read: `docs/sprints/H1/sprint-goal.md` (there was no `plan-designer.md` for H1; see §5), `docs/PROGRESS.md` §H1 + §H1 fix, `docs/test-reports/2026-10-26-H1.md` + `-H1-retest.md`, `docs/BACKLOG.md`.
> Code: `OfflineCard.svelte`, `NotesEditor.svelte`, `Evening.svelte` (header), `Market.svelte` (sheet), `lib/copy.ts`, `lib/theme/tokens.css` (`.qj-textlink`).
> Screens: `H1-03-*`, `H1t-O-*`, `H1t-15`, `H1t-23-*`, `H1r-05`, `H1r-09`, `H1r-10`, `H1r-11-*`, `H1r-14`.

## Verdict: **PASS, with one SHOULD visual fix**

H1 was a hardening sprint, and the design held up. My M6 "fix first" item, the **offline Today blank page**, is solved on all five routes: each keeps its header, shows one calm jade card, and has no red. The 412 panel now sits where the eye is, and the buy sheet stopped offering a red seal that could only fail. The theme wasn't disturbed: the only theme change is the small `.qj-textlink` utility, which I accept (§2).

One real visual break slipped through on a PASS line. **The Evening bonus moment pushes the 済 seal out of the header card at 390 px** (`H1t-15`). The seal is the completion mark of the whole app, and on the one evening that earns a bonus it shows up clipped at the card edge. That's a SHOULD, not a MUST: it's one evening a week, and nothing is lost or wrong in the data.

## 1. Designer-AC check

H1 had no designer plan, so I graded against:
- my M6 review §3.1 (the offline card spec);
- the design-facing sprint ACs (H1-3, H1-4, H1-6, H1-7, H1-8, H1-10);
- the standing system rules (tokens, dark mode, `aria-hidden` decor, reduced motion, 44 px targets).

| AC / rule | Result | Notes / evidence |
|---|---|---|
| M6 §3.1 / H1-6 offline: header kept + **one** quiet card, info styling, never `--danger` | **PASS** | Today, Evening, Market, Garden and Notes, light + dark (`H1t-O-*`, `H1-03-*`). Market keeps its drawer-cabinet band (`H1t-O-market-light-390`). The Garden's red "Couldn't read the garden." is gone. 0 `--error` banners |
| M6 §3.1 "global banner stays the only *top* message" | **PASS (literal)** / see §3.2 | Only one top banner. But the page now tells the same story twice in two voices: the banner says "apothecary", the card says "laptop" |
| H1-6 copy narrowed to "Can't reach your laptop…" | **Accepted** | The psychologist's truth rule beats my "You're offline" wording. A phone on Wi-Fi isn't offline when the PC is asleep. Good catch |
| H1-7 412 panel above, focused, stacked full-width ≤ 400 px, Copy primary | **PASS (after fix)** | `H1r-11-notes-412-390-dark`: heading on top, Copy is a full-width jade fill, and the two quiet actions sit below it. The dark theme reads well. See §3.3 for the duplicate "Save mine anyway" |
| H1-7 scroll honours reduced motion | **PARTIAL** | It checks `prefers-reduced-motion` only, not the in-app Motion setting (`data-motion="reduce"` from Settings). Market and BottomSheet honour both (§3.4) |
| H1-8 bonus moment: one merged toast + streak sticker beside the 済 seal | **FAIL (visual)** | The toast is right: one line, no stacking. But at 390 px the header row is h1 + balance + `+25` float + 72 px sticker + 72 px seal, in about 300 px. The seal is pushed past the card's right edge and clipped, and the date wraps to "Monday, 26 / October" (`H1t-15`). The tester graded the DOM ("`.head-end` holds the sticker"), not the geometry. → new SHOULD |
| H1-10 unaffordable/cooldown sheet: no red seal, primary "Save toward this", quiet Close, no balance-after | **PASS** | `H1r-09`, `H1t-23-*`. The greyed price chip and the sunk "You have 1,700 of 1,800" note read as "not yet", not "denied". Exactly the intent |
| H1-10 pressed label | **FAIL (nit)** | It renders "**✓** Saving toward this **✓**" (`H1t-23-sheet-unaffordable-dark-390`). The theme's `.qj-btn[aria-pressed="true"]::before` already adds the check, and `COPY.savingToward` adds a second one → new SHOULD (a one-character fix) |
| H1-3 "A month ago today" read-only, count-up only | **PASS** | `H1r-10`: highlight first, "· Done" lines only, the quiet link "Open that page". It reads as a keepsake, not a to-do |
| H1-4 garden caption | **PASS** | It fits in 3 lines at 390 in `--ink-muted` and doesn't fight the bars |
| H1-12 boss first Monday only | **PASS** | `H1t-12`: Tuesday opens on the dailies |
| Tap targets (NIT-4, `.qj-textlink`) | **PASS** | 162×44 and 112×44. The underline style stayed the same, and only the hit area grew |
| Dark mode, `aria-hidden` decor, sticker fallback, reduced-motion sheet | **PASS** | Tester matrix rows 13/15/16. The bonus sticker wrapper is `aria-hidden` |
| No new hard-coded colours / off-token spacing in H1 files | **PASS** | `OfflineCard` and the stale panel use `--sp-*`, `.qj-banner--info` and `.qj-btn--primary` only |

## 2. What's good
- **The offline state now looks like a calm, normal condition.** Paper, a jade rule and one sentence, with the route's own header above it. That's the "missing ≠ bad" rule from the garden, applied to the network.
- **The sheet modes are honest.** Removing the red seal when a purchase can't happen is the most important design fix in the sprint. Vermilion now always means "this will happen".
- **The 412 panel order is right.** Panel, then textarea, then the sticky bar, with the heading focused. Making "Copy my text" primary is the right priority: protect the words first.
- **Keeping `.qj-textlink` in `tokens.css`** was the right call (I own the theme, and I accept the change). A text link stays a text link, and only the hit area grows. I'll document it with the other utilities (doc item below).
- **The `PROVISIONAL` tables in the sprint goal and PROGRESS** made reviewing async easy. Keep them.

## 3. What must change

### 3.1 Evening bonus header overflow (SHOULD)
The sticker must never move the seal. Spec (PROVISIONAL):
- Take the bonus sticker **out of the flex flow**. Make `.bonus-sticker` `position: absolute`, anchored to the header card (the card needs `position: relative`): `top: calc(-1 * var(--sp-4)); right: calc(72px + var(--sp-3))`, `size=64`, `rotate(-4deg)`, `pointer-events: none`, `z-index` above the band, below the toast. It overlaps the plum band like a sticker stuck on the scroll, which is the sticker idiom we use elsewhere.
- `.head-end` stays exactly as it was before H1 (balance + seal), so the layout is identical with and without a bonus.
- At ≤ 360 px, drop the sticker to `size=56`.
- At 390 the date line must stay on one line ("Monday, 26 October"). If it doesn't, also give `.head` `flex-wrap: wrap` with `.head-end { margin-inline-start: auto }`.
- **Test (geometry, not DOM):** at 320/390/1280, the seal's `getBoundingClientRect().right` ≤ the header card's `right − 1`, and `.sub` (the date) has a single line box. Run with the bonus sticker present and absent.

### 3.2 Offline card: one voice, no card-in-card (COULD)
- The card is a bordered `.qj-banner` inside a bordered quiet `ScrollCard`, so there are two frames (`H1t-O-today-dark-390`: a near-black box around a green box). Put the copy and the button directly in the quiet ScrollCard, and keep the jade left rule on the ScrollCard (`border-inline-start: 4px solid var(--accent)`).
- The banner says "Couldn't reach **the apothecary**…" and the card says "Can't reach **your laptop**…". When an OfflineCard is on screen, the banner should match its voice: "Can't reach your laptop. Nothing was lost." (PROVISIONAL; the psychologist owns the copy). Don't add a second top message.
- Below the card, add one decorative `aria-hidden` image at ~96 px: an unlit lantern from `decor/img`, or the `idle` sticker. Use the `Sticker` fallback chain, so it's an SVG when the PNG is missing. Today's offline page is a header plus 70 % empty paper, and the brief asks for decoration that supports, not decoration that's absent.

### 3.3 Notes 412: one "Save mine anyway" (COULD)
`H1r-11-notes-412-390-dark` shows "Save mine anyway" twice: in the panel and in the sticky bar. AC H1-7.2 asked for "one path". Remove it from the panel; the sticky bar already carries it. The panel keeps Copy (primary) and "Load the newer page" (quiet).

### 3.4 Shared reduced-motion check (COULD)
`NotesEditor` decides smooth vs instant scroll from the media query only. Use `getMotion()` from `lib/settings.ts` (or the `data-motion` attribute), like Market and BottomSheet, so the Settings "Motion: reduce" chip is honoured everywhere.

### 3.5 Pressed-label double check (SHOULD, trivial)
Set `COPY.savingToward` to `'Saving toward this'`. The theme supplies the ✓. Add a source test: no `COPY` value that's used on an `aria-pressed` button contains "✓".

### 3.6 Verify the dark sheet (COULD, tester)
In `H1t-23-sheet-unaffordable-dark-390`, list text ("available again 10 Dec", a ghost heading near the Close link) shows through the sheet. `--surface` is opaque in every theme, so this is probably a mid-fade capture: the sheet may re-run `sheet-in` when the pin toggles (a re-keyed `{#if}`). If a re-take after `animationend` still shows it, it's a bug: the sheet must not re-animate on a toggle.

## 4. Answers to other agents' questions

- **Builder (H1): "Today's offline header: plain h1 or a date-less MoonGate?"** Use the **MoonGate without the date line** (PROVISIONAL).
  - Show the moon-gate image band and the h1 "Today's prescriptions", and leave out the eyebrow date and the week. Never guess the date on the client: the logical-day rollover lives on the server, and a wrong date is worse than none.
  - This makes Today match the other offline routes, which all keep their image band (Market keeps the drawer cabinet).
  - It's the existing COULD #339; this answers it, so I didn't add a duplicate. Do it together with §3.2.
- **Builder (H1 fix), to architect/psychologist: "Should a pool `too_long` swap drop one difficulty when nothing shorter exists?"** UI view only. The rule is theirs.
  - Keep the honest failure. The card already has the right affordance for "too long": **Smaller version**.
  - So make the failure toast point at it: "Nothing shorter on the shelf today. Try *Smaller version* instead." Keep the cat line as the sticker caption if the toast gets long.
  - That keeps the coins and the slot's difficulty intact and still gives the user a next step. (COULD, the psychologist owns the copy.)
- **Sprint goal "Not taken" list:** the designer visual items (#306 ramp retune, #312 3-month trim, #313 evidence chips, #249 BottomSheet migration, #231/#322 doc tasks) are still my recommended **H2 core**, in that order. #268 (legend words) rides along with #306.

## 5. Process note: what to do differently next sprint
1. **Hardening sprints still get a short designer plan.** H1 had none, and the one PASS that hid a visual break (H1-8) was a UI item with no visual expectation. Next sprint, the designer writes `plan-designer.md` with one line per UI-touching item: "what the picture must show", plus one geometry assertion. I'll do it before the builder starts.
2. **The tester asserts layout geometry for decorative additions:** "element inside its card", "single-line date", "no clipped seal" (`getBoundingClientRect` containment). Checking DOM presence isn't enough. Any AC that adds a sticker, badge or seal to an existing row gets that check automatically.
3. **Copy changes that touch a themed component** (a pressed toggle, a seal button) get a quick look at the rendered label. The double ✓ was visible in the tester's own screenshot but wasn't flagged, because nobody was grading the label.

## 6. Backlog
Added to `docs/BACKLOG.md` under "### Added by quest-designer in the H1 review": 1 SHOULD bug (§3.1), 1 SHOULD nit (§3.5), 4 COULD (§3.2, §3.3, §3.4, §3.6), 1 COULD (the swap toast copy, §4), 1 SHOULD doc task. There's no MUST: nothing in H1 blocks use, corrupts data or coins, or badly breaks the design.
