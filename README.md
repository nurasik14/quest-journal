# Quest Journal

A daily quest log and journal for one person, styled after the apothecary's notebook from *The Apothecary Diaries*.

Each morning you say how much energy you have (1 to 5). The app gives you three small real-life quests sized to that,
plus one boss quest for the week. In the evening you write a few lines and rate the day. Finished quests pay silver
taels, which you spend on real treats in the Palace Market: a bubble tea, a lie-in, a new manga volume. The Garden shows
your days back to you.

It runs on your own PC, and your phone uses it over Tailscale. An AI model writes the quests. You can use your Claude
subscription, a Claude API key, a free local model through Ollama, or any OpenAI-compatible service (several have free
tiers). Your journal is plain Markdown and YAML in a separate git repo that you can read and edit by hand.

It's built to be gentle. A missed day is left blank, never marked "failed". A streak rests instead of breaking. Nobody
judges your ratings. The app sends no notifications, badges or reminders. You open it when you want to.

## Demo

![Today's quests, the evening ledger, the garden and an insight suggestion](docs/demo/hero.webp)

A full walkthrough, phone size (check-in → weekly boss → quests → evening → market → garden → insights):

<p align="center"><img src="docs/demo/walkthrough.webp" width="300" alt="Animated walkthrough of every page"></p>

| | | | |
|---|---|---|---|
| ![Check-in](docs/demo/01-checkin.webp) | ![Weekly boss](docs/demo/02-weekly-boss.webp) | ![Quests](docs/demo/03-quests.webp) | ![Evening](docs/demo/04-evening.webp) |
| Morning check-in | The weekly boss | Quests, one sealed as done | Evening ledger |
| ![Market](docs/demo/05-market.webp) | ![Garden](docs/demo/06-garden.webp) | ![Insights](docs/demo/07-insights.webp) | |
| Palace Market | The Garden | An insight waiting for approval | |

The screenshots use the built-in demo data (30 made-up days) plus a short made-up profile for a CS student. The quests,
the weekly boss and the insight were written live by Claude Sonnet through the `claude` CLI. They show the app as a
fresh clone looks: the anime character stickers aren't in this repo (see [Your data and privacy](#your-data-and-privacy)),
so those slots are empty.

To run the same demo on your machine, see [Try it with demo data](#try-it-with-demo-data). It takes about two minutes.

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

Gratitude entries and days marked private are never sent to the model.

Every answer from the model is checked before you see it: the JSON shape, three different categories, the difficulty
slots for your energy level, the money cap, no repeats of recent quests, and a few safety rules. A bad answer gets one
retry. If that fails too, or the model can't be reached, quests come from your own pool in `quests.yaml`, and Today says
so in a small banner. The pool honors recency and each quest's cooldown, but it doesn't use your ratings.

## Quick start

You need [Bun](https://bun.sh) ≥ 1.4 and `git`. Then pick an AI provider from the next section.

```sh
git clone https://github.com/nurasik14/quest-journal.git
cd quest-journal
bun install
cp .env.example .env        # then edit the AI section (see below)
bun run build
bun run start               # open http://localhost:4317
```

On the first start the app creates your journal in `~/quest-data` (a new git repo) and copies in the starter quest pool
and market. Open the Notes page, or follow "Answer a few questions" on Today, to fill in your profile. Quests get much
better once the model knows a little about you.

## Choosing an AI provider

Set `AI_PROVIDER` in `.env`. Everything else in the app works the same with every provider.

| Provider | `AI_PROVIDER` | Cost | Quest quality | Your journal leaves the PC? |
|---|---|---|---|---|
| Claude subscription (Pro/Max) via the `claude` CLI | `claude-cli` (default) | included in your plan | best | yes, to Anthropic |
| Claude API key | `anthropic` | pay per token, a few cents a day | best | yes, to Anthropic |
| Ollama, local model | `ollama` | free | good with a 7–10B model, rougher below that | **no** |
| Google Gemini, Groq, OpenRouter (free tiers) | `openai` | free within their limits | good | yes, to that company |
| OpenAI, LM Studio, llama.cpp, vLLM | `openai` | depends | depends on the model | LM Studio/llama.cpp: no |

The model sees your profile, approved insights, and the last 14 days of notes, highlights and ratings (never gratitude,
never private days). If that shouldn't leave your computer, use Ollama.

Check what the server picked: the startup log prints an `AI:` line, and `curl -s localhost:4317/api/health` shows
`"provider"`, `"model"`, `"available"` and `"last_error"` under `claude` (the field kept its old name).

### Option 1: Claude subscription (default)

If you have Claude Pro or Max, the app runs your own `claude` CLI in the background (`claude -p`). There's no API key
and nothing is billed per call.

1. Install Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`
2. Run `claude` once and log in.
3. Leave `AI_PROVIDER` unset, or set it to `claude-cli`.

```ini
AI_PROVIDER=claude-cli
AI_MODEL=sonnet              # or opus, haiku
```

The app looks for `claude` on `PATH` and in `~/.local/bin`. Set `CLAUDE_BIN=/full/path/to/claude` if it lives
elsewhere. Any `ANTHROPIC_API_KEY` in the environment is stripped before `claude` runs, so a stray key can't move you
from the subscription to API billing.

### Option 2: Claude API key

1. Create a key at [console.anthropic.com](https://console.anthropic.com/) (Settings → API keys) and add some credit.
2. Put it in `.env`:

```ini
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-5     # or claude-haiku-4-5 to spend less
```

A day is about two calls (morning quests and the evening reflection) plus the weekly boss once a week. Each call
sends up to about 6,000 tokens of prompt and gets a short reply, so with Sonnet a day costs a few cents, more if a
retry is needed. The app asks for structured JSON output
(`output_config.format`). If the API rejects the schema, it retries once with the schema in the prompt only.

### Option 3: Ollama, free and local

Nothing leaves your machine and nothing costs money. You need a few GB of disk and a reasonably recent computer. A GPU
helps but isn't required.

1. Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh` on Linux, or the app from
   [ollama.com/download](https://ollama.com/download) on macOS and Windows.
2. Pull a model: `ollama pull qwen3.5`
3. Set:

```ini
AI_PROVIDER=ollama
AI_MODEL=qwen3.5
# AI_BASE_URL=http://localhost:11434   # default; point it at another machine on your network if you like
# OLLAMA_NUM_CTX=16384                 # context window; the default is fine
# AI_TIMEOUT_MS=180000                 # default for ollama: 3 minutes per call
```

Which model? These are times for one day of quests on a laptop with an RTX 4050 (6 GB) and 16 GB RAM, all run against
this app's demo data:

| Model | Download | Time per day | Notes |
|---|---|---|---|
| `qwen3.5` (9.7B) | 6.6 GB | 20–35 s | Recommended. Varied, on-tone quests; the weekly boss sometimes needs its retry. |
| `qwen3.5:2b` | 2.7 GB | ~13 s | Fine on weak machines. Quests are simpler and the "why" lines wander. |
| `llama3.2:3b` | 2.0 GB | ~7 s | Fast, plain English, little of the Maomao voice. |
| `qwen2.5:3b` | 1.9 GB | 5–7 s | Often breaks the app's rules (wrong difficulty, repeats), so you get pool quests. |

Without a GPU, expect several times slower. That's fine, because quests are written once in the morning. Small local
models follow the rules less reliably than Claude, so you'll see the pool fallback banner more often. Every quest still
passes the same checks before you see it.

The app uses Ollama's native `/api/chat` endpoint rather than its OpenAI-compatible one. Only the native endpoint lets
it raise the context window (Ollama's default would silently cut the prompt) and turn off "thinking" on reasoning
models, which otherwise makes them very slow.

### Option 4: free cloud tiers and other OpenAI-compatible APIs

`AI_PROVIDER=openai` works with anything that speaks the OpenAI Chat Completions API. Set the base URL, a key and a
model. Model names change often, so check the provider's model list. The ones below were current when this was written.

Google Gemini (free tier with daily limits; key from [aistudio.google.com](https://aistudio.google.com/apikey)):

```ini
AI_PROVIDER=openai
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=your-gemini-key
AI_MODEL=gemini-3.8-flash
```

Groq (free tier with rate limits; key from [console.groq.com](https://console.groq.com/keys)):

```ini
AI_PROVIDER=openai
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
AI_MODEL=openai/gpt-oss-20b
```

OpenRouter (models ending in `:free` cost nothing; key from [openrouter.ai](https://openrouter.ai/keys)):

```ini
AI_PROVIDER=openai
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=sk-or-...
AI_MODEL=<any model id ending in :free>
```

OpenAI itself: `AI_PROVIDER=openai`, `OPENAI_API_KEY=sk-...` (or `AI_API_KEY`), and `AI_MODEL` set to a current model.
The base URL defaults to `https://api.openai.com/v1`.

LM Studio, llama.cpp `llama-server` or vLLM on your own machine: start their local server and point `AI_BASE_URL` at it
(LM Studio's default is `http://localhost:1234/v1`, llama.cpp's is `http://localhost:8080/v1`). No key is needed.

`AI_JSON_MODE` controls how strictly the reply is forced into JSON:

- `schema` (default) sends the full JSON Schema as `response_format: json_schema`. If the server rejects that, the app
  retries once with `json_object`.
- `json` sends `json_object` (plain JSON mode).
- `off` sends nothing and relies on the prompt. Use it for servers that reject `response_format` entirely.

With every provider the schema is also written into the system prompt, so models that ignore `response_format` still
know the shape.

### When the model fails

| You see | Meaning | Fix |
|---|---|---|
| Banner "From the apothecary's own shelf…" on Today | The model failed twice or couldn't be reached, so the quests came from your pool | Check `last_error` in `/api/health` |
| `last_error: "claude_missing"` | `claude` binary not found, or the HTTP server refused the connection (Ollama not running?) | `ollama serve`, or fix `CLAUDE_BIN` / `AI_BASE_URL` |
| `last_error: "claude_not_logged_in"` | 401/403: wrong or missing API key, or the CLI needs a new login | Fix the key, or run `claude` and log in |
| `last_error: "rate_limited"` | 429 or overloaded: a free tier's limit, or your plan's usage limit | Wait, or switch model/provider |
| `last_error: "timeout"` | The model took longer than `AI_TIMEOUT_MS` | Use a smaller model or raise the timeout |
| `last_error: "invalid_output"` | The reply wasn't valid JSON or broke the rules | Try a bigger model. With `DEBUG=1`, `GET /api/debug/ai` shows the last replies and which rule failed |

## Try it with demo data

This runs the app against 30 made-up days in a scratch folder, so your real journal is never touched.

```sh
mkdir -p /tmp/qj-demo && bun run seed:demo /tmp/qj-demo --seed 1
bun run build
DATA_DIR=/tmp/qj-demo PORT=4399 SERVE_WEB=true AI_ENABLED=false bun server/src/index.ts
```

Open http://localhost:4399. With `AI_ENABLED=false`, quests come from the pool. To watch a model write them, swap that
for your provider, for example `AI_PROVIDER=ollama AI_MODEL=qwen3.5`.

The seeder writes ratings, gaps, an unrated day, a private day and let-go quests, ending yesterday, so the Garden is
full whenever you run it. Pass `--today YYYY-MM-DD` to pin the dates and `--broken` to include one unreadable page. The
same `--seed` and `--today` always give the same output. The seeder refuses to run on `~/quest-data`, inside this repo,
or on a non-empty directory.

## Configuration reference: `.env`

Bun loads `.env` automatically, and the systemd unit reads it too. Every key is optional. `.env.example` has the same
list with comments.

```ini
# journal and server
DATA_DIR=~/quest-data        # your private data repo; created and git-initialised on first start
HOST=127.0.0.1               # keep loopback; the phone goes through `tailscale serve`
PORT=4317
TZ=Asia/Almaty               # your IANA time zone (default: the system's)
DAY_ROLLOVER_HOUR=4          # a "day" runs 04:00 to 03:59
ALLOWED_HOSTS=localhost,127.0.0.1,pc.your-tailnet.ts.net   # exact names only, no wildcards
GIT_ENABLED=true             # auto-commit DATA_DIR after saves (never pushes)
GIT_DEBOUNCE_MS=5000
STREAK_BONUS=25

# AI
AI_ENABLED=true              # false = always use your quest pool
AI_PROVIDER=claude-cli       # claude-cli | anthropic | ollama | openai
AI_MODEL=                    # default per provider: sonnet | claude-sonnet-5 | qwen3.5 | gpt-4o-mini
AI_BASE_URL=                 # HTTP providers only; defaults: api.anthropic.com | localhost:11434 | api.openai.com/v1
AI_API_KEY=                  # HTTP providers; falls back to ANTHROPIC_API_KEY (anthropic) or OPENAI_API_KEY (openai)
AI_JSON_MODE=schema          # schema | json | off
AI_TIMEOUT_MS=60000          # per call; 180000 by default for ollama
AI_BOSS_ON_OPEN=true         # write the weekly boss with AI on the first open of the week
OLLAMA_NUM_CTX=16384         # ollama only
CLAUDE_BIN=claude            # claude-cli only; bare name: looked up on PATH, then ~/.local/bin
DEBUG=                       # 1 = keep the last 20 raw AI replies at GET /api/debug/ai
```

`DATA_DIR` must not be inside this repo. The app refuses to start if it is.

## Development

```sh
bun install
bun run dev          # API on :4317 + Vite on :5173 with hot reload (open http://localhost:5173)
bun run typecheck
bun test             # unit and API tests; they only ever use temp dirs and never call a real model
bun run econ:sim     # simulates the tael economy over several weeks
```

On startup the server logs the bind address, your data dir, the logical date and the AI line. `GET /api/health`
reports the same.

TypeScript throughout: a Bun + Hono API and a Svelte 5 SPA built with Vite, installable as a PWA.

```
server/src/      API, quest generation, prompts, AI providers (ai.ts, ai-http.ts), economy, streaks, insights, git
server/test/     bun test suites
web/src/         Svelte app: routes/ (one file per page) and lib/ (api client, theme, components)
docs/            architecture, design brief, backlog, sprint plans and reviews, test reports, demo screenshots
deploy/          systemd user unit
.claude/agents/  the Claude Code agents that designed, built and tested this
```

`docs/ARCHITECTURE.md` is the source of truth for design decisions.

## On your phone (Tailscale)

The recommended setup keeps the app on loopback and lets Tailscale put HTTPS in front of it. HTTPS matters because an
installable PWA and the offline shell only work in a secure context.

1. Install Tailscale on the PC and the phone and log both into the same tailnet
   (on Fedora: `sudo dnf install tailscale && sudo systemctl enable --now tailscaled && sudo tailscale up`).
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

Don't enable the unit while agent sprints are running in this checkout, or while you're changing code here: it runs
whatever is in this folder. Build and restart once a change is finished and tested. Bun also auto-loads `.env.local`
and `.env.production`, so a scratch `DATA_DIR` left in one of those would silently apply to the service. Keep only
`.env`, and check the data dir line in the log after a restart (`journalctl --user -u quest-journal | grep -i data`).

## First install (checklist)

1. `curl -s http://127.0.0.1:4317/api/health | grep -o '"available":[a-z]*'` should print `"available":true`. If it
   says `false`: with `claude-cli`, the unit's `PATH` is shorter than your shell's, so compare with
   `command -v claude` and fix `Environment=PATH=`. With `anthropic`, the API key isn't set.
2. Do a check-in at `http://localhost:4317`, then run
   `curl -s http://127.0.0.1:4317/api/today | grep -o '"source":"[a-z]*"' | head -1`. `"source":"ai"` is good.
   `"pool"` means the model didn't answer under the service.
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
- What the model sees depends on your provider (see the table under [Choosing an AI provider](#choosing-an-ai-provider)).
  Gratitude and private days are never sent anywhere.
- Notes and insights always render as plain text. Nothing from your files is rendered as HTML.
- Character stickers and decor paintings are for personal use only. They're gitignored and not in this repo, so a
  fresh clone shows empty sticker slots. Sources and licenses are in `web/public/IMAGE_SOURCES.md`. The herb plates
  are public domain, and the app icons are original.

## Back up your journal

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
- Small local models break the quest rules more often than Claude, which means more pool days.
- No random events yet. The weekly boss is the only extra challenge.

## How it was built

A team of Claude Code agents designed and built the app in short sprints: an architect, a behavioral psychologist
(motivation and the tael economy), a designer, a builder and a tester. Their plans, reviews and test reports are in
`docs/sprints/` and `docs/test-reports/`, and the agent definitions are in `.claude/agents/`. `CLAUDE.md` explains the
workflow.
