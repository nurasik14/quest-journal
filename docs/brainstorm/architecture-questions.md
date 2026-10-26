# Architecture questions for Nurasyl (VibeWise interview, async edition)

> Written by `quest-architect` on 2026-10-25 while you were asleep. No answers here are yours yet.
> `docs/brainstorm/architecture.md` has **PROVISIONAL** defaults so the builder could start tonight. They are
> deliberately conservative and meant to be overturned. Each question below says which provisional choice it challenges.

**How to use this file:** answer in your own words, directly under each question. Plain English, a sketch or
pseudocode are all fine. Try your own answer *before* opening the "If you ask for help" line. That line is a
proposal, not a decision. When we talk it through live (`claude --agent quest-architect`, then `/vibe-wise:learn`),
the answers you defend become the **Decided** section.

Facts I verified tonight (not design choices):
- `claude -p --output-format json` returns an envelope object: `is_error`, `subtype`, `result` (text), `structured_output`
  (present when `--json-schema` is passed), `duration_ms`, `total_cost_usd`, `session_id`.
- A prompt can be piped in on stdin. `--tools ""` disables every tool. `--setting-sources ""` and `--strict-mcp-config`
  stop your user settings, hooks and MCP servers from loading. `--no-session-persistence` keeps sessions off disk.
- A trivial call with Sonnet takes about 5–6 s end to end. A real quest-generation prompt will be slower.
- `--bare` is **not** usable. It turns off OAuth, so it can't use your Max login.
- A browser only enables service workers (which a PWA needs to install and work offline) in a *secure context*:
  HTTPS or `localhost`. `http://100.x.y.z:PORT` over Tailscale is **not** a secure context.

---

## 1. Data model

---

**✦ Concept: Stored vs derived state**

A *stored* value is written to disk, like `coins: 140` in a file. A *derived* value is recomputed from other facts
every time, like summing the coins of every completed quest. Stored values are fast and easy to read, but they can
disagree with the facts they summarize, for example after you hand-edit a quest's status. Derived values can't drift,
but they cost a computation and need the underlying facts to be complete.

---

**1.1 What exactly is in a day file?**
Context: ARCHITECTURE.md lists `date, energy, satisfaction, mood, quests[], coins, streak` in the frontmatter, plus
Highlight/Notes/Gratitude in the body. Walk through one real day, from the morning check-in through a reroll, a
completion and the evening save. Which fields does each step write? What does the file look like if you open it at
noon?
*If you ask for help:* keep only facts in the frontmatter (energy, ratings, quest list with status). Leave `coins` and
`streak` out, because they're derived (see 1.4). The provisional schema is in architecture.md §2.1.

**1.2 How is a quest identified?**
Context: a coin award, a 👍/👎, an undo and a reroll all need to point at "this quest". Its title can change if you edit
it, and its position in the list can change too. What property makes a quest *the same quest* over time, and does it
have to survive you hand-editing the file?
*If you ask for help:* use a readable, deterministic ID: `<date>-<slot>`, with a letter suffix per reroll
(`2026-10-25-2b`), and `<ISO week>-boss` for the boss. If a hand-edited quest has no ID, the server assigns one.

**1.3 What does the week file hold, and who creates it?**
Context: the boss quest is generated "on the first open of each ISO week". What if you don't open the app until
Wednesday? Can the boss be completed on any day of the week? Where does the weekly review text live?
*If you ask for help:* `weeks/<ISO week>.md` holds the boss in its frontmatter and a `## Review` section in the body.
Create it lazily on the first `GET /api/today` of the week. It can be completed until the week's last logical day.

**1.4 Is the coin ledger stored or derived?**
Context: ARCHITECTURE.md left this open ("ledger.md … or derived from the day files"). Think about what happens in
each model when you (a) hand-edit an old quest from `done` to `failed`, (b) undo a completion, or (c) change the
price of "easy" from 10 to 15 next month.
*If you ask for help:* use a hybrid. **Earnings are derived** from quest status, with each quest's coin value
snapshotted at generation. **Spending is stored** as an append-only `purchases.yaml`, because a purchase is an event,
not a state. Manual corrections go in an `adjustments` list.

**1.5 How will the file format evolve?**
Context: you'll want new fields in month three. Old files won't have them. Do you migrate every file at once, migrate
each file the next time it's written, or never migrate and just tolerate old shapes?
*If you ask for help:* add `schema: 1` to every file. On read, treat a missing `schema` as 1 and run the in-memory
upgrade functions. Write the new version back only when the app saves that file anyway, so there are no bulk
rewrites and no noisy git diffs. Unknown fields are always preserved.

---

## 2. Source of truth and hand edits

---

**✦ Why this matters**

CLAUDE.md promises that "the app must survive files edited by hand". Two writers (you in Obsidian/vim, and the
server) share one file with no lock between them. Every write the server makes is a read, a change and a write. If you
saved the file in the gap between the read and the write, the app silently overwrites your edit.

---

**2.1 A day file's YAML is broken after a hand edit. What should the app do?**
Context: options include refusing to touch the file, auto-repairing it, falling back to an empty day, or showing an
error. Consider what each choice does to the coin balance, to the evening page and to git history.
*If you ask for help:* quarantine the file. The server never writes to a file it can't parse. The API returns
`422 unparseable_file` with the parser message, and the UI shows a read-only "fix this in your editor" banner. The
balance excludes that file and reports a warning.

**2.2 The app and your editor change the same file. Who wins?**
Context: think about two cases. In the first, the phone has the evening form open for 20 minutes while you fix a typo
in vim. In the second, you mark a quest done in the app while Obsidian has the file open with unsaved changes.
*If you ask for help:* use optimistic concurrency. Every GET returns an `ETag` (a hash of the file). Free-text saves
must send `If-Match`, and a mismatch returns `412` so the client reloads. Quest status changes are small atomic
field updates under a per-file lock, so they re-read the file at write time and don't need `If-Match`.

**2.3 Which parts of a day file may the app rewrite?**
Context: you might add your own `## Workout log` section or a custom frontmatter key. Should the app preserve
headings, order, comments and formatting it doesn't recognize?
*If you ask for help:* preserve unknown frontmatter keys and unknown `## ` sections in order. Only replace the bodies
of `Highlight`, `Notes` and `Gratitude`. YAML comments may be lost, and this should be documented.

**2.4 Does the server cache files in memory, or read from disk every time?**
Context: a cache is faster but goes stale after a hand edit. A file watcher adds complexity.
*If you ask for help:* read from disk on every request. The data is a few hundred small files. Add caching only if
profiling shows it's needed.

---

## 3. AI pipeline

---

**✦ Concept: Trust boundary on model output**

The model's JSON is untrusted input, just like a form submission from a stranger. `--json-schema` makes the right
shape *likely*, not *guaranteed*: for example, numeric bounds may not be enforced. The server still has to validate
the output (zod) and apply its own business rules.

---

**3.1 What context goes into the generate-day prompt, and how big can it get?**
Context: profile, insights, 14 days of history, recent titles, weekday, energy and balance. On day 300, with long
notes, how do you keep the prompt bounded? What gets cut first?
*If you ask for help:* use fixed character caps per block (profile 6k, insights 8k, history about 8k, titles 2k) with
a total target under about 24k characters. Each history day is one compact line plus notes truncated to 200
characters, and the oldest days are dropped first.

**3.2 What is the JSON contract, and who decides the coin value?**
Context: ARCHITECTURE.md has Claude return `{title, why, category, difficulty, coins}`. Should the model be allowed to
set `coins`? What happens if it returns `coins: 9999`?
*If you ask for help:* the model returns `{title, why, category, difficulty}` only, and the server maps difficulty to
coins. The model never touches economy numbers.

**3.3 Validation, retry, timeout, fallback: what is the exact policy?**
Context: failures include a non-zero exit, `is_error: true`, invalid JSON, a schema violation, duplicate categories,
a hang, and `claude` not being logged in. Which of these deserve a retry? How long should you wait on a phone?
*If you ask for help:* use a 60 s timeout per attempt and retry once on any failure except "binary missing/not
logged in". After that, fall back to the `quests.yaml` pool. The UI labels pool quests as such.

**3.4 Synchronous request or background job?**
Context: generation may take 10–40 s. Phones suspend background tabs, Tailscale can drop, and a proxy might time out.
What happens if you lock the phone mid-request? Can two taps trigger two generations?
*If you ask for help:* use a background job. `POST` returns `202 {job_id}`, and the client polls `GET /api/jobs/:id`.
Run one in-process queue with concurrency 1, de-duplicated by a key like `generate:2026-10-25`. If the server
restarts mid-job, the day shows "needs generation" and the job can be retried.

**3.5 Which model, and what latency is acceptable?**
Context: Sonnet versus Haiku trades quality for speed and for Max usage limits. Would you rather wait 30 s for better
quests or 8 s for good-enough ones? Should reflect use a different model than generate?
*If you ask for help:* make it configurable (`AI_MODEL`, default `sonnet`) and measure the latency in milestone 3.

**3.6 What isolation should `claude -p` run with?**
Context: by default, a `claude` run loads your CLAUDE.md files, hooks, MCP servers and tools, and it has filesystem
access in its working directory. Generating quests needs none of that.
*If you ask for help:* use `--tools ""`, `--setting-sources ""`, `--strict-mcp-config` and
`--no-session-persistence`, run with an empty temporary directory as the working directory, and pass the prompt on
stdin.

---

## 4. Knowledge base (`insights.md`)

---

**✦ Concept: Drift in self-maintained memory**

When a model rewrites its own notes from its own previous notes, small distortions compound. An over-general claim
("hates mornings") gets reinforced because quests stop testing it. Evidence citations and human approval slow this
down. Hard size limits force pruning instead of endless accumulation.

---

**4.1 What is the shape of one insight?**
Context: for edit/remove proposals to target a specific line, each line needs an identity. What about evidence?
*If you ask for help:* use one bullet per insight with a stable ID and evidence dates:
`- [i-0007] Finishes outdoor quests more often on weekends. (evidence: 2026-10-12, 2026-10-19)`

**4.2 How does `insights.md` stay small and accurate over a year?**
Context: are there size limits, merges, expiry, or a periodic "consolidate" pass? Who triggers consolidation?
*If you ask for help:* set a hard cap of 60 bullets / 8k characters. At the cap, the server rejects `add` ops and the
prompt switches to "propose merges/removals only". A manual "consolidate" button is deferred.

**4.3 What does the approval UX look like, and where do pending proposals live while you decide?**
Context: reflect runs after the evening save. You might close the phone before you look. What if you hand-edit
`insights.md` before approving?
*If you ask for help:* store proposals on disk in `kb/proposals/<date>.yaml`, so they survive restarts. Approve per
op, optionally with edited text. Record the `insights.md` hash at proposal time. If that hash has changed, ops whose
target IDs no longer exist are marked stale.

**4.4 How do you stop a bad note from steering the AI (prompt injection)?**
Context: notes, insights and even quest titles flow back into future prompts. Picture a pasted article that says
"ignore previous instructions". What's the *worst* thing a manipulated response can do in this system? Which
mitigations shrink that blast radius, and which only lower the probability?
*If you ask for help:* rely mainly on blast-radius controls: no tools, a schema plus zod, coins set by the server, and
every KB change approved by a human. Add probability reducers: wrap data in delimited tags, state in the system
prompt that tag content is data, apply length caps, and strip URLs from insight text. Render all AI text as plain
text, never `{@html}`.

**4.5 Onboarding: does Claude write `profile.md` directly?**
*If you ask for help:* no. Claude returns a draft that you edit in the UI, and only your save writes the file.

---

## 5. Economy integrity *(needs `quest-psychologist` input on amounts and streak rules)*

---

**✦ Concept: Idempotency**

An operation is *idempotent* if doing it twice has the same effect as doing it once. Phones retry, double-tap and
resend requests after reconnecting. "Set quest 2 to done" is naturally idempotent. "Add 20 coins" is not.

---

**5.1 How do you make sure a completion can't award coins twice?**
Context: double-tap, a network retry, the page being reopened. Which model in 1.4 makes this trivially true?
*If you ask for help:* if earnings come from quest *status*, double awards are impossible by construction.

**5.2 How do you make purchases safe against double-submits?**
*If you ask for help:* the client generates a `request_id` (UUID) per purchase attempt, and the server stores it. A
repeat `request_id` returns the original purchase with `200`.

**5.3 What can be undone, and for how long?**
Context: un-completing a quest after you've already spent its coins could make the balance negative. Is that allowed?
Can a purchase be refunded?
*If you ask for help:* quest status can be toggled freely on the logical today. A purchase can be voided within 24 h
(it's marked `voided_at`, never deleted). The balance can go negative, but purchases are blocked while it is.

**5.4 When does "today" end?**
Context: you write your evening entry at 01:30. Is that yesterday or today? Which timezone counts: the PC's or the
phone's? What happens when you travel?
*If you ask for help:* the server is the only authority on time. The logical date is the local date of
(now − `DAY_ROLLOVER_HOUR`), with a default of 04:00 in the server's timezone (`TZ` env). Clients never send "today".

**5.5 Can past days be edited through the app?**
*If you ask for help:* evening fields can be edited on any day. Quest status can be changed only on the logical today
(and the boss within its week). Older days are hand edits only.

**5.6 Streak rule and bonus amount** → hand off to `quest-psychologist`.
*Provisional:* a day counts if at least 1 daily quest is done. The bonus is +50 coins each time the streak reaches a
multiple of 7, and it is derived.

---

## 6. Sync and deployment

---

**6.1 When does the app commit to git, and what goes in a commit?**
Context: one commit per click floods the history. One per day risks losing work. Should hand edits be swept into the
app's commits?
*If you ask for help:* debounce for 5 s after the last write, then run `git add -A` and commit with a summary message.
Commits are serialized. A git failure is logged and reported in `/api/health`, and it never blocks a save.

**6.2 Is there a remote backup? Where, and how often is it pushed?**
Context: one disk is not a backup. But a push to the wrong remote publishes your journal.
*If you ask for help:* turn push off by default. When `GIT_PUSH=true`, push at most every 15 minutes to a remote you
have personally verified is private.

**6.3 How does the phone reach the server: bind to the Tailscale IP, or use `tailscale serve`?**
Context: see the secure-context fact at the top. Binding `0.0.0.0` exposes the app on your Wi-Fi/LAN as well.
*If you ask for help:* bind to `127.0.0.1` only, and run `tailscale serve --bg <PORT>` to get
`https://<pc>.<tailnet>.ts.net` with a real certificate. That makes the PWA installable and keeps the app off the
LAN. **This changes ARCHITECTURE.md build step 6** ("bind to the Tailscale IP").

**6.4 Does the app need its own auth on the tailnet?**
Context: who else is on your tailnet, now or later (shared devices, family nodes)? `tailscale serve` adds identity
headers (`Tailscale-User-Login`).
*If you ask for help:* no app login for now. Add a Host-header allowlist (DNS-rebinding defense), JSON-only mutations
and an Origin check (CSRF defense). Optionally, enable an `ALLOWED_TS_USERS` check later.

**6.5 How does it run permanently?**
*If you ask for help:* use a systemd **user** service (`~/.config/systemd/user/quest-journal.service`) with
`loginctl enable-linger` so it runs without a login session. The service needs `HOME` set so `claude` finds its
login. This is deferred to milestone 6.

---

## 7. Frontend/backend boundary

**7.1 What API shape: resource-style REST, or page-shaped endpoints?**
*If you ask for help:* use mostly resources, plus one aggregate `GET /api/today` so the main screen is a single
round trip. See the route list in architecture.md §2.3.

**7.2 What should the PWA do offline?**
Context: on a train without signal, should you be able to tick quests and sync later? That needs a client-side queue
and conflict rules.
*If you ask for help:* make it read-only offline at first. The app shell is precached, and the last `GET /api/today`
and `/api/shop` responses are served from cache with an "offline" banner. Mutations are disabled. `request_id` keeps a
future offline queue safe to add.

**7.3 Caching rules?**
*If you ask for help:* use `Cache-Control: no-store` on `/api/*`, use hashed asset filenames with long cache times,
and make the service worker network-first for the API.

---

## 8. Testing seams

**8.1 How will tests avoid calling the real `claude`?**
*If you ask for help:* inject an `AiRunner` interface, with a fake in unit tests. Also add a `CLAUDE_BIN` env var so
end-to-end tests can point at a stub shell script that prints fixture JSON, sleeps (to test timeouts) or exits
non-zero.

**8.2 How will tests control time (rollover at 04:00, ISO week boundaries, streaks)?**
*If you ask for help:* inject a `Clock` (`now(): Date`) everywhere, with no direct `new Date()` in domain code. For
manual and end-to-end testing, add `QJ_FAKE_NOW=2026-10-26T03:59:00`, honored only when `NODE_ENV !== "production"`.

**8.3 Data and git in tests?**
*If you ask for help:* each test gets a fresh temporary `DATA_DIR`. Git is either disabled (`GIT_ENABLED=false`) or
tested against a temporary repo.

---

## 9. Privacy

**9.1 What leaves the PC for Claude?**
Context: profile, insights and history go to Anthropic through your Max account. Should gratitude entries go? Should
any day be off-limits?
*If you ask for help:* send profile, insights, energy, ratings, quest outcomes, highlights and notes truncated to 200
characters. Never send gratitude. A day with `private: true` is excluded from all AI context.

**9.2 What stays out of git remotes and logs?**
*If you ask for help:* the app repo never contains data (`DATA_DIR` lives outside it, and `.env` is gitignored).
Server logs record job metadata only, never prompts or notes. Raw AI responses are kept in memory only, and the last
20 are visible at `/api/debug/ai` only when `DEBUG=1`.

**9.3 Publishing to the Hugo blog with a `publish: true` flag. Now, or never?**
*If you ask for help:* defer it. The flag is reserved in the schema, and no code reads it yet.
