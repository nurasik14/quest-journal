# M6 sprint plan: architect

> 2026-10-26 · `quest-architect` · async (the user is asleep). Every judgment call marked **PROVISIONAL** needs Nurasyl's confirmation.
> Scope (builder-common): Archive (garden heatmap, category × satisfaction, streak, "this day last month"), Profile view/edit of `profile.md` + `insights.md`,
> PWA manifest + service worker + icons, HOST/PORT for Tailscale, README, systemd `--user` unit in `deploy/` (not installed), `bun run seed:demo`.
> Inputs: ARCHITECTURE.md, brainstorm §2.2/§2.3/§2.9–2.12, M5 reviews, BACKLOG, `server/src/{config,static,index,app,kb,economy,ai}.ts`, `web/src/routes/{Archive,Profile}.svelte`, `web/vite.config.ts`.
> Current state: `Archive.svelte` and the Profile editor are placeholders. There's no `/api/stats`, manifest, SW or `deploy/`. `GET/PUT /api/kb/:name` already has ETag/If-Match/412/428 and `KB_MAX_CHARS`.
> `static.ts` gives every non-`/assets/` file `max-age=3600`. `CLAUDE_BIN` defaults to the bare `claude`. `tailscale` is **not installed** on this machine, and `claude` is at `~/.local/bin/claude`.

## Why M6 is a deployment sprint
Up to M5, everything ran on `localhost`. Browsers treat that as a secure context, and it has a login shell's `PATH` and a human watching the terminal. M6 is the first sprint
where the app runs **as a service, opened from a phone, with a cache in between**. Each of those three can fail without any visible error:
1. **Service:** `claude` isn't on the unit's `PATH`, so every day silently falls back to the pool.
2. **Phone:** the origin isn't secure, so the service worker and `crypto.randomUUID` are missing and Buy does nothing.
3. **Cache:** a stale `sw.js` pins an old build, or a cached `/api` response shows an old balance.

The ACs below each close one of these. Stats are read-only and reuse the M5 derivations. **Nothing new may be computed twice.**

## 1. Acceptance criteria (explicit `code → status` pairs)

**Stats (read-only, derived)**
- **architect-AC1 `GET /api/stats?from&to`.** Both params are optional ISO dates. The default window is the 365 logical days ending today. Errors: an invalid date, `from > to`, or a span of more than 366 days → 400 `bad_request`. `to` beyond today is clamped to today.
  Response: `{range:{from,to}, heatmap:[{date, satisfaction|null, counted:bool}], by_category:[{category, done, partial, failed, n_rated, avg_satisfaction|null}], streak, longest_streak, this_day_last_month, warnings[]}`.
  It's a pure `computeStats(days, …)` with a table test and no fs inside it.
- **architect-AC2 One streak truth.** `streak`/`longest_streak` come from the **same** `streakWalk` result as `/api/economy`, not from a second implementation. Test: across the 26-day M5 tester timeline, `stats.streak === economy.streak` and `stats.longest_streak === economy.longest_streak`. `counted` in the heatmap is the walk's per-day "counts" flag.
- **architect-AC3 Category stats are honest.**
  - `avg_satisfaction` is the mean `satisfaction` over days that have ≥1 `done|partial` quest of that category **and** a non-null rating.
  - `n_rated` is reported, and `avg_satisfaction` is `null` when `n_rated < 3` (PROVISIONAL threshold; the psychologist owns how it's framed).
  - Unknown or legacy categories are normalized through the existing `domain.ts` mapping. The boss is excluded (PROVISIONAL).
  - Fixture with a hand-computed expected table.
- **architect-AC4 "This day last month"** = the same day-of-month one calendar month back. Day 31 → last day of the previous month (Mar 31 → Feb 28/29), PROVISIONAL.
  It returns `{date, satisfaction, highlight≤200, quests:[{title,status}]}` or `null` when there's no file. **Notes and gratitude are not included.** The rollover is logical-date (a 02:00 visit on the 1st looks at the previous month's last day's anchor). Fixtures: 03-31, 01-01 at 03:59, and a leap year.
- **architect-AC5 Broken and private files.** A quarantined day is skipped. It gets `{file, code}` in `warnings[]`, its heatmap cell is `satisfaction:null`, and it's flagged as `broken:true` (render it neutral, never as a bad day). Stats never return 422.
  Private days (`private:true`) **are** included: stats are local-only, and `private` governs what goes to Claude, not what the owner sees (PROVISIONAL).
- **architect-AC6 Performance.** p95 of `/api/stats` ≤ 150 ms over 400 days, using the existing perf fixture. Measure before adding any cache.

**Profile / Notes editor**
- **architect-AC7 Editing goes through the existing contract.** The Profile page edits `profile.md` and `insights.md` only via `GET/PUT /api/kb/:name`, and every PUT sends `If-Match`.
  - 412 `stale` → the user's unsaved text stays in the textarea, with a "the file changed on disk" choice: reload, or overwrite with the fresh etag.
  - 428 never happens from the UI.
  - Over `KB_MAX_CHARS` → 400 `too_large`, shown inline, and the text is kept.
  - Unknown name → 404.
  - Test: hand-edit on disk → PUT with the old etag → 412, and the file is byte-identical.
- **architect-AC8 Plain text only.** `insights.md`/`profile.md` content (partly AI-authored) is rendered as text or in a `<textarea>`. No `{@html}`, no Markdown→HTML without escaping, no autolinks. A grep test asserts there's no `{@html}` in `web/src`.
- **architect-AC9 A hand edit of insights can't break reflect.** After a PUT that removes or mangles the `i-NNNN` ids, the next `/api/today` and reflect still work, and new ids never reuse an id that existed in git history (`maxInsightId` already scans raw text). Fixture: PUT an insights file with no ids and one duplicate id → 200, then a decided `add` gets an id > every id ever seen.

**PWA**
- **architect-AC10 Cache headers (closes backlog SHOULD #89).** `sw.js`, `manifest.webmanifest` and `index.html` → `Cache-Control: no-cache`. Hashed `/assets/*` → immutable. Everything else keeps `max-age=3600`. Every `/api/*` keeps `no-store`. There's a header test per file.
- **architect-AC11 The service worker never caches the API.**
  - `/api/*` is network-only, so the SW never stores or serves an API response. A stale balance or stale day is worse than "offline".
  - The SW precaches the built shell (index.html + hashed assets from the Vite manifest).
  - Navigation falls back to the cached `index.html` when offline. The page then shows a read-only "offline" state, and writes are **not queued** (brainstorm Q7.2, PROVISIONAL: read-only offline).
  - The cache name includes the build hash, and `activate` deletes old caches.
  - Test: a unit test of the fetch-routing function (`/api/today` → network, `/assets/x.js` → cache-first, navigation → network-then-cached-shell).
- **architect-AC12 Registration is production-only and degrades.** Register only when `'serviceWorker' in navigator && isSecureContext` and only in the built app, never in Vite dev, so dev HMR can't be pinned. Over plain HTTP the app still works fully without a SW.
- **architect-AC13 Icons are committed-safe.** Manifest icons (192, 512 and a maskable 512, plus `apple-touch-icon`) are **original artwork**, not anime/sticker images, because they are committed. `IMAGE_SOURCES.md` lists them as original. `start_url:"/"`, `scope:"/"`, `display:"standalone"`.
- **architect-AC14 MUST carry-over: request ids without a secure context.** `lib/newRequestId()` uses `crypto.randomUUID` when present, otherwise a v4 UUID from `getRandomValues` (version and variant bits set). The call moves inside the `try` in `Market.svelte`.
  Test: with `randomUUID` deleted from the global, the helper returns ids that match `shop.ts`'s regex, ×1000 with no duplicates. Also grep: `randomUUID(` doesn't appear in `web/src` outside the helper.

**Bind, access, service**
- **architect-AC15 Bind policy.**
  - The default stays `HOST=127.0.0.1`, `PORT=4317`.
  - `HOST=0.0.0.0`/`::` is allowed, but logs a one-line warning at startup ("reachable from your whole network").
  - `ALLOWED_HOSTS` takes exact names only, with no wildcards (so `*.ts.net` isn't accepted; the README says to add `<machine>.<tailnet>.ts.net`).
  - Test: `Host: pc.tail1234.ts.net` → 421 until it's listed, then 200. An `Origin: https://pc.tail1234.ts.net` mutation with that host listed → 2xx.
- **architect-AC16 Phone path = `tailscale serve`, never `funnel` (PROVISIONAL).** The README documents `tailscale serve --bg 4317` → `https://<machine>.<tailnet>.ts.net`, with the app staying on loopback.
  It also has a bold warning: **`tailscale funnel` publishes the journal to the internet. Never use it.** ARCHITECTURE.md's `http://<tailscale-ip>:PORT` line is flagged as superseded, pending Nurasyl.
  No app-level auth: the tailnet is the boundary (PROVISIONAL, brainstorm Q6.4).
- **architect-AC17 `claude` resolution (closes backlog SHOULD #137).** At startup a bare `CLAUDE_BIN` is resolved against `PATH` plus `~/.local/bin` to an absolute path and logged. If it's missing, a warning is logged **and** `/api/health` reports `claude:{bin:null, reason:"claude_missing"}`, without crashing.
  Test: an env with `PATH=/usr/bin` and a fake `HOME/.local/bin/claude` resolves; no binary at all → health shows missing.
- **architect-AC18 systemd user unit `deploy/quest-journal.service`** (written, **not installed or enabled**):
  - `ExecStart=` uses an absolute `bun` path placeholder documented in the README.
  - `WorkingDirectory=%h/Projects/quest-journal` and `Environment=NODE_ENV=production`.
  - `EnvironmentFile=-%h/Projects/quest-journal/.env`.
  - `PATH` includes `%h/.local/bin:%h/.bun/bin`.
  - `Restart=on-failure`, `KillSignal=SIGTERM`, `TimeoutStopSec=30` (≥ the 10 s git flush + 5 s AI kill grace).
  - It has no `User=` (it's a user unit, so `~/.claude` credentials are reachable) and no `PrivateTmp` (unreliable in user units).
  - Check: `systemd-analyze --user verify deploy/quest-journal.service` passes, or the output is quoted if it's unavailable.
  - The README covers `systemctl --user enable --now`, logs via `journalctl --user -u quest-journal`, and optionally `loginctl enable-linger` (the user runs it himself).
- **architect-AC19 AI cwd (backlog COULD, promoted with the unit).** The AI cwd is `$XDG_RUNTIME_DIR/quest-journal-ai` (mode 0700), or a `mkdtemp` under `os.tmpdir()` when it's unset. It's no longer the shared, predictable `/tmp/quest-journal-ai`. Test: the dir mode is 0700.

**Demo data and docs**
- **architect-AC20 `bun run seed:demo <dir> [--today YYYY-MM-DD] [--seed N]`.**
  - It refuses (exit 2, nothing written) when the dir is missing from argv, resolves under `~/quest-data` or inside the app repo (reuse `assertDataDirOutsideRepo` + `realDataDir`), or contains a `days/` with files.
  - It writes 30 synthetic days through the **real store writers**, so every file passes the day schema. It includes ≥2 gaps, 1 private day, days with no rating, and ≥4 categories.
  - It's deterministic: same `--seed` + `--today` → byte-identical files, so the tester can hand-check AC3.
  - It writes no week file with real-looking text, uses no git push, and contains no real personal data.
  - Test: run it twice into temp dirs and the bytes are equal. `/api/stats` over it has 0 warnings.
- **architect-AC21 README.md** covers:
  - prerequisites (bun, claude login, optional tailscale), and the fact that there's no `ANTHROPIC_API_KEY`: it's stripped from children;
  - `.env` keys;
  - dev/prod run, build-then-start;
  - phone setup (AC16), systemd (AC18) and `seed:demo`;
  - the data-repo privacy rules: it lives outside this repo, push is off and unimplemented, and backup is your job (a private remote only);
  - how to fix a quarantined file;
  - the known limitation that YAML comments are lost.
  It doesn't say "open `http://<tailscale-ip>:PORT`" as the install path.

**Cross-cutting carry-overs**
- **architect-AC22 Economy invariant (backlog SHOULD #248).** A route-table test runs **every** mutation that writes an input of `computeEconomy`: quest PATCH, evening PUT (including a backfill), check-in, reroll, generate, purchase, void, wishlist, and a kb PUT (no-op but listed). It asserts that the response carries `economy`, deep-equal to a following `GET /api/economy`. A new mutating route that's missing from the table fails the test, because the table is checked against the Hono route list.
- **architect-AC23 Purchase race (backlog SHOULD, NIT-5).** Earnings are re-gathered **inside** the `purchases.yaml` lock (reads only, no nested day locks). Test: a delay hook between gather and append, plus an undo PATCH → the purchase gets 409 `insufficient_funds`.
- **architect-AC24 Non-loopback smoke (backlog MUST, tester).** At least one browser run goes through a non-loopback origin: `HOST=<LAN IP>` + `ALLOWED_HOSTS`, since Tailscale isn't installed. No sudo, and the report says it's LAN. It covers check-in, one quest Done, one Buy (AC14 proven over insecure HTTP), and confirmation that the SW is **not** registered there with no error thrown.
  A second run on `localhost` (prod build) shows the SW registered, an offline reload rendering the shell, and `/api` never served from the SW cache.

## 2. Risks / what the builder will likely get wrong
1. **Caching `/api` in the SW** "for offline", for example with a Workbox-style catch-all. That pins old balances and duplicates private data in a second store. Network-only, full stop (AC11).
2. **`sw.js` served with `max-age=3600`** through the generic static branch, which leaves the phone stuck on the old build for an hour after every deploy (AC10).
3. **A second streak implementation** inside stats that disagrees with the badge on edge days (herbs, broken days). Reuse `streakWalk` (AC2).
4. **Averages over tiny samples** ("Body: 10.0") presented as insight. That needs the `n_rated` floor (AC3), and the psychologist owns the copy.
5. **`seed:demo` pointed at the real data** by a typo or a defaulted `DATA_DIR`. It must require an explicit argument and reuse the guards (AC20). It must never read `.env`'s `DATA_DIR`.
6. **The unit "works" in a terminal but not under systemd** (PATH, `HOME`, `XDG_RUNTIME_DIR`). Test the resolution with a stripped env (AC17), not by eye.
7. **Rendering `insights.md` as Markdown HTML** to "look nice" reopens the prompt-injection-to-XSS path that M4 closed (AC8).
8. **Committing icons made from stickers** or anime decor. Committed means published (AC13, CLAUDE.md).
9. **SW registration in Vite dev** caches dev modules and makes the next sprint's bugs irreproducible (AC12).
10. **Hand-editing the `ALLOWED_HOSTS` code to accept `*.ts.net` or `*`.** That would undo the DNS-rebinding guard. Use exact names (AC15).

## 3. Backlog items I'd take into M6
- **MUST:** #245 `newRequestId` (AC14) · #246 non-loopback smoke (AC24).
- **SHOULD:** #89 static cache policy (AC10) · #137 `claude` resolution + user unit (AC17/18) · #247 HTTPS via `tailscale serve` (AC16, docs only since tailscale isn't installed) · #248 economy invariant (AC22) · NIT-5 purchase race (AC23) · #88 dev-loop smoke (the tester runs it first, as in M5).
- **COULD promoted to SHOULD:** AI cwd 0700 (AC19), because the service now runs unattended.
- **COULD (only if time is left):** static `realpath` re-check · `econ.balance ?? 0` → explicit 422 · void window for `at > now` · bounded proposal scans.

## 4. Question for the other agents
**To quest-psychologist + quest-designer:** the heatmap must show three different "no rating" states:
1. a day not logged at all;
2. a day logged without a rating (it counts for the streak);
3. a quarantined file (neutral, "fix in editor").

Should these look visibly different in the garden grid, and should a private day look any different to its owner? I'd make (3) distinct and (2) a faint leaf, but the meaning of an "empty" day is your call. The API exposes `counted`, `broken` and `satisfaction:null` so you can choose.

## PROVISIONAL decisions in this plan
1. Read-only offline, with no write queue. 2. The `n_rated < 3` → null average. 3. The boss is excluded from category stats. 4. Private days are shown in local stats.
5. Last-month day 31 → last day of the previous month. 6. `tailscale serve` (never funnel), and no app auth on the tailnet. 7. `ALLOWED_HOSTS` exact names only.
8. The 0.0.0.0 bind is allowed with a warning (the LAN smoke needs it). 9. The unit reads the repo's `.env`. ARCHITECTURE.md is unchanged until Nurasyl confirms 6.
