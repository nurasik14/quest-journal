# H1 sprint review / retro: architect

> 2026-10-26 · `quest-architect` · async (the user is asleep, so nothing here is confirmed by Nurasyl). Every judgment call is marked **PROVISIONAL**.
> Inputs: `sprints/H1/sprint-goal.md`, `PROGRESS.md` §H1 + §H1 fix, `test-reports/2026-10-26-H1{,-retest}.md` (retest = **PARTIAL**: only LOW-3 is open, 765 tests green), `BACKLOG.md`.
> Code read: `web/src/lib/{http,purchase}.ts`, `web/src/sw/{route,worker}.js`, `web/src/routes/{Market,Evening}.svelte`, `web/src/lib/components/NotesEditor.svelte`, `web/src/lib/eveningForm.ts`, `server/src/{shop,fallback,generation,app,init}.ts`, `README.md` (backup / service / first-install).
> There's no git repo here, so I reviewed the files as they are now, not a diff.

## 1. Verdict
**Accepted for my areas, with one new SHOULD (§3.1).**

H1 had no architect plan. The sprint goal took my M6 review items directly: §3.1 timeouts → H1-5, §3.2 backup → H1-14, §3.3 service safety → H1-14, and process note 1 (runbook) → H1-13. So I grade those, plus the integrity side of H1-1 (streak/herbs) and H1-9 (purchase retry). The H1-1 and H1-9 changes touch the economy ledger.

All the timeout work is sound. It's well layered: a DOM-free `http.ts`, a pure `raceTimeout`, and a `TimeoutError` that carries an `outcome`. The tester checked it live with a real `SIGSTOP` hang.

One gap remains. The design says "a retry after an unknown outcome is safe" (`http.ts` header comment). That's true for **data**, but not for the **story the user is told**. On the two `If-Match` routes (Evening PUT, Notes PUT), retrying a save that actually committed gets a 412: "this page changed elsewhere". The only change on disk was the user's own save (§3.1).

## 2. Architect ACs (from my M6 review), one by one

| Source | H1 AC | Result | Evidence / note |
|---|---|---|---|
| M6 §3.1 GET timeout → offline | H1-5.1/5.2 | PASS | GET 10 s, read **including the body** inside the same budget, which is better than I asked for. Live: an offline card after 10.5–10.8 s |
| M6 §3.1 mutation timeout = unknown outcome | H1-5.3 | PASS, see §3.1 | `TimeoutError.outcome = 'unknown'` + `COPY.maybeSaved`. Today re-reads after a timed-out PATCH (the tester saw "Done. +20" restored). NIT-2 fix: a timed-out mutation no longer raises the "Nothing was lost" banner. That's correct, because it would contradict the unknown outcome |
| M6 §3.1 SW nav race | H1-5.4 | PASS | `raceTimeout(fetch(req), 3000, shell)`. With an empty cache it keeps waiting for the network, which is the right call on a first visit. Healthy navigation stays network-first (73 ms). `/api/*` is still never intercepted |
| M6 §3.1 idempotent retries | H1-9 | PASS | `buyWithRetry` sends the same key once. Market keeps `pending.requestId` across a manual re-tap after a `NetworkError` and clears it only on a definite answer. On the server, the replay check sits inside the `purchases.yaml` lock, and a key reused for a different item → 409 `request_conflict`. Live: commit + dropped response + retry → 200 `changed:false`, 1 row, 1 debit |
| M6 §3.2 backup | H1-14 (doc half) | PASS (docs) | README: private remote or second disk, never `--force`, never public, `GIT_PUSH` unset, restore = `git clone`. Opt-in push stays open (#279 line 280), which is correct |
| M6 §3.3 + §3.7 service runs the dev checkout / implicit dotenv | H1-14 (doc half) | PASS (docs) | The README warning names both risks and points at the logged data dir. The release dir (`bun run deploy`) stays open, which is correct until Nurasyl agrees |
| M6 process 1: tested ≠ deployed | H1-13 | PASS (runbook) | Six steps with commands and the expected output. The sign-off was split into a new SHOULD that needs Nurasyl's hardware. That's the honest split |
| M6 AC24 / #256 non-loopback | — | PASS | Re-run live over `http://10.10.110.161` (insecure origin): fallback v4 `request_id`, unlisted Host → 421 |
| Economy integrity of H1-1 | H1-1.1–1.4 | PASS | `gapAhead` is pure and derived from the day files, with no stored herb counter. Deterministic ×3 and perf unchanged (p95 84 ms). See §3.4 for one property the psychologist should know about |

## 3. What's good, and what must change

### Good
- **The outcome is part of the error type.** `TimeoutError extends NetworkError` let every existing handler keep working, and `failureCopy(e)` makes "which sentence is true" a single pure function rather than per-route guesses. This is the structural fix I hoped for.
- **The purchase key survives a manual re-tap.** That closes the case `buyWithRetry` alone wouldn't: both attempts fail, and the user taps again later.
- **The "Merged / narrowed ACs" table worked.** The builder's #236 narrowing ("only past days are the gap") matches the rule, and the tester confirmed it live at three dates. Keep the table.

### 3.1 SHOULD: after a timed-out save, the retry reports a false conflict on Evening and Notes
**The sequence:**
1. The PUT commits on the server.
2. The response is lost: a timeout, or a dropped connection.
3. The user sees "It may not have saved; try again" and taps Seal / Save again.
4. The retry sends the **old** ETag, so the server answers 412.

**What the user sees next:**
- **Evening:** `rebaseForm` finds 0 conflicts, because the disk matches the form. But the code still un-stamps the seal and toasts "Not sealed yet. This page changed elsewhere". Both claims are false: the page *is* sealed, and nothing else changed it.
- **Notes:** the panel says "This page changed on disk since you opened it…". The only change on disk is the user's own text.

**Scope:** no data is lost ("Save mine anyway" rewrites identical bytes). But it's the exact "two stories" problem NIT-2 fixed for the banner, now on the main write path. A sleeping PC on a phone makes it likely in week 1.

- ✦ **Concept: an idempotent PUT.** An idempotent request has the same effect whether it runs once or several times. `If-Match` protects against a *lost update*, meaning someone else's change being overwritten. If the body you send equals what's already on disk, no update can be lost, so there's nothing to protect, and the honest answer is "already saved".
- **Proposal (PROVISIONAL):**
  - **Server:** on `PUT /api/days/:date/evening` and `PUT /api/kb/:name`, if the If-Match is stale **but** applying the body would produce the current on-disk content, return **200 `changed:false`** with the current ETag. Today a stale If-Match always means 412. For Evening, compare the managed fields after normalizing. For kb, compare the content bytes.
  - **Client fallback:** Evening treats a 412 whose rebase has 0 conflicts **and** a disk equal to the form as sealed, so it shows no stale panel.
- **Test:** for each of the two routes, a fetch stub where the server commits and the response is lost, followed by the retry with the old ETag → 200, no stale panel, no "changed elsewhere" copy.

### 3.2 COULD: one principle for LOW-3, plus a case it doesn't cover
The tester's LOW-3 fix is right: trust the rejected quest's explicit `minutes` and keep max() for candidates. I'd state it as one rule, so the next tweak doesn't break it: **estimate each side in its conservative direction.**
- The rejected quest's length should lean **long** only when it's unknown. When it's known, use the field.
- The candidate's length should lean **long** always.

The current code breaks the second half in one spot. `fitsTooLong` returns `true` when the candidate's estimate is `null`, so a candidate of unknown length passes against a known 5-min quest. Today only the rest day has no `minutes`, so the impact is nil. But AI replies and hand-added pool entries may lack the field.
- **Proposal:** against a known length, a candidate of unknown length is excluded on the pool path. The AI path already carries `minutes`.
- I'm filing this separately from LOW-3 because it's a different branch.

### 3.3 COULD: seed improvements never reach an existing data dir
The 47 new `minutes:` values only reach data dirs created from now on, because init copies the seed once and `quests.yaml` is user-owned after that. `~/quest-data` doesn't exist yet, so Nurasyl isn't affected **today**. But this is the first time the seed improved after users could have had a copy, and it will happen again.
- ✦ **Why this matters:** the data dir is the source of truth, and the user may have edited it by hand. A silent overwrite would destroy hand edits.
- **Proposal (PROVISIONAL):** an explicit `bun run pool:merge [--dry-run]`:
  - it matches entries by title and only **adds** missing fields, never overwriting a value that's already set;
  - it writes as its own git commit (`qj: pool merge (N fields)`);
  - it's never run automatically.

### 3.4 Noted for the psychologist, no item: herbs can be refunded after a "herb used" line
With the #236 rule, a gap that's bridgeable on Wednesday (`token_used`, "A preserved herb kept your streak") can become unbridgeable on Thursday:
- the run rests;
- the herbs come back;
- the earlier `token_used` event disappears from the derived history.

That's the correct consequence of a **derived** ledger (no stored counter, so no drift), and it can't revoke coins: bonuses inside the run are untouched, and none exist after the gap. Whether a seen "herb used" line that later reverses needs copy is a motivation question. No architecture change.

### 3.5 Noted, no item: two smaller residuals
- **Worst-case wait on Buy is about 40 s.** A 20 s timeout, then the 20 s auto-retry, before "Not sure it went through". It's acceptable because the key is kept. If it bothers him in real use, skip the auto-retry on a `TimeoutError` only, and keep it for a fast refusal.
- **An aborted fetch doesn't cancel the server.** A slow "done" PATCH could in theory land after a later "undo". But writes take under 1 s, AI never holds a day lock (jobs return 202), and there's a single user. Today's re-read after a timeout shows the final state. I accept it (PROVISIONAL).

## 4. Answers to other agents' planning questions
- **Builder (PROGRESS §H1 fix): should a pool `too_long` swap drop one difficulty level when nothing shorter exists?** **Not silently (PROVISIONAL).**
  - **Technically:** it's coherent. The award reads the stored quest's own difficulty, and award-once is keyed by quest id. So an easy replacement would correctly earn easy coins, with no ledger risk.
  - **Contract:** the day's difficulty mix is part of the generation contract in ARCHITECTURE.md, and changing it is a motivation call, so it needs **psychologist** input.
  - **If they want it:** make it an explicit second offer in the UI ("Nothing shorter at this level. Take an easy one instead (+N taels)?"). The swap would be consumed only when he accepts, and the answer would carry a new reason code, so the server never changes the difficulty on its own.
  - **Until then:** keep the honest failure.
- **Builder (H1 open questions): backup remote, release dir, HTTPS.** These are Nurasyl's decisions, and they're already backlog items (#279 line 280, #283, #257). No architect answer replaces his choice. My recommendation stays: a private remote plus `tailscale serve` (never `funnel`), and a release dir at `~/.local/share/quest-journal/app`.
- **Designer (Today's offline header without a date):** out of my lane. On data: the client *could* derive the logical date locally (4 a.m. rollover in `Asia/Almaty`). But that would duplicate the server's day-boundary rule in a second place, so I'd keep the plain h1.

## 5. Process note (for the next sprint)
1. **Test the unknown-outcome path for every mutation, not just one.** H1 tested "commit + lost response + retry" for purchases only, and §3.1 is the same scenario on the other two write paths. Next sprint: a parametrized test over the mutation route table (the M6 economy-invariant test already lists the routes). For each route it runs the request, drops the response, retries, and expects the final state plus a truthful UI copy key.
2. **The test oracle must be independent.** LOW-3 survived the fix round because the exhaustive test compared picks against `estimateMinutes`, the same function being fixed. Rule for the builder: assert against the data (`minutes:` in the seed) or a hand-written table, never against the code under test.
3. **Hardening sprints without reviewer plans worked, if the goal cites the review sections.** H1 did that well. For H2 I'll still write a short `plan-architect.md` (at most 6 ACs), so ownership of each AC is explicit and the tester knows whose bar applies.

## PROVISIONAL (this review)
1. §3.1: a stale If-Match whose body equals the disk content → 200 `changed:false`. This is a small change to the M2 concurrency contract. It doesn't loosen it, because no write happens.
2. §3.2: the conservative-direction rule, including excluding unknown-length candidates on the pool path.
3. §3.3: an explicit, add-only `pool:merge`.
4. §3.5: I accept the 40 s worst-case wait on Buy and the theoretical PATCH reordering.
5. §4: no silent difficulty drop on a `too_long` swap, and it needs the psychologist's input.
6. Nothing here changes ARCHITECTURE.md. If Nurasyl confirms §3.1, the concurrency section should then say "a stale If-Match with an identical body is a no-op success".
