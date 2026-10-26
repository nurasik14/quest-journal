# Sprint M6: planning (quest-psychologist)

> Scope (builder-common M6): Archive (garden heatmap, category × satisfaction, streak, "this day last month"), a Profile page to view and edit
> `profile.md`/`insights.md`, PWA manifest + service worker + icons, HOST/PORT for Tailscale, README, a systemd `--user` unit in `deploy/`, and `bun run seed:demo`.
> Refs: `motivation.md` §5.3, §6.1–6.2, §8 (#23, #26); `screens.md` §4–5; `architecture.md` `GET /api/stats`; my M5 review §2/§5.
> The user is asleep, so open choices are marked **PROVISIONAL**.
> **My angle:** the Archive is the first screen that shows the past back to the user, and looking back is where self-judgment comes in.
> Each AC below makes sure the history (a) counts up, (b) reports correlations rather than verdicts, and (c) treats missing data as missing, never as a bad day.
> I'm also applying the M5 process notes: a write-route × derived-input matrix, copy that's literally true, and fixtures for the edge where a resource runs out.

## 1. Acceptance criteria

**A. The garden (heatmap)**
- **psychologist-AC1 (missing ≠ bad):** a day with no file, no rating or a broken file never gets a satisfaction colour.
  - No file / unrated → a dashed plot, labelled "not written" / "no rating". Neither label ever says "missed".
  - Broken → the hatch pattern, labelled "can't be read".
  - Unrated days are **excluded** from every average. They are never counted as 0 (motivation §6.2 rule 7).
  - Test: 3 rated days (6, 7, 8) plus 4 unrated → average 7.0, n = 3.
- **psychologist-AC2 (no punishing palette):** the plot for ratings 1–2 is the palest garden step: an un-bloomed bud, not a withered or red plant.
  - None of the 5 garden swatches uses `--danger`/error hues.
  - The legend labels are the anchor words ("Worst", "Bad", "Ordinary", "Good", "Best"), never "Fail".
  - The number printed in each cell is the user's own rating, unrounded.
  - Test: computed colours of `.garden-1` ≠ the error-banner colour, in light and dark themes.
- **psychologist-AC3 (today isn't judged early):** today's plot stays dashed and has no number until today has a rating, even when quests are done.
  - Opening the Archive never changes or prefills the Evening rating.
  - The M2 rule "previous ratings stay hidden on the Evening form until today's rating is saved" still holds. The Evening page doesn't link to the garden above the rating.
  - Test: today with 3 quests done and no rating → dashed plot. After rating 6 → number 6.
- **psychologist-AC4 (counting up first):** the header stats are, in order, **Days logged · Quests done · Longest streak**, with "Current: N" smaller after them.
  - Current streak 0 → the "Current" item is omitted (no "0").
  - Each value equals `computeEconomy`'s `streak`/`longest`/counts. There's **one** streak function, so the Garden and Today can never disagree.
  - Test: the seed:demo data → the Archive header equals `/api/economy` field by field.
  - "Days logged" uses the M5 counting-day rule: a quest done or partial, a rating, or any evening text.

**B. Category × satisfaction (correlation, never verdict)**
- **psychologist-AC5 (minimum sample):** per category, show **done + partial count** (bar) and the average rating on days with ≥1 done/partial quest of that category, **only when n ≥ 5 rated days**.
  - Below 5, show "Too few days to say yet (n of 5)", with no number and no bar ranking.
  - Every average shows its n: "6.8 · 9 days".
  - Fixture at the edge: n = 4 → no average; n = 5 → average shown.
- **psychologist-AC6 (no let-go tallies, no ranking words):** the API field `failed` (arch §2.3) is renamed or mapped to `let_go`, and the UI **does not render** let-go counts at all.
  - Bars are sorted by a fixed category order (domain `CATEGORIES`), **not** by average. Sorting by average would turn the list into a best/worst leaderboard of the user's own life.
  - There's no "best category" / "worst category" / "you're happiest when…" copy.
  - The caption under the list, verbatim: **"Days, not causes. Good days and these quests tend to show up together; that doesn't mean one made the other."**
  - Banned in this section: `best|worst|happiest|makes you|because of|should`.
- **psychologist-AC7 (energy confound, PROVISIONAL scope):** the M6 stats don't split by energy band (motivation #23 stays "later"). Instead, `/api/stats` returns `n` and `avg_energy` per category, so the next sprint can.
  - Test: the response shape contains both per category.
- **psychologist-AC8 (private days are the user's own):** `private: true` days are **included** in Archive stats and the heatmap, because privacy is about the AI, not about the user's own view.
  - Gratitude text never appears in Archive tiles or the day sheet preview line, only in the full day sheet.

**C. "A month ago today" (resurfacing with care)**
- **psychologist-AC9 (date rule):** same day-of-month one month back, clamped to the last day of that month (Mar 31 → Feb 28/29; Jan 31 → Dec 31).
  - The card is hidden when that day has no rating, no highlight and no counting quest.
  - Fixtures: 2026-03-31, 2028-03-31 (leap year), 2026-01-31.
- **psychologist-AC10 (care-aware resurfacing, PROVISIONAL):** a past day is shown unprompted, so it shows **rating + highlight + quest titles only**. Notes appear only behind a "Read that page" link to `/evening/<date>`.
  - If that day's notes, highlight or gratitude match `CARE_PATTERN`, the whole card is **skipped** (`hasCareLanguage` is local, with 0 AI calls).
  - The card has no comparison copy ("You were happier a month ago" or "+2 since then" are banned).
  - Test: a care fixture dated 1 month ago → no card; a normal fixture → card without its notes text.

**D. Profile (the user is the ground truth)**
- **psychologist-AC11 (edit without friction):**
  - Profile and Insights are viewable and editable with plain text (no `{@html}`).
  - Save → "Notes saved." Saving changes no coins (the M5 invariance fixture now also covers profile/insights PUT from Profile).
  - Removing an insight has **no** confirm dialog and asks no reason.
  - A 412 keeps the user's text (as in Evening).
  - Unparsed lines show the info banner "N lines aren't in the usual format; they're kept as-is.", which must be literally true: a byte-identical round-trip test on a file with 2 odd lines.
- **psychologist-AC12 (no AI write path from Profile):** nothing on Profile triggers a `claude -p` call except the existing onboarding/proposal flows.
  - Edits to insights are never auto-"improved".
  - The `/profile` order is h1 → pending suggestions → tabs (closes builder #166).
- **psychologist-AC13 (copy carry-overs, from my M5 review):**
  - `welcomeBack` → "Welcome back. Your page is here."
  - `bossPaused` → "Paused today. It keeps." The `penalt` allowlist entry is removed, so the banned-word scan has **zero** exceptions besides "Nothing was lost".
  - The tz/rollover debug line moves from the Today footer to Profile (designer #155).

**E. PWA / deploy / README / seed**
- **psychologist-AC14 (no attention hooks):**
  - The manifest and service worker add **no** push subscription, no `Notification.requestPermission`, no `setAppBadge`, and no periodic sync.
  - Grep test: none of those strings appear in `web/src`.
  - Manifest `name` "Quest Journal", `short_name` "Quests". Neither contains the words streak or coins.
- **psychologist-AC15 (offline is honest):**
  - `/api/*` is network-only and never served from the SW cache. A cached yesterday shown as today would show stale quests and stale balances.
  - When offline: the existing offline banner shows, and saves don't optimistically claim "Sealed". Any "saved" copy appears only after a 2xx.
  - Test: SW fetch handler unit, `/api/today` → no `cache.match`.
- **psychologist-AC16 (seed:demo is realistic, so the Archive copy gets exercised):** `bun run seed:demo <dir>` writes 30 days, deterministic by seed, with:
  - ratings mostly 5–7, ≤1 day at 1–2, ≤1 at 10;
  - 3 unrated days, 2 gaps (1 day and 3 days), 1 private day, 1 partial-only day, 1 rating-only day, let-go quests with reasons, 1 backfilled day;
  - at least one category with n < 5 and one with n ≥ 5.
  - It **contains no care/crisis language** (that has its own fixture).
  - It refuses `~/quest-data` and any non-empty dir not created by it.
  - Test: run twice with the same seed → identical bytes.
- **psychologist-AC17 (README tone):** the README describes the app in its own non-coercive terms (no "never break your streak").
  - It says the data lives in the private repo, and that the app sends no notifications by design.
  - It states the known limit "YAML comments may be lost on some rewrites" (M1 carry-over).

## 2. Risks: what the builder will likely get wrong
- **R1 Unrated = 0.** `avg` over all days, or a heatmap where empty gets the lowest colour, turns every skipped evening into a "bad day" on the grid. → AC1.
- **R2 A second streak calculation in `/api/stats`** that drifts from `computeEconomy` (e.g. counting only `done`, or a broken day breaking the run). → AC4.
- **R3 Category list sorted by average with a "top category" highlight.** The list becomes a verdict, and a 3-day sample becomes a "finding". → AC5/AC6.
- **R4 `failed` passed straight through from arch §2.3** and rendered as a red "let go 12×" bar. → AC6.
- **R5 Resurfacing a painful entry** in "A month ago today", or a comparison line under it. → AC10.
- **R6 Service worker caches `/api/today`.** The phone then shows yesterday's quests at 08:00 offline, and the user taps Done on a stale day. → AC15.
- **R7 PWA "engagement" extras**: install prompts on every visit, badges, push. A single native install affordance is fine; nagging isn't. → AC14.
- **R8 seed:demo too pretty** (all 7–9, no gaps), so the n<5, unrated, gap and private paths are never seen by the tester. → AC16.
- **R9 Heatmap colour as the only cue**, or year view with no numbers and no label. The designer has this, but it also matters for my anchors: the number is the user's word.
- **R10 Plain-HTTP Tailscale.** `crypto.randomUUID` and service workers both need a secure context. A Buy that silently does nothing breaks the "one true sentence per event" promise.

## 3. Backlog items for this sprint
**MUST**
- (arch #245, endorsed) `newRequestId()` fallback when `crypto.randomUUID` is missing. The failure copy stays "Couldn't reach the market. Tap again; you won't be charged twice."
- (arch #246, endorsed) A non-loopback browser smoke (check-in, Done, Buy, SW registration).
- (psych, new) The AC5/AC6 stats rules (n ≥ 5, no let-go render, fixed order), as a pure `categoryStats(days)` with edge fixtures n = 4/5.
- (psych, new) The AC1 "unrated excluded" rule in the same pure module, plus AC4 "stats streak == economy streak".

**SHOULD**
- (psych #235) welcomeBack copy truth. (psych #207) `bossPaused` reword + drop the allowlist entry. Both are AC13.
- (psych #236) `streakWalk` doesn't burn herbs on an unbridgeable gap (my M5 §2.2 fixtures). The Archive shows longest/current, so it should be right before it's on display.
- (psych #237) Info lines hide once today counts.
- (psych #238) AC19 stubbed-`fetch` test: same `request_id` on retry, one debit.
- (designer #227 / arch #248) Every economy-input mutation returns `economy`, enforced with a route-table test. The Evening bonus toast shows once.
- (psych #212, PROVISIONAL) "+N today" includes `bonus_today`, and boss coins stay out.
- (builder #214) `mode: gentle_restart`: one day of energy ≤ 2 slots after a ≥2-day gap.
- (arch #89) `no-cache` for `sw.js`/manifest/`index.html`. Without it a stale SW pins stale copy, which matters for AC15.

**COULD**
- (motivation §5.3) Monthly calibration note: if > 40% of a month's ratings share one value, show a quiet note with the anchor table under the garden. "Information, not a correction." Test: 12 of 30 days at 7 → note shown.
- (psych #240) Wishlist pace hint in weeks above 14 days. (psych #241) The two extra `econ:sim` rows.
- (psych #178) Reflection fatigue back-off.

**Explicitly OUT of M6:** energy-band stats split (#23), mystery curios, Apothecary's mercy, rest-day declaration, monthly market review, push reminders (#29, rejected for now per AC14).

## 4. Question for the other agents
**To quest-designer (and quest-architect for the API):** can the `--garden-1..5` scale run from *bud* to *full bloom* in one hue family, with no
brown or withered step and none near `--danger`? And can `/api/stats` return `{n, avg, avg_energy}` per category plus `rated: boolean` per heatmap
day, so the UI never has to guess whether a blank plot means "unrated" or "a bad day"?
