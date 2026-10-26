# Sprint M6: review / retro (quest-psychologist)

> 2026-10-26 · async (the user is asleep, so open choices are **PROVISIONAL**).
> Read: `sprints/M6/{plan-*,sprint-goal}.md`, `PROGRESS.md` §M6 + fix round 1, `test-reports/2026-10-26-M6.md` (PARTIAL) and `-M6-retest1.md` (**PASS**), `BACKLOG.md`.
> Code inspected: `web/src/routes/Archive.svelte`, `web/src/lib/copy.ts` (garden block), `web/src/lib/theme/{tokens.css,vocab.ts}` (garden swatches, STATUS), `server/src/stats.ts` (month-ago), `server/src/seed-demo.ts`, `server/test/{m5,m6}-web.test.ts`, `README.md`, `server/src/domain.ts` (`RATING_ANCHORS`).
> Screenshots: I relied on the tester's descriptions of `M6-11…M6-29` / `M6r1-*`. The images are gitignored and I didn't need pixel checks for any psychologist AC.

## 0. Verdict from my angle
**Accepted.** The garden does the three things I asked for:
- it counts up;
- it shows correlations rather than verdicts;
- it treats missing data as missing.

These were the hard parts, and the builder got them right, including two traps the builder caught during their own smoke run: a let-go-only "done 0" row, and a future month label. Nothing I found corrupts data or coins, so there's **no new MUST**.

Two things should change before Nurasyl relies on the garden daily:
- The "A month ago today" card opens an **editable** month-old page and lists let-go/open quests. That's the one unprompted surface, and it should be the gentlest one (§2.1).
- The caption's "Good days" is the only exception left in the banned-word scan. Reword it so the scan has zero exceptions again (§3, answering the builder).

## 1. Psychologist acceptance criteria

| AC | Result | Evidence / note |
|---|---|---|
| **AC1** missing ≠ bad | **MET** | States `rated / unrated / pending / gap / none / broken`. Labels are "not written", "no rating", "can't be read" and "not rated yet", and a test bans `missed` and `0`. Unrated → `satisfaction:null`, excluded from averages (fixture 6/7/8 + 4 unrated → 7.0). Broken → hatch + warning, never a 422 |
| **AC2** no punishing palette | **MET in substance, test missing** | `--garden-1..5` is one green family (`#e7e3c6` → `#2a5f43`; dark `#1a2a21` → `#9fd0ae`), with no `--danger`/vermilion step. The number printed is the user's own (unrounded). The legend uses my words "Worst · Bad · Ordinary · Good · Best". **But** the computed-colour test (`.garden-1` ≠ error colour, both themes) wasn't written, and I now think my legend words were wrong (§2.3) |
| **AC3** today isn't judged early | **MET** | Today = `pending`, dashed, no number until rated. The sheet says "not rated yet". `Evening.svelte` has no link to the garden (grep: 0 matches), and the Archive never writes a rating. No regression guard test exists for the "no garden link above the rating" rule (§2.4) |
| **AC4** counting up first | **MET** | The order is "Days logged · Quests done · Longest streak", with "Current: N" only when ≥ 2. Stats = economy field by field on the seed, the gap fixture, the broken file and 3 rollover instants (tester checks 2 and 12) |
| **AC5** minimum sample | **MET** | `STATS_MIN_RATED = 5`. "Too few days to say yet (3 of 5)". Every average carries its n ("avg 6.8 · 9 days"). n = 4/5 edge fixtures pass |
| **AC6** no let-go tallies, no ranking | **MET** | `let_go` is exposed but never rendered (a test bans `.let_go` and `sort(` in `Archive.svelte`). Let-go-only rows are hidden. Fixed `CATEGORIES` order. The verbatim caption is present. The ranking-word ban passes |
| **AC7** energy confound (scope) | **MET** | `avg_energy` and `n`/`n_rated` per category are in the response. The split stays "later" |
| **AC8** private days are the user's own | **MET** | Private days are included and show "Private page". Gratitude appears only in the full day sheet (muted), never in plots or the month-ago card |
| **AC9** date rule | **MET** | Clamp fixtures 03-31, 2028-03-31, 01-31 and 01-01@03:59 pass. The card is hidden when the page has no rating, no highlight and no counting quest |
| **AC10** care-aware resurfacing | **PARTIAL** | Care language in highlight/notes/gratitude → `null` (checked live by the tester). Notes and gratitude are absent from the JSON. There's no comparison copy. **But:** (a) "Read that page" goes to `/evening/<date>`, the **editable** Evening form, rather than a read-only view; (b) the card lists **every** quest with its status, so "· Let go" and "· Open" lines show up unprompted. See §2.1 |
| **AC11** edit without friction | **MET** | Plain-text editor with If-Match. 412 keeps the text (Copy / Load newer / Save mine anyway). too_large is shown inline. The unparsed-lines banner is literally true. A kb PUT doesn't change the economy. Removal is a raw edit with no confirm and no reason asked. The only confirm is on a *dirty Cancel*, which protects the user's own text, so that's correct |
| **AC12** no AI write path from Profile | **MET** | The tester saw no reflect/generate/onboarding calls from Profile. Order: h1 → suggestions → tabs |
| **AC13** copy carry-overs | **MET** | `welcomeBack` = "Welcome back. Your page is here.", `bossPaused` = "Paused today. It keeps.", `penalt` allowlist removed, and the clock line now lives in Settings. *A new allowlist entry ("Good days") came in, see §3* |
| **AC14** no attention hooks | **MET** | No push/Notification/setAppBadge/periodicSync (grep test). `short_name` "Quests". The README says "no notifications, badges or reminders, by design" |
| **AC15** offline is honest | **MET** | `/api/*` is never cached (0 entries, tested live). Offline = read-only shell + "Couldn't read the garden. Try again". "Saved" copy still appears only after a 2xx (unchanged M2/M5 path, not separately re-shot in M6) |
| **AC16** realistic seed | **MET** | Ratings mostly from an "ordinary" pick, one 2, one 10, two below-par days (3, 4), 3 unrated, gaps of 1 and 3, private, partial-only, rating-only, 6 let-go with reasons, backfilled, n < 5 and ≥ 5. No care language. Deterministic. It refuses `~/quest-data` and non-empty dirs |
| **AC17** README tone | **MET** | "Built to be gentle. A missed day is not written, never 'failed'. A streak rests instead of breaking." Private repo, no notifications, the YAML-comments limit |

**Tally:** 15 MET, 1 MET-in-substance (AC2, test missing), 1 PARTIAL (AC10). None of them block the user.

## 2. What must change (from my angle)

### 2.1 "A month ago today" is the one unprompted surface, so make it read-only and count-up only (SHOULD)
Resurfacing a past day is good for savoring and for seeing your own progress (Bryant & Veroff 2007 on reminiscence; Amabile & Kramer 2011, *The Progress Principle*). But the user didn't ask for that day, so two details matter:
- **The "Read that page" link opens the editable Evening form for a 30-day-old date.** That invites re-rating in hindsight. Retrospective ratings drift with today's mood (mood-congruent recall, Bower 1981; the "remembering self" vs the "experiencing self", Kahneman & Riis 2005), so a 1–10 number written that evening is worth more than a revised one. It's also inconsistent: the garden's own sheet only offers "Write in the ledger" for days ≤ 2 old.
  **Fix:** the link opens the read-only day sheet (`/archive?date=<date>`, which already works via `dateParam`). Rename it "Open that page". Editing an old page stays possible through `/evening/<date>` typed by hand, or a future explicit "Edit" inside the sheet.
- **The card lists let-go and open quests** ("Read a chapter · Let go", "… · Open"). That's a small let-go tally the user didn't ask to see, and "Open" on a month-old quest reads as an unfinished obligation that never closes (Zeigarnik-style intrusion; Masicampo & Baumeister 2011).
  **Fix:** the card lists only `done | partial` quests (the server filter is already there as `counting`). The full sheet still shows everything, because the user asked to see it.

### 2.2 Past-day "Open" in the day sheet (COULD)
In the sheet a past untouched quest shows "· Open", the same label used on Today, where it really is open. For days before today, show "· Not picked up". It's neutral and true: it describes what happened without asking for anything.
The plot `aria-label` "satisfaction 8, 2 of 3 quests" is a completion ratio read aloud on every plot. Change it to "satisfaction 8, 2 quests done" (counting up, the same data).

### 2.3 Legend band words (COULD, correcting my own AC2)
Each legend swatch covers two ratings, but the word I chose names the extreme:
- the 1–2 band is labelled "Worst", while a 2 is "Very bad; most of the day hurt";
- the 9–10 band is labelled "Best", while a 9 is "Great".

"Best"/"Worst" also collide with the ranking words banned elsewhere on the page, which is why the copy test has to skip the anchors array.
**Proposal (PROVISIONAL):** **"Hard · Low · Ordinary · Good · Great"**. Each word is true for both ratings in its band, and none of them is a superlative. Update the `gardenAnchors` test, and remove the anchors-array skip from the garden copy scan.

### 2.4 Two regression guards that didn't make it into the sprint goal (COULD)
- AC2: a computed-style (or token-level) test that no `--garden-1..5` equals `--danger-soft`, `--seal` or `--vermilion*`, in light and dark.
- AC3: a source test that `Evening.svelte` contains no `/archive` link before `HerbRating`.

Both are cheap, and both protect invariants a later "make the garden prettier" change could break without anyone noticing.

### 2.5 Carry-overs that now matter more because the garden displays them
- **#236 `streakWalk` herb-burn** (SHOULD, open): the garden now prints "Longest streak" and "Current: N" next to each other. When a gap can't be bridged and the run rests, we still burn herbs today. The first hardening sprint should take this item with my M5 fixtures.
- **#237 info lines hide once today counts** and **#214 `gentle_restart`** (SHOULD, open): unchanged. Together they're the "return after a gap" experience. They're higher value than any new garden feature.

## 3. Answers to other agents' questions

- **quest-builder (PROGRESS "Open questions" + BACKLOG #249): the caption's "Good days" vs the banned-word list.**
  **Reword it** (PROVISIONAL): *"Days, not causes. Higher-rated days and these quests tend to show up together; that doesn't mean one made the other."*
  - "Higher-rated" is literally what the number is: the user's own rating, not our judgment of the day. That's the rule from my M5 review: a word only appears in sentences literally true about the thing it names.
  - Then the `good days` allowlist entry in `m5-web.test.ts` goes, and the scan is back to one exception ("Nothing was lost").
  - The `gardenCaption` assertion in `m6-web.test.ts` changes to the new text.
- **quest-architect (plan §4): three different "no rating" states.** Answered by what shipped, and I endorse it:
  - (1) not logged → dashed, "not written";
  - (2) logged, no rating → paper fill + `·`, "no rating";
  - (3) quarantined → hatch, "can't be read";
  - plus (4) today → dashed + outline, "not rated yet".

  The builder's PROVISIONAL rule that a page with only generated, untouched quests (check-in only) is drawn as "not written" is **right**. It matches the M5 counting-day rule, and "not written" is literally true. A check-in alone isn't reflection.
- **quest-designer (plan §4): one `isCountingDay` predicate.** Confirmed from my side: stats = economy at every tested instant. Keep it as the only definition of "logged".
- **My own plan question (bud → bloom, one hue, no withered step; `rated` per day):** both delivered.

## 4. What went well
- **Honest numbers survived a whole UI.** The rule "one streak truth" was tested field by field, at rollover seams and with a broken file. This is the property that makes the garden trustworthy, and the trust is what makes it motivating rather than a source of anxiety.
- **The builder self-caught "done 0".** Hiding let-go-only rows shows the "no let-go tallies" principle was understood rather than just pattern-matched.
- **Care-aware resurfacing works locally** with 0 AI calls, including gratitude.
- **The no-hooks PWA.** No push, badge or install nag, and README states it as a feature.
- **The seed is realistic**, so the n < 5, unrated, gap and private paths were all seen by the tester and not only by unit tests.

## 5. Process note (what to do differently next sprint)
1. **Silent AC narrowing in the merge.** Three of my sub-criteria disappeared from `sprint-goal.md` without a "not taken" line: the AC2 colour test, the AC3 Evening-link guard, and AC10's "notes only behind a link" (which became a link to an *editable* page). Proposal: `sprint-goal.md` gets a short **"Merged / narrowed ACs"** table: each source AC whose wording or test changed, with one line on why. The tester checks the table too.
2. **My own ACs need exact targets.** "Behind a 'Read that page' link" didn't say *where to*. From now on, any psychologist AC that names a link or button also names its route and whether it's read-only.
3. **Hardening sprints: take the return-after-a-gap set first** (#236, #237, #214), then §2.1. Those are the behaviours a real user hits in week 2, and no tester run with a 30-day perfect seed will surface them on its own.
4. **The first real use matters more than another fixture.** Once Nurasyl runs it on his phone, the psychologist review should read ~7 real days (with his consent, locally) for rating spread (the calibration note) and suggestion fatigue (#178) before tuning anything.
