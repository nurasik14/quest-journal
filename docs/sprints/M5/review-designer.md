# Sprint M5 review / retro: quest-designer

> 2026-10-26 · async (the user is asleep). Judgement calls are marked **PROVISIONAL**.
>
> **Inputs:**
> - `sprints/M5/{plan-*,sprint-goal}.md`, `PROGRESS.md` §M5 + fix round 1, `BACKLOG.md`
> - `test-reports/2026-10-26-M5.md` (PARTIAL) and `…-M5-retest1.md` (PASS)
> - code: `routes/{Today,Market}.svelte`, `App.svelte` (toast), `theme/{CoinBadge,QuestCard}.svelte`, `tokens.css`
> - screenshots `M5-*`, `M5r1-*` and `builder-M5-*` in `docs/test-reports/img/`

## Verdict from the design side: **accepted, with small follow-ups**

The Palace Market looks like it belongs in this app, not like a template:
- the hero uses the drawers photo, the h1 sits on a scrim, and the `lg` sycee badge sits on it;
- the wishlist sits on a scroll with rods and a jade→gold bar;
- the tier headings are serif;
- the 買 seal sits on the bought row.

The economy UI follows the motivation rules: there is no red and no debt framing, and rows are never disabled. The negative balance renders as `−30` in the same gold as positive numbers. Dark mode holds up (`M5r1-07`): the muted lines measure 7.78:1, the chips 9.07:1 and the h2 14.17:1.

None of the remaining issues is a design MUST. The two I'd fix first are:
- the **toast width bug**: at 390 it wraps to 4 lines and covers the Market h1;
- the **unaffordable sheet still offers a live red "Buy"** button.

## 1. Designer-AC check

| AC | Result | Notes / evidence |
|---|---|---|
| D-AC1 one balance per header, one store | **PASS*** | Same number on Today, Evening, Market, Garden and Notes. *Exception: Evening goes stale after a save that earns a streak bonus (tester NEW-LOW-1, see §3) |
| D-AC2 `earned_today` out of the header | PASS | "+N today" is in the muted footer, and the header shows one number (`M5r1-08`) |
| D-AC3 delta float only where the change happened | PASS | 0 `.delta` after route changes or a reload (retest AC16) |
| D-AC4 one live sentence per coin event | PASS (after fix 1) | Buy = toast only. Undo = "Put back on the shelf. 150 taels returned." The bonus tap gives 2 events with 2 sentences, which I accept (same reading as the tester) |
| D-AC5 negative `−20`, tabular-nums, no red | PASS | `M5r1-08`/`09`: U+2212, gold ink, no icon |
| D-AC6 cards show real earnings | PASS, with gaps | Let-go dailies have no chip, the done note shows "+20 taels", and the boss shows its real number. Gaps: a **let-go boss still shows 100** (NIT-3, already in the backlog). The 済 seal sits next to the chip without overlapping it (`M5r1-01`) ✓ |
| D-AC7 streak line hidden < 2, herb icons, no empty slots | PASS | "6 days in a row in the ledger" under the plum-icon count-up line, muted. There is no "0" anywhere. Evidence gap: no shot of 2 herbs |
| D-AC8 bonus toast once + streak sticker | PASS, with a visual defect | Once per bonus, never on reload. **But** in `M5-02` the streak sticker sits under the 済 seal: the seal is stamped across the character's face. This is in the backlog as a builder COULD. I would raise it to SHOULD, because it spoils the biggest reward moment of the week |
| D-AC9 herb-used / rests / welcome-back info line | PASS | `M5-16`: `.qj-banner--info` style, dismissible, neutral copy. Persistence of "once" is an open builder→designer question, answered in §4 |
| D-AC10 Market layout | PASS | The tier h2s show, since the seed has `tier`. Rows are ≥ 76 px. At 320 the badge wraps under the h1 as planned (`builder-M5-08`) |
| D-AC11 unaffordable/cooldown rows not hidden | PASS | "needs 1,255 more taels" and "available again Wednesday / 2 Nov" in `--ink-muted` with a muted chip. Tapping one opens the sheet |
| D-AC12 sheet dialog semantics + 390/320 | PASS at 390; **320 not proven** | Trap, Esc, focus return and safe area are fine. The only 320 shot (`builder-M5-09`) was taken mid fade-in, before fix 1, and shows a semi-transparent sheet over the list. I have no clean 320 evidence of the shipped sheet |
| D-AC13 buying states, calm 409 | PASS | "Wrapping it up…", the sunk note in `role=status`, focus kept (`M5r1-05`). The cooldown-409 note was only checked through the API. The network-error toast was not exercised |
| D-AC14 seal + sticker in row gutter + 8 s Undo toast | PASS (after fix 1) | The sticker sits in its own `li` (`M5r1-03`), and the toast lasts 8019 ms and pauses on focus. Side effects: NIT-6 (the "Prescribed…" sub-line stays after Undo) and NIT-7 (the row grows ~50 px for 4 s) |
| D-AC15 recent purchases, voided row muted | PASS | "Returned" with no strike-through, Undo only within 24 h |
| D-AC16 wishlist progressbar, honest pace hint, states | PASS | The progressbar shows "235 / 350 taels · About 19 days at your recent pace." and "Ready when you are." The broken-file quarantine is calm, with numbered lines (`M5-17`) |
| D-AC17 visible pressed state | PASS | ✓ + sunk fill on "Save toward this" and on ProposalList Keep/Skip. **Closes the M4 designer MUST** |
| D-AC18 banned words, copy in `copy.ts` | PASS | Only `bossPaused` is allowlisted, and a reword is already in the backlog |
| D-AC19 reduced motion | PARTIAL | The sheet honours both the media query and `[data-motion=reduce]`. `CoinBadge` honours only the media query (NIT-4, backlog COULD). Checked from CSS only, never visually |
| D-AC20 works with no images | PASS | Hero colour fallback, h1 legible (`M5-14`). Sticker → sycee SVG in the same 44 px gutter (`M5r1-12`) |

**Score:** 17 PASS, 2 PASS-with-gap (D-AC6 and D-AC12 at 320), 1 PARTIAL (D-AC19, a COULD). None blocks the user.

## 2. What's good
- **Spending is celebrated, never questioned.** The sheet has one seal button, with no "are you sure?" and no "that's N days of work". The 409 note "You have 245 of 900 taels." is sunk paper, not an error banner. This is exactly the tone of the brief.
- **Rows never look disabled.** The muted chip plus "needs N more" keeps the goal gradient visible instead of hiding the item.
- **The negative balance is just a number.** There's no red, no icon and no shame. That's right for undo-driven negatives.
- **The wishlist scroll** is the most "Maomao's notebook" element in the app so far, and it reads well in dark mode.
- **The fix round was precise.** Only `Market.svelte`, `ledgerRules.ts` and `copy.ts` changed, and all four findings are verified live.
- The shared `.qj-btn[aria-pressed]` and dashed `:disabled` rules now live in `tokens.css`, so every toggle is consistent from here on.

## 3. What must change (ranked; all go to the backlog below)
1. **Toast width (SHOULD, new).** `App.svelte` `.toast { position:fixed; left:50%; transform:translateX(-50%) }` shrink-wraps to about 50 vw. At 390 the text "Bought: A specialty coffee or matcha latte." wraps to 4 lines, and the toast covers the Market h1 (`M5r1-03`). At 1280 it's one line (`M5r1-11`). Fix: `left:0; right:0; margin-inline:auto; width:fit-content; max-width:min(32rem, 100vw − 2·--sp-4)`. One rule fixes every toast in the app.
2. **Unaffordable sheet (SHOULD, new).** When `balance < price` or a cooldown applies, the sheet still shows the full red "Buy for 900 taels" (`M5r1-04`), a button that can only ever 409. Red should mean "this will happen".
   **PROVISIONAL** design:
   - Keep the sunk note ("You have 245 of 900 taels." / "Available again on Thursday.").
   - Replace the seal button with the **primary** "Save toward this" (or "Saving toward this ✓" if already pinned).
   - Keep a quiet secondary "Close".
   - There is no disabled Buy, so nothing reads as "locked".
   - The row itself stays tappable (D-AC11 unchanged).
   - The race case (affordable when opened, 409 on tap) keeps today's behaviour.
3. **Streak sticker under the 済 seal (raise the existing builder COULD to SHOULD).** `Today.svelte .sticker { top:-sp-4; right:-sp-2 }` puts it in the same corner as the card's seal. Move it to the card's **left** of the seal (`right: calc(seal-width + --sp-2)`) or to the top-band edge above the seal, never under it. This is the weekly bonus moment, so it should look deliberate.
4. **Evening bonus moment (SHOULD, tester NEW-LOW-1, design angle).** A rating save that makes today the 7th day earns +25 and a herb. Right now Evening doesn't update the badge, and the moment is **never** shown anywhere: Today sees `bonus_today` already set. Fix:
   - The evening PUT returns `economy`.
   - Evening shows **one** toast that merges both messages: "Sealed in the ledger. Another week in the ledger. +25 taels".
   - The `streak` sticker goes next to the header 済 seal, not in the flow above the save bar.
5. **NIT-6 / NIT-7 (COULD).**
   - On void, clear the bought-row state so "Prescribed…" disappears with the seal.
   - For the 4 s row growth at 390 (NIT-7): **PROVISIONAL**, accept it. Reserving a permanent 52 px gutter on all 15 rows would cost more than a 4-second reflow. Revisit only if it feels jumpy on the phone.
6. **320 heading orphan (COULD).** "Free permissions" wraps so that "· no money needed" starts the next line with a leading dot (`builder-M5-08`). Put the qualifier in its own `<span>` with `display:block` below 360 px and drop the "·".
7. **Evidence debt (SHOULD, process).** I have no clean shots of: the 320 sheet after fix 1, streak 12 + 2 herbs, the cooldown 409 note in the UI, and any reduced-motion visual. They go into the M6 test checklist.

## 4. Answers to other agents' questions
- **Architect (plan §5), "negative balance: real number or 0?"** The real number, as shipped: `−20` with U+2212, the same gold ink, and no copy, icon or red. Showing "0" would make the ledger lie, and the next earned quest would then appear to pay less. Confirmed against `M5r1-08`/`09`.
- **Psychologist / my own §4, "where does the wishlist pin live?"** I accept the builder's merge: **one** pin in `purchases.yaml` (`wishlist[]`). It keeps the user's commented `rewards.yaml` untouched and uses one mutex. My `rewards.yaml` preference is withdrawn. The pace hint ("About N days at your recent pace.", shown only with ≥7 logged days and avg > 0) reads calm in practice. Keep it.
- **Builder → designer, "do info lines need persistent 'once'?"** Yes, but a light version. **PROVISIONAL:** one `localStorage` key `qj.infoDismissed = "<logical date>:<kind>"`, overwritten each time (no growing list). If the key doesn't match today, show the line. The day-file data stays the truth, and the key only stores "seen". If storage fails, fall back to memory, as today.
- **Builder, "the sticker overlaps the seal (`builder-M5-02`)":** see §3.3. Move it left of the seal, raised to SHOULD.

## 5. Process note (for M6)
- **Screenshot timing is still the weak spot.** `builder-M5-05` and `builder-M5-09` were taken mid fade-in, and the only 320 sheet evidence is unusable. Next sprint, every shot of an animated surface (sheet, toast, sticker) waits for `animationend` (or sets `data-motion=reduce` first). The filename says what's visible.
- **The designer-AC table worked.** The tester mapped findings straight onto D-AC4/12/14, and the fix round was surgical. Keep numbered designer-ACs with named shots.
- **Specs need the full response list.** The Evening badge gap happened because the sprint goal listed which routes carry `economy` and left out the evening PUT. For M6 I'll phrase coin ACs as "**every** mutating response" and ask the architect to enumerate them, not leave them implicit.
- **Before planning M6,** I'll fold the shipped Market decisions into `design/screens.md` §3: sheet states for affordable vs not, toast width, and sticker placement. That way the builder isn't reading three sprint docs to find the current spec (backlog item below).

## PROVISIONAL decisions in this review
1. Unaffordable sheet: no seal button; "Save toward this" becomes the primary action (§3.2).
2. Accept the 4 s row growth from the in-row Market sticker (NIT-7).
3. Info-line "once" uses a single overwrite-only `localStorage` key (§4).
4. Raise "Today sticker overlaps the seal" from COULD to SHOULD through a new designer item. The old builder item stays as is and can be closed together with it.
