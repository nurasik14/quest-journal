# M3 review / retro: architect

> 2026-10-26 · `quest-architect` · async (the user is asleep). Every judgment call here is **PROVISIONAL** until Nurasyl confirms it.
> Inputs: `sprint-goal.md` (G1–G28), `plan-architect.md` (architect-AC1–17), `PROGRESS.md` §M3, `test-reports/2026-10-26-M3.md` (PASS),
> `BACKLOG.md`, and the code in `server/src/{ai,jobs,generation,today,config,index,quest-rules,prompts}.ts`.
> My own check: `bun test` → `352 pass / 0 fail / 1991 expect() calls` (4.18 s). I wrote no application code.

## Verdict

**Accepted.** All 17 architect ACs are met, and two of them have small deviations that don't block anything (AC12 and AC17). The tester re-ran the
riskiest behaviour through the real spawn path with their own fake `claude`. That is the evidence I trust most: the failure table, 202-while-hung,
the hand-edit race, preemption and the env stripping.

The two things I was most worried about are closed:
- **Money:** an API key can't reach the child, because of `childEnv()`.
- **The Monday phone hang:** check-in is async, and it preempts a running boss job.

## 1. Architect acceptance criteria

| AC | Result | Evidence / note |
|---|---|---|
| AC1 One seam, argv, stdin, cwd | ✅ | `claudeArgv()` matches §2.6 exactly, with no `--bare`. Tester: prompt text absent from argv (`grep -c` → 0), cwd `/tmp/quest-journal-ai`. The child runs in its own process group (`detached`), which is better than I asked for |
| AC2 `childEnv()` allowlist for claude **and** git | ✅ | Tester: `ANTHROPIC_API_KEY`, `SECRET_X`, `CLAUDECODE` and `CLAUDE_CODE_*` were all absent from the child env. `TZ`/`TMPDIR`/`LOGNAME` were added to the list, which is fine |
| AC3 Failure table + retry policy | ✅ | Every row was exercised live (auth/rate get no retry, hang → TERM→KILL with no orphans, fenced JSON accepted). `interpret()` only pattern-matches auth/rate text when the envelope is already an error. That's correct: a valid answer that mentions "quota" isn't misclassified |
| AC4 The tests can't spawn the real claude | ✅ | `assertRunnableBin` + `defaultRunner` → null under `NODE_ENV=test`. The `ConfigError` is rethrown from `callAi`, so the guard is loud, not swallowed |
| AC5 The server owns coins/id/status | ✅ | `aiQuestToQuest` maps fields explicitly. `coins:9999, id:"../x"` → tariff, server ID, `open`. PROVISIONAL 21 (strip extras rather than reject them) is the right call: a stray key shouldn't cost a 60 s retry |
| AC6 Business rules → `invalid_output` | ✅ | It does more than the AC asked (Levenshtein similarity, minutes, small win, care rule). The safety regex is too broad, see §3.2 |
| AC7 Pure, bounded context | ✅ | Tester: a worst-case input (20k profile, 20k insights, 20×10k notes) → a 22,689-char prompt with the newest 14 days kept. No balance until M5 |
| AC8 Privacy + tag escaping | ✅ | `ZZGRAT`/`ZZPRIVATE`/`ZZPRIVTITLE` absent, `</history>` escaped, `{{profile}}` in notes stays literal (single-pass fill). Private titles are still used locally for repeat-avoidance and never sent (PROVISIONAL 23, agreed) |
| AC9 Logs hold only codes | ✅ | Both canaries absent from the logs. The ring only exists with `DEBUG=1`, and `/api/debug/ai` is a 404 otherwise |
| AC10 202 < 500 ms while hung, priority + preemption | ✅ | 0.259 s. A Monday boss is preempted in about 1 s. One deviation: a child that ignores TERM delays the day job by the 5 s grace (tester LOW-2). It's cosmetic, because the HTTP reply is still fast |
| AC11 Re-check under the mutex, energy frozen | ✅ | The hand-added quest stays byte-identical (md5), the result is `superseded`, and a different energy → 409. Gap: the re-check doesn't compare **energy**, so a hand edit of `energy:` mid-call keeps quests sized for the old energy. That's acceptable, see COULD |
| AC12 Restart safety | ✅ (minor) | `needs_generation` → `/generate` works. The order is: SIGTERM → `jobs.stop()` → `killAll()` → flush. The flush doesn't wait for an in-flight pool write, so a write that lands *after* the flush stays uncommitted until the next start (it's atomic, so it's never torn). See COULD |
| AC13 Provenance + health | ✅ | `generation{source, model, at, attempts, fallback_reason}`, `source` on each quest, `/api/health.claude` with codes only |
| AC14 Reroll | ✅ | Double tap → the same job. A quest done mid-job → discarded. Nothing fits → `rerolls_used` unchanged. An unknown ID → **404**, while the AC listed it among the 409s (LOW-4). **404 is correct, so fix the AC text, not the code** |
| AC15 Placeholder boss swap | ✅ | Double guard: an ETag match **and** "untouched" under the week mutex. A ticked checkpoint keeps the placeholder, and a hand-made week file is never replaced. Placeholder ETags are memory-only, so a restart in between just keeps the pool boss (PROVISIONAL 31, agreed: it fails safe) |
| AC16 Boss contract | ✅ | 4 checkpoints, server-rotated type ≠ last week's, category derived from the type, `TARIFF.boss` |
| AC17 Dev-loop smoke + one real call | ⚠️ partial | The real `claude` ran (7.7–10.7 s per call, `structured_output` present on CLI 2.1.310). **No one ran `bun run dev` through the Vite proxy**: both builder and tester used the production build on one port. The tester made 2 real calls instead of 1 (process note §5) |

## 2. What's good (keep doing this)

- **"Read → call outside the lock → lock → re-check → write"** is applied the same way to the day, reroll and boss paths. A 10–60 s spawn never holds a
  file mutex, so ticking a quest stays instant while Claude is thinking.
- **A hard deadline on top of the timeout** (`timeoutMs + grace + 2 s`) means a grandchild holding the pipes open can't leave a job pending forever.
- **Concurrency 1 plus preemption** (PROVISIONAL 26) is better than a second lane. It never runs two claude calls at once, so Max quota is predictable.
- **`structured_output` first, then fence-stripped `result`**: envelope drift is handled, and the real CLI turned out to emit `structured_output`.
- **A failed reroll doesn't consume the swap**, and nothing is written on failure. Coin integrity holds: a reroll only ever replaces an `open` quest, so no
  earned coins can disappear.
- **Hostile fixtures named in the ACs got written first.** The M2 retro asked for fewer ACs with named fixtures, and it shows: the tester found
  no high findings.

## 3. What must change

Nothing in this list blocks M4. These are ordered by how much they hurt the user.

1. **The fallback banner can be untrue.** `FALLBACK_NOTE` always says "Claude couldn't be reached". But `fallback_reason` is often `invalid_output`
   (Claude answered and the rules rejected it twice) or `claude_not_logged_in` (which the user can fix right away by logging in). The API already has the code, so the UI
   should map it to roughly three honest variants: unreachable, answered but didn't fit, needs login. The wording belongs to the psychologist and designer.
   PROVISIONAL architect position: show the code class, never raw text. → SHOULD.
2. **The safety blocklist has false positives (tester LOW-1)** ("Tea drunk", "wine-red"). Each one costs 2 real calls (~20 s) and then shows the untrue banner from item 1.
   The architecture fix is a **benign corpus test**: every seed pool title/why plus the real smoke outputs must pass `SAFETY_BLOCKLIST`. That way the regex can't
   regress silently. The regex content itself needs the psychologist. → SHOULD.
3. **Production `claude` resolution (M6, flagged now).** `CLAUDE_BIN` defaults to the bare `claude`, and the installed binary is in `~/.local/bin`. Under a systemd
   unit, `PATH` usually doesn't include it, so every day would silently become `claude_missing` → pool. Also, the Max login lives in `~/.claude`, so the service must run
   as the user (a `systemctl --user` unit), not as a system unit. PROVISIONAL: resolve `CLAUDE_BIN` to an absolute path at startup, log it, and warn loudly if it
   isn't found. → SHOULD (M6).
4. **Settle preemption at once (LOW-2).** On `aborted`, there's no reason to wait for TERM. The run uses `--no-session-persistence`, so there's nothing for claude to save.
   SIGKILL the group right away, or settle the promise on abort and reap in the background. → COULD.
5. **Shutdown waits briefly for the running job** (`await jobs.idle()` bounded to about 2 s after `stop()`, then flush), so a pool write that lands mid-shutdown is still
   committed under its own message. → COULD.
6. **The init commit gets swept into "(+hand edits)" (LOW-5).** Flush the `qj: init` commit (bounded) *before* `Bun.serve`, not just on a startup failure. Then
   the first boss/check-in writes can't fall inside its debounce window. → COULD.

## 4. Answers to the other agents' planning questions

- **Designer: hard timeouts?** Each attempt is `AI_TIMEOUT_MS` = 60 s, plus a 5 s kill grace and a 2 s hard deadline, with 1 retry. That makes the job worst case
  about 2×67 s ≈ **135 s** before the pool answers. That's well under your 200 s assumption. `started_at`/`elapsed_ms` are on every job, and `generation.fallback_reason`
  is on the day, so the loader phases and the banner can rely on server truth.
  **PROVISIONAL recommendation:** measured real latency is 8–11 s, so `AI_TIMEOUT_MS=45000` would cut the worst case to about 105 s and still leave 4× headroom.
  I'm leaving the default unchanged until Nurasyl sees real phone latency. It's a config change, not code (COULD below).
- **Psychologist: `boss_pending`, and should a discarded AI boss be kept?** `boss_pending` shipped (true only while a boss job is active **and** the boss is null or an untouched
  pool placeholder). A discarded AI boss is **dropped**. I agree with you: keeping it would need a new store of model output that nobody approved, and that's a
  prompt-injection and drift surface with no user value.
- **Psychologist (M3 plan): does a hand-edited `coins:` count?** `questEarnings` now counts it, clamped to 0..100, as you proposed. From the architecture side that's fine:
  the day file is the ledger and the clamp bounds accidents. It's still listed as an open user question before the M5 balance ships.
- **Builder (PROGRESS open question): Sonnet vs Haiku?** Keep Sonnet for now. About 10 s behind a 202 + loader is fine, and quality is what makes AI quests worth having
  over the pool. Revisit only if real phone use says otherwise. Switching is one env var (`AI_MODEL`). If a split is ever wanted, the seam already
  carries `kind`, so `generate_day` and `reroll` could use different models without new plumbing. **PROVISIONAL**, the user decides.
- **Builder: should Today show `minutes`/`done_when`?** That's for the designer and psychologist. Architecturally the data is already stored and in the API, so no server change
  is needed.

## 5. Process notes (what to do differently next sprint)

1. **The real-`claude` budget counts calls, not intents.** The tester's single smoke turned into 2 calls because `ensureWeek` queues the boss on the first GET.
   For any "N real calls" smoke, **pre-create `weeks/<current-week>.md` in the scratch `DATA_DIR`** before starting the server, so no boss job is queued.
   It needs no code. Put it in the tester's smoke recipe.
2. **ACs must state the HTTP status per error code**, not "each with its own 409" (LOW-4 came from my own AC14 wording). From M4 on, my ACs will list
   `code → status` pairs.
3. **The Vite-proxy dev loop has been deferred twice (M2, M3).** For M4, I'll make it a one-line tester check (one check-in through `bun run dev`, no 421/403) instead of
   a builder smoke, so it actually gets done.
4. **Carry-forward for M4 (reflect / insights):** it's the first time model output gets written into a file that is later fed back into prompts.
   - The M4 plan must put the **approval step before any write** to `kb/insights.md`, with `If-Match` on the approve call.
   - Proposals must be stored as pending data, never as `insights.md` content, and each note must get the same `</` escape plus a per-note length cap.
   - `reflect` must reuse `callAi` and the queue. The `reflect` kind already exists in `jobs.ts`, inside the `INTERACTIVE` set, so today it would preempt a boss job.
     If reflect runs in the background after the Evening save, it should be a background kind: it must never delay a check-in or a reroll.
     Decide its priority in the M4 plan.

## 6. Backlog items added (see `BACKLOG.md` → "Added by quest-architect in the M3 review")

- SHOULD: honest fallback banner by `fallback_reason` class (§3.1)
- SHOULD: a benign-corpus test for `SAFETY_BLOCKLIST` (§3.2)
- SHOULD (M6): an absolute `CLAUDE_BIN` + a user-level systemd unit (§3.3)
- SHOULD: verify once (in the opt-in real smoke) that `--setting-sources ""` really keeps the user's `~/.claude/CLAUDE.md`, hooks and MCP out of the quest call
- COULD: settle a preempted run immediately (§3.4)
- COULD: shutdown waits for the running job before the flush (§3.5)
- COULD: flush the init commit before serving (§3.6)
- COULD: re-check `energy` under the mutex in `generateDay`
- COULD: reject control characters / newlines in model `title`/`why`/`done_when`
- COULD: a private `mkdtemp` (or `$XDG_RUNTIME_DIR`) for the AI cwd instead of a shared, predictable `/tmp/quest-journal-ai`
- COULD: empty boss pool + AI boss failure → no boss all week (no re-attempt in-process)
- COULD: `AI_TIMEOUT_MS` default 45 s, after real phone latency is seen

No MUST items this sprint. Nothing found blocks use, corrupts data or coins, or breaks the design.
