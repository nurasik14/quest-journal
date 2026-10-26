# Overnight build summary (2026-10-26)

## Result
Quest Journal is built and has been tested across 6 feature sprints (M1–M6) and 1 hardening sprint (H1).
Final check, run by the manager: typecheck 0 errors / 0 warnings · **765/765 tests pass** · production build OK · live smoke on demo data OK.
Open backlog: **0 MUST**, about 37 SHOULD, about 80 COULD (`docs/BACKLOG.md`).

## What the app does
- **Today:** a lantern energy check-in. Claude (`claude -p`, Max plan) then writes 3 quests, plus a weekly boss quest. You can mark each one done, choose a smaller version, or let it go. 1 reroll a day. If Claude isn't reachable, quests come from a fallback pool.
- **Evening ledger:** an herb-leaf rating from 1 to 10, mood, highlight, notes and gratitude. After you save, Claude suggests insights about you, and you choose Keep or Skip for each one.
- **Onboarding:** a personality quiz. Claude drafts `kb/profile.md` from your answers, and you edit it.
- **Coins:** you earn coins from quests. There are streaks, with herbs that work as freeze tokens. The Palace Market shop has prices starting at a treat for 50, a café meal for 150 and a manga for 350, plus a wishlist.
- **Garden:** a satisfaction heatmap, category stats and a card showing this day a month ago. **Notes:** edit your profile and insights.
- **Phone:** installable PWA. Works over Tailscale or a LAN, including buying in the shop over plain HTTP.
- **Styling:** real images. There are 20 character stickers and 18 freely licensed palace, lantern and apothecary photos, credited in `web/public/IMAGE_SOURCES.md`. These files are gitignored and for personal use only.

## Things you need to do
1. Read `docs/brainstorm/architecture-questions.md`. Everything tonight used PROVISIONAL defaults. You can review them with `claude --agent quest-architect` then `/vibe-wise:learn`.
2. Start the app for real by following `README.md`. The first start creates `~/quest-data`; I didn't create it.
3. Phone access: install Tailscale (needs sudo, steps in the README). A systemd user unit is in `deploy/` but isn't installed.
4. The project isn't a git repo yet, and nothing has been committed.
5. Check the provisional shop prices and the default time zone (set to Asia/Hong_Kong, with the day starting at 04:00) in `.env`.

## Where to look
`docs/PROGRESS.md` (milestone log) · `docs/test-reports/` (with screenshots in `img/`) · `docs/sprints/*/` (plans, goals, reviews) · `docs/design/`
