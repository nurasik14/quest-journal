# Sprint M3: goal (quest-builder)

> 2026-10-26 · Author: quest-builder · The user is asleep, so every judgment call is **PROVISIONAL** and listed in PROGRESS.md.
> Inputs: `plan-architect.md` (architect-AC*), `plan-psychologist.md` (psychologist-AC*), `plan-designer.md` (designer-AC*), `docs/BACKLOG.md`.
> M2 retest 2 was a **PASS**, so this isn't a fix round. Its only open finding, R2-BUG-1 (the 412 panel is off-screen), is taken in as G26.

**Goal:** Claude writes today's 3 quests and the weekly boss through a sandboxed, injectable `claude -p` runner. Anything it gets wrong
falls back to the pool without the phone ever hanging. Reroll works, and the Evening draft survives navigation and a 412.

## Committed acceptance criteria

### Runner (`server/src/ai.ts`)
1. **G1. One seam.** Every AI call goes through `AiRunner.run({kind, system, prompt, schema, timeoutMs, signal?})`. The real runner spawns
   `CLAUDE_BIN -p --output-format json --model $AI_MODEL --tools "" --setting-sources "" --strict-mcp-config --no-session-persistence
   --system-prompt … --json-schema …`.
   - The prompt goes to **stdin** and never appears in argv. There's no `--bare`.
   - `cwd` is an empty `<tmpdir>/quest-journal-ai`.
   - Test: the built argv/cwd for a request, and the prompt text isn't in the argv. *(architect-AC1)*
2. **G2. Child env allowlist.** A single `childEnv()` in `config.ts` passes `PATH, HOME, USER, LOGNAME, LANG, LC_*, XDG_*, TERM, TMPDIR` plus explicit extras.
   - Both git and claude spawns use it.
   - `ANTHROPIC_*`, `CLAUDE*` (including `CLAUDECODE`, so a nested run behaves normally) and every other variable are stripped.
   - Test: a run with `ANTHROPIC_API_KEY`/`SECRET_X` set gives an env without either. *(architect-AC2, BACKLOG MUST raised from SHOULD)*
3. **G3. Failure table.** Each fixture maps to a code and a retry decision:
   - ENOENT → `claude_missing`, no retry
   - auth/login text → `claude_not_logged_in`, no retry
   - usage/rate-limit text → `rate_limited`, no retry
   - a hang → `timeout` (SIGTERM, then SIGKILL after 5 s)
   - exit N → `exit_N`
   - `is_error` envelope → `ai_error`
   - prose, the wrong shape, or stdout over 256 KB → `invalid_output`. Fenced JSON is accepted once the fences are stripped.

   One retry on `timeout|exit_*|ai_error|invalid_output`, then the pool. The fixtures come from scripted runner results **and** a
   `server/test/fixtures/fake-claude.sh` driven through the real spawn path. *(architect-AC3)*
4. **G4. Test guard.** Under `NODE_ENV=test` the real runner refuses (throws) unless `CLAUDE_BIN` resolves inside `server/test/fixtures/`.
   Apps built in tests without an explicit runner use no AI at all (pool by design). *(architect-AC4, BACKLOG MUST)*
5. **G5. Logs and debug.** Logs contain only job ID, kind, duration, exit code and error code. Raw output goes to a 20-entry in-memory ring that's kept
   only with `DEBUG=1`. `/api/debug/ai` returns 404 unless `DEBUG=1`. Test: canaries in notes and model output never reach captured logs.
   *(architect-AC9, architect COULD)*

### Output contract and business rules (pure `validateDay` / `validateReroll` / `validateBoss`)
6. **G6. The server owns the economy.** The zod and JSON contracts come from `CATEGORIES`/`DIFFICULTIES`/`COSTS`/`BOSS_TYPES`. `title` ≤80, `why` ≤240, and
   `minutes`/`cost`/`done_when` are required.
   - Unknown model keys (`coins`, `status`, `id`) are **dropped**. `coins = TARIFF[slot difficulty]`, and `id`, `slot`, `status` and `source` are set by the server.
   - Test: `coins: 9999, status:"done", id:"../x"` → 10/20/35, `open`, server ID. *(architect-AC5, psychologist-AC2)*
7. **G7. Rule violations become `invalid_output` and count toward the retry:**
   - 3 quests with distinct categories, and difficulties equal to `ENERGY_SLOTS[energy]` in order. *(architect-AC6, psychologist-AC1)*
   - No title is equal to, or has a normalized Levenshtein similarity above 0.8 with, a title (including `rejected[]`) from the last 14 days. *(psychologist-AC3)*
   - ≤1 quest with `cost ≠ free`, and all free at energy 1. *(psychologist-AC4)*
   - `minutes` fits the difficulty (easy ≤20, medium ≤60, hard ≤180). ≥1 quest is ≤15 min, except at energy 5. *(psychologist-AC5)*
   - The care rule matches the pool: energy 1 needs a `care` quest, energy 2 needs `care` or `treat`. *(motivation §1.4)*
   - `SAFETY_BLOCKLIST` (one exported regex in `domain.ts`, word-bounded, so "Breakfast" doesn't match). *(psychologist-AC6)*
   - No emoji in the title. *(psychologist-AC7)*
   - Soft `tone_warning` (logged and counted, **no retry**) for `should|must` in `why`. *(psychologist-AC7/12)*

   Each rule gets a hostile fixture: retry, then pool.

### Context builder (pure)
8. **G8. Budget.** `buildDailyContext` takes no I/O. Caps: profile 6k, insights 8k, history 8k (14 non-private days, newest first, highlight ≤120, notes ≤200),
   recent titles 2k, total ≤24k (oldest history dropped first). A missing `profile.md`/`insights.md` renders as `(none)`, plus the empty-profile sentence
   from psychologist-AC11. There's **no balance** until M5. *(architect-AC7, psychologist-AC8/11)*
9. **G9. Privacy.** Gratitude and `private: true` days never appear. Quarantined days are skipped, and missing days are omitted. Every `</` inside user text is escaped to
   `<\/`, and placeholders are filled in a single pass, so `{{…}}` in notes is never expanded.
   - Test: `ZZPRIVATE`/`ZZGRAT` canaries and a `</history>` attack. *(architect-AC8, psychologist-AC9)*
10. **G10. Avoid list.** It holds rejected and 👎 **titles** from the last 30 days, with their reasons. Older entries decay out, and a 👎 never bans a category. The prompt carries the
   "no surveillance voice" rule. *(psychologist-AC10/12)*

### Async jobs
11. **G11. Fast check-in.** `POST /api/today/checkin` returns `202 {job}` in under 500 ms while the runner hangs. It waits ≤250 ms inline, so an instant pool job still comes back `succeeded`.
   - The queue runs **one** job at a time. Interactive kinds (`generate_day`, `reroll`) go before `generate_boss`.
   - A running boss job is **preempted** (its child is killed and it's re-queued, at most 3 times) when an interactive job arrives, so a hung boss never delays a check-in.
   *(architect-AC10, psychologist-AC20, designer-AC1, BACKLOG SHOULD→MUST "async check-in")*
12. **G12. Races.** The AI result is re-checked under the day mutex. If quests already exist by then, it's discarded (`result:"superseded"`) and the hand-written quests stay
   byte-identical. A check-in with a **different** energy while `generate_day` is active → 409 `generating`. *(architect-AC11)*
13. **G13. Restart.** After a restart, energy set and 0 quests → `needs_generation` → `/api/today/generate`. SIGTERM kills running claude children before the git flush.
   *(architect-AC12)*
14. **G14. Provenance.** `generation = {source, model, at, attempts, fallback_reason?}`, and each quest carries `source`. `/api/health` reports
   `claude:{bin, enabled, last_ok_at, last_error}` with codes only. Jobs expose `started_at` and `elapsed_ms`. *(architect-AC13, designer Q)*

### Reroll
15. **G15. Reroll route.** `POST /api/quests/:id/reroll {reason?}` → 202 `{job}`, key `reroll:<date>`.
   - Preconditions are checked up front and again under the mutex, each with its own 409: `not_today|not_found|not_open|no_rerolls_left|generating`.
   - Success replaces the quest in the **same slot and difficulty** with a new suffix ID (`-1b`) and pushes `{title, category, difficulty, reason?, at}` to `rejected[]`, plus
     `rerolls_used+1`, all in one write.
   - If the AI and the pool both come up empty, the job fails and `rerolls_used` is unchanged. A double tap → 1 replacement.
   - A quest marked done mid-job → the result is discarded.
   *(architect-AC14, psychologist-AC13/15)*
16. **G16. Replacement rules.** The category differs from the rejected one and from the other two. `costs_money` → free. `too_long` → fewer minutes, when known. The other quests' IDs and statuses
   are untouched. The pool path follows the same rules. *(psychologist-AC14/16)*
17. **G17. Typed reasons.** `REROLL_REASONS` lives in `domain.ts` and equals the theme `REROLL_REASONS` ids (parity test). `rejected[].reason` is typed. *(BACKLOG SHOULD)*

### Weekly boss
18. **G18. Placeholder swap.** `ensureWeek` still writes the pool boss synchronously, then enqueues `generate_boss:<week>` once per process. The AI boss replaces it only while it's
   untouched, under the week mutex: the ETag is unchanged since the app wrote it, `source: pool`, `open`, no checkpoint done, and no feedback. Otherwise the result is dropped.
   - An empty `boss:` pool → no file is written, and the AI job creates the week file.
   - `/api/today` exposes `boss_pending`. *(architect-AC15, psychologist-AC18, BACKLOG SHOULD + COULD)*
19. **G19. Boss contract.** `{title, why, type, checkpoints[4], artifact, cost: free|low}`. `type` ≠ last week's, and the category is derived from the type. Coins = `TARIFF.boss`.
   *(architect-AC16, psychologist-AC17)*

### UI
20. **G20. Generating state.** `HerbLoader` shows "Maomao is grinding herbs…" (`vocab.LOADING.generate`), a read-only energy line, and 3 static ghosts. The phases (15 s/45 s) are measured from the
   job's server-side elapsed time, so navigating away and back doesn't restart them. The loader is keyed on the job ID, so polling doesn't re-announce it. Polling survives navigation
   and `visibilitychange` without a duplicate POST. *(designer-AC1/2/3, psychologist-AC20)*
21. **G21. Fallback vs. pool by design.** A fallback day (`generation.fallback_reason` set) shows **one** `.qj-banner--fallback` with `FALLBACK_NOTE`. Pool-by-design days and AI days show none.
   AI quests have no tag, and pool quests keep "from the shelf". A failed job or `needs_generation` → "The herbs didn't grind this time." + "Try again". There's no regenerate
   button. *(designer-AC8/9/10, psychologist-AC21)*
22. **G22. Reroll UI.** Swap → reason chips + "Just swap" → an in-card loader. On success the cat sticker shows for 4 s, the live text reads "New prescription: <title>", and no card offers Swap
   anymore. On failure the toast reads "The cat couldn't find another one. This one stays.", the card is unchanged, and Swap stays available. *(designer-AC12/13/14, psychologist-AC13/15)*
23. **G23. Boss loader.** While `boss_pending` is true, the boss slot shows `HerbLoader size="sm"` with "Consulting the Jade Pavilion…" instead of a tickable placeholder. *(designer-AC15, psychologist-AC18)*
24. **G24. Boss copy.** The boss micro-copy sits inside the card through a new `QuestCard` `note` snippet:
   - "Paused today, no penalty." at energy 1
   - "N of 4" counting up
   - "All four ticked. Seal the week?" (one tap, no auto-complete)
   - "Sealed for the week." when done, with no "+100" promise anywhere until M5

   *(designer-AC16, psychologist-AC19, BACKLOG SHOULDs)*
25. **G25. Honest coins.** A single pure `questEarnings(q)` (done = `clamp(q.coins ?? tariff, 0, 100)`, partial = `min(partial tier, that)`) drives `earned_today` and a new
   per-quest `earned`. A partial card shows the partial tier, and the DOM sum equals `earned_today`. *(psychologist-AC22, BACKLOG SHOULD architect+psych)*
26. **G26. Evening draft and visible 412.** The draft lives in a memory-only module `$state` store (no `localStorage`) and survives Today → Evening navigation. `beforeunload` is set while
   the form is dirty. On a 412:
   - the stale panel scrolls into view and takes focus (`tabindex=-1`)
   - the header seal un-stamps
   - the toast reads "Not sealed yet. This page changed elsewhere; your text is still here."

   *(BACKLOG MUSTs psych + designer, designer-AC17/18, tester R2-BUG-1)*
27. **G27. Theme copy.** `LOADING.verySlow` → "Claude is slow today. If it doesn't answer, the apothecary's own shelf has backups." and `STATUS.partial.note` → "A smaller dose
   still counts.". Every theme edit is logged under "Theme edits" in PROGRESS.md. *(designer-AC2/AC20, BACKLOG SHOULD)*

### Verification
28. **G28. Checks and smoke runs.** `bun run typecheck`, `bun test` and `bun run build` are green, with the real output pasted in PROGRESS.md. There's one live `fake-claude.sh` smoke run through the real server and at most two real
   `claude -p` smoke calls (scratch `DATA_DIR`, synthetic profile), with their latency recorded. *(architect-AC17, psychologist R11)*

## Backlog items taken in
- **MUST**:
  - `childEnv()` allowlist (G2)
  - async check-in (G11)
  - lazy week vs AI boss (G18)
  - real-claude test guard (G4)
  - Evening draft + visible 412, both the psych and designer MUSTs (G26)
- **SHOULD**:
  - `REROLL_REASONS` (G17)
  - `questEarnings` + `earned` (G25)
  - boss Done copy, "N of 4", seal-the-week offer (G24)
  - boss micro-copy inside the card (G24)
  - theme copy reconciliation (G27)
- **COULD**:
  - empty boss pool writes nothing (G18)
  - `/api/debug/ai` behind `DEBUG=1` (G5)

## Not taken (stays open)
- Sticky save-bar paper backing and the low-rating sticker move (designer SHOULD): a CSS-only attempt, best effort, not committed.
- Unroll stagger, seal lift, CoinBadge caption, warm lanterns, the "Welcome back" gap mode, the boss seed content nits, and the dev-loop smoke through Vite with a real browser.
  The live smoke run uses the API only (see PROGRESS).
- Removing the coin badge on let-go cards needs a `QuestCard` prop that isn't in the designer's allowed list, so it's left for the designer.
