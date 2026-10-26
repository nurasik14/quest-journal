# M2 review and retro: architect

> Author: `quest-architect` · 2026-10-26 · async (the user is asleep). Nothing here is user-confirmed, and my judgment calls are marked **PROVISIONAL**.
> Inputs:
> - `docs/sprints/M2/{plan-architect,plan-psychologist,sprint-goal}.md`
> - `docs/PROGRESS.md` (M2, fix 1, fix 2)
> - `docs/test-reports/2026-10-26-M2{,-retest1,-retest2}.md`, whose final verdict is **PASS**
> - `docs/BACKLOG.md`
> - the code: `server/src/{app,today,static,jobs,store,fallback,domain}.ts`, `web/src/lib/{api,jobs.svelte}.ts`, `web/vite.config.ts`
> - I re-ran `bun test` myself: **221 pass, 0 fail**.

## 1. Verdict

**Accepted.** All 24 architect-ACs are met. Two of them, AC3 and AC23, have small caveats that are recorded below. The increment rests on a
sound base for M3: the job contract, the restart-safe `needs_generation` derivation, in-mutex re-checks, per-file ETags, and git
snapshots before a 412. I found **no MUST items** from my side. There's one SHOULD for an economy-model divergence. It's harmless today,
but it has to be settled before M5 computes a balance.

## 2. Acceptance criteria check

| AC | Result | Evidence and notes |
|---|---|---|
| AC1 workspace/build/typecheck | ✅ | `tsc` + `svelte-check` 299 files, 0 errors. `bun run build` exits 0. 221 tests |
| AC2 no server runtime in the web bundle | ✅ | `api.ts` uses `import type` from `server/src/api-types.ts` only. The `web/dist` grep finds 0 hits |
| AC3 dev proxy | ✅ (caveat) | `vite.config.ts` uses `host: 'localhost'`, `strictPort`, `changeOrigin:false`. Proxy-style Host/Origin is covered by a server test (`regression.test.ts`), but **a live `vite` + proxy run was never done** (builder and tester both say so). I accept this, and it gets a smoke test in M3 |
| AC4 static serving | ✅ | `/api/*` catch-all JSON 404 is registered *before* the SPA handler. `/assets/*` is immutable and `index.html` is no-cache. Other top-level files get `max-age=3600`. That's fine now, but it's wrong for M6 (`sw.js`, manifest), see backlog |
| AC5 traversal | ✅ | Decode → reject `\0` and `\` → `resolve` + prefix check → no dotfiles. `static.test.ts` and the ported M1 probes cover it. It uses no `realpath`, so a symlink *inside* `web/dist` could point outside. `web/dist` is build output, so the risk is low (COULD) |
| AC6 `/api/today` one round trip | ✅ | Also returns `weekday` and `earned_today`. The date comes only from `logicalDate(clock.now())` on the server, and there's no `toISOString`/`new Date()` in non-theme `web/src` (I re-grepped) |
| AC7 quarantine → 200 + `*_error` | ✅ | `readDaySafe`/`ensureWeek` turn quarantine codes into a `FileProblem`. `needs_checkin`/`needs_generation` are false when the day is broken, so the app never writes over a broken file |
| AC8 lazy week create-if-absent | ✅ | `expectedEtag:"*"`, and on `stale` it re-reads and uses the other version. 5 concurrent GETs give 1 file and 1 commit (test). Edge case: an **empty `boss:` list** still creates a boss-less week file, which then never gets a boss (COULD, below) |
| AC9 check-in + pool generation | ✅ | `TARIFF[difficulty]` snapshot, pool `coins` ignored, `generation.source="pool", model:null` |
| AC10 job contract | ✅ | `202 {job, day}` + `GET /api/jobs/:id` + key dedupe. The SPA polls from a navigation-surviving store and treats a 404 as "server restarted → refetch". Still awaited inline, see backlog item (builder, M3) |
| AC11 idempotent generation | ✅ | `generateDay` reads pool and history **outside** the mutex and re-checks "energy set and 0 quests" **inside** it. That's exactly the shape M3's slow AI job needs. A later check-in only updates `energy`. `/generate` → 409 |
| AC12 PATCH | ✅ | `z.strictObject`, so `coins`/`failed` give 400. Same values give `changed:false`, which means no write and no `git.touch` |
| AC13 strict ID routing | ✅ | `DAILY_ID`/`BOSS_ID` regexes, `isValidDate`, `not_today`/`not_this_week` 409s. Unit-tested, including the 04:00 rollover |
| AC14 checkpoints | ✅ | Index bounds are checked before the write, only `done` is touched, and there's no auto-complete (PROVISIONAL 5) |
| AC15 evening PUT | ✅ | 428/412/`*`→412/future 409/bad 400, 10k caps, mood normalized on write only. Hand-written tags are kept verbatim |
| AC16 no-op byte identity | ✅ | Met after fix 1: an in-place `yaml` Document edit plus line splice. Commented + CRLF files are byte-identical on no-op |
| AC17 read/write split | ✅ | Unit tests |
| AC18 `git.touch` + sanitized messages | ✅ | `e2e-git.test.ts` runs against real git. Reasons carry kind/ref/detail only, never user text. Fix 2 binds reasons to staged files |
| AC19 git timeouts | ✅ | Hung-runner tests. The shutdown flush is bounded |
| AC20 DST `logicalDate` | ✅ | 15 cases (Berlin/NY/Almaty) |
| AC21 DATA_DIR not in repo | ✅ | Direct, `..` and symlink cases, in every `NODE_ENV` |
| AC22 no `{@html}`/user text in title | ✅ | The only hit is a comment in a theme file |
| AC23 refetch + 412 keeps text | ✅ (caveat) | Data is safe: `rebaseForm` gives `{conflicts, updated}`, and the hand edit is snapshotted to git before the 412. Tester R2-BUG-1 (Low) is a **visibility** gap: on a phone the stale panel renders off-screen, so a sighted user may think the save worked. The psychologist's M2 MUST (draft store + scroll/focus the panel) covers it. I agree with MUST, because "silently not saved" is a trust problem, even though nothing is lost |
| AC24 tz visible | ✅ | Today footer reads "Ledger date … · day starts 04:00 · Asia/Almaty". It's also on Profile and logged at startup |

## 3. What went well

- **The concurrency model is right.** The pattern is: read slow inputs outside the lock, re-check preconditions under the per-file mutex,
  and decide `changed` before `git.touch`. Every write route uses it, so M3 can drop in a 30–60 s `claude -p` call without changes.
- **Restart safety comes from derivation, not memory.** Jobs live in memory, but `needs_generation` is derived from the file
  (`energy set ∧ 0 quests ∧ no active job`). A crash during generation therefore just leaves a "Try again" state. Nothing gets stuck.
- **The hand-edit story is strong.** It has byte-identical no-ops, minimal diffs, `##`/fence escaping, and a `hand_edit` snapshot commit
  before a 412. Together these meet CLAUDE.md's "must survive hand edits" with real evidence. It's the riskiest property of the whole design, and
  M2 spent its fix rounds on the right things.
- **The trust boundaries hold:** strict bodies, coins only from `TARIFF`, Host allowlist + Origin + JSON-only mutations, no `{@html}`, no
  `localStorage` journal drafts, `assetsInlineLimit: 0` (personal-use images are never inlined), and screenshots gitignored.

## 4. What must change (from my side)

None of these block M2. The priorities are in the backlog section.

1. **Economy divergence (SHOULD, fix before M5).** `earnedFor()` → `coinsFor(difficulty, status)` recomputes from the **current** `TARIFF`
   and ignores the quest's stored `coins` snapshot. `docs/brainstorm/architecture.md` §2.4 says earnings use the snapshot (clamped 0..100).
   `partial` also pays `PARTIAL_TARIFF`, which §2.4 never defined. Psychology owns that value, which is fine, but it must live in the same single function.
   If M5 builds the balance on a different function than `earned_today`, the two numbers will disagree, and a later tariff change would rewrite
   past earnings. **PROVISIONAL recommendation:** use one pure `questEarnings(q)` in `domain.ts` for both:
   - `done` → `clamp(q.coins ?? TARIFF[q.difficulty], 0, 100)`
   - `partial` → `min(PARTIAL_TARIFF[q.difficulty], that)`
   - anything else → 0

   Plus a table test. The open question is whether a hand-edited `coins: 999` should count (clamped) or be ignored. That needs the user and `quest-psychologist`.
2. **The M3 boss path vs. lazy week creation.** `ensureWeek` writes a **pool** boss synchronously on the first GET of the week. Once M3
   adds AI boss generation (`generate_boss:<week>`), that pool boss will always win the race. M3 has to choose one of two options:
   - (a) the pool boss is an instant placeholder that an AI job may replace only while it's untouched (`status=open`, no checkpoint done, file
     ETag unchanged since creation).
   - (b) the GET enqueues `generate_boss` and the pool boss is only the fallback.

   **PROVISIONAL:** (a), because it keeps the GET fast and the screen never empty.
3. **412 latency on the phone.** A stale save can wait up to 5 s for the snapshot flush before answering. That's acceptable for M2 (data
   safety first), but the 5 s should appear in M3's latency budget, alongside the AI job and the git queue.
4. **Silent fallback to full re-serialization** (already a backlog COULD from the builder). I'd keep it COULD, but `/api/health` is the right place for it, so do
   it together with the `clock: system|fake` health item (M6).

## 5. Answers to other agents' planning questions

- No M2 *planning* question was addressed to the architect. The psychologist's question went to the designer.
- **The psychologist's M2 review asks for an API shape for a per-quest `earned` value** (backlog SHOULD, M3). My answer (PROVISIONAL):
  - Add a read-only, derived `earned: number` to `QuestJson`/`BossJson`. The server computes it in `dayJson`/`weekJson` from the same
    `questEarnings(q)` that feeds `earned_today` and, later, the M5 balance (my backlog item). That way the card, the header and the balance can never disagree.
  - It is **never written to disk** (a day file stays human-sized, and nothing new can drift).
  - It is **never accepted on input**. Strict PATCH bodies already reject unknown keys.
  - For the boss, `earned` stays `0` with no number shown until M5's `bossCoinsFor` exists, which matches their "no +100 promise" item.
- **The psychologist's MUST on Evening drafts** (memory-only `$state` store + `beforeunload`, and the 412 panel scrolled into view):
  architecturally **endorsed**. It's in-memory only, and no journal text goes to `localStorage`, consistent with my risk 11. It also covers tester R2-BUG-1, so I
  dropped my duplicate backlog item.
- My own question (boss checkpoints ticked one at a time vs. auto-complete) was answered **PROVISIONALLY** by the builder: individual ticks and no
  auto-complete (PROGRESS PROVISIONAL 5). **I accept this.** It keeps completion as the user's own act, and it keeps the M5 coin rule simple: boss
  earnings come from `status`, and checkpoint partial credit (psych `bossCoinsFor`, backlog) is a pure function of the stored `done` flags.
- Builder PROVISIONALs 14 (aliases aren't written back on unrelated saves), 18 (scalar lists stay flow), 19 (hand-edit detection uses this process's last
  write) and 20 (neutral `qj: hand edits`): **accepted** from an architecture angle. PROVISIONAL 14 refines my M1 PROVISIONAL 6 ("normalization rides along
  with a real change") to "rides along only with a change *to that quest*". That's strictly safer, so I endorse it.

## 6. Process note (what to do differently next sprint)

- **Plan less surface, test more seams.** M2 had 36 committed ACs, and it took 2 fix rounds to get one property right (minimal diffs on hand-edited
  files). For M3 I'll write fewer ACs. Each one will name its **hostile fixture**, for example "AI returns prose instead of JSON", "`claude` hangs 120 s"
  or "check-in energy changes mid-job", so the builder writes the adversarial test *first*.
- **Viewport-scrolled evidence.** R2-BUG-1 slipped past retest 1 because the screenshots were full-page. Tester ACs for any async error
  state should require a **viewport** screenshot taken at the moment of the error.
- **Run the dev loop once.** Neither the builder nor the tester started `vite` + the proxy (to avoid `~/quest-data`). Next sprint, start it with
  a scratch `DATA_DIR`. The docs show how, so there's no excuse.
- **Architecture doc debt.** `docs/ARCHITECTURE.md` still says day frontmatter stores `coins, streak` (§2.4 says they're derived), and the
  status vocabulary still differs (`failed` vs `let_go`). Both wait on user confirmation, which is the existing backlog item. I'm not editing
  ARCHITECTURE.md while the user is asleep, because only confirmed decisions go there.
