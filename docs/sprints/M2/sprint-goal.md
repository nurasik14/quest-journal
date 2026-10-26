# Sprint M2: sprint goal (quest-builder)

> 2026-10-26 · Merged from `plan-architect.md` (architect-AC*), `plan-psychologist.md` (psychologist-AC*) and the designer's
> `docs/design/screens.md` §0–§2 + "Implementation notes" (designer-*). The user is asleep, so conflicts are resolved
> conservatively and marked **PROVISIONAL**. No FIX round: the M1 test report verdict was PASS. Its BUG-1 (DST) and BUG-2
> (no-op save) are taken in below.

**Goal:** a working Svelte 5 SPA with Today (energy check-in → 3 pool quests + weekly boss, outcomes, feedback) and Evening
(leaf rating, mood, highlight, notes, gratitude). It's backed by write routes that auto-commit, keep hand-edited files
byte-identical on no-op saves, and never show a blank screen or a guilt surface.

## Acceptance criteria I commit to

### Workspace, build, serving
1. `web/` is a Bun workspace (Svelte 5 + Vite + TS strict). `bun run build` builds `web/dist` and the server bundle. `bun run typecheck` runs `tsc` (server) **and** `svelte-check` (web), and both exit 0. `bun test` stays green. *(architect-AC1, designer-impl-1/2)*
2. The web bundle imports no server runtime: shared API types come via `import type` from `server/src/api-types.ts` only. A grep of `web/dist` for `node:fs`, `gray-matter` and `Bun.spawn` finds 0 hits. *(architect-AC2)*
3. The Vite dev server binds localhost and proxies `/api` → `127.0.0.1:4317`. Proxied requests pass the Host/Origin guards. *(architect-AC3)*
4. When `SERVE_WEB` is on (default: `NODE_ENV=production`), Hono serves `web/dist`. Unknown non-`/api` paths get `index.html`. Unknown `/api/*` paths get a JSON 404, never HTML. `/assets/*` is `immutable`, and `index.html` is `no-cache`. *(architect-AC4)*
5. Static traversal is impossible (`%2e%2e`, `..%2f`, encoded variants): only files inside `web/dist` are served. *(architect-AC5)*

### Today API
6. `GET /api/today` → `{date, week_id, weekday, tz, rollover_hour, day, day_error, week, week_error, rerolls_left, needs_checkin, needs_generation, jobs, earned_today}`. The date comes from the server's injected clock only. *(architect-AC6, AC24)*
7. A quarantined day or week file → 200 with `day_error`/`week_error = {code, file, line?, raw}`, and the other half still renders. *(architect-AC7, BACKLOG MUST calm quarantine)*
8. Lazy week creation is create-if-absent (`If-Match: *` semantics). 5 concurrent GETs in a new week give 1 file and 1 commit reason. An existing week file is never overwritten, and repeat GETs write nothing. The boss comes from the pool (seeded by week), its `type` differs from last week's when possible, and its 4 checkpoints are stored as `{text, done:false}`. *(architect-AC8, psychologist-AC11)*
9. `POST /api/today/checkin {energy}` writes the energy and generates from the pool under the day-file mutex. Slot difficulties follow motivation §1.4 exactly. `coins` come from `TARIFF` (pool coins are ignored). `generation = {source:"pool", model:null, at}`. *(architect-AC9, psychologist-AC3, AC5)*
10. The pure selector `selectDaily` gives: distinct categories; energy 1 → ≥1 `care`; energy 2 → ≥1 `care|treat`; ≤1 money-costing quest (`cost` ≠ free) and none at energy 1; titles from the last 14 days, then within `cooldown_days`, are excluded. Relaxation order: 14-day window → cooldown → category rules (care, then money, then distinct). **Difficulty is never relaxed.** Same inputs give the same output. *(architect-AC9, psychologist-AC4, BACKLOG psych B2)*
11. The job contract: check-in returns `202 {job, day}` (the job is already `succeeded` in M2), and `GET /api/jobs/:id` exists. Two concurrent check-ins give exactly 3 quests. A later check-in with a different energy updates `energy` only (200 `{day}`) and never reshuffles. `POST /api/today/generate` → 409 `already_generated` when quests exist. *(architect-AC10, AC11, psychologist-AC2)*
12. No energy is preselected, and `energy` stays `null` until chosen. *(psychologist-AC1)* PROVISIONAL: the designer's "default lantern to 2 after a gap" is **not** done (psychologist-AC1 wins).

### Quest mutations
13. `PATCH /api/quests/:id {status?, feedback?, reason?, checkpoints?}` uses a strict body (unknown keys → 400, so `coins` can't be sent). Statuses are `open|done|partial|let_go`. **PROVISIONAL:** the alias `failed` is rejected on write (400, architect-AC12 over psychologist-AC6). The UI never sends it. `completed_at` is set on done/partial and cleared otherwise. `reason` ∈ `no_time|not_feeling_it|not_possible|didnt_fit` and is cleared when leaving `let_go`. Sending the same values again is a 200 no-op: no write, no commit. *(architect-AC12, psychologist-AC6/7/8/10)*
14. ID routing is strict: `<date>-<slot>[b-z]` → that day, and only if it's today (else 409 `not_today`); `<week>-boss` → only inside its ISO week. Anything else → 400. *(architect-AC13)*
15. Boss checkpoints are toggled one at a time: `checkpoints:[{index, done}]`, and an out-of-range index → 400. A toggle never rewrites the text or auto-completes the boss. *(architect-AC14; answer to architect's question: PROVISIONAL, no auto-complete)*

### Evening API
16. `PUT /api/days/:date/evening {satisfaction?, mood?, highlight?, notes?, gratitude?}`: a missing `If-Match` → 428. A stale one → 412 `stale` + `current_etag`. `*` on an existing file → 412. A future date → 409. A bad date → 400. Text is capped at 10k chars. Mood tags are trimmed, lowercased, deduplicated, 1–24 chars, max 24 tags (write-side only). The rating alone is a valid save, and `null` clears it. *(architect-AC15, psychologist-AC14)*
17. **No-op saves don't touch disk:** identical values on a hand-edited file with YAML comments (and CRLF) leave the bytes identical, with no `git.touch` and the same ETag. A real change edits only that field or section, and unknown keys/sections survive. *(architect-AC16, psychologist-AC19, BACKLOG MUST BUG-2)*
18. The read/write split: a hand-edited day with a 120-char title, a 4th quest or `rerolls_used: 3` reads as 200. Ranges for energy 1–5 and satisfaction 1–10 still quarantine. *(architect-AC17, BACKLOG SHOULD)*
19. The rating never touches coins. *(psychologist-AC20)*

### Git & integrity
20. Every write route calls `git.touch({kind, ref, detail?}, [file])` only when something changed, and no user text appears in messages. E2E test: PUT evening → disk → flush → `git log -1` sanitized, plus `(+hand edits)` for a concurrent hand edit, 412 stale and 428 missing. *(architect-AC18, BACKLOG SHOULD×2)*
21. Git spawns time out (30 s → `last_error`). The shutdown flush is bounded to 10 s. *(architect-AC19)*
22. `logicalDate` is DST-correct (Berlin/New York spring + fall cases). *(architect-AC20, M1 BUG-1)*
23. `loadConfig` refuses a `DATA_DIR` inside the app repo, including via `..` or a symlink. *(architect-AC21)*
24. M1 tester probes are ported as regression tests (CRLF, BOM, empty, no frontmatter, missing `---`, traversal, Host spoof). *(BACKLOG SHOULD)*

### Client (Today, Evening, shell)
25. The theme is used as-is: `tokens.css`, the font `<link>`s, the no-flash theme script, and `ScrollCard`, `MoonGate`, `LanternScale`, `QuestCard`, `SealStamp`, `CoinBadge`, `HerbRating`, `LatticeFrame`, `HerbLoader`, `Sticker` and `Icon`. No theme file is edited, and app components live in `web/src/lib/components/`. *(designer-impl-1, architect risk 1)*
26. The shell has a bottom tab bar from `vocab.NAV` (with `aria-current`), routes `/`, `/evening[/:date]`, `/market` (alias `/shop`), `/archive` and `/profile`, and moves focus to the `h1` on route change. Placeholder copy per the copy table. The tz, logical date and rollover are shown in the Today footer and on Profile. *(designer §0, psychologist-AC21, architect-AC24)*
27. **Today states:** check-in (LanternScale, primary "Write today's prescriptions", disabled until chosen), generating (HerbLoader + ghost cards), no-quests ("Try again"), ready (3 `QuestCard` in an `<ol>`, `allowPartial`, `letGoStatus="let_go"`), all settled ("Today's prescriptions are filled." + link to Evening). The boss goes above the dailies on Mon/Tue and below from Wednesday. Energy 1 → "Paused today, no penalty." on the boss. *(designer §1, psychologist-AC11/12)*
28. Outcomes are optimistic: the seal stamps on tap, then PATCH, and on failure it reverts with a calm toast. Undo goes back to open. 👍/👎 ("Suits me"/"Not for me") toggles independently of status. After "Let go", optional reason chips appear below the card, with one tap to skip and no confirm dialog. *(psychologist-AC6–10, designer impl-6)*
29. **Evening:** the order is rating → mood → highlight → notes → gratitude. There's no preselected leaf, and the anchor shows. The 12 balanced mood chips are neutral, hand-written tags show as selected, and custom tags can be added. Gratitude is expanded on Wed/Sun (or when it has text), otherwise "+ Add gratitude". The seal button "Seal today's ledger" is enabled once rated or edited. Saved → 済 seal + toast, and a rating ≤4 shows the low_rating sticker. No other day's rating is shown. *(psychologist-AC13–17, designer §2)*
30. On a stale save (412) the user's text stays in the form, the newer on-disk version is shown read-only next to it, and the next save uses the new ETag. *(psychologist-AC18, architect-AC23)*
31. A quarantined day on Today/Evening shows "Your words are safe. Line N needs a small fix in your editor." plus the raw text read-only. Never a blank screen. *(psychologist-AC23, BACKLOG MUST)*
32. Refetch on `visibilitychange` → visible and after `409 not_today`. Jobs are polled every 2 s from a store that survives navigation. *(architect-AC23, designer impl-5)*
33. There's no `{@html}` in `web/src` and no client date math for "today" (no `toISOString` in `web/src`). *(architect-AC22, risk 8)*
34. All app copy lives in `web/src/lib/copy.ts` (the psychologist copy table verbatim). There are no streaks, no balance, no red counts and no countdowns. *(psychologist-AC24/25, B4)*
35. `MOOD_SUGGESTIONS` and `RATING_ANCHORS` are exported from `server/src/domain.ts`, and a test asserts they equal the theme's `vocab.ts`. *(psychologist B6)*
36. Seed data: `cost: low` is added to the money-costing pool quests (additive). *(psychologist B3)*

## Backlog items taken in
- MUST: no-op saves don't touch disk (arch + psych BUG-2) → AC17
- MUST: calm quarantine UI → AC7, AC31
- MUST (promoted): wire `git.touch()` into every write route → AC20
- SHOULD: E2E write-path git test (AC20), DST `logicalDate` (AC22), git timeout (AC21), DATA_DIR inside the repo (AC23), read/write caps (AC18), tz visibility (AC26), port the tester probes (AC24), copy table (AC34), mood/anchors (AC29, AC35), strict request bodies (AC13)
- Psych B2 (selector) / builder SHOULD "fallback honours cooldown_days + boss type rotation" → AC8, AC10

## Not in M2 (explicit)
Reroll UI/API (M3), AI generation (M3), reflection (M4), balance/streaks/shop (M5), `backfilled` flag, the "welcome back" gap
detection (psych B7 COULD), a `localStorage` draft for evening text (privacy, architect risk 11), and CRLF preservation on a *real*
change (COULD).

## Fix round 1 (2026-10-26)
The test report `docs/test-reports/2026-10-26-M2.md` came back **PARTIAL**. This round fixes every listed bug, and the ACs above
are unchanged. AC17 ("a real change edits only that field or section") is now fully met. Each bug has a regression test in
`server/test/fix1-m2.test.ts`.
- **BUG-1 (High):** Evening sends only changed fields. A 412 rebases the form onto the on-disk version, and the server commits the
  hand-edited version (`qj: day <date> hand_edit`) before answering 412. → AC30, AC20
- **BUG-2 (Medium):** frontmatter is edited in place via the `yaml` Document API plus a line splice, so comments, flow style,
  read-side aliases (`failed`) and untouched lines stay byte-identical. Section-only changes keep the frontmatter bytes. → AC17
- **BUG-3 (Medium):** `## ` and code-fence lines typed into owned sections are backslash-escaped on write and unescaped on
  read (a line bijection). → AC16/AC17
- **BUG-4/5 (Low):** the let-go note no longer repeats "Let go." (copy-only theme edit, PROVISIONAL exception to AC25), and the Today
  footer link is 44 px tall.

## Fix round 2 (2026-10-26, final)
`docs/test-reports/2026-10-26-M2-retest1.md` came back **PARTIAL** with one Medium regression and two Low findings. The ACs above are
unchanged, and each finding has a regression test in `server/test/fix2-m2.test.ts`.
- **R-BUG-1 (Medium):** an empty flow sequence (`quests: []` from the template) that receives maps or lists is now written block-style
  (`quests:\n  - id: …`), so app-created day files stay readable by hand. Non-empty hand-written flow collections and scalar lists
  (`mood: [calm]`) keep their style. → AC17, CLAUDE.md "readable by hand"
- **R-BUG-2 (Low):** a 412 adds `day <date> hand_edit` (and waits for the snapshot flush) only when the bytes on disk aren't the ones the app
  last wrote. The git queue also drops any reason whose files aren't in the staged set. → AC20
- **R-BUG-3 (Low):** `rebaseForm` returns `conflicts` (field edited in the app and changed on disk, and the two differ) and `updated`
  (untouched fields adopted from disk). The stale panel shows the on-disk text only for conflicts, plus "Updated from the page on disk:
  Highlight." → AC30
