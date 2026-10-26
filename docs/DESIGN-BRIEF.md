# Design brief: "The Apothecary's Ledger"

The app should feel like Maomao's apothecary notebook, kept inside the Inner Court of the imperial palace in *The Apothecary Diaries* (Kusuriya no Hitorigoto). Quests are "prescriptions". Coins are "silver taels". The shop is the "palace market". The journal is the "herbal ledger".

## Mood
- Calm, curious, a little mischievous. Inspired by Tang-dynasty court style: elegant, without excess.
- Mostly **green** (jade, herbs, celadon), balanced with warm paper and small hints of vermilion and gold.

## Palette (starting tokens; the designer will refine them)
| Token | Light | Use |
|---|---|---|
| `--jade` | `#3f7d5c` | primary actions, quest seals |
| `--celadon` | `#a8c8b0` | cards, soft fills |
| `--herb-dark` | `#1f3d2e` | headings, ink |
| `--paper` | `#f4ecd8` | background (rice paper) |
| `--vermilion` | `#c0392b` | seal stamps, "done" marks, warnings |
| `--gold` | `#c9a24a` | coins, boss quest, borders |
| `--plum` | `#7a4a6b` | Jinshi-violet accent, used sparingly |
Dark mode: a "night in the Jade Pavilion" look, with deep green-black, lantern-gold highlights and low-saturation jade.

## Motifs and decorations
- Lattice window borders (palace window patterns) as SVG frames around cards
- Hanging paper lanterns, plum blossoms, ginkgo leaves, mortar and pestle, herb sprigs
- A round "moon gate" frame for the daily header
- A vermilion seal stamp (hanko/chop) animates onto a quest when it's completed
- Scroll-style headers that unroll on page open (respect `prefers-reduced-motion`)
- Paper grain texture as a subtle background

## Typography
- Display: a brush-like serif, e.g. "Shippori Mincho", "Zen Antique" or "Noto Serif SC" (Google Fonts)
- Body: a readable serif or humanist font, e.g. "Noto Serif" or "Zen Kaku Gothic New"

## Real images, not hand-drawn art (user requirement)
The user wants the app styled with **real pictures from the internet**, not decorations we draw ourselves. The designer sources and downloads them:
- **Character stickers** (Maomao, Jinshi, Gaoshun, Xiaolan, Lihaku, the cat Maomao, etc.): official art, screenshots and fan art, preferably with transparent backgrounds. They go into `web/public/stickers/`. These are copyrighted and for the user's personal private use only, so they're **gitignored, never committed and never published**.
- **Decorations and backgrounds:** photos or illustrations of Chinese palace architecture (Forbidden City lattice windows, moon gates, red pillars, roof tiles), paper lanterns, plum blossoms, herbs, mortar and pestle, rice-paper and silk textures. Prefer freely licensed sources (Wikimedia Commons, Unsplash, Pexels, Openverse). They go into `web/public/decor/img/` (gitignored).
- Every downloaded file is recorded in `web/public/IMAGE_SOURCES.md` (file → source URL → license/"personal use only").
- Safety: download only image files (check with `file`). Optimize them to ≤300 KB each (webp is fine), and keep the total under ~15 MB.
- Hand-drawn SVG is only allowed as the fallback when an image is missing, never as the main decoration.
- Stickers react to state: Maomao looks pleased when you finish quests, Jinshi appears for the boss quest, and the cat appears on reroll.
- `stickers/manifest.json` maps moods/events to filenames, so missing files degrade gracefully into decorative SVG placeholders.

## Screens
Today (prescription scroll with 3 quests + boss) · Evening ledger (rating as 1–10 herb leaves, notes) · Palace market (shop) · Archive (satisfaction heatmap styled as a garden grid) · Profile (the "Apothecary's notes on you")

## Requirements
- Mobile-first (PWA on phone), 16px gutters, large tap targets
- WCAG AA contrast in both themes
- Decorations are `aria-hidden` and never block content
