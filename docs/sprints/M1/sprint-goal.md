# Sprint M1: sprint goal (quest-builder)

> Merged from `plan-architect.md` (architect-AC*) and `plan-psychologist.md` (psychologist-AC*), 2026-10-25.
> Scope: **server only**. Workspace, config, clock, domain constants, store, data-repo init, git auto-commit,
> `GET /api/health`, `GET /api/days/:date` (+ alias `/api/day/:date`). The designer owns `web/src/lib/theme`, which is not touched here.
> No previous test report exists, so this is not a fix round.

## Committed acceptance criteria

**Workspace and config**
1. Root `package.json` (Bun workspace, `server/` member) has the scripts `dev`, `test`, `build`, `start` and `typecheck`. `tsconfig` has `strict` and `noUncheckedIndexedAccess`. Typecheck and `bun test` exit 0. *(architect-AC1)*
2. `config.ts` is the only module that reads `process.env`. It reads `DATA_DIR` (expanding `~`), `HOST` (default `127.0.0.1`), `PORT` (4317), `TZ` (default: the system zone; an invalid zone fails fast), `DAY_ROLLOVER_HOUR` (4), `ALLOWED_HOSTS`, `GIT_ENABLED` and `GIT_PUSH` (false). `createApp(deps)` receives the config. *(architect-AC2)*
3. The default host is never `0.0.0.0`. *(architect-AC3)*
4. Tests can never resolve `~/quest-data`: `loadConfig` throws under `NODE_ENV=test`, and `createStore`/`initDataRepo` refuse that directory under `bun test`. *(architect-AC4)*
5. The default `STREAK_BONUS` is 25. *(psychologist-AC4)*

**Time and domain**
6. `Clock` is injected. `logicalDate` and `isoWeek` are pure. 03:59 belongs to the previous day and 04:00 starts the new one. 2026-12-31 and 2027-01-01 are both 2026-W53. Everything is computed in the configured TZ. *(architect-AC5)*
7. There is one constants module (`server/src/domain.ts`): 8 `CATEGORIES`, `STATUSES = open|done|partial|let_go` with the `failed→let_go` alias, `TARIFF`, `coinsFor()` with partial credit (never negative), `BOSS_TYPES`, `MODES`. *(psychologist-AC1/AC2/AC3, conflicts C3/C4)*

**Store**
8. Dates stay strings. gray-matter uses the `yaml` core-schema engine, with fresh options on every call (no shared cache). *(architect-AC6)*
9. Round-trips preserve unknown top-level and quest keys, the preamble, and extra sections in order. Japanese text, emoji, blank lines and `---` lines in the notes survive. Only the owned section bodies change, and heading matches are case-insensitive. Saving twice changes nothing. *(architect-AC7, psychologist-AC9, R6)*
10. Owned sections (`Highlight`, `Notes`, `Gratitude`) are added in canonical order when missing. *(architect-AC8)*
11. Quarantine: broken YAML gives `unparseable_file` (with the line and the raw text), and a zod failure gives `invalid_file` (with issue paths). Writes are refused and the file stays byte-identical. Missing values stay `null`/`[]`, and out-of-range values are never clamped. *(architect-AC9, psychologist-AC10, R4/B6)*
12. A `schema` newer than the current one gives `newer_schema` (read-only). A missing schema counts as 1. Alias normalization happens only in memory on read, and is written back only when the app saves the file for another reason. *(architect-AC10, psychologist-AC2)*
13. Writes are atomic (tmp file, fsync, rename) under a per-file mutex. 20 concurrent updates lose nothing and leave no tmp files. *(architect-AC11)*
14. Missing quest IDs are computed on read (`<date>-<slot>`, plus a suffix when that's taken). Duplicate IDs give `invalid_file`. *(architect-AC12)*
15. The week file, kb files and `rewards.yaml`/`quests.yaml` all go through the same safety rules. Both YAML shapes are accepted (seed and arch). Directory scans ignore editor temp files. *(architect-AC13, psychologist-AC6, C1/C2)*
16. Optional psychology fields round-trip and are never added when absent: day `mode`, `backfilled`, `prompt_id`; quest `minutes`, `cost`, `done_when`, `reason`; boss `type`, `checkpoints` (≤4), `shrunk`. *(psychologist-AC11/AC12, B5)*
17. `streak` and `coins_total` are never written. *(psychologist-AC13)*

**Init**
18. Init creates the layout and templates, copies the seeds **byte-for-byte**, and runs `git init` once. It is idempotent and never overwrites anything. *(architect-AC14/AC15, psychologist-AC5/AC7)*
19. The seeds parse without warnings: 48 daily quests, 6 per category, each category with at least one easy quest, plus ≥4 boss items. Prices are treat 50, cafe-meal 150, manga-volume 350. *(psychologist-AC6, B2)*
20. The insights template has no bullets, and the profile template has neutral headings only. *(psychologist-AC8)*

**Git**
21. `touch()` is debounced (5 s by default, injectable) and serialized. 3 touches produce 1 commit. The message is `qj: <unique reasons ≤5>`. The fallback identity is used only when `user.email` is unset. *(architect-AC16)*
22. Git never pushes. A failed commit sets `last_error` and doesn't throw. SIGINT/SIGTERM flushes. `GIT_ENABLED=false` spawns no git process. *(architect-AC17)*
23. Commit messages contain only reason codes and ids/dates (they are typed and sanitized). *(psychologist-AC15, B7)*

**HTTP**
24. `GET /api/health` returns the documented shape, with the logical date taken from the injected clock. Broken files appear in `broken_files` and never cause a 5xx. *(architect-AC18)*
25. `GET /api/days/:date` and the alias `/api/day/:date` return the Day shape plus an `ETag` (16 hex chars). A missing day returns `404 not_found` with neutral copy. *(architect-AC19, psychologist-AC14, C6/R8)*
26. Invalid dates and traversal attempts get a 400, with no fs access outside `DATA_DIR`. *(architect-AC20)*
27. Every `/api/*` response sends `Cache-Control: no-store`. Errors use `{error:{code,message,details?}}`. A foreign `Host` gets 421. Mutations with a foreign `Origin` get 403, and non-JSON mutations get 415. *(architect-AC21)*

## Backlog MUST items taken in
`docs/BACKLOG.md` had no open items at sprint start. The items proposed in the M1 plans were added to the backlog and taken in:
architect: seed-shape schemas + single constants, test-safety guard, Host/no-store middleware. psychologist: B1 (domain constants), B2 (boss pool in seed), B3 (seed-tolerant loaders), B4 (journal-integrity tests).
SHOULD items also done: the test helpers factory, the YAML-comment limitation note, B5, B6 and B7.
