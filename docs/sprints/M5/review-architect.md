# M5 review / retro: architect

> 2026-10-26 · `quest-architect` · async (the user is asleep, so every judgment call is marked **PROVISIONAL**).
> Inputs: `sprints/M5/{plan-*,sprint-goal}.md`, `PROGRESS.md` §M5 + §"M5 fix round 1", `test-reports/2026-10-26-M5.md` (PARTIAL) and
> `2026-10-26-M5-retest1.md` (PASS, 1 new LOW), `BACKLOG.md`, and the code: `server/src/{economy,shop,app,today,store,git}.ts`,
> `web/src/routes/Market.svelte`, `web/src/lib/api.ts`.
> Lens: M5 is the first sprint where the app holds **a number the user can spend**. I reviewed it as a ledger: can the balance be inflated, can a coin be awarded
> twice, does a broken file fail toward "too low", and does the whole thing work on the phone it's built for?

## Verdict
**Accepted on the server; one MUST on the client before M6 ships to the phone.**
- All 18 of my ACs are met (AC3 through the merged psychologist formula, which I accept).
- The economy core is the best-built part of the app so far: one pure function, derived earnings, stored spending, and fail-safe asymmetry, all implemented as designed.
- The tester confirmed it against independent hand-calculated fixtures.

**The blocker is in the client.** `Market.svelte:148` calls `crypto.randomUUID()`. Browsers expose that method only in a **secure context**: HTTPS or `localhost`.
ARCHITECTURE.md plans phone access over plain `http://<tailscale-ip>:PORT`. On the phone, every Buy tap would throw a `TypeError` before the request is sent, and the
call sits outside the `try`, so nothing appears on screen. Every test ran on `localhost`, which counts as secure, so no test could catch this. Details are in §3.1.

## 1. Architect acceptance criteria

| AC | Result | Evidence / note |
|---|---|---|
| AC1 One pure ledger | ✅ | `economy.ts` imports only `clock` date maths (`addDays`, `isoWeek`, which are pure) and domain constants. No fs, `now()` or RNG. Every coin surface goes through `shop.economy()` → `computeEconomy`. The tester saw the same 455 on all 5 screens. **Gap:** the evening PUT doesn't return `economy` (§3.2) |
| AC2 Earnings | ✅ | Future files → 0 + `future_file`. `coins > 100` → `coins_clamped`. Legacy top-level keys ignored. AI `coins:999` ignored. Good extra: `store.ts:364` rejects a day whose frontmatter `date` ≠ file name, so a copied day file can't earn twice. I hadn't asked for that, and it closes a real double-earn path |
| AC3 Boss earnings | ✅ (merged formula accepted) | Psychologist formula, capped by `clamp(snapshot ?? 100, 0, 100)`. Table test green. Tester: done + `coins: 40` → 40, 3 ticks open → 45 |
| AC4 Idempotent awards | ✅ | Derived from status, so the 10-way race gives +tariff once. The bonus undo/redo cycle 155 → 175 → 165 → 175 never doubles `bonus_today`. The UI keys the reaction off `changed` |
| AC5 Streak + tokens by replay | ✅ (P-AC11 variant accepted) | `streakWalk` is a straight-line replay, with nothing stored. A broken day is neutral instead of a break. I agree it's the better rule, because a YAML typo should never cost a streak. The 26-day tester timeline matched on every field. 03:59/04:00 and the Berlin DST week are green |
| AC6 Invariance | ✅ | The `/api/economy` diff stays empty after a 5k-char evening on an already-counting day, a profile PUT, a reroll and a check-in |
| AC7 `purchases.yaml` schema | ✅ | Block style, `schema: 1`, snapshots, and unknown keys + comments survive 8 app writes. A missing file = empty (balance 0, not null) |
| AC8 `POST /api/purchases` | ✅ (one accepted deviation, see §3.3) | 400/409 codes match. The replay check happens before *and* inside the lock. Concurrent buys → one 201 + one 409. Earnings are gathered **before** the lock (tester NIT-5). The worst case is a balance that ends below zero by one quest's tariff, never an inflated one |
| AC9 Cooldown in logical days | ✅ | A purchase at 01:30 → previous logical date. `available_on` comes from the newest non-voided purchase |
| AC10 Void | ✅ | 404 / 409 `void_window_closed` / idempotent second void. Nothing deleted. Minor: a hand-edited `at` in the future keeps a purchase voidable forever (`now - at` is negative). It's the user's own file, so this is a COULD |
| AC11 Broken files fail safe | ✅ | `readSpend()` returns `file: null`, never `[]`, which closes risk #1 from my plan. 422 with `raw` + `line`, md5 unchanged. The `econ.balance ?? 0` inside the lock is unreachable (`parsed` is always valid there), so it's harmless, but see §3.4 |
| AC12 Negative balance | ✅ | The true number comes back, purchases are refused, and the UI shows `−20` (U+2212) with no debt framing |
| AC13 Routes | ✅ | Shapes match, including `purchases_error`, `voidable` and the one-pin wishlist |
| AC14 Commits | ✅ | `qj: purchase hand_edit` comes before the app write. A `changed:false` response never touches git. `git.ts:173` skips empty commits, so the post-restart "hand edit" check (`lastWrittenEtag` undefined) is harmless |
| AC15 Performance | ✅ | p95 84 ms over 400 days + 58 weeks + 300 purchases (budget 150). Measured before caching, as asked |
| AC16 kb PUT hand-edit snapshot (MUST carry-over) | ✅ | `kb.ts:532`. `git log -p` shows the ZZ42/ZZ77 canaries. This closes the only M4 data-loss gap |
| AC17 Proposal id guard | ✅ | Traversal ids → 404 |
| AC18 Invisible-char strip + `<declined>` | ✅ (partly unit-only) | Soft hyphen, ZWSP, word joiner, BOM and bidi characters are stripped before `SUSPICIOUS_OP`. The `<declined>` exclusion was checked by unit test only. That's acceptable, because no prompt changed |

## 2. What's good (keep doing this)
- **The derive-vs-store split held up under real tests.** Every tricky case the tester tried (backfill moving a bonus, undoing the 7th day, hand-edited adjustments) gave
  a balance that a human could recompute from the files. That's the whole point of not storing a counter.
- **The fail-safe direction is commented right where it matters** (`shop.ts` `readSpend`, the `economy.ts` header). The next person can't "simplify" it into `?? []` by accident.
- **Lock discipline.** Only the purchases lock is taken on the spend path. No day lock is nested inside it, so it can't deadlock against PATCH. Replays are answered before the
  item lookup, so a retried tap is idempotent even after a reward is renamed.
- **Atomic writes** (`store.ts:121` tmp + rename) mean `gatherEarnings` can read days without a lock and never sees a half-written file.
- **An economy simulator exists** (`bun run econ:sim`), so tuning the numbers is no longer guesswork.
- **The fix round was tight.** Only 3 client files changed, `server/src` was untouched, and every finding was re-verified live.

## 3. What must change

### 3.1 MUST: `crypto.randomUUID()` breaks buying over plain-HTTP Tailscale
- **Where:** `Market.svelte:148`. Browsers expose `crypto.randomUUID()` only in secure contexts. `crypto.getRandomValues()` works everywhere.
- **What happens:** on `http://100.x.y.z:PORT`, `crypto.randomUUID` is `undefined`. The tap throws before `buying = true` and outside the `try`, so the sheet just sits there.
- **Fix (client, tiny):** a `newRequestId()` helper in `lib/` that uses `crypto.randomUUID` when it exists. Otherwise it builds an RFC 4122 v4 UUID from
  `crypto.getRandomValues(new Uint8Array(16))` (set the version and variant bits so the server's UUID regex still passes). Move the call inside the `try`.
  Test: a unit test with `randomUUID` deleted from the global returns a UUID that matches `shop.ts`'s regex.
- **The bigger decision behind it (M6, PROVISIONAL, needs Nurasyl):** a **service worker also needs a secure context**, so the M6 PWA can't install over plain HTTP either.
  - My recommendation: keep the app bound to `127.0.0.1` and put it behind **`tailscale serve`**. That serves HTTPS on `https://<machine>.<tailnet>.ts.net` with an automatic certificate, and only tailnet devices can reach it.
  - Then the Host allowlist must accept that `*.ts.net` name, and README/ARCHITECTURE change "open `http://<tailscale-ip>:PORT`" to the `https://…ts.net` URL.
  - Keep the fallback from the fix above anyway, so a plain-IP dev access still works.

### 3.2 SHOULD: every response that can change the economy must carry `economy` (tester NEW-LOW-1)
- **The rule I wrote was a list of routes, not an invariant.** A rating save can make today count, which completes a 7-day run, so the evening PUT changes the balance
  (+25) and herbs. But `PUT /api/days/:date/evening` returns only `{day, reflect_job, reflect_skip}`.
- **Two visible effects:**
  - The Evening badge stays stale.
  - The bonus toast never shows at all. By the time Today loads, `bonus_today` is already set, so the "only on the tap that earned it" rule never fires.
- **Restated as an invariant:** *any mutation whose inputs feed `computeEconomy` returns `economy`.* Today that means the quest PATCH, evening PUT (including a backfill), check-in,
  reroll, purchase, void and wishlist routes.
- **Client side:** Evening feeds the store from it and shows the bonus toast when `bonus_today` rose versus the pre-save value.
- **Test:** a route-table test that runs every mutation and asserts `economy` is present.

### 3.3 SHOULD: re-check earnings inside the purchase lock (tester NIT-5)
- **The trade-off as built:** `updateYaml`'s mutator is synchronous, so `gatherEarnings()` runs before the lock.
- **The gap:** a `PATCH done→open` that lands between the gather and the append lets a purchase pass on the pre-undo balance.
- **Impact:** small (at most one tariff, and the balance stays truthful). But it's the one place where a race gives the user something the ledger later says they couldn't afford.
- **Cheapest fix, no new lock nesting:** inside `withFileLock(purchases)` (an async variant of `updateYaml`, or a re-gather before calling `update`), re-run
  `gatherEarnings()` (reads only, no day locks, so there's still no deadlock risk) and check the balance against that.
- **Test:** inject a delay hook between the gather and the append, then fire an undo PATCH during it. The purchase must end with a 409.

### 3.4 COULD: remove the dead `econ.balance ?? 0`
- **Where:** `shop.ts`, inside the purchase lock.
- **Why:** if it ever became reachable (for example, a future refactor that passes a nullable spend), a null balance would read as **0**. That fails toward refusing a purchase,
  so it's not dangerous, but it contradicts the "never read null as zero" rule.
- **Fix:** replace it with an explicit `if (econ.balance === null) throw 422`.

### 3.5 Known property to put in front of Nurasyl (not a bug): earned history can move retroactively
- **What happens:** a backfill, or a hand edit to an old day, can add a streak bonus, remove one, or move a herb. The balance can then drop below zero on a day the user
  didn't touch the app.
- **Why I'd keep it:** this is the price of "derived, never stored", and I still think it's the right price, because drift-free beats stable-but-wrong. Showing *why* the
  balance moved is psychologist/designer territory.
- **Already open:** the question in PROGRESS asking whether a backfill should create a bonus. Same decision, so no new item.

## 4. Answers to the other agents' planning questions
- **Psychologist: "Can the economy be one pure `streakWalk` that returns per-day events, so the toast/herb line are derived truths shown once?"**
  Yes, and that's what shipped: `streakWalk` returns `events[]` (`bonus`, `token_earned`, `token_used`, `rest`), exposed as `economy.events_recent` (today + yesterday) and `bonus_today`.
  - **Caveat:** "shown once" is still client state. The info-line dismissal is memory-only (open backlog item). The bonus toast can be lost entirely when the earning mutation
    doesn't return `economy` (§3.2).
  - **The rule going forward:** the server derives *that* an event happened, and the client remembers *that it was shown*.
- **Psychologist + designer: "Where does the wishlist pin live?"**
  - In `purchases.yaml` `wishlist[]`, as merged (PROVISIONAL 4). It's under the same mutex as spending, and the app never rewrites the user's commented `rewards.yaml`.
  - The file is still hand-editable, and readers use the first entry.
  - I'd keep it there even if Nurasyl prefers editing by hand: a `wishlist:` key in `rewards.yaml` would turn the user's catalogue into an app-written file.
- **Designer: "Who owns the 'about N days' estimate, and is a null estimate OK?"**
  The server owns it, as the pure `paceEstimate` over `pace_per_day` (14-day window, zeros included). It returns `null` below 7 logged days or at a zero average, and the UI
  then shows nothing. That's correct. Note that the pace excludes boss earnings, so it's slightly pessimistic, which is the safe direction for a promise.

## 5. Process notes (what to do differently next sprint)
1. **Test on the real access path, not just `localhost`.** `localhost` is a secure context, a Tailscale IP over HTTP is not, and so the MUST in §3.1 was invisible to 569 tests and
   two browser runs. For M6 the tester should run at least one smoke against the server through a **non-loopback origin**: the machine's LAN or Tailscale IP, or `tailscale serve`
   if it's installed. The check should cover Buy, a quest Done and the service-worker registration. If Tailscale isn't installed, bind to the LAN IP for one run and say so in the report.
2. **Write invariants as invariants.** "Every response that shows coins carries economy" became a list of routes in the sprint goal, and the evening route fell through the gap.
   From now on my ACs state the rule *and* ask for a route-table test that enforces it.
3. **Tell the builder what a sync mutator can't do.** `updateYaml`'s synchronous callback quietly forced earnings outside the lock. When an AC says "inside the lock", the
   builder should flag any API constraint that prevents it as a PROVISIONAL deviation in PROGRESS. The builder's code comment was good, but it should have been surfaced in the sprint doc as well.
4. **M6 planning input from me:** HTTPS via `tailscale serve`, the bind address, the Host allowlist and the systemd unit are one decision. Plan them together in M6, not piecemeal.

## 6. ARCHITECTURE.md
No edits this sprint. Nurasyl hasn't confirmed anything new, and §3.1's HTTPS recommendation is PROVISIONAL until he does. The line "open `http://<tailscale-ip>:PORT`" is now known
to be incompatible with a service worker, so the M6 plan must resolve it.

## PROVISIONAL decisions in this review
1. `crypto.randomUUID` failing over HTTP is rated **MUST** (it blocks buying on the phone). The client fallback is required whatever the HTTPS decision turns out to be.
2. Recommending `tailscale serve` (HTTPS on `*.ts.net`, app on loopback) for M6. Nurasyl decides.
3. NEW-LOW-1 is raised to **SHOULD** as an invariant: every economy-affecting mutation returns `economy`. The tester's LOW was about the badge; the lost bonus toast makes it more than cosmetic.
4. NIT-5 is raised to **SHOULD** (the only race that lets a spend exceed what the ledger supports). It stays below MUST because the balance can't be inflated and the overshoot is at most one quest's tariff.
