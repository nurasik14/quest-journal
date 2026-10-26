# Sprint M6 goal (quest-builder)

> 2026-10-26 · async (the user is asleep). Not a fix round: the latest report (`test-reports/2026-10-26-M5-retest1.md`) is a **PASS**.
> Sources: `sprints/M6/plan-{architect,designer,psychologist}.md`, open MUSTs in `BACKLOG.md`.
> Where plans conflict, the most conservative option wins and is marked **PROVISIONAL**.

**Goal:** the past is shown back honestly (the garden), the notes about you are editable by hand, and the app can run as an
unattended service that a phone opens. No cache may ever serve a stale balance.

## Committed acceptance criteria

### Stats (server, pure)
1. **`GET /api/stats?from&to`** with optional ISO dates. The default is the 365 logical days ending today. Invalid date, `from > to` or a span > 366 days → 400 `bad_request`. `to` > today is clamped.
   The response holds `range`, `heatmap[]`, `by_category[]`, `streak`, `longest_streak`, `days_logged`, `quests_done`, `this_day_last_month`, `warnings[]`. It is computed by a pure `computeStats()` with no fs. *(architect-AC1)*
2. **One streak truth.** `streak`, `longest_streak`, `days_logged` and `quests_done` are taken from `computeEconomy` over the same inputs (the same `streakWalk`), and `counted` per heatmap day is `dayCounts()`.
   Test: stats equals `/api/economy` field by field on the seed:demo data and on a gap/broken fixture. *(architect-AC2, psychologist-AC4, designer-AC2, designer Q: one `isCountingDay` predicate)*
3. **Heatmap day shape:** `{date, satisfaction|null, rated, counted, broken, private, quests_done, quests_total}`. Unrated days are never 0.
   Days before the first entry are reported, but the UI shows no plot for them. *(psychologist-AC1/AC3, architect-AC5, designer-AC4)*
4. **Category stats are honest.**
   - `n` = days with ≥1 done/partial quest of that category. `n_rated` = those days with a rating.
   - `avg_satisfaction` and `avg_energy` are only present when `n_rated ≥ 5`, otherwise `null`. **PROVISIONAL:** this takes the psychologist's 5, which is stricter than the architect/designer 3.
   - `failed` is exposed as `let_go` and never rendered.
   - The order is fixed (`CATEGORIES`), the boss is excluded (PROVISIONAL) and legacy categories are normalized.
   - Fixtures: n = 4 → null, n = 5 → avg; rated 6/7/8 + 4 unrated → 7.0. *(architect-AC3, psychologist-AC1/AC5/AC6/AC7, designer-AC9)*
5. **"This day last month":** the same day-of-month one month back, clamped to the last day of that month (Mar 31 → Feb 28/29, Jan 31 → Dec 31). It is based on the logical date.
   - It returns `{date, satisfaction, highlight ≤200, quests:[{title,status}]}`, with no notes or gratitude.
   - It is `null` when the file is missing, broken or empty (no rating, no highlight, no counting quest) **or when `hasCareLanguage`**.
   - Fixtures: 03-31, 2028-03-31, 01-31, 01-01 at 03:59, and a care day. *(architect-AC4, psychologist-AC9/AC10, designer-AC10)*
6. **Broken and private files:** a quarantined day becomes a `warnings[]` entry plus `broken:true`, and is never a 422. Private days are included (local-only view). PROVISIONAL. *(architect-AC5, psychologist-AC8)*
7. **Performance:** `/api/stats` p95 ≤ 150 ms over 400 days (perf fixture), measured. *(architect-AC6)*

### Notes on you (Profile)
8. Profile edits `profile.md` and `insights.md` only through `GET/PUT /api/kb/:name` with `If-Match`.
   - 412 keeps the text and shows Copy + Reload + "Save anyway" (which overwrites with the fresh etag).
   - 400 `too_large` is shown inline with the text kept.
   - Server test: a hand edit on disk, then a PUT with the old etag → 412, and the file is byte-identical. *(architect-AC7, designer-AC14, psychologist-AC11)*
9. **Plain text only.** There is no `{@html}` anywhere in `web/src` (grep test). The profile preview uses a tiny text-block parser. *(architect-AC8, designer-AC14)*
10. An insights PUT with no ids and a duplicate id → 200. Then `/api/today` works, and a decided `add` gets an id greater than every id ever seen. *(architect-AC9)*
11. Page order is `h1` "Notes on you" → pending suggestions → tabs (Insights · Profile, `role=tablist`, arrow keys) → Settings → About.
    - Insight evidence chips link to `/archive?date=`.
    - The unparsed-lines banner wording is literally true (byte-identical round-trip test).
    - Saving changes no coins (the economy is unchanged after a kb PUT).
    - Profile triggers no AI call. *(designer-AC12/AC13/AC15, psychologist-AC11/AC12)*
12. **Settings:**
    - Theme (System/Paper/Night) and Motion (System/Reduce), persisted and applied before first paint (inline script).
    - Stickers (On/Off), persisted.
    - The clock/rollover line moves here from the Today footer.
    - About shows the version. *(designer-AC16, psychologist-AC13c)*

### Archive (the garden)
13. Layout:
    - the header with `h1` "The garden" and the balance badge;
    - the stats row "Days logged · Quests done · Longest streak", with "Current: N" only when ≥ 2;
    - range chips "4 weeks · 3 months" (`aria-pressed`, 4 weeks is the default);
    - the grid, then the legend, then by-category, then "A month ago today". *(designer-AC1/AC2/AC6/AC7, psychologist-AC4)*
14. Grid:
    - Weeks are rows (newest on top), Mon→Sun, with a month label column.
    - The CSS is `2rem repeat(7,minmax(0,1fr))`, so a 320 px viewport doesn't scroll horizontally.
    - The rating number is printed in each cell.
    - The states are distinct without colour: rated / unrated `·` / gap dashed "not written" / no plot before the first entry or in the future / broken hatch "can't be read".
    - Today stays unrated-dashed until rated.
    - Every plot is a `<button>` with an `aria-label`. *(designer-AC3/AC4/AC5, psychologist-AC1/AC2/AC3)*
15. The day detail opens in a new shared `BottomSheet.svelte` (dialog, focus trap, Esc, focus return). It shows:
    - the date, a read-only HerbRating, mood, quests, the highlight first, and the notes as text;
    - a "Write in the ledger" link only for days ≤ 2 days old;
    - the quarantine copy for broken days. *(designer-AC8)*
16. By category:
    - It uses the fixed order, a colour bar plus icon plus label, and printed numbers.
    - "Too few days to say yet (n of 5)" is shown below the threshold.
    - It carries the verbatim caption "Days, not causes. …".
    - There are no banned ranking words (test). *(designer-AC9, psychologist-AC5/AC6)*
17. States: loading, an empty state (< 3 logged days: sticker + seeds copy), an error banner with "Try again", and a partial "N pages couldn't be read". *(designer-AC11)*

### PWA
18. **Cache headers:** `sw.js`, `manifest.webmanifest` and `index.html` get `no-cache`, `/assets/*` gets immutable, and the rest gets `max-age=3600`. `/api/*` stays `no-store`. There is a header test per file. *(architect-AC10, backlog SHOULD #89)*
19. **Service worker:**
    - `/api/*` is network-only. A pure `routeFor()` is unit-tested.
    - It precaches the built shell (index.html + hashed assets).
    - Navigation falls back to the cached shell offline.
    - Decor/stickers are runtime cache-first and not precached.
    - The cache name carries the build hash, and `activate` deletes old caches.
    - Offline is read-only, with no write queue (PROVISIONAL). *(architect-AC11, designer-AC19/AC20, psychologist-AC15)*
20. Registration happens only when `import.meta.env.PROD && 'serviceWorker' in navigator && isSecureContext`. A silent no-op otherwise.
    A waiting update shows one toast "A fresh page is ready" + "Reload", with no auto-reload. *(architect-AC12, designer-AC19)*
21. **Original icons** from our own SVG (済 seal on paper with a jade rim): 192, 512, 512-maskable and 180 apple-touch, committed under `web/public/icons/` and listed as original in `IMAGE_SOURCES.md`.
    The manifest has `name` "Quest Journal", `short_name` "Quests", `standalone`, `#f4ecd8`, and `start_url`/`scope` `/`. There are two media `theme-color` metas.
    No push, Notification, `setAppBadge` or periodic sync (grep test). *(architect-AC13, designer-AC17/AC18, psychologist-AC14)*
22. **`newRequestId()`:** uses `crypto.randomUUID` when it exists, otherwise a v4 UUID from `getRandomValues`. The call is inside the `try`.
    Tests: ×1000 matches `shop.ts`'s regex with `randomUUID` deleted, and `randomUUID(` appears nowhere else in `web/src`. *(architect-AC14, **backlog MUST #245**)*

### Bind, service, deploy
23. **Bind policy:** the default stays `127.0.0.1:4317`. `0.0.0.0`/`::` logs a warning. `ALLOWED_HOSTS` entries with a wildcard are a `ConfigError` (PROVISIONAL: fail loudly).
    Test: a `ts.net` host gets 421 until it is listed, then 200, and its Origin is accepted. *(architect-AC15)*
24. **`claude` resolution:** a bare `CLAUDE_BIN` is resolved against `PATH` + `~/.local/bin` at startup and logged.
    If it's missing: a warning, and `/api/health` returns `claude.bin:null, reason:"claude_missing"`.
    Test with a stripped `PATH` and a fake `HOME`. *(architect-AC17, backlog SHOULD #137)*
25. **`deploy/quest-journal.service`** is written but not installed, and follows architect-AC18. `systemd-analyze --user verify` output is quoted. *(architect-AC18)*
26. **AI cwd:** `$XDG_RUNTIME_DIR/quest-journal-ai`, or a `mkdtemp` under `tmpdir()`, with mode 0700 (test). *(architect-AC19)*
27. **`bun run seed:demo <dir> [--today] [--seed]`:**
    - It refuses a missing arg, `~/quest-data`, anything inside the repo, or an existing non-empty `days/`, with exit 2 and nothing written.
    - It writes 30 days through the real store writers and is deterministic (byte-identical across runs).
    - It exercises every garden state: 5 levels, gaps of 1 and 3 days, 3 unrated days, 1 private day, 1 partial-only day, 1 rating-only day, let-go with reasons, 1 backfilled day, a 300-char highlight, a 60-char title, a current streak ≥ 4, a month-ago day with a highlight, and categories with n < 5 and n ≥ 5.
    - It contains no care language. **`--broken`** optionally adds one broken file (PROVISIONAL: it's off by default, so architect's "0 warnings" holds). *(architect-AC20, designer-AC21, psychologist-AC16)*
28. **README.md:**
    - prerequisites, no API key, `.env` keys, dev/prod run;
    - phone via `tailscale serve`, with a bold "never `funnel`" warning;
    - systemd commands, `seed:demo`;
    - privacy (no push, backup is yours), the quarantine fix, the YAML comments limit;
    - a non-coercive tone, and no notifications by design. *(architect-AC16/AC21, psychologist-AC17)*

### Carry-overs
29. **Economy invariant:**
    - Every mutation that writes a `computeEconomy` input returns `economy` deep-equal to a following `GET /api/economy`: quest PATCH, evening PUT incl. backfill, check-in, reroll, generate, purchase, void, wishlist set/clear, kb PUT.
    - The route table is checked against the Hono route list.
    - Evening feeds the ledger store. *(architect-AC22, backlog SHOULD #248, designer "Evening bonus moment" partially)*
30. **Purchase race:** earnings are re-gathered inside the `purchases.yaml` lock. Test: a delay hook + undo → 409. *(architect-AC23, NIT-5)*
31. **Copy:** `welcomeBack` becomes "Welcome back. Your page is here.", and `bossPaused` becomes "Paused today. It keeps.". The `penalt` allowlist entry is removed. *(psychologist-AC13, backlog SHOULD)*
32. **Toast width fix** in `App.svelte` (designer SHOULD).

## Backlog MUSTs taken in
- #245 `newRequestId()` → goal 22.
- #246 non-loopback browser smoke: the builder runs a LAN-IP curl smoke (HOST=0.0.0.0, temp port, `ALLOWED_HOSTS=<LAN IP>`). The **tester** owns the full browser smoke (architect-AC24).

## Not taken (left open in BACKLOG)
- The year range (designer COULD), the monthly calibration note, the energy-band split, and `gentle_restart`.
- `streakWalk` herb-burn change (psych SHOULD): it alters ledger semantics, and M5 just passed. Deferred to its own change with the psychologist's fixtures.
- Info-line persistence/hide, buy-sheet "Save toward this", and the sticker-under-seal nudge.
- Migrating the Market sheet onto `BottomSheet`: the new component is created and used by the Garden, while the M5-passed Market is left untouched to avoid regressions.
- The merged Evening bonus toast (Evening now feeds the store, so the badge is correct; the toast itself is not added).

## Fix round 1 (2026-10-26): `docs/test-reports/2026-10-26-M6.md`
Committed, in this order:
- F1. **MED-1 (goal 15):** the sheet focus trap only counts nodes that can really take focus (`:disabled`, which includes fieldset-disabled radios; `tabIndex < 0`; not rendered; `[inert]`). Tab and Shift+Tab cycle inside the dialog, including Shift+Tab from the focused title. The Market sheet uses the same helper. Test: a pure `focusTrap.ts` with the report's day-sheet shape.
- F2. **LOW-1:** the About `<summary>` gets a ≥ 44 px tap target.
- F3. **NIT-1:** the read-only `HerbRating` is `role="img"` with one label; its radios are `tabindex=-1` and its inner parts `aria-hidden`.
- F4. **NIT-2:** the startup "AI:" line says `claude NOT FOUND …` when the binary is missing, and `/api/health` adds `claude.available`.
- F5. **NIT-3:** the README demo drops `--today`.
- F6. **NIT-4:** plots are ≥ 44 px at 390 (label column 1.5rem, 2 px gaps).
- F7. **NIT-6:** with `SERVE_WEB`, the static shell also returns 421 (plain text) for an unlisted Host.
- F8. **NIT-7:** drop `After=/Wants=network-online.target` from the user unit.
- Not taken: **NIT-5** (dashed empty-garden plots) is a designer decision, filed in BACKLOG.
