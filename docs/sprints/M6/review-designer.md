# Sprint M6 review / retro: quest-designer

> 2026-10-26 · async (the user is asleep). Judgement calls are marked **PROVISIONAL**.
>
> **Inputs:**
> - `sprints/M6/{plan-*,sprint-goal}.md`, `PROGRESS.md` §M6 + fix round 1, `BACKLOG.md`
> - `test-reports/2026-10-26-M6.md` (PARTIAL) and `…-M6-retest1.md` (PASS)
> - code: `routes/{Archive,Profile}.svelte`, `lib/components/{BottomSheet,NotesEditor}.svelte`, `lib/copy.ts` (garden strings), `lib/theme/tokens.css` (garden ramp), `web/index.html`, `public/manifest.webmanifest`, `public/icons/*`
> - screenshots `M6-*` and `M6r1-*` in `docs/test-reports/img/`
> - my own contrast check of the garden ramp (WCAG relative luminance, script in the session scratchpad)

## Verdict from the design side: **accepted, with follow-ups (no design MUST)**

The garden fits the app. It doesn't look like a GitHub contribution chart with a new skin:
- the header scroll has the plum-blossom photo band and large serif numerals;
- every plot prints its number, so colour is never the only cue;
- the five plot states can be told apart in greyscale: number, `·`, dashed, hatched, and no plot at all;
- days before the first entry get **no** plot, so the garden never opens on a wall of "missed" days;
- "A month ago today" reuses the leaf branch and shows the highlight first.

Notes on you has the right order: h1, then suggestions, then tabs. The ruled editor and the Settings chips work. The app icon is original: a 済 seal on paper with a jade rim (`icons/icon-192.png`). It is safe on a fresh clone and doesn't leak any anime art to the home screen.

What I'd fix first, in order:
1. **The offline Today is a blank page** (`M6-27`). Only the banner shows: no header, no card. It isn't white, but the result is the same, and it fails half of designer-AC19.
2. **The low end of the garden colour ramp has steps you can't see.** In light, 1–2 vs 3–4 is **1.03:1**. In dark, the three lowest steps differ by 1.21:1 each. The printed numbers carry the meaning, so this isn't an a11y failure. But the "bud → bloom" gradient doesn't read, which is exactly what the psychologist asked for.
3. **The 3-month view keeps empty rows** for weeks before the first entry (`M6-17`): about 600 px of blank paper with "Sep" and "Aug" labels floating over nothing.

## 1. Designer-AC check

| AC | Result | Notes / evidence |
|---|---|---|
| AC1 layout order, one h1, one balance | PASS | Header (plum band, h1 "The garden", balance) → stats → h2 "Days in the garden" + chips → grid → legend → h2 "By kind of quest" → "A month ago today" (`M6r1-02`, `M6-14`) |
| AC2 stats row, current = Today | PASS | "Current: 20" in the garden matches "20 days in a row" on Today (`M6r1-02` and `M6-28`, same data). It's hidden below 2. There's no count-up animation, which the AC allows (builder COULD) |
| AC3 grid, numbers, 320 fit | PASS | At 320 there's no horizontal scroll. Plots are 35.7 px at 320, 45.7 at 390 and 63 at 1280 (retest). The label column was narrowed to 1.5rem (F6). This is an accepted deviation from my 2rem: "Oct" still fits. Today gets the outline ring |
| AC4 five states without colour | PASS* | All five are distinct (`M6r1-02`, `M6-18`). *The ramp itself is too flat at the low end (§3.2). I couldn't confirm the out-of-range clamp from the screenshots, and the seed doesn't exercise it |
| AC5 aria-labels, tab order | PASS | The retest quotes labels like "Sun 25 Oct: satisfaction 8, 3 of 3 quests". Tab reaches the plots in date order |
| AC6 range chips | PASS | `aria-pressed`, and 4 weeks is the default. Year was not built (COULD) |
| AC7 legend | PASS | 6 + 2 swatches with printed numbers, readable in dark (`M6r1-16`). The words "Worst … Best" came from the psychologist's plan. Their M6 review now proposes "Hard · Low · Ordinary · Good · Great" (BACKLOG COULD), and **I endorse it**: no superlatives, and it fits the §3.2 ramp |
| AC8 day sheet | PASS | Shared `BottomSheet`, focus trap fixed in round 1 (MED-1). The highlight comes before the quests and the notes are plain text. "Write in the ledger" shows only for days ≤ 2 days old. The quarantine sheet shows line 3 highlighted (`M6r1-04`). Minor: the highlight and the notes look like the same prose (§3.7) |
| AC9 by category | PASS | Fixed order, bar + icon + label + printed numbers, and "Too few days to say yet (n of 5)" (the threshold is 5, the psychologist's stricter value). Minor: two different row layouts (§3.6) |
| AC10 month-ago card | PASS | The title shows the real date "26 Sep" and the card is hidden when there is no such day |
| AC11 states | PASS | Loading, empty (sticker + seeds copy, `M6r1-19`; the Stickers-off variant is `M6r1-20`), error + "Try again", and partial "1 page couldn't be read." (`M6-14`) |
| AC12 Notes order | PASS | Round sticker + h1 first, then suggestions, then tabs, Settings and About (`M6r1-11`) |
| AC13 tabs | PASS | Underline + weight show the selected tab, not colour alone |
| AC14 editor, 412 | PASS* | Ruled textarea, a paper-backed sticky bar, and the text is kept on 412 with Copy / Load newer / Save mine anyway (`M6r1-22`). *The 412 panel renders **below** the textarea and the sticky bar, off-screen at 390. You only find it by scrolling, and the sticky "Save" is still live (§3.5) |
| AC15 insights tab | PASS* | Evidence chips link to `/archive?date=`. *They're 34 px tall (tester LOW-2) and print ISO dates "2026-10-24", while the suggestion chips above print "Oct 24" (§3.4) |
| AC16 settings | PASS | Theme / Motion / Stickers chips persist and apply before first paint. The ledger/clock line moved here, and About shows the version (`M6r1-03`, `M6-18`) |
| AC17 icons | PASS | Original SVG → 192/512/maskable/180, committed. No anime art |
| AC18 manifest, theme-color | PASS | Name, short_name, standalone, `#f4ecd8`; two media `theme-color` metas, and the inline script rewrites both for a manual Night setting. The tab bar pads `env(safe-area-inset-bottom)`. Standalone safe areas were not shot (no phone), so that stays unverified |
| AC19 SW, offline, update toast | **PARTIAL** | The update toast "A fresh page is ready · Reload" is quiet, fits on one line, and doesn't auto-reload (`M6-28`). Plain-HTTP LAN shows no error UI (`M6r1-21`). **Offline Today is an empty page under the banner** (`M6-27`). The Garden shows a red-bordered "Couldn't read the garden." under a second offline banner, so there are two messages and the danger styling is used for a normal condition (`M6r1-17`). "Your last page is below" can't hold, because the committed goal 19 keeps `/api/*` network-only. That's the right call, so my copy has to change (§3.1) |
| AC20 decor runtime-cached | PASS | Not precached. A 404 doesn't fail install (tester) |
| AC21 seed covers every state | PASS | 5 levels, gaps, unrated, private, 300-char highlight, 60-char title, month-ago day. Broken comes via `--broken` (the PROVISIONAL default-off is fine) |
| AC22 screenshot checklist | PASS* | Covered except 13 (standalone safe areas: no phone) and the M5 evidence debt, which is still open |

## 2. What's good (keep doing this)
- **The design rule "missing ≠ bad" is honoured in the layout as well as the copy.** There's no plot before the first entry, gaps are a soft dash and never red, unrated days are a `·`, and broken days are a hatch with "Your words are safe".
- **The quarantine sheet** (`M6r1-04`) is the best error UI in the app so far: it names the file, highlights the line and doesn't blame anyone.
- **One `BottomSheet`** with a pure, unit-tested `focusTrap.ts`. The Market already uses the helper, and moving the Market onto the component itself is in the backlog (I endorse it).
- **Dark mode inverts the ramp**, so brighter means more bloom. That's the right choice on night paper.
- **The toast width fix works**: "A fresh page is ready · Reload" and "Bought: … Undo" each fit on one line.

## 3. What must change (all SHOULD/COULD; filed in BACKLOG)

### 3.1 Offline state card (SHOULD)
When a fetch fails with `navigator.onLine === false` or a network `TypeError`, each route (Today, Ledger, Market, Garden, Notes) keeps its header and shows one neutral card instead of the danger banner:
- the card is a `ScrollCard variant="quiet"` with an info `.qj-banner` (jade rule, not vermilion);
- copy: "You're offline. Your pages are safe on the laptop; they open again when you're back." plus a "Try again" button;
- the global offline banner stays the only *top* message, so the route never adds a second one.

This replaces the AC19 copy "Your last page is below". **PROVISIONAL:** no API caching (the architect's read-only, network-only decision stands).

### 3.2 Retuning the garden ramp (SHOULD, theme edit, pre-approved)
This answers the psychologist: yes, one hue family from bud to bloom, with nothing brown or withered and nothing near `--danger`. Light `--garden-1 #e7e3c6` is straw-yellow, which is too close to "withered". The proposed values are measured against the current tokens:

| step | light now → new | dark now → new | ink (unchanged) |
|---|---|---|---|
| 1 (1–2) | `#e7e3c6` → `#e4ecd6` | `#1a2a21` → `#1f3326` | herb-dark / `#ece3cb` |
| 2 (3–4) | `#d9e3c6` → `#c8dcb6` | `#22392c` → `#2a4a35` | same |
| 3 (5–6) | `#b5cfa9` → `#a3c596` | `#2b4a37` → `#3a6748` | same |
| 4 (7–8) | `#84b28c` (keep) | `#5f9a72` → `#6fa982` | herb-dark 4.94 / `#0e1813` 6.62 |
| 5 (9–10) | `#2a5f43` (keep) | `#9fd0ae` → `#a8d8b5` | paper-light 6.91 / `#0e1813` 11.35 |

- Adjacent-step contrast goes from 1.03–1.26 to ≥ 1.2 (light) and from 1.21 to ≥ 1.35 (dark).
- The number ink stays ≥ 4.5:1 on every step. The lowest is light step 4 at 4.94.
- Update the design-system table and the `/* ratio */` comments with the change.

### 3.3 Trimming the 3-month view (SHOULD)
- Don't render week rows that end before the first entry.
- If the window was trimmed, show one muted line under the grid: "The garden starts on {d MMM}."
- The 4-week view is unchanged, because there the empty cells *are* the honest "no plot" state inside a short window.

### 3.4 Evidence chips (SHOULD; merges tester LOW-2)
- The chip link gets `min-height: var(--tap)` (44 px) through a shared `a.qj-chip` rule.
- Use the same short date format as the suggestion chips ("Oct 24", with the full date in `aria-label`).

### 3.5 412 panel placement (SHOULD)
On 412:
- render the panel **above** the textarea, scroll it into view and move focus to its heading;
- relabel the sticky bar's Save to "Save mine anyway" (one path, not two);
- at ≤ 400 px, stack the actions full-width: "Copy my text" (primary), "Load the newer page", "Save mine anyway".

Today a second Save tap just 412s again, out of sight.

### 3.6 Category row rhythm (COULD)
The meta ("done N · avg …") sits right-aligned on the name line when it fits, but moves to its own line when it doesn't. That gives two alternating layouts in the same list (`M6r1-02`). Always put the meta on the second line.

### 3.7 Day sheet and grid labels (COULD)
- Day sheet: give the highlight a small-caps "Highlight" kicker (or the `--accent` left rule used on Today), so it doesn't read as the same paragraph as the notes.
- Grid: put the month label on the **topmost** row of each month block. With newest-first rows, the current "first chronological row" puts "Oct" at the bottom of the October block, where it reads as a label for the block below.

### 3.8 Decisions on the open designer questions
- **Tester NIT-5 (dashed empty garden): won't do.** A grid of dashed plots for a new user is exactly risk 2 of my plan (shame by layout). Sticker + seeds copy stays. I'll fix the `screens.md` §4 wording in my doc task.
- **Plots at 320 px are 35 px: accept (PROVISIONAL).** That's above WCAG 2.5.8's 24 px, the plots are spaced, and they open a sheet that is easy to dismiss. Moving the label column above the grid would cost the month cue. I'll revisit only if Nurasyl's phone is ≤ 360 px wide.

## 4. Answers to other agents' planning questions
- **Architect (three "no rating" states, and should private days look different?).** Shipped and kept:
  - not logged inside the range → dashed "not written";
  - logged without a rating → paper + `·` "no rating" (it counts for the streak, so it never looks like a gap);
  - quarantined → hatch "can't be read";
  - before the first entry or in the future → no plot.

  Private days look **the same** to their owner (it's a local-only view). The sheet already says it's private (`M6r1-05`). No lock icon on the plot: it would draw the eye to exactly the days he chose to keep quiet. PROVISIONAL.
- **Psychologist (bud → bloom in one hue, and `rated` per day?).** Yes on both. `rated` is in the heatmap shape (goal 3). The hue fix is §3.2.
- **Builder ("Good days" in the verbatim caption).** That's the psychologist's call. If a reword is wanted, my suggestion keeps the meaning without the banned word: "Days, not causes. Higher-rated days and these quests tend to show up together; that doesn't mean one made the other."

## 5. Process note (do differently next sprint)
1. **Test the offline and empty paths with the network actually cut, not just mocked fetches.** `M6-27` was in the evidence set, but nobody flagged it as failing AC19, because "no white screen" was read literally. Next sprint, every state AC gets a one-line *visual* expectation ("header visible, one card"). The tester then grades against the picture, not just the wording.
2. **The designer AC should state measurable contrast between adjacent ramp steps**, not only text-on-fill contrast. I wrote the ramp in M1 and only checked ink-on-fill. That's my miss.
3. **Copy in a designer AC that depends on an architecture choice** (e.g. "Your last page is below" needs API caching) must be cross-checked against the architect's plan during planning. The sprint goal resolved the conflict conservatively (correct), but nobody updated the copy.
4. Keep the full-page 390 shots and the 320 shots. They caught §3.3 and §3.6. Add a **3-month dark** shot to the checklist.
