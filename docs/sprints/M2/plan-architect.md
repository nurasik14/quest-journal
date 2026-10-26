# M2 sprint plan: architect

> Author: `quest-architect` · 2026-10-26 · async, so the user is asleep and nothing here is user-confirmed. Judgment calls are marked **PROVISIONAL**.
> Inputs: `docs/brainstorm/architecture.md` §2 (binding defaults), `docs/sprints/M1/*`, `docs/BACKLOG.md`, `docs/PROGRESS.md`,
> `server/src/*.ts`. Scope is from `builder-common.md`: the SPA, Today, Evening, write routes, the pool fallback, static serving and auto-commit.
> Note: `web/src/lib/theme/` currently holds **only** `tokens.css` and `fonts.css`. It has no components, and `docs/design/` is empty.

## 1. Acceptance criteria (architect-AC*)

**Workspace & build**
- **architect-AC1** `web/` joins the Bun workspace. `bun run build` builds the SPA to `web/dist` (and the server bundle) and exits with 0. `bun run typecheck` covers the server *and* web (`svelte-check` or `tsc` with Svelte types) and exits with 0. `bun test` stays green and doesn't pick up stray web files.
- **architect-AC2** The web bundle never imports server runtime code. Shared API types are imported with `import type` from one module (for example `server/src/api-types.ts`). Test: grep `web/dist` for `node:fs`, `gray-matter` and `Bun.spawn` and find 0 hits.
- **architect-AC3** The Vite dev server binds `localhost` only (no `--host`) and proxies `/api` to `127.0.0.1:4317`. The proxied requests pass the Host allowlist and Origin check (no 421 or 403 in dev). Test: an integration test or documented curl through the proxy.

**Static serving (production)**
- **architect-AC4** With `NODE_ENV=production`, Hono serves `web/dist`. Unknown non-`/api` paths fall back to `index.html` (200). Unknown `/api/*` paths still return a JSON 404 and **never** the SPA. Hashed `/assets/*` get `Cache-Control: public, max-age=31536000, immutable`, and `index.html` gets `no-cache`.
- **architect-AC5** Static traversal is impossible: `/%2e%2e/package.json`, `/..%2fserver/src/config.ts` and `--path-as-is` variants return 404 or `index.html`, and never return a file outside `web/dist`. Nothing under `DATA_DIR` is ever reachable through the static handler.

**Today API**
- **architect-AC6** `GET /api/today` returns, in one round trip, `{date, week_id, day, week, rerolls_left, needs_checkin, needs_generation, jobs, tz, rollover_hour}`. `date` is computed by the server with the injected clock. The client never sends "today".
- **architect-AC7** If today's day file or week file is quarantined, `GET /api/today` returns **200**. The broken part is `null` and comes with `day_error` / `week_error` = `{code, file, line?, raw}`. The other part still renders. Never a 500 or a blank screen. Test: a broken fixture for today's date, plus a separate broken fixture for this week.
- **architect-AC8** Lazy week creation (§2.3) is **create-if-absent** (`expectedEtag: "*"` semantics). 5 concurrent `GET /api/today` calls in a new ISO week give exactly 1 week file and 1 commit reason. An existing hand-made week file is never overwritten. **PROVISIONAL:** this is the only documented exception to "reads never write". Repeat GETs with the week file present write nothing (check the mtime).
- **architect-AC9** `POST /api/today/checkin {energy}` writes the energy, then generates from the pool. Slot difficulties come from the energy table (motivation.md §1.4), `coins` is the snapshot from `TARIFF`/`coinsFor()` (pool coin values are ignored), and `generation.source = "pool"`, `model = null`. The 3 categories are distinct, and titles used in the last 14 days are excluded (relaxed only if fewer than 3 are eligible). Energy 1 gets at least 1 `care`. Selection is deterministic: same date, energy and pool give the same 3 quests.
- **architect-AC10** The job contract is ready for M3. Check-in returns `202 {job, day}` using the §2.3 `Job` shape (`key = generate_day:<date>`). In M2 the job may already be `succeeded` when returned. `GET /api/jobs/:id` exists. The SPA handles both "already succeeded" and "queued → poll every 2 s", so M3 only swaps the runner.
- **architect-AC11** Generation is idempotent. Double-tapping check-in (2 concurrent POSTs) gives exactly 3 quests, not 6. The write step re-checks "still 0 quests?" under the day-file mutex. A later check-in with a different energy updates `energy` only and **never** regenerates (200 `{day}`). `POST /api/today/generate` returns 409 `already_generated` when quests exist.

**Quest mutations**
- **architect-AC12** `PATCH /api/quests/:id` accepts `{status?: open|done|partial|let_go, feedback?: up|down|null, reason?: REASON_CHIP}`. Old aliases like `failed` are **rejected on write** (400), because aliases are read-side only. `completed_at` is set on `done`/`partial` and cleared on `open`. Sending the same value again is a 200 no-op with **no disk write and no commit**.
- **architect-AC13** ID routing is strict. `<date>-<slot>[suffix]` resolves to that day file and `<week>-boss` to that week file. Anything else gives 400. A daily quest is editable only if its date equals the logical today, else `409 not_today`. The boss is editable only inside its ISO week. Hostile cases: an ID for yesterday right after 04:00 rollover, and a `..`-containing ID.
- **architect-AC14** Boss checkpoints can be toggled through PATCH (`checkpoints: [{index, done}]`, PROVISIONAL shape, see §4). An out-of-range index gives 400. A toggle never rewrites checkpoint text.

**Evening**
- **architect-AC15** `PUT /api/days/:date/evening {satisfaction, mood, highlight, notes, gratitude}`. A missing `If-Match` gives `428`, a stale one gives `412 {code:"stale", current_etag}`, and `If-Match: *` on an existing file gives 412. Dates later than the logical today give 409, and invalid dates 400. Each text field is capped at 10k chars, and mood tags are trimmed, lowercased, deduplicated and capped at 24 chars **on write only**.
- **architect-AC16** A no-op save doesn't touch disk (backlog MUST). Re-saving identical values on a hand-edited file **with YAML comments and CRLF** keeps its bytes identical, with no `git.touch` and the same ETag. Saving one changed field changes only that field's YAML line or section body. Unknown keys, extra `##` sections and pre-heading text survive verbatim.
- **architect-AC17** The read/write split (psych SHOULD): a hand-edited day with a 120-char title, a 4th quest or `rerolls_used: 3` reads as 200. Write routes and generation still enforce the caps. Ranges for energy 1–5 and satisfaction 1–10 still quarantine on read.

**Git & integrity**
- **architect-AC18** Every write route calls `git.touch({kind, ref}, [file])` with a typed reason. No user text (titles, notes, mood) appears in commit messages. End-to-end test: `PUT evening` → file on disk → `git.flush()` → `git log -1` has the sanitized message, and a concurrent hand edit to another file adds `(+hand edits)`.
- **architect-AC19** Git spawns time out after 30 s (SIGKILL → `last_error`), and the shutdown flush is bounded to 10 s. Test: the injected `GitRunner` never resolves, the request still returns 2xx, and shutdown completes.
- **architect-AC20** `logicalDate` is DST-correct. It compares the wall-clock hour in `tz` with `rolloverHour` and subtracts a *calendar* day. Tests cover Europe/Berlin and America/New_York spring and fall at 03:30, 04:00 and 04:30 local time, plus Asia/Almaty 03:59/04:00.
- **architect-AC21** `loadConfig` refuses a `DATA_DIR` inside the app repo (`REPO_ROOT`), including via `..` and symlinks, in every environment.

**Client & security**
- **architect-AC22** No `{@html}` anywhere in `web/src` (grep = 0). All quest, AI and user text renders as plain text. No user text reaches `document.title` or URLs.
- **architect-AC23** The SPA refetches `/api/today` on `visibilitychange`→visible and after any `409 not_today`, so a tab left open across 04:00 shows the new day. If the evening form gets a 412, the user's typed text stays in memory and is shown next to the reloaded version. It's never discarded.
- **architect-AC24** `tz`, the logical date and `rollover_hour` are visible in the UI (Profile placeholder or footer) from `/api/health` or `/api/today`, and they're logged at startup.

## 2. Risks / what the builder will likely get wrong

1. **Inventing theme components inside `web/src/lib/theme/`.** That dir belongs to the designer and holds only tokens and fonts today. PROVISIONAL: the builder puts components in `web/src/lib/components/`, consumes the CSS variables only, and doesn't edit theme files.
2. **The dev proxy trips our own guards.** Vite's proxy forwards `Host: localhost:5173` or the target, and `Origin: http://localhost:5173`. `normalizeHost` strips the port, so it should pass, but **test it** rather than "fixing" it by loosening the allowlist.
3. **SPA fallback swallowing `/api`.** Registering the static catch-all before or around the API router makes typos in API paths return HTML 200, and the client then crashes on `JSON.parse`. Mount `/api` first, keep the JSON 404 and add a test.
4. **Double generation.** It's a race between two check-in taps, or check-in plus `/generate`. Only the in-mutex re-check prevents it, and an in-memory "is generating" flag is not enough.
5. **A GET that writes** (week creation) sneaks into other GETs. Only `/api/today` may create, and only the week file.
6. **No-op detection by string compare after re-serialization.** That always says "changed" for commented or CRLF files. Compare the merged *object* to the raw object, and the section text to the section text.
7. **Writing aliases or normalization on PATCH.** The first status toggle on a hand-edited file will rewrite `failed→let_go`, the computed ids and coins. That's acceptable (it rides along with a real change, per M1 PROVISIONAL 6), but the diff must be limited to those keys. Assert it in a test.
8. **Client-side date math.** Using `new Date().toISOString().slice(0,10)` anywhere in `web/` gives the UTC date and breaks the 04:00 rule. The server's `date` is the only source of truth. Grep for `toISOString` in `web/src`.
9. **Coins from the pool file or the client.** Coins come only from `TARIFF`/`coinsFor()` on the server, and PATCH must ignore a `coins` field in the body (strict zod on request bodies: unknown keys give 400).
10. **Images.** Stickers and decor are gitignored and personal-use. The build must not fail when they're absent (fresh clone), and they must not be inlined as base64 into a committed artifact. `web/dist` stays gitignored: the root `.gitignore` pattern `dist/` already matches `web/dist/`.
11. **Draft persistence.** If the builder stores unsaved evening text in `localStorage`, journal text then sits on the phone outside git. PROVISIONAL: in-memory only for M2. A `localStorage` draft is a SHOULD that needs the user's OK (privacy).
12. **Economy scope creep.** M2 must not invent a stored balance. If the UI shows coins, they're derived per request, or the badge is left for M5.

## 3. Backlog items I want in this sprint

MUST:
- [MUST] No-op saves don't touch disk (tester BUG-2, which also closes the psych SHOULD) → AC16
- [MUST] Calm quarantine UI for today/week (psych) → AC7 is the API half
- [MUST] Write routes call `git.touch()` (builder SHOULD, promoted because M2 is the first sprint with writes) → AC18

SHOULD (take all of them if time allows, in this order):
1. End-to-end write-path + git integration test → AC18
2. DST-correct `logicalDate` → AC20 (M3 jobs and M5 streaks key off it)
3. Git subprocess timeout + bounded flush → AC19
4. Refuse a `DATA_DIR` inside the repo → AC21
5. Read/write schema-cap split → AC17
6. Time-zone visibility → AC24
7. Port the M1 tester probes (CRLF, BOM, empty, traversal, Host spoof) into `server/test/`

Deferred: the `childEnv()` allowlist (M3, with the claude spawn), `updateYaml` parity (M5), and CRLF preservation (COULD, though AC16 implicitly requires CRLF files to stay byte-identical on a no-op).

New (added by me, for the builder to append to the BACKLOG when merging):
- [SHOULD] (quest-architect, M2) Strict request-body schemas (`z.strictObject`) on every write route, with unknown keys → 400 (risk 9)
- [COULD] (quest-architect, M2) `GET /api/today` includes `extra_sections` names so the Evening screen can say "your own sections are kept"

## 4. Question for the other agents

**To quest-designer + quest-psychologist:** on the Today screen, are boss checkpoints ticked **one at a time**, with each tick an
individual, undoable action, or only on the week review? I've provisionally specced `PATCH /api/quests/<week>-boss {checkpoints:[{index, done}]}`
(AC14) plus status `done`/`partial` derived by the user, not automatically. If ticking all 4 should *auto*-complete the boss, tell me now,
because that moves a rule into the server and changes how M5 coins are derived.
