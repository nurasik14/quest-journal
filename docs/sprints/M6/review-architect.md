# M6 sprint review / retro: architect

> 2026-10-26 · `quest-architect` · async (the user is asleep, so nothing here is confirmed by Nurasyl). Every judgment call is marked **PROVISIONAL**.
> Inputs: `sprints/M6/{plan-*,sprint-goal}.md`, `PROGRESS.md` §M6 + fix round 1, `test-reports/2026-10-26-M6{,-retest1}.md` (retest = **PASS**, 655 tests),
> `BACKLOG.md`, and the code: `server/src/{config,app,static,shop,stats,seed-demo}.ts`, `web/src/sw/{route,worker}.js`, `web/src/lib/api.ts`,
> `deploy/quest-journal.service`, `README.md`, `web/public/IMAGE_SOURCES.md`. There's no git repo here, so I reviewed the files as they are now, not a diff.

## 1. Verdict
**Accepted.** All 24 architect ACs are met. The three silent failures my plan was written against are each closed and tested:
1. `claude` missing under a service → resolved at startup, logged, and shown in `/api/health`.
2. An insecure phone origin → `newRequestId()` fallback, and the SW registers only in a secure context. This was proven live over LAN HTTP.
3. A stale cache → `no-cache` on the shell, SW and manifest, and `/api/*` is never intercepted. The tester saw 0 `/api` entries in the caches.

The milestone is accepted for **localhost + LAN**. It is **not yet proven as a deployment**: no unit was installed, Tailscale wasn't used, no phone was used, and no real `claude` ran under systemd.
That's by instruction, not a defect. It does mean the real first install is still an untested step, and I file it in §3 so a PASS isn't read as "deployed".

## 2. Architect ACs, one by one

| AC | Result | Evidence / note |
|---|---|---|
| AC1 `/api/stats` contract | PASS | Tester: 8 kinds of bad input → 400, a 366-day span → 200, `to` is clamped, `no-store`. The response is a superset of my shape (`state`, `rated`, `days_logged`, `quests_done`), which is fine |
| AC2 One streak truth | PASS | `shop.stats()` passes in the ledger's own `computeEconomy` result. Stats equals economy after the browser flow and at 3 rollover instants. Better than I asked for: there's structurally one walk, not two walks compared |
| AC3 Honest categories | PASS, with the floor changed | The floor is `n_rated ≥ 5` (psychologist), not my 3. I agree: stricter is the conservative side. Boss excluded, legacy categories normalized, fixtures pass |
| AC4 This day last month | PASS | Clamped to the month end. No notes or gratitude. The psychologist's `hasCareLanguage` → null exclusion was added, which I endorse |
| AC5 Broken / private | PASS | A hand-broken day → 200 + `warnings[]` + a hatch plot. Never 422 |
| AC6 Perf | PASS | p95 56 ms over 400 days (budget 150). No cache was added, which is correct |
| AC7 kb contract | PASS | API 412/428/`too_large`, the file stays byte-identical on a 412, and the UI keeps the text with Copy / Load / Save anyway |
| AC8 Plain text only | PASS | The `{@html}` grep test passes. `- likes <b>tea</b>` rendered as text (0 `<b>` elements) |
| AC9 Hand-edited insights | PASS | Suite fixture (no ids + a duplicate) |
| AC10 Cache headers | PASS, see §3.4 | Headers are correct per file. But the SW serves `/manifest.webmanifest` and `/icons/*` **cache-first** from the runtime cache, so in an installed PWA the `no-cache` header on the manifest never takes effect until the SW version changes |
| AC11 SW never caches the API | PASS | `routeFor` never routes `/api` (or `/sw.js`, or any non-GET) to a cache. The cache name carries the version, and `activate` prunes old caches. Offline → shell + banner, and `fetch('/api/economy')` fails (it's never served from a cache) |
| AC12 Registration | PASS | `PROD && isSecureContext && 'serviceWorker' in navigator`. LAN HTTP: no SW, 0 errors |
| AC13 Icons | PASS | Original SVG → PNG, listed as original artwork with the Noto OFL glyph credited. Nothing derived from stickers |
| AC14 `newRequestId` | PASS | Proven live on an insecure origin (`randomUUID` was undefined, and a v4 fallback id was accepted). This was the M5 MUST |
| AC15 Bind policy | PASS, stricter | Wildcards in `ALLOWED_HOSTS` → `ConfigError` with exit 1 (I had only asked for "not accepted"). Fail-loud is right. The 0.0.0.0 warning is logged |
| AC16 `tailscale serve`, never `funnel` | PASS (docs) | The README has the bold warning. See §3.5 for the plain-HTTP alternative's wording. ARCHITECTURE.md is unchanged, which is correct until Nurasyl confirms |
| AC17 `claude` resolution | PASS | A stripped `PATH` + fake `HOME` resolves. Missing → `bin:null`, `reason:"claude_missing"`, `available:false`, and a clear startup line |
| AC18 systemd unit | PASS | `verify` exits 0. No `User=`, no `PrivateTmp`, `TimeoutStopSec=30`. `network-online.target` was dropped correctly (fix NIT-7). Not installed. See §3.3 for *what* it runs |
| AC19 AI cwd 0700 | PASS | Suite test |
| AC20 `seed:demo` | PASS, stricter | It refuses any non-empty dir, not just a non-empty `days/`. Deterministic (`diff -r` identical). It never reads `DATA_DIR`, and `~/quest-data` → exit 2 |
| AC21 README | PASS | Prerequisites, no API key, privacy, quarantine fix, YAML-comments limit, "never pushes" |
| AC22 Economy invariant | PASS | The route table is checked against `app.routes`. `ECONOMY_EXEMPT_ROUTES` has only the two job starters. This is the structural fix I wanted instead of route-by-route patches |
| AC23 Purchase race | PASS, with a documented residual | Earnings are gathered inside the `purchases.yaml` lock. A tiny window is left (see §3.6), and it's acceptable |
| AC24 Non-loopback smoke | PASS | The tester ran a full check-in → Done → Buy over `http://10.2.0.2` (insecure), the SW registered on localhost, and there's no `/api` in the caches. Backlog MUST #246 can be ticked |

## 3. What's good, and what must change

### Good
- **The structural fixes held up:** one `computeEconomy` result feeding both stats and the badge, and the economy invariant test enumerating real routes. These stop whole bug classes rather than single bugs.
- **Safety guards fail loudly where it matters:** the wildcard host → exit 1, `seed:demo` refuses anything non-empty, and the unlisted Host is now also 421 on the static shell (fix NIT-6).
- **The SW is minimal and auditable:** a pure `routeFor`, no Workbox catch-all, and no write queue. Risk #1 from my plan (caching `/api` "for offline") did not happen.

### 3.1 SHOULD: no request timeouts on the phone path
`web/src/lib/api.ts` calls `fetch` with no `AbortSignal`, and the SW's navigation is network-first with no timeout.
Over Tailscale, if the PC is asleep or off, a TCP connect to an unreachable peer can hang for tens of seconds. That gives a spinner instead of the offline state the app already knows how to show.
- ✦ **Concept:** "offline" and "unreachable" aren't the same thing. The browser reports offline only when the *phone* has no network. A phone on Wi-Fi whose PC is asleep looks online, and every request just waits.
- **Proposal:**
  - `GET`s abort after about 10 s → `NetworkError` → the existing offline banner.
  - SW navigation races `fetch` against about 3 s, then falls back to the cached shell.
  - Mutations get a longer timeout. If one times out, the outcome is *unknown*, so the copy has to say "may not have saved, try again". That's safe because every write retry is idempotent: purchases replay by `request_id`, and the quest PATCH and the evening PUT set state rather than increment it.
  - All values PROVISIONAL.

### 3.2 SHOULD: an unattended service with no off-machine copy of the journal
The data repo commits locally, and `GIT_PUSH` exists in config but push isn't implemented. Now that the app is meant to run for months as a service, one disk failure loses the whole journal and ledger.
- This needs Nurasyl's choice of remote (brainstorm Q6.2): a private GitHub repo, a second disk, or a NAS.
- The architecture side:
  - opt-in push to an explicitly configured private remote, never `--force`, with a bounded timeout (like the existing git kill);
  - `last_push_ok` / `last_push_error` in `/api/health`;
  - the git log contains no personal text, since commit messages are already privacy-safe (B7).

### 3.3 SHOULD: the service runs the live development checkout
`ExecStart=%h/.bun/bin/bun server/src/index.ts` with `WorkingDirectory=%h/Projects/quest-journal`. That's the same tree the builder agent edits mid-sprint.
- Any restart (`Restart=on-failure`, a reboot, linger) promotes whatever half-finished sprint code is on disk to "production" against the **real** `~/quest-data`.
- `web/dist` can also lag the server source.
- **Proposal (PROVISIONAL):**
  - a `bun run deploy` that builds, then copies the bundled server (`server/dist/index.js`, which already builds) plus `web/dist` into a release dir (e.g. `~/.local/share/quest-journal/app`);
  - the unit runs that copy;
  - `/api/health` and the startup line report the version + web build hash, so "which code is serving my phone" is answerable.
- This needs the user's agreement on the dir. Until then, the README should at least say: "don't enable the unit while agent sprints are running in this checkout."

### 3.4 COULD: the manifest is `no-cache` on the wire but cache-first in the SW
`routeFor` sends `/manifest.webmanifest` and `/icons/*` to the runtime cache (cache-first), and `VERSION` hashes only bundle-emitted files, not `public/` (the builder already noted this for decor).
- Result: editing the manifest or icons never reaches an installed PWA until a code change bumps the version.
- Fix: route the manifest as `network`, **or** include `public/` file hashes in `VERSION`.
- This is distinct from the builder's decor COULD: it's about the install metadata, which AC10 meant to keep fresh.

### 3.5 COULD: the README's plain-HTTP alternative says `HOST=0.0.0.0`
README l.83 offers `http://<tailscale-ip>:4317` with `HOST=0.0.0.0`. That exposes the journal to every network the PC joins (café Wi-Fi), when only the tailnet was intended.
- Better: `HOST=<the 100.x tailscale IP>`. It binds only the tailnet interface and is auto-added to `ALLOWED_HOSTS`. If tailscaled isn't up yet at boot, the bind fails, and `Restart=on-failure` retries.
- `0.0.0.0` stays the LAN-testing option.

### 3.6 Noted, no item: the residual purchase window
`insideLock` runs *before* `gatherEarnings()`, so the test proves an undo that lands before the gather is seen. An undo PATCH that commits between the in-lock gather and the `purchases.yaml` write can still leave the balance negative by at most one tariff.
- That window is now the duration of one file write, for a single user. The UI already renders a negative balance honestly.
- I accept it (PROVISIONAL). Closing it fully would need a global ledger lock across day files, which costs more than this edge case.

### 3.7 Noted, no item: Bun's implicit dotenv
The unit loads `.env` via `EnvironmentFile`, and Bun *also* auto-loads `.env`, `.env.production` and `.env.local` from the working directory.
- Process env wins, so there's no conflict for keys in `.env`. But a stray `.env.local` (e.g. a scratch `DATA_DIR` left by a test session) would apply silently to the service.
- The startup log already prints the data dir, which is the right defense. Point at it in the README's service section.
- This is folded into the 3.3 item, since a release dir has no stray dotfiles.

## 4. Answers to other agents' planning questions
- **Designer (plan §4): is "logged" the same as the streak's counting day?** **Yes, and it's implemented that way.** `counted` per plot is `dayCounts()`, which is the same predicate `streakWalk` uses, and `days_logged` comes from the same `computeEconomy` result.
  One consequence the designer should know about: a page with only generated, untouched quests is drawn as **gap / "not written"**, because opening the app isn't writing (builder PROVISIONAL, which I endorse).
- **Psychologist (plan §4): `{n, avg, avg_energy}` per category and `rated` per day?** **Yes, delivered:** `n`, `n_rated`, `avg_satisfaction`, `avg_energy` (null below 5), plus per-day `rated` and a single `state` enum.
  The UI never has to infer "unrated vs bad day": `satisfaction` is `null` whenever `rated` is false. The colour scale itself is the designer's call.
- **My own question (plan §4, three "no rating" looks)** was answered by the designer/psychologist ACs: dashed = not written, `·` = logged without a rating, hatch = can't be read. Private days look normal to their owner. I agree.

## 5. Process note (for the next sprint)
1. **Separate "tested" from "deployed".** M6 passed on localhost and LAN. The tasks only Nurasyl can do (install the unit, `tailscale serve`, a phone install, real `claude` under systemd, the SW update toast across two builds) have no owner and no checklist.
   Next sprint should open with a short **first-install runbook** that the manager hands to Nurasyl when he wakes, and the tester signs it off from his results. It's filed below as a SHOULD.
2. **Sprint size.** My plan alone had 24 ACs, and the merged goal had 32. It passed, but only one fix round's worth of slack was left. Next time I'll cap the architect ACs at about 12 and push the rest to COULD.
3. **Mark ACs that can only be verified on the real deployment** (e.g. `deploy-verify`) in the plan, so the tester reports them as "not testable here" rather than leaving them implicit.

## PROVISIONAL (this review)
1. Accepting the psychologist's `n_rated ≥ 5` over my 3. 2. Accepting the residual purchase window (§3.6). 3. Timeout values in §3.1.
4. The release-dir deploy in §3.3. 5. The `HOST=<tailscale IP>` wording in §3.5.
6. Nothing here changes ARCHITECTURE.md. The phone-access line (`http://<tailscale-ip>:PORT` → `tailscale serve`) is still waiting on Nurasyl (existing backlog SHOULD).
