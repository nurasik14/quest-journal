# M1 review / retro: architect

> Author: `quest-architect` · 2026-10-26 · async (the user is asleep, so nothing here is user-confirmed. Every judgment call is marked **PROVISIONAL**)
> Inputs: `plan-architect.md`, `plan-psychologist.md`, `sprint-goal.md`, `docs/PROGRESS.md`, `docs/test-reports/2026-10-26-M1.md`,
> and the code itself (`server/src/*.ts`, `server/test/*.ts`). M1 is server-only, so there are no screenshots.
> My own re-run: `bun run typecheck` → exit 0; `bun test` → `104 pass / 0 fail / 358 expect()`;
> `logicalDate(2026-10-25T02:30Z, "Europe/Berlin", 4)` → `2026-10-25` (expected `2026-10-24`, which confirms tester BUG-1).
> The system zone of this PC is `Asia/Hong_Kong` (`timedatectl`).

## Verdict

**Accepted.** The increment is a solid foundation. The trust boundaries I cared most about all hold, and they hold
because of the design, not by luck: tests can't reach real data, broken files can't be overwritten, and plain reads
never write. User text can't get into commit messages, and the default bind is localhost-only. The module seams
(`config / clock / domain / markdown / schemas / store / git / app / index`) are exactly what M2 and M3 need to plug into.
There are two defects to fix **before M2 adds write routes** (no-op rewrite, unbounded git subprocess) and one to fix soon (DST).

## Architect acceptance criteria

| AC | Verdict | Notes (my own code reading plus the tester's evidence) |
|---|---|---|
| AC1 workspace, strict TS, green | PASS | `strict` + `noUncheckedIndexedAccess`. Typecheck and tests re-run green by me |
| AC2 config is the only env reader | PASS (nit) | `git.ts:89` spreads `process.env` into the child env. That's a pass-through, not a config read. See "must change" item 5 |
| AC3 never 0.0.0.0 by default | PASS | `HOST` default `127.0.0.1`, verified with `ss` by the tester |
| AC4 tests can't hit `~/quest-data` | PASS | Three layers of protection (`loadConfig`, `createStore`, `initDataRepo`). This is better than I asked for |
| AC5 clock seams, 03:59/04:00, W53 | **PASS as written, defect found** | `logicalDate` subtracts elapsed ms rather than comparing wall-clock hours, so it's wrong for 1 h on DST days. My AC only specified a no-DST zone, so the miss is partly mine. Not live for HK/Almaty |
| AC6 dates stay strings | PASS | `yaml` core schema through a custom gray-matter engine, with fresh options on every call, which avoids gray-matter's shared cache |
| AC7 round-trip preservation | PASS | Ordered chunk parser, fenced-code aware. `mergeChanges` diff-merges into the raw object, so key order survives. This is the best part of the sprint |
| AC8 missing owned sections appended | PASS | Inserted next to their owned neighbours, which is smarter than "append at end" |
| AC9 quarantine, byte-identical | PASS | It also returns `raw` in `details` (psych B6). Note: `readYaml`'s `unparseable_file` lacks `raw` (COULD) |
| AC10 newer_schema, alias in memory only | PASS | |
| AC11 atomic write + per-file mutex | PASS | tmp + `fsync` + `rename`, mutex keyed by `resolve()`d path (risk #9 avoided). No parent-dir fsync (COULD, power-loss durability only) |
| AC12 quest IDs on read, duplicates rejected | PASS | Collision suffixes `b, c…`. Duplicate IDs found during an *update* surface as `invalid_file` instead of `invalid_update`, which is cosmetic |
| AC13 week/kb/yaml under the same rules | PASS with gap | `updateYaml` has no `expectedEtag` and no no-op short-circuit, unlike `updateMd`. That's fine for M1 (nothing calls it) and needed by M5 |
| AC14 init layout + byte-for-byte seeds | PASS | `wx` / `COPYFILE_EXCL`, so creating files can't race with existing ones |
| AC15 init idempotent, never overwrites | PASS | `git.init()` compares `realpath(show-toplevel)` with the data dir. See the "nested repo" risk below |
| AC16 debounce, 1 commit, identity fallback | PASS | Typed `CommitReason` + regex sanitizing is a stronger privacy contract than the one I specified |
| AC17 no push, last_error, flush on signal | PASS with gap | There's no subprocess timeout: a hook or gpg-pinentry prompt can wedge the queue *and* the shutdown flush. A failed commit only retries on the next `touch` |
| AC18 `/api/health` | PASS | Full scan on every call: fine at this size, measure in M6 |
| AC19 GET day + ETag + 404 | PASS | ETag is quoted in the header and also included in the body (`etag`), which is useful for the SPA |
| AC20 date validation / traversal | PASS | Validated at the route *and* in `store.abs()`, so there are two layers |
| AC21 no-store, error shape, 421 | PASS | The builder also added the Origin → 403 and non-JSON → 415 checks from §2.3 ahead of schedule |

## What's good (keep doing this)

1. **Defense in depth on the dangerous boundaries.** The data-dir guard has 3 layers and path validation has 2 (route + store).
   Commit messages are built from typed reasons, so user text has no way into them by construction.
2. **"Reads never write" is enforced structurally.** Normalization happens on an in-memory raw object, and the only
   disk write is inside `updateMd` under the lock. This prevents the Obsidian-race and noisy-commit class of bugs.
3. **Diff-merge into the raw object** (`mergeChanges`, with array elements matched by `id`) is the right answer to
   "keep hand-edited files' diffs small". It also makes the M2 evening PUT safe against unknown keys by default.
4. **ETag preconditions already exist in the store** (`expectedEtag`, with `"*"` meaning "must not exist"), so M2's
   `If-Match`/`412`/`428` contract (§2.2) only needs HTTP wiring.
5. **The PROVISIONAL decisions were recorded** (PROGRESS.md §PROVISIONAL 1–11) instead of being made silently. All 11 are acceptable to me.

## What must change

Ordered by when they bite. Backlog items were added for all of them.

1. **[MUST before M2 write routes] A no-op save rewrites the file and strips the user's YAML comments (tester BUG-2).**
   M2's evening form re-sends every field. With today's code, *opening and saving* an Obsidian-edited day without
   changing anything re-serializes the frontmatter. That loses comments and reformats it, and the auto-commit then
   records an "edit" the user never made. Git can recover the content, so it isn't corruption, but it silently
   rewrites hand-written content, which breaks the "app must survive hand edits" rule.
   **PROVISIONAL contract:** `updateMd` writes only if (a) the merged frontmatter differs from the raw on-disk object,
   or (b) an owned section's text changed. Normalization alone (computed `id`/`coins`, aliases) **does not count**
   as a change. It rides along with the next real change. A `changed:false` save must not call `git.touch`.
2. **[SHOULD, M2] The git subprocess has no timeout.** `Bun.spawn(["git", …])` waits forever. A user `pre-commit`
   hook, `commit.gpgsign=true` with pinentry, or a credential prompt would stall the serialized queue: every later
   commit stays pending, and SIGTERM's `flush()` never returns, so systemd ends up SIGKILLing the process. Fix: a
   per-command timeout (30 s, then SIGKILL → `last_error`) and a bounded shutdown flush (10 s). PROVISIONAL: keep
   hooks and signing enabled (it's the user's config). Just don't let them hang the app.
3. **[SHOULD, M2] DST-correct `logicalDate` (tester BUG-1).** Compare the wall-clock hour in `tz` against
   `rolloverHour`, and subtract one *calendar* day when the hour is earlier. Add the Berlin and New York spring/fall
   cases. It doesn't affect the user today, but `TZ` is configurable and M5 streaks and coin awards key off this function.
4. **[SHOULD, M2] Refuse a `DATA_DIR` inside the app repo.** If `DATA_DIR` is misconfigured to `./data` or similar,
   init would `git init` a nested repo (or, with `GIT_ENABLED=false`, drop plain journal files) inside
   `~/Projects/quest-journal`. One careless `git add` would then publish personal data, which is a hard rule in
   CLAUDE.md. Fix: `loadConfig` throws in all environments if `dataDir` is within `REPO_ROOT`.
5. **[SHOULD, M3] Build child-process env in one place, with an allowlist.** This is BUG-4 reframed. The nit itself
   is harmless, but M3 adds a second spawn (`claude -p`), and that one has privacy weight. Provide a single
   `childEnv()` (in `config.ts`) that passes `PATH, HOME, LANG, LC_*, XDG_*, USER, TERM` plus explicit extras, used by
   both git and claude. That keeps unrelated secrets in the server's env out of the AI subprocess, and it makes AC2 literally true.
6. **[SHOULD, M2] Make the time zone visible.** PROVISIONAL default = system zone, which is `Asia/Hong_Kong` on this
   PC. Tests and the tester's run used `Asia/Almaty`. **I don't know which zone the user actually lives in.** A
   3-hour mismatch moves the 04:00 rollover to 01:00 or 07:00 local time, so late-night entries land on the wrong day.
   Fix now: log `tz` + logical date at startup, and have the M2 UI show them (settings/footer) from `/api/health`.
   The M6 systemd unit must set `TZ=` explicitly. → **Open question for Nurasyl** (below).
7. **COULD items** (backlog): preserve the dominant line ending on write (BUG-3); retry with backoff for a failed
   commit, so the last edit of the night isn't left uncommitted until tomorrow; `updateYaml` parity (`expectedEtag`,
   no-op short-circuit, `raw` in errors) before the M5 shop writes; parent-dir fsync; a cheap or cached `/api/health`
   scan; health reports `clock: "fake"` when `QJ_FAKE_NOW` is active.

## Answers to other agents' planning questions

**quest-psychologist → architect: "tolerant-enum rule, or aliases only through `migrate<Type>()` with a schema bump?"**
**Tolerant enum, with rules (PROVISIONAL, matches what the builder shipped):**
- A known alias in the single `domain.ts` alias map (`failed→let_go`, `outside→adventure`, `rest→care`,
  `chores→mind`) is normalized in memory on read and persisted only with the next real write (see must-change #1).
  It doesn't quarantine the file.
- *Adding* an alias needs no schema bump, because it only widens what's accepted. *Renaming or removing a canonical
  value* does need a bump + `migrate<Type>()`, because old app versions would quarantine new files.
- An alias must map to exactly one canonical value, and every alias needs a round-trip test.
- Truly unknown values still quarantine (`invalid_file` with the field path). That's the honest behavior, because the
  app can't guess what the user meant.

**architect → quest-psychologist (my M1 plan question), now resolved by the increment:**
the status enum `open|done|partial|let_go` is treated as final for schema 1. The boss pool lives in `quests.yaml`
under `boss:` (10 entries × 4 checkpoints, appended to the seed as data). If the psychologist wants a different
location, that's a schema change and needs a bump. I'd rather not move it.

**Designer:** no M1 questions (no UI). For M2, the API returns `extra_sections` and `etag` in the `Day` body. The
evening screen should show "this page has your own sections: <names>" read-only, so the user knows they're preserved.

## Open question for Nurasyl (when awake)

- **Which time zone do you live in?** This PC says `Asia/Hong_Kong`, and the tests and the tester assumed `Asia/Almaty`.
  Is 04:00 the right "my day ends" hour for you, given how late you usually write the evening entry?

## Docs debt (architect-owned, not the builder's)

`docs/ARCHITECTURE.md` still says day frontmatter stores `coins, streak` (the decision is that both are derived),
lists the starter prices 30/80/150 (the seed has 50/150/350), and says "bind to the Tailscale IP" (§2.10 uses
`tailscale serve`). I haven't edited it, because none of these is user-confirmed. The existing backlog item
"Reconcile architecture.md §2.1 with C1–C7" now covers these three too. I'll present them as one confirm-list at the next interactive session.

## Process note (what to do differently next sprint)

1. **Architect ACs must name adversarial inputs, not just happy edges.** I wrote "03:59 vs 04:00" in a no-DST zone,
   and the tester found the DST hole. From M2 on, each time, concurrency or hand-edit AC lists at least one hostile
   case: a DST zone, a CRLF file, a comment-bearing file, a hook that hangs.
2. **The tester's probe scripts should become regression tests.** The M1 probes (CRLF, BOM, empty or no-frontmatter
   files, traversal variants, Host-spoof variants, DST) live in a scratchpad that disappears. The builder should port
   them into `server/test/` during the M2 fix round (backlog item added).
3. **A milestone without write routes leaves its write-side infrastructure untested end-to-end.** `git.touch()` and
   `expectedEtag` exist but no route exercises them. M2's plan should include one integration test that goes from
   HTTP to a commit: `PUT evening` → file → `flush()` → `git log -1` message, plus `412` on a stale `If-Match`.
4. **Keep recording PROVISIONAL decisions in PROGRESS.md.** The M1 list made this review fast. Next time, also link
   each one to the AC or conflict ID it resolves.
