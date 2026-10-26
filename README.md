# Quest Journal

A daily quest log and journal for one person, styled after the apothecary's notebook from *The Apothecary Diaries*.

Each morning you say how much energy you have (1 to 5). The app gives you three small real-life quests sized to that,
plus one boss quest for the week. In the evening you write a few lines and rate the day. Finished quests pay silver
taels, which you spend on real treats in the Palace Market: a bubble tea, a lie-in, a new manga volume. The Garden shows
your days back to you.

It runs on your own PC, and your phone uses it over Tailscale. Quests come from your own `claude` CLI login, so there is
no API key and nothing is billed per call. Your journal is plain Markdown and YAML in a separate git repo that you can
read and edit by hand.

It's built to be gentle. A missed day is left blank, never marked "failed". A streak rests instead of breaking. Nobody
judges your ratings. The app sends no notifications, badges or reminders. You open it when you want to.

## The pages

| Page | Path | What it's for |
|---|---|---|
| Today | `/` | Energy check-in, then three quests and the week's boss. Mark each one done, partly done or let go. Reroll a quest and say why, or give it a thumbs up or down. |
| Evening | `/evening` | Rate the day from 1 to 10 herb leaves, pick mood tags, write a highlight, notes and gratitude. You can mark the day private. |
| Palace Market | `/market` | Spend taels on rewards from `rewards.yaml`. Rewards have cooldowns, and prices are set so a small treat comes about 2 to 3 times a week. |
| Garden | `/archive` | Your history. Each day is a plot colored by its rating, with totals (days logged, quests done, longest streak) and a per-category tally. Tap a plot to read that day or fill in a past one. Unrated and unwritten days look different from bad days. |
| Notes | `/profile` | Your profile (what you like, your schedule, what you have access to) and the insights the app has learned about you, which you approve or decline one by one. |

Rewards: an easy quest pays 10 taels, medium 20, hard 35, the weekly boss 100. Partly done pays about half. Every 7
days in a row you get a 25-tael bonus and a preserved herb, which covers one missed day so the streak rests instead of
resetting (you can hold two).

## How quests get personal

Every morning the quest prompt includes:

- your profile, which is ground truth and overrides everything else
- the insights you approved
- your last 14 days, one line each: energy, rating, mood tags, highlight, notes, and every quest with its status, 👍/👎
  and let-go reason
- an avoid list of titles from the last 14 days, plus quests you rerolled or 👎'd, with your reasons
- category counts from the last 7 days, so it favors what you haven't done lately

Energy decides the mix. At 1 you get three easy quests that are free, work from home and include a care quest. At 4 and
5 you get one real stretch. There is never more than one hard quest.

When you save an evening entry, a background job reads the day and may propose insights such as "enjoys outdoor quests
more on weekends". These go into `kb/insights.md` only if you accept each one. That file is the app's long-term memory.
Anything older than 14 days is gone unless an insight captured it.

Gratitude entries and days marked private are never sent to Claude.

If Claude doesn't answer, quests come from your own pool in `quests.yaml`. The pool honors recency and each quest's
cooldown, but it doesn't use your ratings.

## Stack and layout

TypeScript throughout: a Bun + Hono API and a Svelte 5 SPA built with Vite, installable as a PWA.

```
server/src/      API, quest generation, prompts, economy, streaks, kb/insights, git autocommit
server/test/     bun test suites (they only use temp dirs, never your real data)
web/src/         Svelte app: routes/ (one file per page) and lib/ (api client, theme, components)
docs/            architecture, design brief, backlog, sprint plans and reviews, test reports
deploy/          systemd user unit
.claude/agents/  the Claude Code agents that designed, built and tested this
```

`docs/ARCHITECTURE.md` is the source of truth for design decisions.

## Prerequisites

| What | Why | Install |
|---|---|---|
| `bun` ≥ 1.4 | runs everything | `curl -fsSL https://bun.sh/install \| bash` |
| `claude` CLI, logged in | quest generation and reflection | the Claude Code installer, then run `claude` once and log in |
| `git` | auto-commits your data repo | usually already installed |
| `tailscale` (optional) | using the app from your phone | `sudo dnf install tailscale && sudo systemctl enable --now tailscaled && sudo tailscale up` |

## Configuration: `.env` (optional, in the repo root)

Bun loads `.env` automatically, and the systemd unit reads it too. Every key is optional.

```ini
DATA_DIR=~/quest-data        # your private data repo; created and git-initialised on first start
HOST=127.0.0.1               # keep loopback; the phone goes through `tailscale serve`
PORT=4317
TZ=Asia/Almaty               # your IANA time zone (default: the system's)
DAY_ROLLOVER_HOUR=4          # a "day" runs 04:00 to 03:59
ALLOWED_HOSTS=localhost,127.0.0.1,pc.your-tailnet.ts.net   # exact names only, no wildcards
CLAUDE_BIN=claude            # bare name: looked up on PATH, then ~/.local/bin
AI_MODEL=sonnet
AI_TIMEOUT_MS=60000
AI_ENABLED=true              # false = always use your quest pool
GIT_ENABLED=true             # auto-commit DATA_DIR after saves (never pushes)
GIT_DEBOUNCE_MS=5000
STREAK_BONUS=25
```

`DATA_DIR` must not be inside this repo. The app refuses to start if it is.

Any `ANTHROPIC_API_KEY` in the environment is stripped before `claude` runs, so a stray key can't start billing you.

## Run it

```sh
bun install

# development: API on :4317 + Vite on :5173 with hot reload (open http://localhost:5173)
bun run dev

# production: build the web app once, then serve API + app from one port (open http://localhost:4317)
bun run build
bun run start
```

Checks: `bun run typecheck`, `bun test` (884 tests at the time of writing), and `bun run econ:sim`, which simulates
the tael economy over several weeks.

On startup the server logs the bind address, your data dir, the logical date, and which `claude` binary it found.
`GET /api/health` reports the same (`claude.bin: null, reason: "claude_missing"` if it can't find one).

## Try it with demo data

```sh
mkdir -p /tmp/qj-demo && bun run seed:demo /tmp/qj-demo --seed 1
DATA_DIR=/tmp/qj-demo PORT=4399 SERVE_WEB=true AI_ENABLED=false bun server/src/index.ts
```

This writes 30 made-up days (ratings, gaps, an unrated day, a private day, let-go quests) into an empty scratch
directory, ending yesterday, so the Garden is full whenever you run it. Pass `--today YYYY-MM-DD` to pin the dates and
`--broken` to include one unreadable page. The same `--seed` and `--today` always give the same output. The seeder
refuses to run on `~/quest-data`, inside this repo, or on a non-empty directory.

## On your phone (Tailscale)

The recommended setup keeps the app on loopback and lets Tailscale put HTTPS in front of it. HTTPS matters because an
installable PWA and the offline shell only work in a secure context.

1. Install Tailscale on the PC and the phone and log both into the same tailnet.
2. On the PC, run `tailscale serve --bg 4317`. That gives you `https://<machine>.<tailnet>.ts.net`, reachable only
   inside your tailnet. `tailscale serve status` shows the exact name.
3. Add that name to `ALLOWED_HOSTS` in `.env` and restart the app. Until you do, requests for that host get `421`
   (a DNS rebinding guard).
4. On the phone, open the URL and use Add to Home Screen (iOS Safari) or Install app (Android Chrome).

> **Never use `tailscale funnel` for this app.** Funnel publishes the port to the whole internet, and your journal with
> it. The app has no login of its own, so the tailnet is the only boundary.

Plain `http://<tailscale-ip>:4317` with `HOST=0.0.0.0` also works, but the browser won't let you install the app or
use the offline shell over plain HTTP. Binding `0.0.0.0` also exposes the app to your whole local network, and the
server logs a warning about it.

## Run it as a service (systemd, your user)

`deploy/quest-journal.service` is a user unit. It runs as you, so `claude` can use your login.

```sh
bun run build
mkdir -p ~/.config/systemd/user
cp deploy/quest-journal.service ~/.config/systemd/user/
# if `command -v bun` is not ~/.bun/bin/bun, edit ExecStart in the copied file
systemctl --user daemon-reload
systemctl --user enable --now quest-journal
journalctl --user -u quest-journal -f           # logs
loginctl enable-linger "$USER"                  # optional: keep it running while you're logged out
```

After pulling new code, run `bun run build && systemctl --user restart quest-journal`. Open tabs show "A fresh page is
ready" and never reload while you're typing.

The unit runs whatever is in this checkout, so don't leave it enabled while you're changing code here. Build and
restart once a change is finished and tested. Bun also auto-loads `.env.local` and `.env.production`, so a scratch
`DATA_DIR` left in one of those would silently apply to the service. Keep only `.env`, and check the data dir line in
the log after a restart (`journalctl --user -u quest-journal | grep -i data`).

### First-install checklist

1. `curl -s http://127.0.0.1:4317/api/health | grep -o '"available":[a-z]*'` should print `"available":true`. If it
   says `false`, the unit's `PATH` is shorter than your shell's: compare with `command -v claude` and fix
   `Environment=PATH=`.
2. Do a check-in at `http://localhost:4317`, then run
   `curl -s http://127.0.0.1:4317/api/today | grep -o '"source":"[a-z]*"' | head -1`. `"ai"` is good. `"pool"` means
   Claude didn't answer under the service.
3. Through Tailscale, open Today on the phone and tap Done on a quest. `421` means the host isn't in `ALLOWED_HOSTS`.
   `403` means the proxy changed the Origin header.
4. Install it on the phone, turn on airplane mode, and reopen it. You should see the header and a "Can't reach your
   laptop right now" card.
5. Write a word in the evening notes, save, and within 5 s run `systemctl --user stop quest-journal`.
   `git -C ~/quest-data log -1 --format=%s` should show a `qj:` commit for that save.

## Your data and privacy

- Everything lives in `DATA_DIR`: `days/YYYY-MM-DD.md`, `weeks/YYYY-Www.md`, `kb/profile.md`, `kb/insights.md`,
  `quests.yaml`, `rewards.yaml`, `purchases.yaml`. You can edit all of it in any editor.
- The app commits that repo after saves. It never pushes, so for now the only copy is on your disk.
- Notes and insights always render as plain text. Nothing from your files is rendered as HTML.
- Character stickers and decor paintings are for personal use only. They're gitignored and not in this repo, so a
  fresh clone shows empty sticker slots. Sources and licenses are in `web/public/IMAGE_SOURCES.md`. The herb plates
  are public domain, and the app icons are original.

### Back up your journal

Pick one and do it now. Either push to a private remote:

```sh
git -C ~/quest-data remote add backup <your-private-repo-url>
git -C ~/quest-data push backup HEAD          # repeat whenever you like, e.g. every Sunday
```

or to a second disk:

```sh
git init --bare /run/media/$USER/<disk>/quest-data.git
git -C ~/quest-data push /run/media/$USER/<disk>/quest-data.git HEAD
```

The remote must be private. Never `--force`. Restoring is `git clone <backup> ~/quest-data`.

## When a page can't be read

If a hand edit breaks a file (say `satisfaction: 14`, or bad YAML), the app won't overwrite it or guess. The page shows
the line number and your text, read-only, and the Garden draws a hatched "can't be read" plot that never counts as a
bad day or breaks a streak. Fix the line in your editor and the app picks it up on the next load.

## Known limitations

- YAML comments can be lost when an edit has to re-serialise a file. Git history keeps the old version.
- Offline, the app shows the last loaded shell, read-only. Saves need the server and nothing is queued. A page gives up
  after about 10 s and a save after about 20 s. Retrying a save is always safe: it never doubles a quest, entry or
  purchase.
- One user, no accounts. The tailnet is the security boundary.
- No random events yet. The weekly boss is the only extra challenge.

## How it was built

A team of Claude Code agents designed and built the app in short sprints: an architect, a behavioral psychologist
(motivation and the tael economy), a designer, a builder and a tester. Their plans, reviews and test reports are in
`docs/sprints/` and `docs/test-reports/`, and the agent definitions are in `.claude/agents/`. `CLAUDE.md` explains the
workflow.
