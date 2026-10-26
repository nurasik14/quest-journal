# Quest Journal

A personal daily quest + journal app. Each day Claude proposes 3 quests plus a weekly boss quest, personalized from a knowledge base about Nurasyl. Completed quests earn coins, which are spent in a reward shop (treat, café meal, manga). Each day stores a satisfaction rating and notes as a Markdown file.

- Architecture and decisions: `docs/ARCHITECTURE.md` (source of truth, don't contradict it silently)
- Visual design brief: `docs/DESIGN-BRIEF.md` (Apothecary Diaries style)
- Stack: TypeScript, Bun + Hono (API) + Svelte (Vite SPA, PWA). Phone access over Tailscale.
- Data lives in a **separate private git repo** (`DATA_DIR`, default `~/quest-data`), never in this repo.
- AI calls go through headless `claude -p` (Max subscription), with no Anthropic API key.

## Prerequisites not yet installed
- `bun` (`curl -fsSL https://bun.sh/install | bash`)
- `tailscale` (`sudo dnf install tailscale && sudo systemctl enable --now tailscaled`)

## Agent team (`.claude/agents/`)
The agents work in agile sprints: see `docs/PROCESS.md` and `docs/BACKLOG.md`.
Run them in this order. Each one writes its output to `docs/` so the next one can pick it up.

| Step | Agent | Role | Output |
|---|---|---|---|
| 1a | `quest-architect` | Brainstorm: software architecture, run as a VibeWise interview | `docs/brainstorm/architecture.md` |
| 1b | `quest-psychologist` | Brainstorm: behavioral psychology + game design | `docs/brainstorm/motivation.md` |
| 2 | `quest-designer` | Apothecary Diaries UI design system + screens | `docs/design/`, `web/src/lib/theme/` |
| 3 | `quest-builder` | Implements one build-order milestone at a time | code + `docs/PROGRESS.md` |
| 4 | `quest-tester` | Tests a milestone, reports pass/fail with evidence | `docs/test-reports/` |

1a and 1b run in parallel. Steps 3 and 4 then loop: build, test, fix, and repeat for each milestone.

**The architect is interactive.** The VibeWise `learn` skill only works in the main conversation, and subagents can't ask you questions. Run the architect as the main agent:
```
cd ~/Projects/quest-journal && claude --agent quest-architect
/vibe-wise:learn
```
If it's spawned as a subagent instead, it only drafts the question list (`docs/brainstorm/architecture-questions.md`) for you to answer later.

## Conventions
- Markdown day files must stay readable and editable by hand. The app must survive files edited by hand.
- Never commit the user's personal data to this repo. Never publish it.
- Styling uses **real images downloaded from the web** (see DESIGN-BRIEF). Anime/character images are for personal use only: they live in gitignored `web/public/stickers/` and `web/public/decor/img/`, are listed in `web/public/IMAGE_SOURCES.md`, and are never committed or published.
