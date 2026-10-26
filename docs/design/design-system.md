# Design system: "Maomao's herbal notebook"

> Redesign 2026-10-27 (replaces "The Apothecary's Ledger" of 2026-10-26). Made with the Hardlight UI workflow.
> Code: `web/src/lib/theme/` (tokens, fonts, components, `folio.ts`) · Images: `web/public/decor/img/` (gitignored), `web/public/decor/herbs/` (committed), `web/public/stickers/` · Credits: `web/public/IMAGE_SOURCES.md`
> Component API: `web/src/lib/theme/README.md`. Screen specs: `screens.md`.

## 1. Why it changed

The first version said "Apothecary Diaries" with generic China signifiers: stock photos of the Qing-dynasty Forbidden City, a moon gate, red lanterns, gold sycee, a jade-and-cream wellness palette. The display font didn't load, the task checkboxes were browser defaults, the Today header was mostly empty, and the main card was half a scroll and half a building photo.

The series is set in a fictional court that borrows mostly from Tang China (with Ming and later pieces), and its heroine keeps notes on herbs and poisons. So the redesign makes every screen **a leaf of the apothecary's own notebook**, built from the conventions of real Chinese woodblock herbals and Tang court painting, not from tourist imagery.

## 2. Principles

1. **The object is a real kind of book.** Thread-bound (線装) herbal pages give the structure: a vermilion double rule round the page (四周雙邊), the folded centre strip with a fish-tail mark (版心, 魚尾), vertical labels in the margin of each entry, red circles a reader inks beside a passage (圈點), seals for completion, a title slip on the cover (題簽).
2. **Period sources, not costume.** Decoration is Tang/Song court painting (宮樂圖, 簪花仕女圖, 搗練圖), a 1590 本草綱目 page, and woodblock plates from 植物名實圖考 (1848). One modern photo stays: a real medicine-drawer cabinet for the market.
3. **Brush text is decoration; English carries meaning.** Every kanji label is `aria-hidden` or duplicates the English beside it. Headings, buttons, status and errors are in English.
4. **The character colours mean something.** Maomao's jade is the primary action colour; Jinshi's violet marks only his weekly commission; vermilion is ink for ruling and seals (never for the user's own failures).
5. **Kind feedback** (motivation doc). Completion is stamped immediately. "Let go" is neutral (no red, no shake). Low ratings get the same jade leaves as high ones. Purchases are celebrated, never questioned.
6. **Mobile first.** 16px gutters, 48px targets, one 36rem column, bottom index tabs for the thumb. On wide screens the leaf lies on the cover cloth with its binding on the right edge.

## 3. Imagery

| Role | Asset | Treatment |
|---|---|---|
| Page | Generated paper grain + long fibres (SVG noise, no tiling seams) | Over `--bg`; on ≥42rem the leaf sits on `--desk` with a shadow and four indigo stitches on the right edge |
| Today header | Herb of the day: one of 17 woodblock plates (`decor/herbs/*.webp`) picked by `plateFor(server date)` | Ink-only alpha mask, printed with CSS `mask-image` in `--ink`, so it works in both themes; caption 甘草 · gāncǎo · Licorice root, plus one verifiable line and the source |
| Evening band | `band-evening.webp`: 宮樂圖, Tang court ladies at a banquet | 72px strip closed by a vermilion double rule |
| Garden band | `band-garden.webp`: 簪花仕女圖 detail | Same |
| Notes band | `band-notes.webp`: 本草綱目, 1590 first edition (CC BY 4.0, Wellcome Collection) | Same |
| Onboarding hero | `hero-consorts.webp`: 簪花仕女圖, the round-fan detail | Full-bleed top |
| Loader | `loader-pestle.webp`: 搗練圖, women working with long pestles | Inside a round silk fan (團扇) with a wooden handle; bobs like the pestle |
| Market header | `apothecary-drawers.webp` (real TCM drawer cabinet) | Inside a vermilion double rule; each reward row below is a drawer with a paper label |
| Character stickers | `stickers/*.webp` (unchanged) | Die-cut paper sticker. On Today they sit over the entry's margin column, never over a seal, the title or a button |

**Dark theme images** get `--photo-filter: brightness(.8) saturate(.85)` or the `--photo-scrim` layer.

**Missing images.** Every CSS use stacks a colour or gradient under the `url()`, and `Photo` / `HerbPlate` / `Sticker` swap to an SVG on error. A fresh clone (gitignored folders empty) still shows the full page structure, the herb plates (committed) and the fonts (committed).

**Budget:** decor 424 KB in 6 files; herb plates 17 files, 32–96 KB each; fonts 7 WOFF2 subsets, about 290 KB total. `/decor/*` and `/stickers/*` use the service worker's runtime cache-first route; fonts are fingerprinted into `/assets` and precached.

## 4. Colour tokens

Components use the **semantic** tokens (`--bg`, `--ink`, `--accent`…), never the brand ones directly.

### 4.1 Light: "paper by day"

| Token | Value | Role |
|---|---|---|
| `--bg` (`--paper`) | `#f3ead6` | Unbleached page |
| `--surface` (`--paper-light`) | `#fbf6ea` | A fresh leaf: cards, inputs |
| `--surface-sunk` (`--paper-deep`) | `#ebdfc5` | Wells, disabled, quiet cards |
| `--desk` | `#e6d8b8` | Cover cloth behind the leaf; index tabs |
| `--ink` (`--sumi`) | `#2a251f` | Text: warm lamp-black, not green |
| `--ink-muted` | `#5b5246` | Secondary text |
| `--ink-faint` | `#9a8e78` | Decoration only |
| `--line` / `--line-strong` | `#d9c9a8` / `#857a64` | Dividers / input borders |
| `--rule` / `--rule-faint` | `#c4685a` / vermilion 28% | 朱絲欄 ruling (decorative only) |
| `--accent` (`--jade-deep`) | `#2f6b4c` | Primary button (Maomao's green) |
| `--accent-ink` (`--jade-ink`) | `#2a6346` | Jade text, links |
| `--jade` | `#3f7d5c` | Leaves, icons (non-text) |
| `--accent-soft` | `#e2ebdf` | Pressed chips, info banners |
| `--seal` (`--vermilion`) | `#ad3326` | Seals, seal button, entry numbers, errors |
| `--boss` (`--plum`) | `#5d4a87` | Jinshi's violet: weekly commission, focus ring |
| `--coin` (`--silver`) | `#a3a7ab` | The tael ingot (decoration) |
| `--coin-ink` / `--coin-soft` | `#5a4f3c` / `#ece6d8` | Tael numbers / pill |
| `--gold` | `#b8913f` | Decoration only (fallback banner stripe) |
| `--thread` | `#3b4a6b` | Indigo binding thread |
| `--wood` / `--wood-edge` | `#8a5f3c` / `#5e3f27` | Drawer fronts in the market |
| `--garden-1…5` | `#ebe3c9` `#dbe2c4` `#b5cfa9` `#84b28c` `#2a5f43` | Heatmap 1–2 … 9–10 |

### 4.2 Dark: "by lamplight"

Ink-stone black, paper-coloured ink, vermilion and violet lifted to read under a lamp. Activated by `prefers-color-scheme: dark` (unless `[data-theme=light]`) or by `[data-theme=dark]`.

| Token | Value | Notes |
|---|---|---|
| `--bg` / `--surface` / `--surface-sunk` / `--desk` | `#15120e` / `#1e1a15` / `#100d0a` / `#0c0a08` | Warm black, not green |
| `--ink` / `--ink-muted` | `#ece3cb` / `#b3a993` | |
| `--line` / `--line-strong` | `#3a3229` / `#7d7262` | |
| `--accent` = `--jade` / `--accent-ink` | `#86bf9b` / `#96cba9` | Dark text on jade |
| `--seal` | `#e3786a` | |
| `--boss` | `#bba7e0` | |
| `--coin` / `--coin-ink` | `#c9ccd1` / `#d9d1bd` | |
| `--focus-ring` | `#e3bd62` | Lamp gold |
| `--on-accent` / `--on-seal` | `#15120e` | |
| `--garden-1…5` | `#221d17` `#22392c` `#2b4a37` `#5f9a72` `#9fd0ae` | |

### 4.3 Contrast (measured with `hardlight_contrast`, WCAG relative luminance)

Text needs ≥ 4.5:1; UI components and graphics ≥ 3:1. All pairs below pass.

| Pair | Light | Dark | Use |
|---|---|---|---|
| `--ink` on `--bg` | 12.69 | 14.60 | Body text |
| `--ink` on `--surface` | 14.08 | — | Card text |
| `--ink` on `--desk` | 10.76 | 15.45 | |
| `--ink-muted` on `--bg` | 6.41 | — | Secondary text |
| `--ink-muted` on `--surface` / `--surface-sunk` | — / 5.80 | 7.43 / 8.31 | |
| `--ink-muted` on `--desk` | 5.43 | 8.48 | Tab labels |
| `--accent-ink` on `--bg` | 5.91 | — | Links |
| `--accent-ink` on `--surface` | — | 9.40 | |
| `--accent-ink` on `--accent-soft` | 5.78 | — | Pressed chips |
| `--on-accent` on `--accent` | 5.85 | 8.84 | Primary buttons |
| `--seal` on `--surface` | 5.94 | 5.90 | Seal glyph, error text |
| `--seal` on `--bg` | 5.35 | — | Entry numbers, current tab kanji |
| `--seal` on `--desk` | 4.54 | 6.74 | |
| `--on-seal` on `--seal` | 5.94 | 6.37 | Seal buttons, chosen pulse cell |
| `--boss` on `--surface` | 6.97 | 8.01 | Commission eyebrow, margin label |
| `--boss` on `--bg` | 6.28 | 8.64 | |
| `--boss` on `--boss-soft` | 6.15 | 7.41 | |
| `--coin-ink` on `--coin-soft` | 6.45 | 10.54 | Tael pill |
| `--ink` on fallback / error / info banners | 12.11 / 12.04 / 12.43 | 12.06 / 11.80 / 11.70 | |
| `--garden-ink-N` on `--garden-N` | ≥ 6.31 | ≥ 5.65 | Heatmap numbers |
| `--line-strong` on `--bg` / `--surface-sunk` (non-text) | 3.53 / 3.20 | 3.96 / 4.11 | Input borders, unticked circles |
| `--jade` on `--bg` (non-text) | 4.08 | 8.84 | Leaves, icons |
| `--focus-ring` on `--bg` | 6.28 | 10.42 | Focus outline |
| `--rule` on `--bg` | 3.21 | — | Decorative ruling (not relied on) |

Not measured: text over the painting bands (no text sits on them) and the market title on its photo, which keeps the dark scrim and text shadow; it needs a look at the rendered composite, not a colour pair.

### 4.4 Category accents and margin headings

Accents colour only the diamond in the margin and the category icon; chip text stays `--ink`. Each category also has a materia-medica heading, written vertically in the entry's margin.

| Slug | Display | Margin | Light | Dark |
|---|---|---|---|---|
| body | Tonic | 養身 | `#b5543f` | `#e08a74` |
| mind | Focus draught | 醒神 | `#3f7d5c` | `#86bf9b` |
| social | Court gossip | 閑話 | `#7a4a6b` | `#c9a0bd` |
| creative | Ink & brush | 筆墨 | `#34557a` | `#8fb0d6` |
| adventure / outside | Expedition | 遠行 | `#b0832c` | `#e3bd62` |
| care / rest | Rest remedy | 安神 | `#6f9c86` | `#9cc7b2` |
| learning | Herbal study | 本草 | `#2e6f73` | `#7cc2c4` |
| treat | Sweet medicine | 甘味 | `#c0687e` | `#e7a3b4` |
| chores | Palace chores | 雜務 | `#7a6a4f` | `#c2b08a` |

## 5. Typography

Self-hosted WOFF2 subsets (`web/src/lib/theme/fonts/`, made by `scripts/subset-fonts.py`; all SIL OFL 1.1). There are no third-party requests, and the fonts work offline because Vite fingerprints them into the precached `/assets`.

| Role | Family | Token |
|---|---|---|
| Display: dates, headings, quest titles, numerals, seals | **Shippori Mincho B1** 500/700/800 (Latin + every kanji the UI uses) | `--font-display`, `--font-seal` |
| Maomao's notes (`why`), the herb note, ruled textareas | Shippori Mincho B1 500 | `--font-note` |
| UI: buttons, labels, chips, metadata | **Zen Kaku Gothic New** 400/500/700 (Latin) | `--font-body` |
| Vertical brush labels: margins, tabs, title slips, the spine date | **Yuji Syuku** (kanji only) | `--font-brush`, class `.qj-brush` (vertical-rl, upright) |

The kanji subset is collected from `web/src` at build time of the subsets (125 glyphs today). **A new kanji anywhere in the source needs a re-run of the subset script**, or it falls back to a system Mincho.

| Token | Size | Use |
|---|---|---|
| `--fs-xs` | 13px | Metadata, legends (never body copy) |
| `--fs-sm` | 14px | Secondary text, chips |
| `--fs-base` | 16px | Body, inputs, Maomao's note |
| `--fs-md` | 18px | Field labels |
| quest title | 20px (commission 21.6px) | Mincho 700 |
| `--fs-lg` | 22px | Section headings |
| `--fs-xl` | 26→32px | Page titles |
| Today date | 28→41.6px | "26 October" stays on one line at 320px |

Numbers use `tabular-nums lining-nums`. Uppercase is used only for small eyebrows.

## 6. Spacing, radii, borders, elevation

- **Spacing** (4px base): `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 (the gutter) · `--sp-5` 24 · `--sp-6` 32 · `--sp-7` 48 · `--sp-8` 64. `--margin-col` 2.5rem is the entry's label column.
- **Targets:** `--tap` 48px, `--tap-min` 44px. Nothing interactive is smaller than 44×44.
- **Layout:** one column, `--content-max: 36rem`. `.qj-page` is the leaf: double rule inset 6px (10px on wide screens), bottom padding for the tabs plus `env(safe-area-inset-bottom)`.
- **Radii:** paper is cut square: `--r-xs` 1, `--r-sm` 2, `--r-md` 3 (buttons, inputs), `--r-lg` 6 (tab bottoms). Only seals, the loader fan and pulse stamps are round.
- **Borders:** hairline 1px, line 1.5px, double rules 2px + 1px.
- **Elevation:** a page lies on a desk, so shadows are short and warm. `--shadow-1` chips, `--shadow-2` leaves, `--shadow-3` the page on the desk and the tab bar.
- **Z-index:** decor 0 · content 1 · seal 2 · sticky 10 · nav 20 · toast 30 · overlay 40.

## 7. Shared controls (classes in `tokens.css`)

| Class | What |
|---|---|
| `.qj-btn` (+ `--primary`, `--seal`, `--quiet`, `--block`, `--sm`) | 48px, nearly square. Primary = jade (one per view). Seal = vermilion, only for "Seal today's ledger" and "Buy". Quiet = text button |
| `.qj-chip` | A paper slip (付箋): square-cut with a darker left fold. 44px when it's a toggle; `aria-pressed="true"` adds a ✓ and the jade fill |
| `.qj-field`, `.qj-label`, `.qj-hint`, `.qj-input`, `.qj-textarea` | Forms. The textarea is set in the Mincho on vermilion ledger lines |
| `.qj-banner` (+ `--fallback`, `--error`, `--info`) | A slip pinned to the page: text plus a 4px left stripe, never colour alone |
| `.qj-brush` | Vertical brush text (decorative labels) |
| `.qj-page` | The leaf |
| `.qj-sr-only` | Visually hidden text |

## 8. Motion

| Moment | Animation | Duration | Reduced motion |
|---|---|---|---|
| Leaf appears (`unroll`) | Ink soaks in: opacity + 1.2px blur → sharp | `--dur-unroll` 520ms | 160ms fade |
| Today header | Same ink-in for text, spine and plate (plate +120ms) | 420/520ms | 160ms fade |
| Quest done | **SealStamp**: scale 1.9→0.9→1 with rotation, blur→sharp, ink ring | `--dur-stamp` 520ms, overshoot | 160ms fade |
| Checkpoint ticked | Vermilion fill, white dot scales in | 140ms | Instant |
| Pulse reading chosen | The brush numeral stamps in (scale 1.35→1) | 260ms | None |
| Coins change | "+20" chip floats up and fades; polite live region | 1.4s | Static chip 1.6s |
| Sticker appears | Pop from 0.6 scale | 360ms | Fade |
| Loading | The painted pestles bob inside the fan; dots cycle | 1.1s loop | Still fan and text |
| Buttons | Press: 1px down | 140ms | Instant |

Rules: animations play once, in response to the user or on first mount; the loader is the only loop. The seal animates only on a `false → true` transition while mounted. `prefers-reduced-motion: reduce` **or** `<html data-motion="reduce">` (the Profile setting) collapses the `--dur-*` tokens and switches components to fades. No parallax, carousels or confetti.

## 9. Component inventory

All Svelte 5 (runes) with typed props; full API in `web/src/lib/theme/README.md`. Names from the first design were kept where the role stayed, so routes and tests didn't change.

| Component | Purpose |
|---|---|
| `FolioHeader` (new, replaces `MoonGate`) | Today's page head: spine column with the brush date, date `h1`, herb of the day |
| `HerbPlate` (new) | One woodblock plate as an ink mask, with name, pinyin and English |
| `PageTitle` (new) | Vertical 題簽 title slip beside a page `h1` |
| `ScrollCard` | A leaf: default / boss (violet double rule + silk cord) / quiet / alert; painting `band`; ink-in |
| `QuestCard` | One prescription with the brush margin (第一方 / 依頼 + category heading), Maomao's note, 圈點 checkpoints, seal |
| `LatticeFrame` | The 四周雙邊 double rule round important content (vermilion / jade / violet) |
| `LanternScale` | The 一–五 pulse reading (energy check-in) |
| `HerbLoader` | Silk fan with the 搗練圖 pestles; escalating messages |
| `SealStamp`, `CoinBadge`, `Sticker`, `HerbRating`, `Photo`, `Icon` | As before; CoinBadge's ingot is silver |
| `NavBar` (`lib/components`) | Index tabs: 方 録 市 苑 記 over Today / Ledger / Market / Garden / Notes; the current tab joins the page |

Support modules: `folio.ts` (kanji numerals and dates, brush labels, herb plates), `vocab.ts`, `assets.ts`, `stickers.ts`, `theme.ts`, `types.ts`.

## 10. Verification (2026-10-27)

- `svelte-check`: 0 errors, 0 warnings. `bun test`: all pass.
- Rendered on a separate demo instance (seeded scratch data, port 4399, AI off, git off; never `~/quest-data`): Today, Evening, Market, Garden, Notes and Onboarding at 390px light and dark, and Today at 1280px.
- Exercised there: check-in → generation; marking a quest done (済) and the weekly commission done/undo (勝); keyboard ticking of checkpoints (Space toggles and saves, focus stays, Tab moves on); every focus stop showed a 3px ring; all 10 brush labels hidden from assistive tech; rating → "Seal today's ledger" (済 on the header); in-app reduced motion (durations collapse, header fades); server stopped mid-session → offline banner and the quiet "Can't reach your laptop" card on Market.
- Not done: a screen-reader pass with real AT, iOS Safari on a phone, and a check of the market title over its photo in the rendered composite.

## 11. Decisions carried over

1. **Character art source:** MyAnimeList character pages, personal use only, gitignored. "The cat" uses real cat photos (CC0/PD/CC BY).
2. **Status vocabulary:** Done / Smaller version / Let go. Today passes `letGoStatus="let_go"` and `allowPartial`.
3. **Categories:** both enums (the psychologist's 8 and the architect's `outside`/`rest`/`chores` aliases).
4. **Rating colour is constant jade** for every value (no red for low days).
5. **Seal glyphs:** 済 done, 半 smaller version, 勝 weekly commission, 買 purchase.
6. **Default theme = system**; the override is stored in `localStorage['qj-theme']` (Profile: System / Paper / Night).
