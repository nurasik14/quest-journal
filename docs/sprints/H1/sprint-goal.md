# Hardening sprint H1: sprint goal (quest-builder)

> 2026-10-26 · async (the user is asleep, so every judgment call is **PROVISIONAL**).
> Inputs: `docs/BACKLOG.md` (open MUST/SHOULD), `docs/sprints/M6/review-{architect,designer,psychologist}.md`, `docs/PROGRESS.md` §M6 + fix 1, `docs/test-reports/2026-10-26-M6-retest1.md` (PASS).
> Process: `docs/PROCESS.md`, hardening = steps 2–4 on open backlog items. No new features.

## Goal
Make the app safe and honest for **daily real use on a phone**. That means:
- the return-after-a-gap experience (herbs, info lines);
- an unreachable laptop behaving like "offline", not an endless spinner;
- typed text never lost on a conflict;
- copy that is literally true;
- the first install and the data backup written down for Nurasyl.

## Selection
The rule: reviewer "first for hardening" picks first (psychologist §2.5/§5.3 and architect §3.1/§5), then whatever a real user hits in week 1–2. Items that only Nurasyl can decide (the backup remote, the release dir, HTTPS) are taken **only up to the documentation half**. Their backlog items stay open, with a note.

The only open MUST (#256, the tester's non-loopback browser run) is a tester task. The M6 retest already did it (architect review AC24), so the tester ticks it, not the builder.

| # | Backlog item | Why now |
|---|---|---|
| H1-1 | #236 `streakWalk` doesn't burn herbs on a gap it can't bridge | Psychologist: "take this first". The garden prints Longest + Current side by side |
| H1-2 | #237 + #228 + #208 info lines hide once today counts; Dismiss persists | The return moment, psychologist "first" set |
| H1-3 | #266 "A month ago today" read-only + count-up only | The one unprompted surface. Psychologist AC10 PARTIAL |
| H1-4 | #249 garden caption: no "Good days" | Copy truthfulness; the banned-word scan gets zero garden exceptions |
| H1-5 | #273 request timeouts (GET, mutation, SW navigation) | Architect "first": a sleeping PC = endless spinner on the phone |
| H1-6 | #299 offline state card on every route | Designer "first": offline Today is a blank page |
| H1-7 | #316 Notes 412 panel above the textarea + unsaved-text guard | Unsaved-text / 412 safety |
| H1-8 | #227 (+ builder COULD duplicate) Evening bonus moment | Evening economy refresh: the bonus earned by a rating is never told |
| H1-9 | #238 purchase retry with the same `request_id` (web + server tests) | Psychologist-AC19 unverified twice |
| H1-10 | #225 unaffordable/cooldown buy sheet has no Buy seal | A button that can only 409 is a false promise |
| H1-11 | #124 the reroll `too_long` pool path keeps its promise | "Too long" → "Study for an hour" breaks trust |
| H1-12 | #151 boss card first on **Monday only** | Tuesdays open with zero dailies visible |
| H1-13 | #287 first-install runbook in the README (builder half) | Architect §5: "tested" ≠ "deployed" |
| H1-14 | #279 / #283 doc halves: backup instructions + "don't run the unit from this checkout" | One disk failure loses the journal |
| H1-P | #270 process: "Merged / narrowed ACs" table (below) | Psychologist process note |

## Acceptance criteria

### H1-1 Herbs are never burned on a gap they can't bridge (#236)
1. At the first past (`< today`) non-counting, non-neutral day after a counting run, the walk measures the gap's **remaining** length: past, non-counting, non-neutral days up to the next counting day or today, with neutral (broken) days skipped and not counted. If the length ≤ `tokens`, it uses one herb per day (as before). Otherwise the run `rest`s on that first gap day and **no herb is spent**.
2. Fixtures (pure `streakWalk`):
   - 14 days (2 herbs) + gap 3 + 1 day → streak 1, herbs 2;
   - 7 days (1 herb) + gap 2 + today counts → rest, herbs 1, events `[bonus, token_earned, rest]`;
   - 7 days + gap 1 → bridged, herbs 0;
   - 14 days + gap 2 → bridged, herbs 0;
   - 7 days + gap 4 + today → streak 1, herbs 1, no `token_used`.
3. Today not counting yet is never part of the gap (P-AC8 unchanged). A broken day inside a gap is skipped, not counted.
4. The walk stays deterministic: recomputing ×3 gives the same result.

### H1-2 Info lines are for the return moment (#237, #228, #208)
1. A pure `todayCounts(day)` (web `ledgerRules.ts`) mirrors the server's `dayCounts`: a quest done/partial, a rating, or any non-blank highlight/notes/gratitude.
2. The info line (welcome back / herb used / streak rests) is hidden as soon as today counts. That's derived from the day data, so it stays hidden after a reload.
3. Dismiss writes the single overwrite-only key `qj.infoDismissed = "<logical date>:<kind>"`. A reload the same day keeps it hidden, and the next day's line can show again. If storage fails, there's a memory fallback.
4. Tests: a pure `infoLineFor` table covering:
   - `token_used` yesterday → shown;
   - one quest done → null;
   - a rating only → null;
   - dismissed key for today → null;
   - a dismissed key from yesterday → shown;
   - plus the localStorage allowlist test updated to name the new key.

### H1-3 "A month ago today" is read-only and count-up only (#266)
1. `this_day_last_month.quests` contains only `done | partial` quests.
2. The card link goes to `/archive?date=<date>` (the read-only day sheet) and reads "Open that page".
3. Tests: a server fixture with done + let_go + open quests → only the done one is in the JSON; a source test → the card link's href starts with `/archive?date=` and `Archive.svelte` has no `/evening/{m.date}`.

### H1-4 Garden caption (#249)
1. `gardenCaption` = "Days, not causes. Higher-rated days and these quests tend to show up together; that doesn't mean one made the other."
2. The `good days` allowlist entry is removed from the M5 banned-word scan, and the M6 caption assertion is updated.

### H1-5 Request timeouts (#273)
1. `api.ts` aborts a `GET` after `GET_TIMEOUT_MS = 10_000` and a mutation after `MUTATION_TIMEOUT_MS = 20_000` (PROVISIONAL).
2. A timed-out GET → `NetworkError` (→ offline banner + offline card).
3. A timed-out mutation → `TimeoutError` (a `NetworkError` subclass, so every existing handler still works), with `outcome: 'unknown'`. Mutation handlers show `COPY.maybeSaved`: "The laptop didn't answer in time. It may not have saved; try again." Retries are safe: PATCH/PUT set state, and a purchase replays by `request_id`.
4. The SW navigation races `fetch` against `NAV_TIMEOUT_MS = 3000` and serves the cached shell if the network loses. It stays network-first when the network answers in time.
5. Tests:
   - a stalled-fetch stub → `NetworkError` within the budget (injected small timeout);
   - a stalled mutation → `TimeoutError`;
   - pure `raceTimeout` with fake timers: the network wins / the timeout wins / the network rejects;
   - `worker.js` uses it for `shell`.

### H1-6 Offline state card (#299)
1. A shared `lib/components/OfflineCard.svelte`: `ScrollCard variant="quiet"` + an **info** `.qj-banner` (never `--danger`) + "Try again".
2. Shown on Today, Evening, Market, Garden and Notes when the page's first load failed with a `NetworkError` (including a timeout). Each route keeps its header. The global offline banner stays the only top message.
3. The Garden shows the offline card, not the red "Couldn't read the garden.", on a network failure. Non-network errors keep their existing copy.
4. Copy (PROVISIONAL, narrowed for truth, see the table): "Can't reach your laptop right now. Your pages are safe there; they open again once it's reachable."
5. Tests: source tests confirm every route renders `OfflineCard` and that `OfflineCard` has no `qj-banner--error`/`--danger`; the copy is in the banned-word scan.

### H1-7 Notes 412 panel and unsaved text (#316)
1. On 412 the panel renders **above** the textarea. It's scrolled into view and its heading is focused.
2. The sticky Save becomes "Save mine anyway" (one path) while stale.
3. At ≤ 400 px the actions stack full-width. "Copy my text" is primary.
4. A dirty Notes editor asks before unload (`beforeunload`), like Evening.
5. Tests: source order (stale panel before `<textarea`), the sticky label switch, the `beforeunload` guard.

### H1-8 Evening bonus moment (#227)
1. Evening seeds the bonus memory from its `/api/today` load (`setEconomy(economy, date)`). The save calls `setEconomy(res.economy, today)`.
2. If the save lands today's streak bonus, Evening shows ONE merged toast, "Sealed in the ledger. Another week in the ledger. +25 taels", plus the `streak` sticker beside the header seal. Otherwise the toast is "Sealed in the ledger."
3. Today doesn't replay it: the same in-memory `bonusMoment` set already has today.
4. Tests: pure `sealedToast(bonus, amount)`; `bonusMoment` seeded → a bonus from 0 → true once, then false on the next call (Today's load).

### H1-9 Purchase retry is charged once (#238)
1. Web: a pure `buyWithRetry(buy, item, requestId)` sends the **same** `request_id` on retry after a `NetworkError`. Market uses it.
2. Web test: a stubbed fetch where the server-side purchase commits but the response is lost (a network reject), then the retry → 200 `changed:false`. One debit, the same id twice, and the outcome copy is "Bought".
3. Server test: a replay of a committed `request_id` → the same purchase, `changed:false`, one row in `purchases.yaml`.

### H1-10 Unaffordable buy sheet (#225)
1. When `balance < price` or `available_on > today`, the sheet shows no red "Buy for N" seal. Instead it shows the sunk note, a **primary** "Save toward this" (or "Saving toward this ✓" if pinned), and a quiet "Close".
2. The race case (affordable at open, 409 on tap) keeps the current behaviour.
3. Test: pure `sheetMode(balance, price, availableOn, today)` table + a source test.

### H1-11 Reroll "too long" keeps its promise (#124)
1. `poolQuestSchema` accepts optional `minutes`.
2. In `selectReroll`, with `reason: "too_long"`, a candidate is excluded if its `minutes ≥ rejected.minutes` (when both are known) or if its title/why mentions hours or ≥ 10 minutes.
3. If nothing fits → null (the swap fails honestly and isn't consumed).
4. Test: a `too_long` reroll over a pool where the only same-difficulty candidate is "Study for an hour" → null, and a short one is picked when present.

### H1-12 Boss first on Monday only (#151)
1. `bossFirst('Tuesday') === false` and `bossFirst('Monday') === true` (test updated).

### H1-13 / H1-14 README: first install, backup, service safety (#287, #279, #283)
1. The README has a "First install (checklist)" section with the six steps from #287, each with the exact command and the expected result. Sign-off by the tester from Nurasyl's results stays open as a new backlog item.
2. The README has a "Back up your journal" section: the data dir is a git repo; a manual `git -C ~/quest-data push` to a **private** remote Nurasyl creates; a second-disk copy alternative; never a public remote. The app doesn't push (yet).
3. The README's service section says: don't enable the unit while agent sprints run in this checkout; check the logged data dir; Bun auto-loads `.env.local`/`.env.production` from the cwd.
4. A source test confirms the three headings exist.

## Merged / narrowed ACs (process item #270)

| Source AC | Change | Why |
|---|---|---|
| #236 fixture "today = gap day 2 with 1 herb → `rest` on gap day 1, herbs 1" | **Narrowed:** with today = gap day 2, only gap day 1 is *past*, so 1 ≤ 1 herb → bridged (herbs 0). It flips to `rest`, herbs 1, once gap day 2 is past (today = gap day 3), and that flip is never announced (`events_recent` only covers today/yesterday, and the rest is dated 2 days back) | The item's own rule ("past (`< today`) … days") and P-AC8 (today can still count) contradict that fixture. I kept the rule. Both instants are tested |
| #299 offline copy "You're offline. Your pages are safe on the laptop…" | **Reworded:** "Can't reach your laptop right now. Your pages are safe there; they open again once it's reachable." | Psychologist truth rule: a phone on Wi-Fi with the PC asleep isn't "offline" (architect §3.1 makes the same point) |
| #273 mutation timeout value | **Set:** 20 s (GET 10 s, nav 3 s), all PROVISIONAL | The architect gave none for mutations. An AI-free mutation is < 1 s locally, and 20 s is a generous upper bound for a phone over Tailscale |
| #287 runbook "signed off by the tester from his results" | **Split:** the builder writes the runbook. The sign-off is a new backlog item | It needs Nurasyl's hardware, and nobody can do it tonight |
| #279 off-machine backup | **Narrowed to docs:** manual instructions only. Opt-in `GIT_PUSH` stays open | It needs Nurasyl's choice of remote (brainstorm Q6.2) |
| #283 release-dir deploy | **Narrowed to docs:** the README warning only. `bun run deploy` stays open | The dir needs Nurasyl's agreement |
| #227 sticker "beside the header 済 seal" | Kept. The sticker sits in `.head-end` next to `SealStamp` | — |

## Not taken (stay open)
- Designer visual items (ramp retune, 3-month trim, evidence chips, BottomSheet migration, doc tasks) are the next hardening sprint's candidates.
- `gentle_restart` is a COULD.
- #257 HTTPS needs Nurasyl's decision.
- The tester evidence-debt items.
