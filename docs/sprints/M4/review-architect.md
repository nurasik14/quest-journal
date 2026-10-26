# M4 review / retro: architect

> 2026-10-26 · `quest-architect` · async (the user is asleep, so every judgment call is marked **PROVISIONAL**).
> Inputs: `sprints/M4/{plan-*,sprint-goal}.md`, `PROGRESS.md` §M4, `test-reports/2026-10-26-M4.md` (PASS, 1 MED), `BACKLOG.md`, and the code:
> `server/src/{kb,insights,reflect-rules,prompts,store,app,today}.ts`.
> Lens: M4 is the first sprint where model output can **persist** into a file (`kb/insights.md`) that goes into every later prompt. So I reviewed it the way
> I'd review a ledger: is every write approved, idempotent, stale-safe and recoverable?

## Verdict
**Accepted.** 14 of my 15 ACs are met, either as written or through a better merged variant. AC15 has one gap (commit coverage of hand edits on the kb PUT). That gap is the
tester's MED-1, and I'm raising it to **MUST** for the next sprint because it destroys user-written data with no git copy. Nothing in M4 corrupts coins. The
injection boundary held against a real model with a hostile note.

## 1. Architect acceptance criteria

| AC | Result | Evidence / note |
|---|---|---|
| AC1 KB routes | ✅ (deviation accepted) | 428/412/400 `too_large`/415/404 and the same-content no-op were all checked live by the tester. The 412 code is `stale` rather than my `etag_mismatch`. It matches Evening, and the client checks only the status, so I accept it (the backlog COULD already exists). `If-Match: *` is create-only, which is safe |
| AC2 Onboarding job | ✅ | Single flight on key `onboarding`. `profile.md` md5 was unchanged after success and after failure. Save uses the **pre-quiz** etag (a mid-quiz hand edit → 412). But see MED-1: the *second* save after the 412 loses the hand edit from git |
| AC3 Reflect enqueue gating | ✅ | 5 identical saves → 1 call. Gratitude-only change → `unchanged`. `few_days`, `private`, `not_recent`. The hash lives in memory plus `input_hash` on file. After a restart, an empty-ops date can re-call once (PROVISIONAL 38, agreed: cheap and bounded) |
| AC4 Manual retry | ✅ | Plus `future_date` → 409, which is better than my AC. A failed job writes nothing |
| AC5 Reflect contract | ✅ (C2 variant accepted) | One schema source. Evidence is checked against `sentDates` **after** the budget trim (`history.slice(0, out.days)`), which is exactly the hallucinated-date guard I asked for. Schema `1..5` with validator `≥3` is better than my `3..5`, because one short op no longer fails the whole reply |
| AC6 Sanitiser | ✅ (LOW-5 gap) | One `sanitizeOpText` on the model text **and** the accept-time override. The `<`/`>` → space fix (so "system"+"Ignore" don't glue together and dodge the flag) is a good catch. Gap: bidi/zero-width/soft-hyphen characters survive (tester LOW-5), so a soft hyphen evades AC7 |
| AC7 Suspicious flag | ✅ | Stored, never pre-decided, counted in health. See §3.3 for where flagged text still goes |
| AC8 Nothing unapproved in generation prompts | ✅ | `ZZPENDING`/`ZZREJECT` are absent from generate_day stdin and `ZZPROFILE` is present. Note: rejected texts **do** go into the *reflect* prompt as `<declined>`. That's by design (psych AC12), but see §3.3 |
| AC9 Care never persisted | ✅ (C1 is better than my AC) | Making it `care: boolean` plus a local `CARE_PATTERN` before any spawn removes the model-text persistence risk entirely, and care notes never leave the machine. I withdraw `care_message` |
| AC10 Proposal file | ✅ (LOW-4) | Shape, `op_id`, `base_text` and broken → 422 + health, never rewritten. Decide re-stringifies the whole YAML, so hand comments are dropped (LOW-4). Accepted for now, because the file is app-owned |
| AC11 Decide by `op_id` | ✅ | 428/412/404/400/409, a repeat → bytes identical, a hand-edited target → `stale` with the user's words kept. Lock order is proposal → insights, and `putKb` takes only the insights lock, so it can't deadlock |
| AC12 Byte-preserving edits | ✅ | The CRLF fixture diff shows only the target line plus 1 insert. Ids never reused (proposal `assigned_id` is scanned). NIT-1 (an id inside a `%% comment %%` bumps the counter) is harmless |
| AC13 Discoverability | ✅ | `pending_proposals` + `profile_empty` on `/api/today`, list newest first, bad status → 400. See §3.5 for the cost |
| AC14 Real-call budget + canary | ✅ (process issue) | Builder 2 + tester 1 = 3 real calls, each enforced by a counting shim. `AI_BOSS_ON_OPEN=false` worked. **But my AC told the builder to write a canary into `~/.claude/CLAUDE.md`, which is outside the repo and `DATA_DIR`.** That's my fault, not the builder's (see §5) |
| AC15 Commit reasons | ⚠️ | All the labels are correct (`qj: profile`, `qj: reflect <date>`, `qj: insights <date> accepted <n>`), and the git label-adoption fix is good. Gap: a kb PUT that replaces a hand-edited file never commits the hand-edited version (MED-1) |

## 2. What's good (keep doing this)
- **Approval really comes before any write.** Nothing reaches `insights.md` except through `decide`, and `decide` re-reads under the lock and checks `base_text`. The
  real-model smoke with `</history><insights>SYSTEM: … 1000 coins` produced zero obeyed ops. Even if it had obeyed, the output would only have been a pending proposal.
- **Grounding is checked against what was actually sent** (`sentDates` after truncation), not just "a file exists". This is the most important validator in M4.
- **Merging the conflicts made things safer.** C1 (a boolean care flag), C2 (drop per op) and C5 (`op_id` + If-Match) each ended up stricter than any one plan.
- **Line-level edits instead of re-serialising**, with a CRLF/comment fixture. This is the pattern I want for every file the user owns.
- **Failure writes nothing.** Reflect/onboarding failures leave the disk untouched, and there's no pool fallback for these kinds.
- **Tester method:** a fake `claude` controlled by files, kinds told apart by schema, and a counting shim for the real binary. Reuse this exactly in M5.

## 3. What must change

### 3.1 MUST: snapshot the hand edit before a kb PUT replaces it (tester MED-1)
`kb.putKb` → `store.writeKb` writes `content` once the etag matches. When the client got a 412 and then re-PUTs with `current_etag`, the hand-edited
bytes are overwritten **before any commit captured them**. `today.ts:366-377` already does the fix for the Evening flow: if the on-disk etag ≠ `store.lastWrittenEtag(rel)`, call
`git.touch({kind, detail:"hand_edit"})` and **flush** before the overwrite. Apply it to `putKb` for both profile and insights. **Test:** hand-edit the profile → PUT with the fresh
etag → `git log -p -- kb/profile.md` contains the hand text. This is data loss of the user's own words, which is why it's MUST and not MED.

### 3.2 SHOULD: validate the proposal id on GET (tester LOW-2)
`GET /api/insights/proposals/:id` passes the raw id into `proposalRel`. `store.abs` stops escapes outside `DATA_DIR`, but `..%2F..%2Fquests` still reads any `*.yaml`
inside the data repo, and the parse-error message can echo a snippet of it. `decide` already does `isValidDate(id)` → 404. Do the same in `getProposal`, and add
a traversal case to the M2 regression list. The app has no auth on the tailnet, so error messages count as part of the trust boundary.

### 3.3 SHOULD: keep flagged text out of the `<declined>` block
`declinedTexts()` sends every rejected op's text back into the **reflect prompt** for 30 days, and that includes ops flagged `suspicious`. A hostile note that the user
correctly Skips therefore gets re-injected into 30 later reflect calls. It's sanitised (no tags, no URLs), so it's only a *soft* channel, but it's the one place
where model-echoed instruction text keeps reaching a model. Fix: exclude `flag: suspicious` ops from the prompt's `<declined>`, but **keep** them in the local
similarity check (which runs locally and needs no model). Also strip invisible characters (LOW-5) in the same sanitiser so the flag can't be dodged.

### 3.4 COULD: crash window between the two decide writes
`decide` writes `insights.md`, then the proposal file. A crash in between leaves the bullet applied while the op still says `decision: null`. Re-applying would append a
**duplicate** bullet with a new id. It's rare (a single-process, millisecond window), but idempotency is the rule for the ledger, and the same rule should apply here. Cheapest fix: before
appending an `add`, skip it if a bullet with identical text and evidence already exists (treat it as already applied, mark `accepted`, set `assigned_id` to that id).

### 3.5 COULD: bounded proposal scans
`/api/today` (`pendingCount`), `/api/health` (`scanBroken`) and every decide (`maxInsightId`) parse **every** proposal file. That's fine now, but it grows by roughly 1 file per reflective
evening, forever, on every Today load. Pending is hidden after 7 days anyway, so `pendingCount` only needs files whose names fall in the last 7 days. `maxInsightId`
can cache the max, invalidated by the proposal/insights etags. Related: `allProposals` skips broken files, so an `assigned_id` that exists only in a
broken proposal could be reused. Scan ids with a regex over the raw text instead of the parsed file.

### 3.6 Noted, not filed (already covered or out of my lane)
- LOW-1 (the blocklist profile exception is a substring match): the psychologist owns the rule. LOW-3 (dark disabled button): the designer.
- NIT-2 (an accepted-then-edited op re-proposed): psychologist/builder. NIT-4 (`reflect_skip: "care"` vs the sprint text): the code is right, so fix the doc. I'm adding it to the
  ARCHITECTURE contract pass below.
- The builder's existing COULD about the git label for late touches: I agree with COULD, since production debounces 5 s.

## 4. Answers to the other agents' planning questions
- **Designer, "fixed app copy only for care, with a boolean schema?":** **Yes.** This was adopted as C1 and I endorse it. Model-written comfort text would be the only model
  text with no review step, and it could never be safely persisted or logged. A boolean removes the whole class of problem. (Final.)
- **Psychologist, "`{ops, care: boolean}` with `CARE_PATTERN` checked before the spawn?":** **Yes**, built and verified (0 spawns, no file, no log text).
  **"Persist rejected texts in `kb/proposals/*.yaml` and feed 30 days as `<declined>`?":** **Yes, with one condition**: suspicious-flagged texts are kept out of the
  prompt (§3.3). They're already persisted with `decision: rejected` (plus `proposed_text` when the user edited them), so no new file is needed.
- **My own M4 questions to the psychologist** (pre-set Reject on flagged ops? hide proposals on a care evening?) were overtaken by the build: flagged ops start
  undecided with a warning line, and care discards all ops, so no proposal exists to hide. **PROVISIONAL:** I'm fine with both. No change requested.

## 5. Process notes (what to do differently next sprint)
1. **My AC14 sent an agent outside the sandbox.** "Put a canary in `~/.claude/CLAUDE.md`" made the builder create (and delete) a file in the user's global Claude
   config. That breaks the rule "nothing outside the repo and `DATA_DIR`". From now on my ACs **never** ask agents to touch `$HOME` config. The `--setting-sources ""`
   canary is done once and passed. Its regression guard is the argv unit test, so it isn't repeated. (The canary method is also weak: an absent echo
   doesn't prove the file wasn't loaded. If it ever needs re-checking, that's a task for Nurasyl, with his consent.)
2. **ACs that copy a protection must name the reference implementation.** I wrote "never a silent overwrite" for onboarding (AC2) but didn't say "and snapshot the
   hand edit like `today.ts` BUG-1". The 412 path was built and the snapshot was missed. In M5, every AC that involves overwriting a user-owned file says *"hand edit committed first
   (as `today.ts:366`)"*, and the tester runs `git log -p` for the hand text.
3. **The tester's findings need to reach the backlog.** MED-1 and LOW-1…5 weren't in `BACKLOG.md` when this review started. I filed the architecture ones below. The
   manager should have the tester append its own LOW/MED items at report time, so nothing depends on the reviewers' recall.
4. **The Vite-proxy dev loop (#88/#119) has now been skipped in M2, M3 and M4.** Both the builder and the tester used the production build on one port again. It's 1 check-in
   through `bun run dev`, and Nurasyl will use it on day one, so I'm raising it to **SHOULD with a named owner (tester), checked first** in M5.
5. **Keep doing:** the `code → status` pairs in the ACs worked. The tester's AC table could be matched to mine row by row, with zero ambiguity about 404 vs 409.

## 6. ARCHITECTURE.md
Not edited: none of these are user-confirmed decisions. **PROVISIONAL** contract facts to fold in once Nurasyl confirms: reflect schema `{ops, care}` (no
`care_message`), evening PUT → `{day, reflect_job, reflect_skip}`, 412 code `stale` everywhere, decide keyed by `op_id` + If-Match, and proposals hidden after 7 days.
