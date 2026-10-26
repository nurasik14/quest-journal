# Sprint M4: goal (quest-builder)

> 2026-10-26 · Merged from `plan-architect.md` (A), `plan-designer.md` (D) and `plan-psychologist.md` (P).
> Scope: onboarding quiz → Claude drafts `kb/profile.md` → the user edits and saves. Reflect after the evening save → insight proposals →
> per-op Keep/Skip → `kb/insights.md`. Notes are treated as data.
> The user is asleep. Where the plans disagree I took the most conservative option, marked **PROVISIONAL** below.

## Conflicts resolved (PROVISIONAL)
| # | Conflict | Decision |
|---|---|---|
| C1 | Care path. A-AC5/AC9 want a model-written `care_message` that is never persisted. P-AC13 wants a local `CARE_PATTERN` plus `care: boolean`. D-AC13 wants fixed copy only. | Reflect schema is `{ops: [...0..3], care: boolean}`. The model never writes comfort text, so nothing can be persisted. A local `CARE_PATTERN` match on that day's highlight+notes → **no AI call**. `care:true` → all ops are discarded, no file is written, and the UI shows the fixed `CARE_NOTE` (P §F wording). |
| C2 | Evidence minimum. A wants schema `3..5`. P wants schema `1..5` with the validator raising the minimum. | Schema `1..5`, so a short op is dropped individually instead of failing the whole reply. Validator: `add` needs ≥3 distinct valid dates. `edit` needs ≥3 valid dates, with ≥1 not already cited on the bullet. `remove` needs `reason` only. |
| C3 | Re-run with a pending proposal. A re-runs when the hash changed and nothing is decided. P never re-runs while a pending proposal exists. | The evening PUT auto-enqueues only when **no proposal file exists** for the date **and** the input hash differs from the last attempt (in memory + `input_hash` on file). The manual `POST /reflect` may overwrite a pending proposal only if no op in it is decided. |
| C4 | Onboarding answers at rest. A and D say `localStorage`. P says memory only. | `localStorage` key `qj:onboarding:v1` (answers + draft), cleared on a successful profile save and on "Start over". There are no health or mood questions (P-AC1), so the data at rest is low-sensitivity. |
| C5 | Decide key. §2.7 uses `index`. A uses `op_id` + If-Match. | `op_id` + If-Match (proposal etag). |
| C6 | Old proposals. | Proposals older than 7 days are hidden from lists and the count, and stay `pending` on disk (P-AC15). |
| C7 | Button labels. | UI says **Keep / Skip** (D-AC10). The API keeps `accept: true/false`. |

## Acceptance criteria I commit to
**Routes and contracts**
1. `GET /api/kb/profile|insights` → 200 `{content, etag}` + `ETag` header. Insights also returns `items[]` and `unparsed_lines`. `PUT` without `If-Match` → 428. A stale etag → 412 with `current_etag`. More than 20k chars → 400 `too_large`. Non-JSON → 415. An unknown name → 404. A same-content PUT is a 200 no-op with no commit. *(A-AC1)*
2. `POST /api/onboarding/draft {answers}` → 202 `{job}`. 0 or >30 items, an answer >1,000 chars or a question >300 chars → 400. The job key is `onboarding`, so a second POST returns the same job. The result is `{draft}` (≤8,000 chars) plus `tone_warnings` codes. It **never writes** `profile.md`. A failure means the job is `failed`, with no fallback. *(A-AC2, P-AC4)*
3. The evening PUT returns `reflect_job` only when all of these hold: date ∈ {today, yesterday}; not private; no proposal file exists; the input hash changed; ≥3 non-private days in the 15-day window; no `CARE_PATTERN` match (that case returns `reflect: {care: true}` and no job). Five identical saves → 1 call. The hash covers satisfaction, mood, highlight, notes and quest outcomes, never gratitude. *(A-AC3, P-AC8, P-AC13)*
4. `POST /api/days/:date/reflect {}` → 202. No day → 404. Private → 409 `private_day`. Decided → 409 `already_decided`. Older than yesterday → 409 `too_old`. A failed job writes nothing. *(A-AC4)*
5. Reflect contract: zod and `--json-schema` both come from one definition, `{ops (0..3), care}`. Per-op validation drops invalid ops individually with no retry. Evidence dates must be in the sent window or the target date, exist, not be private, and be ≤ the target date. `edit`/`remove` ids must exist. `add` is refused at the cap (60 bullets / 8,000 chars; the prompt then switches to consolidation mode). Only the first 3 ops are used. *(A-AC5, P-AC9)*
6. `INSIGHT_BLOCKLIST` (P-AC10 regexes) → hard drop, unless the term appears in `profile.md`. Similarity >0.8 to a declined op from the last 30 days → drop (P-AC12). Soft tone warning on causal wording. *(P-AC10/11/12)*

**Sanitising and the injection boundary**
7. One sanitiser for every op text and every accept-time override: control chars and newlines → space, URLs → `[link removed]`, `<`/`>` removed, trimmed, 200 cap. Empty → dropped. The hostile fixture passes. *(A-AC6, P-AC17)*
8. Suspicious-op flag (`ignore|disregard|instruction|system prompt|assistant|you must|always respond`) → stored `flag: "suspicious"`, never auto-accepted, counted in `/api/health.claude.reflect_flags`. *(A-AC7)*
9. Nothing unapproved reaches a generation prompt: the `ZZPENDING`/`ZZREJECT` canaries are absent from generate_day stdin. Gratitude and private days stay out of the reflect context. Onboarding answers are wrapped in `<answers>` with `</` escaped. *(A-AC8, P-AC5)*
10. `care` results are never persisted (no file, no commit, no log text). *(A-AC9, C1)*

**Proposal storage and decide**
11. `kb/proposals/<date>.yaml` holds `schema, id, created_at, input_hash, base_insights_etag, status, ops[]`. Each op has `op_id` (`p-<date>-<n>`), `op`, `text`, `evidence`, `flag?`, `decision`, and `base_text` for edit/remove. 0 valid ops → no file. A broken file shows in `broken_files`, and decide on it → 422. *(A-AC10)*
12. `POST /api/insights/proposals/:id/decide {decisions:[{op_id, accept, text?}]}` + `If-Match`. Unknown proposal → 404. Unknown op_id → 400. Stale → 412. Repeating a decision → no-op. Changing a decision → 409. Under the insights lock: a missing target or changed `base_text` → `stale`. One write to each file, then one commit. *(A-AC11, P-AC14/16)*
13. Byte-preserving line edits to `insights.md`. The fixture (heading, blockquote, blank lines, a hand bullet, `%% comment %%`, CRLF) keeps every untouched line identical. A new id = max(insights ids, proposal ids) + 1. *(A-AC12)*
14. `GET /api/today` adds `pending_proposals` and `profile_empty`. `GET /api/insights/proposals?status=pending` → newest first. A bad status → 400. *(A-AC13, D-AC8/12)*

**Operational**
15. `AI_BOSS_ON_OPEN` (default true) controls the boss on open. ≤2 real calls. Commit messages: `qj: profile`, `qj: reflect <date>`, `qj: insights <date> accepted <n>`. *(A-AC14/15)*
16. Onboarding save, decide and evening save never change `earned_today`. *(P-AC7)*
17. With the untouched template, `isEmptyKb` still sees an empty profile. After a real save, the profile is in the next daily prompt. *(P-AC6)*

**UI**
18. `/onboarding`: full screen with no tab bar; hero + h1 + intro; one question per screen in a ScrollCard; focus on the h2; "Question N of M" progressbar; Back · Skip · Next sticky footer; the last button reads "Ask Maomao to write my notes"; the 15 `ONBOARDING_QUESTIONS` (P-AC1, banned-topic grep). *(D-AC1–4, P-AC1)*
19. Drafting loader keyed on the job id; failure state with "Try again" and "Write my notes myself" (template); a draft textarea (plain text) with "Save my notes", using the etag from **before** the quiz; 412 → stale notice with the text kept; save → top toast "Notes saved." → Today. *(D-AC5–7, A-AC2, P-AC4)*
20. Entry points: a dismissible invitation line on Today when the profile is empty; Profile shows "Start the onboarding quiz" or "Retake the quiz". *(D-AC8)*
21. Evening reflection block directly under the header/rating after Seal (loading / ready / none / failed / care / hidden on private or past dates); proposal rows with Keep/Skip (`aria-pressed`); editable add/edit text; evidence chips; "Apply my choices"; 済 on kept rows; the stale-row line; a top toast "Added to your notes."; the low-rating sticker is suppressed on the care path. *(D-AC9–11, D-AC13–14, P-AC14/15)*
22. Pending proposals at the top of `/profile` (same `ProposalList`); a jade dot on the Notes tab (no count). *(D-AC12)*
23. All strings live in `lib/copy.ts`. The banned-word scan covers them. No `{@html}`. No new colours. *(D-AC15–16)*

## Backlog items taken in
- MUST: everything above.
- SHOULD: toasts at the top of the viewport (backlog #492b, a precondition for 19/21); fallback banner copy by reason class (#465/#477, P-AC18); narrowing `SAFETY_BLOCKLIST` + a benign-corpus test (#464/#478, P-AC19); `HerbLoader` `[data-motion=reduce]` + trailing `…` strip (#495, a pre-approved theme edit).
- COULD: `AI_BOSS_ON_OPEN` (#474); evening `too_old` beyond 366 days (#434).
- Not taken: reroll too_long/small-win (P-AC20), the minutes/done_when chip, Monday-only boss-first, `showCoins`, preemption/shutdown COULDs, gentle restart.
