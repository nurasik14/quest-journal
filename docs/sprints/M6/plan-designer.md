# Sprint M6 plan: quest-designer (Archive garden, Profile, PWA, deploy)

> 2026-10-26 · async (the user is asleep). Judgement calls are marked **PROVISIONAL**.
> Inputs: `ARCHITECTURE.md` (History/Profile, milestone 6), `brainstorm/architecture.md` (`GET /api/days?from&to`, `GET /api/stats`), `brainstorm/motivation.md`
> (no shame on breaks, peak-end highlight), `design/screens.md` §4/§5, `design/design-system.md` (garden tokens), `BACKLOG.md`, `PROGRESS.md` §M5, `sprints/M5/*`.
> Code: `routes/Archive.svelte` and `routes/Profile.svelte` are still `Placeholder`s, and the server has **no** `/api/days` list or `/api/stats` route yet. There is no
> `web/public/icons/` and no manifest. `index.html` has a single light `theme-color`. The garden and `--cat-*` tokens already exist in light and dark.
> No new colours, fonts or downloaded images. The PWA icons are the **one** new asset type (see AC17).

## 1. Acceptance criteria (designer-AC1…)
Evidence rule (carried over from M5): viewport shots at 390×844 light + dark and 320×640. Shots are taken after `animationend` or with `<html data-motion="reduce">`.
Pressed and changed states need a before/after pair. Data: `bun run seed:demo` into a scratch DATA_DIR (see AC21).

**Archive: "The garden" (screens §4)**
- **designer-AC1:** Layout order: the header ScrollCard with the plum band and `h1` "The garden" → stats row → range chips → grid → legend → by-category →
  "A month ago today". The page has exactly one `h1`, and section titles are `h2`. One `CoinBadge kind="balance"` sits in the header (M5 D-AC1).
- **designer-AC2:** The stats row shows "Days logged · Quests done · Longest streak" as display numerals, with a smaller "Current: N" line. **Current streak must equal the
  Today streak** (both come from the same server `streak`; the client never recounts). Count-up runs ≤ `--dur-3`, and under reduced motion the final number shows at once.
  When current < 2, show no "Current" line. Never show "0" or "lost" (motivation: "The streak rests").
- **designer-AC3:** Grid: weeks are rows (newest on top), Mon→Sun columns, and the left column holds the month label (only on the first row of each month). Each plot is
  a `<button>` with fill `--garden-N` (1–2→1, 3–4→2, 5–6→3, 7–8→4, 9–10→5) and the **number printed in the cell** in `--garden-ink-N`. Today has a focus-ring
  outline. At **320 px all 7 columns and the label fit with no horizontal scroll**: use `grid-template-columns: 2rem repeat(7, minmax(0,1fr))`, a 3px gap, plots
  `aspect-ratio:1`, ≥ 32px (WCAG 2.5.8 needs ≥ 24). Check: `scrollWidth <= clientWidth` at 320.
- **designer-AC4:** Plot states are distinct **without colour**:
  (a) rated: number + fill;
  (b) logged but unrated (quests or text, no rating): paper fill + a small `·`, label "no rating";
  (c) gap inside the logged range: a soft dashed `--garden-empty-line` outline, label "no entry", never red;
  (d) before the first ever entry, or a future day: **no plot** (an empty cell; a dashed outline there would read as "missed");
  (e) `broken`: a diagonal hatch, label "can't be read", and tapping it opens the sheet with the quarantine copy.
  A hand-edited satisfaction outside 1–10 or not an integer: round, then clamp, for colour (**PROVISIONAL**), and print the raw value.
- **designer-AC5:** Every plot has `aria-label` like "Sat 25 Oct: satisfaction 9, 3 of 3 quests" (variants for b–e). The grid is a `role="grid"`, or a list of week
  groups, with arrow-key movement **PROVISIONAL**: at minimum, Tab reaches every plot in date order.
- **designer-AC6:** Range chips "4 weeks · 3 months" are `aria-pressed` segmented chips, and 4 weeks is the default. **Year is a COULD** (16px plots without numbers
  need the "Show numbers" toggle, and 53 rows is a long scroll). If shipped, it follows screens §4.
- **designer-AC7:** The legend has 6 swatches (no entry, 1–2 … 9–10), each with a text label and the swatch number printed like the cells. It's readable in dark mode.
- **designer-AC8:** Day detail: tapping a plot opens the **same bottom-sheet pattern as the Market buy sheet** (`role=dialog`, focus trap, Esc, focus returns to the
  plot, safe-area padding). It contains the date `h2`, `HerbRating readonly size="sm"`, mood chips, read-only quest rows with their seals (`QuestCard editable={false}`
  or a compact row), the highlight first (peak-end), and the notes as **plain text** (no `{@html}`). Days ≤ 2 days old get a quiet "Write in the ledger" link to
  `/evening/:date`. Older days are read-only.
- **designer-AC9:** By category: one row per category with the `--cat-*` colour bar plus the category icon and label, "done N" and "avg 7.4" as text. **The numbers
  are always printed**: several `--cat-*` fills are < 3:1 on paper (for example `--cat-care`), so the colour is never the only cue. Bars use a `--surface-sunk` track.
  Categories with n < 3 days show "too few days yet" instead of an average (motivation #23 confounding; **PROVISIONAL**).
- **designer-AC10:** "A month ago today" card: its title shows the **actual date** used (for example "25 Sep"), then the rating, the highlight and the quest titles.
  It's hidden when there is no such day.
- **designer-AC11:** States: **loading** shows all plots dashed and stats as "—", static (no shimmer under reduced motion). **Empty** (< 3 logged days) shows
  `Sticker event="idle"` + "Your garden is still seeds. Each sealed day plants something here.", and stats and categories are hidden. **Error** shows the
  `.qj-banner--error` "Couldn't read the garden." + "Try again". **Partial** (`warnings[]` non-empty) shows a muted info line "N pages couldn't be read" and the grid
  still renders.

**Profile: "Notes on you" (screens §5)**
- **designer-AC12:** Order: the `LatticeFrame pattern="floral"` header with a round idle sticker and `h1` "Notes on you" **first**, then pending proposals (closes the
  M5 COULD "h2 above h1"), then tabs, Settings and About. One `h1`.
- **designer-AC13:** Tabs Insights · Profile: `role=tablist`, arrow keys, 48px. The selected tab is shown by an underline **and** the weight, not by colour alone.
- **designer-AC14:** The Profile preview renders Markdown as text blocks (h3/ul/p from a tiny parser; **no `{@html}`**). "Edit" opens a full-height ruled
  `.qj-textarea` (≥ 16px font, so iOS doesn't zoom). The sticky Save/Cancel bar has a paper backing (same rule as the Evening bar). Saving shows "Saving…" and then the
  toast "Notes saved." **No seal.** On 412 the user's text stays, and the page shows the info panel + Copy + Reload (the Evening pattern). Cancel on a dirty
  textarea asks once, inline (not `confirm()`).
- **designer-AC15:** Insights tab: bullets with evidence chips that link to `/archive?date=` and open that day's sheet. `unparsed_lines` show as an info banner. At
  the 60-note cap, the info banner appears. "Edit raw" uses the same editor pattern as AC14.
- **designer-AC16:** Settings ScrollCard with segmented controls: Theme (System/Paper/Night → `applyTheme`, `theme-color` updates), Motion (System/Reduce →
  `data-motion`), Stickers (On/Off; Off removes all character art, and the SVG fallback decoration stays). These persist in `localStorage` and apply before first
  paint (the `index.html` inline script is extended for `qj-motion`). The ledger/clock line moves here from the Today footer (M4 COULD). About shows
  `IMAGE_SOURCES.md` as plain text, plus the version.

**PWA**
- **designer-AC17:** Icons: an **original** mark: the vermilion 済 seal on `--paper`, with a thin jade lattice rim, **generated from our own SVG** and committed
  (`web/public/icons/` 192, 512, 512-maskable with an 80% safe zone, 180 apple-touch). **No anime art or gitignored photos in icons or the manifest**: they must exist on
  a fresh clone and are visible outside the app.
- **designer-AC18:** Manifest: `name` "Quest Journal", `short_name` "Quests", `display: standalone`, `background_color #f4ecd8`, `theme_color #f4ecd8`, start `/`.
  `index.html` gets two `theme-color` metas with `media` (light `#f4ecd8`, dark `#0e1813`) plus the apple status-bar meta. In standalone mode the tab bar respects
  `env(safe-area-inset-bottom)` and the MoonGate respects the top inset (shot: an iOS-like 390 viewport with insets emulated, or the Chrome standalone window).
- **designer-AC19:** The service worker caches the app shell only, **never `/api/*`**. Offline: the existing offline banner, and Today shows the cached shell with
  "You're offline. Your last page is below." No blank white screen. A new version shows one quiet toast "A fresh page is ready" + "Reload" (no auto-reload while a
  draft is dirty). Over plain `http://<tailscale-ip>` the SW can't register (no secure context). The app must then show **no error UI** at all (feature-detect
  silently).
- **designer-AC20:** Decor/sticker images are runtime-cached (cache-first) and **not precached**: they're gitignored, so a 404 must not fail SW install.

**Seed + evidence**
- **designer-AC21:** `seed:demo` produces data that exercises every visual state: all 5 garden levels, ≥ 1 gap, ≥ 1 logged-unrated day, 1 broken file, a
  current streak ≥ 4, a day exactly one month ago with a highlight, ≥ 1 category with n < 3, and long text (a 300-char highlight and a 60-char quest title).
- **designer-AC22:** Screenshot checklist M6-01…M6-14: garden 390 light/dark (01/02); garden 320 with no h-scroll (03); empty garden (04); day-detail sheet
  390 + 320 (05/06); broken plot sheet (07); by-category + month-ago (08); Profile insights tab dark (09); profile editor + 412 panel (10); settings Night before/after
  (11); Stickers Off on Today (12); installed/standalone with safe areas (13); offline shell (14). Plus the M5 evidence debt (backlog).

## 2. Risks / likely builder mistakes
1. **The 320 grid overflows.** 7×40px + label + gaps = 336 > 288 content width. Don't hard-code 40px plots (AC3).
2. **Dashed plots for days before the first entry or in the future.** The garden would open as a wall of "missed" days, which is shame by layout (AC4d).
3. **Streak mismatch** between Garden and Today because the garden recounts on the client. Use the server value only (AC2).
4. **`{@html marked(...)}`** for the profile preview or day notes. This is an injection risk with hand-edited files. Use text only (AC8/AC14).
5. **Colour-only categories/heatmap** in dark mode or with low-contrast `--cat-care`/`--cat-adventure` fills. Numbers always printed (AC3/AC9).
6. **Icons cut from a sticker or decor photo**: these break on a fresh clone and leak personal-use art to the home screen (AC17).
7. **SW precaching gitignored images**, or caching `/api/today`. Install fails, or stale quests show as live (AC19/20).
8. **The SW update auto-reloads** and wipes a dirty Evening/Profile draft (AC19).
9. **Second sheet implementation.** Extract the Market sheet into a shared `BottomSheet` component instead of copying it (the trap, Esc and safe-area fixes from M5 come along).
10. **Settings applied after mount**, which flashes the light theme and motion on reload in standalone mode. Extend the inline no-flash script (AC16).

## 3. Backlog items for this sprint
MUST (from the backlog, design-relevant):
- `crypto.randomUUID` fallback (architect M5 MUST): without it, Buy breaks over the Tailscale origin, the exact M6 context.
- A non-loopback browser smoke (architect M5 MUST). The designer adds: the screenshots for AC19's "no error UI without SW" are taken from that origin.

SHOULD (mine, carried over from M5, and small CSS/copy work alongside M6):
- Toast width fix (`App.svelte`). Every new M6 toast ("Notes saved.", "A fresh page is ready") depends on it.
- Unaffordable/cooldown buy sheet: "Save toward this" instead of the red Buy.
- Today event sticker not under the 済/勝 seal.
- Evening bonus moment (with the architect's "every mutation returns `economy`" invariant).
- Info-line "shown once" `localStorage` key; M5 evidence debt shots; fold M5 decisions into `screens.md` (my doc task, done in the review).
- Async-feedback (a): the fallback banner directly under the MoonGate (still open since M4).

COULD: Year range (AC6), `CoinBadge` delta honouring `data-motion` (NIT-4), NIT-6 void clears the "Prescribed…" line, the 320 tier-heading orphan, SealStamp lift.

New (designer, M6) to add to BACKLOG if the builder doesn't take them:
- [SHOULD] Shared `BottomSheet.svelte` in `lib/components` used by Market + Garden (risk 9).
- [SHOULD] PWA icon set from an original 済-seal SVG, committed (AC17).

## 4. Question for the other agents
**To quest-architect:** is the heatmap's "logged" definition the same as the streak's "counting day" (a quest done/partial **or** a rating **or** any evening text)?
If `/api/stats` defines "logged" differently from `computeEconomy`, then "Days logged", the dashed gap plots and "Current streak" will disagree on screen.
**PROVISIONAL:** one shared server predicate `isCountingDay()` feeds all three.
