# Sprint M1: planning (quest-psychologist)

> Scope of M1 is **server only**: workspace, config, `store.ts` (day/week/kb/yaml), data-repo init with seed copy,
> `git.ts`, `GET /api/health`, `GET /api/day/:date`. There's no UI and no AI yet.
> My angle: M1 **freezes the data vocabulary**. That covers enums, tariff constants, seed files and the day/week
> schemas. `init` never overwrites existing files, so the seed content and enum names chosen now become the user's
> files permanently. Any mistake here turns into a migration later.
> Decisions made while the user is asleep are marked **PROVISIONAL**.

## 1. Acceptance criteria

**Vocabulary (one exported constants module, e.g. `server/domain.ts`)**

- **psychologist-AC1:** `CATEGORIES` is a single exported constant with exactly these 8 slugs, in order:
  `body, mind, social, creative, adventure, care, learning, treat`. The zod enums for day quests, week boss and the
  pool are all derived from it. Test: `CATEGORIES.length === 8`, and a day file with `category: adventure`
  round-trips. **PROVISIONAL:** this replaces architecture.md §2.6's `outside|chores|rest`, which explicitly
  asked for psychologist input. Mapping for any old/hand-written value: `outside→adventure`, `rest→care`,
  `chores→mind`, normalized on read.
- **psychologist-AC2:** The quest status enum is `open | done | partial | let_go`. When a file is read, the
  hand-written or legacy value `failed` is accepted and normalized to `let_go`. It's rewritten only when the app saves
  that file for another reason. A quest may carry an optional `reason`: `no_time | not_feeling_it | not_possible |
  didnt_fit` or free text ≤ 60 chars. Test: a day file containing `status: failed` parses, and it isn't quarantined.
- **psychologist-AC3:** `TARIFF = {easy:10, medium:20, hard:35, boss:100}` plus a pure `coinsFor(difficulty,
  status)`. `done` gives the full tariff. `partial` gives the next-lower tier (hard→20, medium→10, easy→5).
  `open` and `let_go` give **0**. No function may ever return a negative number. Test: a table-driven unit test
  over all 12 combinations, plus an assertion that the minimum ≥ 0.
- **psychologist-AC4:** The config default `STREAK_BONUS` is **25**, not 50 (motivation.md §3.5: flat bonus, no
  escalation). Test: config loads with no env set, and `STREAK_BONUS === 25`.

**Seed + init**

- **psychologist-AC5:** Init copies `docs/brainstorm/seed/quests.yaml` and `rewards.yaml` **byte-for-byte**, so the
  comments explaining the prices survive. Test: the sha256 of each copy equals the source.
- **psychologist-AC6:** The store's loaders parse the copied seeds **without warnings**. That means 48 pool quests,
  6 per category, and every category has ≥1 easy. Reward prices include `treat 50`, `cafe-meal 150` and
  `manga-volume 350`. Test: load the seeds in a temp DATA_DIR and assert the counts and those three prices.
  (The seed uses `quests:` / `rewards:` / `title`, while architecture.md §2.1 uses `daily:` / `items:` / `name`. The
  loader must accept **both** shapes. See Risk R1.)
- **psychologist-AC7:** Running init a second time over a DATA_DIR where the user changed `rewards.yaml` (for example
  manga → 400) and `kb/profile.md` leaves both files byte-identical. User-set prices are sacred.
- **psychologist-AC8:** The seeded `kb/insights.md` contains only the heading `# Insights` and no bullets. The seeded
  `kb/profile.md` contains only neutral placeholder headings and **no pre-filled claims** about the user (no
  personality, health or traits). Test: insights has 0 parsed items, and profile matches the template exactly.

**Day/week files (journal integrity)**

- **psychologist-AC9:** The round-trip preserves the user's writing exactly. A day file whose `## Notes` contains
  Japanese, emoji, a blank line, a `---` line and a custom `## Café review` section, plus an unknown frontmatter key
  (`weather: rainy`), is read and written back with those parts byte-identical. Only the frontmatter formatting may
  change.
- **psychologist-AC10:** Missing data stays `null` and is never turned into 0. A day file with no `energy`,
  `satisfaction` or `mood` reads back as `energy: null`, `satisfaction: null`, `mood: []`. Out-of-range values
  (`satisfaction: 11`, `energy: 0`) are `invalid_file`, never clamped silently. This matters because "missing data
  isn't a signal" (motivation.md §6.2), and a fake 0 or 1 would poison stats and the AI context.
- **psychologist-AC11:** The day schema accepts these psychology fields as **optional typed keys**, so M2–M5 need no
  migration: `mode` (`normal|exam|rest_day|gentle_restart`, default `normal`), `backfilled` (bool),
  `prompt_id` (string), and per-quest `minutes` (int), `cost` (`free|low|medium`), `done_when` (string) and `reason`.
  Test: a file with all of them round-trips, and a file with none of them gets no extra keys written.
- **psychologist-AC12:** The week-file boss accepts the optional `type` (`make|learn|explore|connect|restore`),
  `checkpoints: [{text, done}]` (0–4 items) and `shrunk: bool`. Test: a week file with 4 checkpoints, 2 of them done,
  round-trips.
- **psychologist-AC13:** Day files never store `coins_total` or `streak`, because both are derived (arch §2.4).
  Per-quest `coins` is a snapshot only. Test: after a write, the frontmatter has no `streak` or `coins_total` key.

**API copy (tone starts at the first byte)**

- **psychologist-AC14:** `GET /api/day/:date` for a date with no file returns `404` with code `not_found` and a
  neutral message (for example "No ledger page for this date"). The message must not contain `missed`, `failed`,
  `streak` or `lost`. Test: string assertion. A future date returns `404` (or `400`), never an empty day containing
  quests.
- **psychologist-AC15:** Git commit messages contain only the reason codes and dates/IDs (`qj: day 2026-10-25`), and
  **never** quest titles, notes, ratings or mood. A test spy on the commit command checks for this.

## 2. Risks / likely builder mistakes

- **R1 Seed ↔ schema mismatch.** The seed files (`quests:`, `rewards:`, `title`, `tier`, `coins`, `id`,
  `cooldown_days`, no `schema:` key) don't match arch §2.1 (`daily:`, `items:`, `name`, `schema: 1`). The builder will
  probably either "fix" the seed by rewriting it, which loses the comments (breaking AC5), or write a zod schema that
  rejects it (breaking AC6). **PROVISIONAL resolution:** normalize on read (`quests|daily`, `rewards|items`,
  `title|name`; a missing `schema` means 1), keep `id`/`tier`/`cooldown_days` through passthrough, and never rewrite
  the seed on init.
- **R2 No boss pool in the seed.** Arch §2.1 wants ≥4 boss items, but `seed/quests.yaml` has none. If M1 seeds without
  bosses, M3's fallback boss will be `null` for every existing install. See the MUST item B2.
- **R3 Arch's category enum gets copied.** §2.6 still lists `outside|chores|rest`. If the builder uses it, every seed
  quest in `adventure/learning/treat/care` fails validation. AC1 overrides it.
- **R4 Quarantine is too harsh on journal text.** A typo in one day's frontmatter must never hide that day's
  **notes**. GET should still return the raw body inside the 422 `details` (read-only), so later the UI can show
  "your words are safe, fix line N". It must never auto-repair, truncate or rename the file.
- **R5 `date` vs YAML Date coercion.** If `2026-10-25` becomes a JS Date and is written back shifted by the TZ, the
  user's day moves. That kind of silent data damage destroys trust in a journal. Tests at a UTC+5 TZ and at 03:59.
- **R6 Empty sections spam.** Writing `## Highlight / ## Notes / ## Gratitude` into a hand-made file that had none
  is fine. Re-ordering the user's own sections, or adding blank lines on every save (so the git diff grows each time),
  is not. Test: save twice and check the second diff is empty.
- **R7 Defaults that encode judgment.** `satisfaction: 5`, `energy: 3` or `status: failed` used as defaults on read.
  Defaults must be `null`/`open`.
- **R8 Route name drift.** The milestone text says `/api/day/:date`, while arch §2.3 says `/api/days/:date`. Pick one
  and alias the other, so the M2 UI and the tester don't disagree. **PROVISIONAL:** `/api/days/:date` is canonical
  and `/api/day/:date` is an alias.

## 3. Backlog items proposed for this sprint

- **B1 [MUST]** (psychologist, M1) The domain-constants module: `CATEGORIES` (8), `STATUSES` (with the `failed`→`let_go`
  alias), `TARIFF`, `coinsFor()` with partial credit, `STREAK_BONUS=25`, `BOSS_TYPES` (5), `MODES`. Covers AC1–AC4.
- **B2 [MUST]** (psychologist, M1) Add a `boss:` list to `docs/brainstorm/seed/quests.yaml` before init ships: the 10
  bosses from motivation.md §2.2 (title, why, type, 4 checkpoints, category). The builder may append it, as data not
  code, keeping the existing comments.
- **B3 [MUST]** (psychologist, M1) Seed-tolerant loaders for `quests.yaml`/`rewards.yaml` (R1). Covers AC5–AC7.
- **B4 [MUST]** (psychologist, M1) Journal-integrity round-trip tests (AC9, AC10, AC13, R5, R6).
- **B5 [SHOULD]** (psychologist, M1) Optional psych fields in the day/week schemas (AC11, AC12).
- **B6 [SHOULD]** (psychologist, M1) A read-only raw body in the 422 response for quarantined files (R4).
- **B7 [SHOULD]** (psychologist, M1) Neutral error copy and privacy-safe commit messages (AC14, AC15).
- **B8 [COULD]** (psychologist, M5) A `bun run econ:sim` script that runs 30 fake days at the motivation.md §3.1
  completion rates, to check that a 350-coin manga lands every 2–4 weeks. Pure functions from B1 make this cheap.

## 4. Question for the other agents

**To quest-architect:** arch §2.2 quarantines any file that fails zod. Would you accept a **tolerant-enum** rule
instead? Known legacy or alias values (`failed`, `outside`, `rest`, `chores`) are normalized on read, and only truly
unknown values quarantine the file. That keeps a user's hand edit, or a file from an older schema, from blocking
their whole day. Or do you want aliases handled only through `migrate<Type>()` with a schema bump?
