# Sprint M5 plan: quest-designer (Economy: balance, streaks, Palace Market, reactions)

> 2026-10-26 · async (the user is asleep). Judgement calls are marked **PROVISIONAL**.
> Inputs: `ARCHITECTURE.md`, `brainstorm/architecture.md` §2.1/§2.3–2.5, `brainstorm/motivation.md` §3, `design/screens.md` §0/§3/§7,
> `design/design-system.md` §7–8, `BACKLOG.md`, `PROGRESS.md` §M4, `sprints/M4/*`, and the code (`routes/Market.svelte` is a placeholder; `Today.svelte` shows the
> `earned_today` CoinBadge; `CoinBadge`/`SealStamp kind="bought"`/`Sticker` and the `shop_buy`/`streak` manifest entries already exist).
> All visuals use the existing tokens and components. There are **no new colours, fonts or images**.

## 1. Acceptance criteria (designer-AC1…)
Evidence rule (from the M4 retro): each AC lists its screenshot(s). Pressed and changed states need a **before/after pair**. Viewports: 390×844 light + dark, plus 320×640
for the Market. Reduced motion is checked with `<html data-motion="reduce">`. Screenshot names must match what they show.

**Balance in the header**
- **designer-AC1:** Every tab screen (Today, Ledger, Market, Garden, Notes) shows **one** `CoinBadge kind="balance"` in its own header slot, top-right: the Today
  MoonGate `trailing` slot, the Market hero, and the page header elsewhere. It is not a new global sticky bar, which would cost ~56px of the 844px viewport (**PROVISIONAL**).
  Onboarding has no badge. The value comes from a single `economy` store that is updated from every `{economy}` the API returns. It never comes from a per-page
  recomputation. Test: on Today, mark a quest done, open Market, and the balance is the same number on both screens.
- **designer-AC2:** The `earned_today` badge is removed from the header. If the number is kept, it becomes a quiet `--ink-muted` line in the Today footer
  ("+45 today"), so it can't be read as the balance. Test: the header shows only one number.
- **designer-AC3:** The delta float plays **only on the screen where the change happened**, and never on mount or route change. Test: open Market after earning
  coins on Today, and no "+20" floats there.
- **designer-AC4:** There is exactly **one** live announcement per coin event. Today, `CoinBadge` says "Earned/Spent N…" and the quest note also announces it.
  A void/undo must read "Returned 150 silver taels. Balance 265." and **never "Earned"**. Pre-approved theme prop: `CoinBadge announce?: string | null`, where the parent
  supplies the sentence and `null` means silent. Test: the a11y tree or live-region text after done, buy, and undo shows one sentence each.
- **designer-AC5:** A negative balance renders as `−20` (U+2212) with no red, no warning icon and no banner. Numbers use `font-variant-numeric: tabular-nums`, so the badge
  doesn't jitter. Test: a fixture with balance −20 is shown in both themes.

**Quest cards with real earnings**
- **designer-AC6:** Each card's coin chip shows what the card **earns** (`earned` from `questEarnings`). That's the partial tier for partial, and **no chip** for let-go
  dailies. The boss shows `bossCoinsFor(...)` once done. This uses the pre-approved `QuestCard showCoins?: boolean` (still open from M4). The done note reads
  "+{earned} taels.", not `quest.coins` (`QuestCard.svelte:172` today). Test: a hard partial card shows 20, a let-go card has no chip, and a boss done with 1 of 4 checkpoints shows its real number.
  The 勝 seal doesn't overlap the chip.

**Streak and preserved herbs (motivation §3.5)**
- **designer-AC7:** Today shows a quiet streak line under the MoonGate. It uses `--ink-muted` and the plum-blossom icon, e.g. "5 days in the ledger · 1 preserved herb".
  The line is **hidden when streak < 2**: there is never a "0", never "streak broken" and no countdown. Preserved herbs show as **0–2 small herb-jar icons** with
  `aria-label="2 preserved herbs"`, and there are no empty slots ("1 of 2" invites loss aversion). Test: shots of streak 0, 5, and 12 with 2 herbs.
- **designer-AC8:** On a 7-day multiple: a top toast "Another week in the ledger. +25 taels" with the `plum-branch` photo strip, plus the `streak` sticker (Xiaolan).
  It shows **once per bonus**, keyed by the date that earned it, and never on reload. If it lands on the same tap as `quest_done`, the streak sticker wins (one sticker
  per screen).
- **designer-AC9:** When a freeze token is used automatically, the next Today open shows one neutral info line, once: "A preserved herb kept your streak while you were away."
  When the streak rests: "The streak rests. You've logged N days this month." It uses `.qj-banner--info`, which is never `--alert` or error styling, and it can be dismissed.
  Test: copy scan plus a shot of each.

**Palace Market (screens.md §3)**
- **designer-AC10:** The layout follows screens §3. The hero is the 120px `apothecary-drawers` photo with a scrim, the h1 "Palace market" and the `CoinBadge size="lg"`. Below it
  come the wishlist card (if set), the items, and "Recent purchases". Items are grouped by `tier` with h2s **when `tier` exists**. Otherwise there is one unheaded list
  (**PROVISIONAL**: architecture's `rewards.yaml` has no `tier`, but the psychologist's seed does). Each row has the title, a sub-line, and a price `CoinBadge kind="price"`. Rows are ≥ 48px tall.
- **designer-AC11:** Unaffordable or cooling-down rows are **never hidden or disabled**. They show `CoinBadge muted`, and the sub-line says "needs 40 more taels" or
  "available again Thursday" (`--ink-muted`, not red). Tapping one opens the sheet with the explanation. Test: shots at balance 120 with a 150 item and an item on cooldown.
- **designer-AC12:** The buy sheet is a bottom sheet with `role="dialog"`, `aria-modal`, a labelled title, a focus trap, Esc/close and the scrim. Focus returns to the row on close. It shows the
  title, the price, and "Balance after: 115". The single `.qj-btn--seal` "Buy for 150 taels" is the only red on screen, and there is no "are you sure?". The
  sheet sits above the tab bar and clears the safe area. Test: 390 and 320 shots, plus a keyboard Tab cycle that stays inside the sheet.
- **designer-AC13:** Buying states. While the request runs, the button reads "Wrapping it up…", is disabled, and keeps the same `request_id` on retry. A 409 shows an inline note inside the sheet on
  `--surface-sunk`: "You have 120 of 150 taels." / "Available again on Thursday." There is no red and no error code. A network error shows the toast "Couldn't reach the market.
  Nothing was spent." Test: a double tap gives one purchase, plus shots of both 409 notes.
- **designer-AC14:** After buying, the sheet closes, the 買 `SealStamp kind="bought"` stamps on the row, the balance floats "−150", and the `shop_buy` sticker
  (Gyokuyou/Lihaku) appears with "Prescribed. Take as directed.". It is **anchored to the row's right gutter**, `pointer-events:none`, and never `position:fixed` over buttons
  (closes M4 SHOULD part (c) for the Market). The top toast "Bought: café meal. Undo" stays **8s** and doesn't time out while focused or hovered (**PROVISIONAL**, because 4s is too short
  for an action). Test: a before/after pair of the row.
- **designer-AC15:** Recent purchases is a collapsible list, newest first, showing the date, name and price. "Undo" is a quiet button only within 24h. A voided row stays visible
  muted, with "Returned" and no strike-through. Undo is a neutral action, never framed as a mistake. Test: a shot with one voided and one live purchase.
- **designer-AC16:** The wishlist card has a `role="progressbar"` with `aria-valuenow/max` and a jade→gold fill (decorative gold `#c9a24a` only on the bar, with text in `--ink`).
  Its copy is "245 / 350 taels", plus "about 2 more good days" **only if** the server provides the estimate. It never says "N days left" and has no countdown. You set or clear the target
  through the sheet's quiet "Save toward this" toggle (`aria-pressed`, with a visible selected state, see AC17).
  Market states: loading shows the hero plus 4 static row skeletons (no shimmer under reduced motion). The empty shop shows "The market stalls are empty. Add
  rewards to `rewards.yaml`.". A broken `rewards.yaml`/`purchases.yaml` shows `.qj-banner--error` with the path in `<code>`, and the balance still renders.

**Cross-cutting**
- **designer-AC17:** Every toggle uses the M4 Keep/Skip rule: the computed background of `[aria-pressed=true]` ≠ `[aria-pressed=false]`, with a ✓ before the label (backlog MUST).
- **designer-AC18:** The banned-words copy scan is extended with `insufficient|afford|debt|broke|lose|lost|penalt|expire|hurry|only \d+ left|last chance`. Coin and
  streak strings live in `lib/copy.ts`.
- **designer-AC19:** Reduced motion: the seal, the float and the sticker become a 160ms fade, and the sheet opens without a slide. There is no confetti, sound or looping animation in the Market.
- **designer-AC20:** The Market works with no images: the hero falls back to colour and the stickers fall back to the `sycee`/`plum-blossom` SVG. Test: rename `decor/img` and check the shot.

## 2. Risks (what the builder will likely get wrong)
1. **Two sources of truth for the balance.** Today keeps `data.economy` while the Market fetches `/api/shop`, so the two badges disagree after a purchase. Use one store (AC1).
2. **CoinBadge announces "Earned 150" on undo**, and double-announces with the quest note (AC4). Also, `prev` resets on remount, which is fine, but a store that hydrates
   *after* mount fires a float on first load. Seed `prev` from the first non-null value.
3. **The disabled-looking unaffordable row.** The natural instinct is `disabled` and greyed out. That hides the price, and the "needs N more" goal gradient with it (AC11).
4. **A red 409.** `insufficient_funds` gets mapped to `.qj-banner--error` by the generic error handler. It must be the inline sunk note (AC13).
5. **The sticker covers the sheet or toast.** The existing Today sticker is `position:fixed` bottom-right, and copying it into the Market puts it over the buy button
   or the tab bar.
6. **A sheet without a focus trap or focus return.** On a phone this means the screen reader sits behind the scrim, and Esc does nothing on desktop.
7. **The streak toast replays** on every Today load, because it's derived from `streak % 7 === 0` and not keyed to the bonus event (AC8).
8. **Showing "0 days", an empty herb slot, or "streak reset"** (AC7/AC9): the classic abandonment trigger right after a lapse (psychologist M4 retro).
9. **`tabular-nums` missed**, so the badge width jumps as digits change, and at 320px the hero's "Palace market" wraps under the `lg` badge. Let the badge sit under the h1
   below 360px.
10. **Scope creep into mystery curios, the real-money budget or the market review** (motivation §3.3/§3.6). These are not M5 and need their own spec.

## 3. Backlog items for this sprint
**MUST**
- (quest-designer, M5) `ProposalList` Keep/Skip visible pressed state. It's the same rule as AC17, so do it once in a shared `.qj-toggle[aria-pressed]` style.
- (quest-architect, M5) Tester MED-1, a hand edit committed before the KB PUT. This isn't my area, but it's listed so it isn't dropped.

**SHOULD (economy-relevant, take in)**
- `QuestCard showCoins?: boolean` (pre-approved), plus per-quest `earned` on the chip (psych M3 SHOULD). It's a precondition for AC6.
- Event-sticker anchoring, part (c) of the async-feedback item: the Today sticker goes to the card gutter, using the same pattern as the Market row (AC14).
- Primary actions use `.qj-btn--primary`, and `.qj-btn:disabled` gets the dashed/muted style. The buy sheet needs this too, so fix it globally.
- psych `bossCoinsFor` (feeds AC6).
- psych: coin invariance with a non-zero balance (135) across onboarding save, decide and evening save.

**SHOULD (carry-overs; take if time allows, else re-tag M6)**
- Proposal textareas grow with their content; the reflection-block `scroll-margin-top` clears the toast; "Start over" moves above the onboarding footer; the `HerbRating` focus ring follows the leaf.

**COULD**
- `SealStamp` lift-out on true→false. Purchase undo makes this visible on the Market row too.
- The "All four marked. Seal the week?" boss hint.
- The `CoinBadge` "today" caption: obsolete once AC2 lands, so **close it**.

## 4. Question for the other agents
**To quest-architect + quest-psychologist:** where does the **wishlist target** live, and who owns the "about N more good days" estimate?
My PROVISIONAL default is a top-level `wishlist: <item_id>` in `rewards.yaml`. It's hand-editable and written comment-preserving through `updateYaml`. `GET /api/shop`
returns `wishlist: {item_id, have, need, est_days|null}`, where `est_days` = need ÷ (trailing 14-day average daily earnings), rounded up, and `null` when the average is 0.
The UI hides the phrase when `est_days` is null, so we never show "∞" or a guilt-tinged estimate on a rest week. Is that acceptable to both of you, or should the estimate be dropped entirely?

## PROVISIONAL decisions in this plan
- The balance goes in each screen's header slot, not a new global sticky bar (AC1).
- The toast with Undo lasts 8s and pauses on focus or hover (AC14).
- Tier grouping applies only when `tier` exists in `rewards.yaml` (AC10).
- Preserved herbs show only the icons held, with no empty slots (AC7).
- The wishlist lives in `rewards.yaml`, and the estimate is shown only when the server sends it (§4).
