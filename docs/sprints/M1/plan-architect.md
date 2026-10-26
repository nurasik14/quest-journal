# M1 sprint plan: architect

> Author: `quest-architect` · 2026-10-25 · async (the user is asleep, nothing here is user-confirmed)
> Binding references: `docs/brainstorm/architecture.md` §2 (PROVISIONAL defaults), `docs/ARCHITECTURE.md`.
> Scope: **server only** (workspace, config, store, data-repo init, git auto-commit, health, read a day).
> State at planning time: no code exists yet (only `web/public/`). No previous sprints, no backlog items, no PROGRESS.md.

## 0. Conflicts found during planning (resolved PROVISIONALLY for M1)

The seed files (`docs/brainstorm/seed/*.yaml`, written by the psychologist) don't match the schemas in
architecture.md §2.1. Init **copies the seeds verbatim**, so the store has to read what's actually on disk.

| # | Conflict | PROVISIONAL M1 resolution |
|---|---|---|
| C1 | `quests.yaml`: arch says `daily:`/`boss:` lists. The seed has a single `quests:` list with `id`, `coins`, `cooldown_days`, and **no boss items** | The store accepts the seed shape (`quests:`, plus optional `boss:`), passthrough. `coins` in the pool is ignored later (the server tariff wins). The missing boss pool goes to the backlog (it's needed by M3) |
| C2 | `rewards.yaml`: arch says `items:[{id,name,price,cooldown_days}]`. The seed has `rewards:[{id,title,price,cooldown_days,tier}]` | The store schema follows the **seed** (`rewards:`, `title`, optional `tier`/`approx_cost`), passthrough |
| C3 | Categories: arch has 7 (`outside`, `chores`, `rest`). Psych/seed has 8: `body mind social creative adventure care learning treat` | Use the psych's 8 in **one exported constant** (arch §2.6 explicitly deferred categories to the psych) |
| C4 | Quest status: arch has `open\|done\|failed`. Psych has `open\|done\|partial\|let_go` (+ optional `reason`) | Enum = `open\|done\|partial\|let_go`. On read, `failed` migrates to `let_go` in memory (written back only on the next save). One exported constant |
| C5 | Seed files have no `schema:` key | Missing means `1` (already the rule in §2.1). Don't inject the key into seed copies at init |
| C6 | Milestone text says `GET /api/day/:date`. Arch §2.3 says `GET /api/days/:date` | Canonical `/api/days/:date`, with `/api/day/:date` as an alias to the same handler |
| C7 | Psych wants extra day keys (`mode`, `mood_tags`, `prompt_id`, `backfilled`) and boss `checkpoints` | Not modelled in M1. They **must survive round-trip** through passthrough (tested by AC7) |

## 1. Acceptance criteria (testable)

**Workspace and config**
- architect-AC1: Root `package.json` has scripts `dev`, `test`, `build`, `start` and `typecheck`. `tsconfig` has
  `strict: true` (and `noUncheckedIndexedAccess`). `bun run typecheck` and `bun test` both exit 0 on a clean checkout.
- architect-AC2: Config reads `DATA_DIR` (expands a leading `~`), `HOST` (default `127.0.0.1`), `PORT` (default
  `4317`), `TZ` (default: the system zone, validated with `Intl.DateTimeFormat`, so an invalid zone fails fast at startup),
  `DAY_ROLLOVER_HOUR` (default 4), `ALLOWED_HOSTS`, `GIT_ENABLED` and `GIT_PUSH` (default false). Config is a plain object
  passed into `createApp(deps)`. No module reads `process.env` apart from `config.ts`.
- architect-AC3: The server never binds `0.0.0.0` by default. A test asserts `loadConfig({})` has `host === "127.0.0.1"`.
- architect-AC4: Under `bun test`, the code **refuses** to use `~/quest-data`. Either the test helper always injects a
  temp dir, or the config throws if `NODE_ENV=test` and `DATA_DIR` resolves to the home default. There's a test for this guard.

**Time seams**
- architect-AC5: `Clock {now(): Date}` is injected. `logicalDate(date, tz, rollover)` and `isoWeek(logicalDate)` are pure.
  Tests: `2026-10-26T03:59` local → `2026-10-25`, `04:00` → `2026-10-26`. `2026-12-31` → `2026-W53`, and
  `2027-01-01` → `2026-W53`. They're computed in the configured TZ, not the process TZ (the test runs with a
  TZ different from the host).

**Store (gray-matter + yaml + zod)**
- architect-AC6: Dates stay strings. An unquoted `date: 2026-10-25` in frontmatter reads back as the string
  `"2026-10-25"`, not a JS `Date`. gray-matter's engine is replaced with the `yaml` package (core schema). Its default
  js-yaml engine converts dates.
- architect-AC7: Round-trip preservation. Read and then write a day file containing unknown top-level keys
  (`mode`, `backfilled`), unknown quest keys (`minutes`, `done_when`), text before the first heading, and an extra
  `## Prompt` section between `## Notes` and `## Gratitude`. After an evening-field update, all of these survive verbatim
  and in order. Only the bodies of Highlight/Notes/Gratitude change. Heading matching is case-insensitive.
- architect-AC8: Writing a file that has no owned sections appends `## Highlight`, `## Notes` and `## Gratitude` in that order.
- architect-AC9: Quarantine. A day file with broken YAML makes `GET /api/days/:date` return `422` with
  `{error:{code:"unparseable_file", ...}}`. A store write attempt is refused, and the file is **byte-identical**
  afterwards (sha256 compare). A file that parses but fails zod (`energy: 7`) returns `422 invalid_file` with zod issue paths.
- architect-AC10: `schema` greater than CURRENT → `422 newer_schema`, read-only. A missing `schema` is treated as 1.
  `failed` → `let_go` migration happens in memory only, and a plain read doesn't modify the file.
- architect-AC11: Atomic writes. Each write goes to `<file>.tmp-<rand>` in the same dir, then `rename`. A per-file
  async mutex serializes mutations. A test fires 20 concurrent field updates on one file, and all 20 are reflected
  with no lost update and no leftover tmp file.
- architect-AC12: Quest IDs. A hand-edited quest without `id` gets `<date>-<slot>` computed in memory on read.
  Duplicate IDs in one file → `422 invalid_file`.
- architect-AC13: Week file (`weeks/YYYY-Www.md`), `kb/*.md` (raw text), `rewards.yaml` and `quests.yaml` (the seed
  shapes from C1/C2) all have read/write functions using the same atomic, mutex, passthrough and quarantine rules.
  Directory scans ignore `*.swp`, `*~`, `.#*` and `*.tmp-*`. Only `^\d{4}-\d{2}-\d{2}\.md$` counts as a day file.

**Data-repo init**
- architect-AC14: Init on a nonexistent temp dir creates it, runs `git init`, and creates `days/`, `weeks/`, `kb/`, `kb/proposals/`,
  `kb/profile.md` (placeholder heading), `kb/insights.md` (`# Insights`), a data `.gitignore`, and copies the seed
  `rewards.yaml` and `quests.yaml` byte-for-byte.
- architect-AC15: Init is idempotent and **never overwrites**. Running it twice over a dir with modified
  `rewards.yaml`/`profile.md` leaves both files byte-identical. Running it on an existing git repo doesn't re-init.

**Git auto-commit**
- architect-AC16: `git.touch(reason)` debounces (5 s, injectable for tests) and runs one serialized
  `add -A` + `commit`. The message is `qj: <unique reasons, max 5>`. The identity `-c user.*` is used only when the repo has
  no `user.email`. Tested against a temp repo: 3 touches inside the window → exactly 1 new commit.
- architect-AC17: Git never pushes in M1 (no `push` code path is reachable with defaults). A failing commit
  (for example a stale `index.lock`) is recorded in `last_error` and doesn't throw into the HTTP handler. The pending commit
  is flushed on SIGINT/SIGTERM. `GIT_ENABLED=false` → no git process is spawned.

**HTTP**
- architect-AC18: `GET /api/health` returns 200 `{ok, now, date, tz, rollover_hour, data_dir_ok,
  git:{enabled,last_commit_at,last_error}, broken_files:[]}`, where `date` is the logical date from the injected clock.
  A broken day file appears in `broken_files` without causing a 5xx.
- architect-AC19: `GET /api/days/:date` (+ alias `/api/day/:date`) returns the `Day` shape from §2.3 (frontmatter
  fields + `highlight`, `notes` and `gratitude` strings) with an `ETag` header (the first 16 hex chars of sha256 of the file bytes).
  A missing file → `404 {error:{code:"not_found"}}`.
- architect-AC20: `:date` must match `^\d{4}-\d{2}-\d{2}$` **and** be a real calendar date (`2026-02-30` → 400).
  `..%2F`, `../etc` and similar → 400, and no fs access outside `DATA_DIR` is possible (there's a test).
- architect-AC21: All `/api/*` responses have `Cache-Control: no-store`. Errors use `{error:{code,message,details?}}`.
  A `Host` header not in `ALLOWED_HOSTS` → `421` (tested with `Host: evil.example`).

## 2. Risks / things the builder will likely get wrong

1. **gray-matter defaults.** js-yaml turns dates into `Date` objects (which breaks AC6 and the filename check), and
   gray-matter **caches results by input string** and returns a shared mutable object. Pass a fresh options object
   or call `yaml` directly. Mutating the cached result corrupts later reads.
2. **Body re-serialization.** Rebuilding the body from the three owned sections drops user sections and the preamble.
   Parse into an ordered list of `{heading, raw}` chunks and replace only the owned chunks' contents.
3. **Writing on read.** Auto-assigning IDs or migrating `failed`→`let_go` must NOT touch the disk on GET. It
   would create noisy commits and race with Obsidian.
4. **Stringify churn.** `yaml.stringify` can reorder keys, change quoting, or line-wrap long titles (`lineWidth: 0`).
   Keep the original key order (passthrough objects keep insertion order) so the git diffs of hand-edited files stay small.
5. **Tests hitting real data.** A default `DATA_DIR` of `~/quest-data` combined with a forgotten override in one
   test would write the user's real repo. AC4 exists for this.
6. **Timezone.** Using `new Date().toISOString().slice(0,10)` (UTC) or the process TZ instead of `Intl` with the
   configured zone. Off-by-one around midnight and 04:00.
7. **Debounce timers keeping `bun test` alive**, or tests sleeping 5 s. Make the delay injectable and expose
   `flush()`.
8. **Git identity.** Hardcoding the user's email, or failing on a fresh machine without `user.name`. Use the
   per-command `-c` fallback only.
9. **Mutex keyed by un-normalized path** (`days/x.md` vs the absolute path). Two locks for one file means a lost update.
10. **Over-building.** M1 shouldn't implement economy, AI, jobs or quest PATCH. Leave clean module boundaries
    (`store`, `git`, `config`, `clock`, `app`) so M2/M3 plug in. Don't touch `web/src/lib/theme` (the designer owns it).

## 3. Backlog items proposed

- [ ] [MUST] (quest-architect, M1) Store schemas follow the on-disk seed shapes (C1/C2), with categories and statuses as single exported constants (C3/C4)
- [ ] [MUST] (quest-architect, M1) Test-safety guard: tests can never resolve `DATA_DIR` to `~/quest-data` (AC4)
- [ ] [MUST] (quest-architect, M1) Host-header allowlist + `Cache-Control: no-store` middleware from day one (AC21)
- [ ] [SHOULD] (quest-architect, M1) A `test/helpers` factory: `makeTempDataDir()`, `fakeClock(iso)` and `createApp(deps)` reused by every later milestone
- [ ] [SHOULD] (quest-architect, M1) Document the "YAML comments may be lost on app rewrite" limitation in PROGRESS.md (README comes in M6)
- [ ] [MUST] (quest-architect, M3) Seed `quests.yaml` has **no boss items**. Add ≥4 boss entries (psychologist content) or a `boss:` list before the M3 boss fallback
- [ ] [SHOULD] (quest-architect, M2) Reconcile `docs/brainstorm/architecture.md` §2.1 with C1–C7 once the user confirms (architect task, not builder)

## 4. Question for the other agents

**To `quest-psychologist`:** the seed pool has `cooldown_days` per quest and your §9 wants partial/let_go statuses
and boss checkpoints. For M1 the store only *preserves* these. Can you confirm `open|done|partial|let_go` is
final, so that the M1 zod enum doesn't need a schema bump in M5? Also, should the boss pool live in `quests.yaml`
under a `boss:` key (my preference) or in a separate file?
