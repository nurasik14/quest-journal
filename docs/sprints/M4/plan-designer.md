# Sprint M4: plan (quest-designer)

> 2026-10-26 · Author: quest-designer. Scope: **onboarding quiz → profile draft → edit/save**, and **reflection after the evening save → per-op approval → insights.md**.
> Inputs: `ARCHITECTURE.md`, `brainstorm/architecture.md` §2.5–2.8, `brainstorm/motivation.md` §5–6, `design/screens.md` §2/§5/§6, `sprints/M3/*`, `BACKLOG.md`, and the code
> (`routes/{Evening,Profile}.svelte`, `lib/router.svelte.ts`, `theme/vocab.ts`). Profile is still the M6 placeholder and there's no `/onboarding` route yet.
> The user is asleep, so judgement calls are marked **PROVISIONAL**. Per the M3 retro, every AC about a message says *where* it appears and what it must not cover.

## 1. Acceptance criteria (designer-AC*)
All of these apply at 390×844 and 320×640, in light and 🌙 dark mode. "First viewport" means visible without scrolling.

**Onboarding: "Entering the Inner Court" (screens §6)**
- **designer-AC1** The `/onboarding` route renders full-screen **without the tab bar**. It shows the `moon-gate-garden` hero (or the colour fallback if the image is missing), one `h1` "Welcome to the apothecary", the intro line "Answer a few questions so the prescriptions fit you. Skip anything you like.", and at most **one** sticker (`event="idle" seed="onboarding"`), which never overlaps text or buttons.
- **designer-AC2** One question per screen inside a `ScrollCard`. Each question has an `h2`, and focus moves to that `h2` on Next/Back. Progress reads "Question N of M" with `role="progressbar"` and `aria-valuenow/max`. Input types: Likert = 5 `.qj-chip` radios ("Not me" … "Very me") in a `radiogroup` that works with the arrow keys; short = `.qj-input`; long = `.qj-textarea`; multi = wrapping chips in a `group`. Nothing uses a new colour, and no button is wider than 100 % at 320 px.
- **designer-AC3** The sticky footer **Back · Skip · Next** has a paper backing and a spacer. A focused textarea or the last chip row is never hidden under it (check with the 320×640 viewport and the soft keyboard emulated as 320×400). On the last question, the primary button reads **"Ask Maomao to write my notes"** (`.qj-btn--seal`). It's enabled even if every question was skipped, because skipping is allowed.
- **designer-AC4** Answers survive a reload and navigation (they're in `localStorage` under one `qj:onboarding:v1` key, PROVISIONAL) and are **cleared on a successful profile save** or on "Start over". Nothing else from the app goes into storage.
- **designer-AC5** Drafting state: `HerbLoader message="Maomao is writing up her notes on you…"` appears within 300 ms of the tap, with the line "Keep this tab open, or come back later. Your answers are kept." It's keyed on the job id, so it survives leaving the route and coming back (same pattern as M3 generate_day). It shows a single `…` with no "……", and it's calm under `prefers-reduced-motion` **and** `[data-motion=reduce]`.
- **designer-AC6** Failure state (the job failed; there's **no fallback** per arch §2.5): "Couldn't reach Claude. Your answers are safe." plus primary **"Try again"** and quiet **"Write my notes myself"**. The second button opens the editor with a headings template (`# About me`, `## Likes`, `## Goals`, `## Energy & routines`, `## Budget`, `## Please avoid`; PROVISIONAL). No raw error codes, no red.
- **designer-AC7** Draft review: one full-height ruled `.qj-textarea` holding the Markdown **as plain text**, the muted hint "Edit freely. This file is yours.", and primary **"Save my notes"** in a sticky bar. A successful save shows the toast "Notes saved." at the **top** of the viewport (no seal stamp) and then navigates to Today. A 412 or an existing profile shows the info-style stale panel and keeps the user's text (same pattern as Evening).
- **designer-AC8** Entry points: (a) when `profile.md` is empty, Today shows **one** quiet invitation line under the MoonGate, "Maomao knows nothing about you yet. → Answer a few questions". It's dismissible, never a modal, and never pushes the check-in card below the first viewport. (b) The Profile placeholder shows "Start the onboarding quiz" when the profile is empty, and "Retake the quiz" otherwise. Retaking never overwrites without the review step.

**Reflection and approval (screens §2 "Reflection" + §5 item 2)**
- **designer-AC9** After **Seal**, the Reflection block renders **directly below the sealed header/rating** (not after Gratitude), and the page scrolls it into the first viewport. Its states:
  - loading: `HerbLoader size="sm" message="Maomao is reading your ledger…"`, with the line "You can leave; her notes will wait in Notes."
  - ready
  - no ops: the muted line "Nothing new to note today."
  - failed: "Couldn't reach Claude for reflections. Your ledger is saved." + quiet "Try again"
  - care (see AC13)
  - private day / past date: **no block at all**
- **designer-AC10** Proposal rows (one per op, text-only, `{@html}` nowhere):
  - **add**: jade left stripe + the eyebrow "New note" + an editable `.qj-input` (max 200, with a counter).
  - **edit**: the current text struck through in `--ink-muted` above an editable new text field.
  - **remove**: the struck-through text, then "Why: <reason>".
  - All rows: evidence dates as small chips ("Oct 12", full date in the `aria-label`), plain text in M4 because Archive is M6. Each row has **Keep** (primary sm) / **Skip** (quiet sm) as a toggle pair with `aria-pressed`. "Skip" maps to `accept:false`. The words "Reject", "wrong" and "error" are never used.
- **designer-AC11** **"Apply my choices"** is enabled once ≥1 row has a choice. Undecided rows stay pending. It's never hidden under the Evening save bar: once the day is sealed, the save bar collapses to a non-sticky "Sealed ✓ · Edit" line. After apply, kept rows get a small 済 seal and skipped rows fade to muted. A row the server marks `stale` shows "This note changed since. Left as it is." Toast "Added to your notes." goes to the **top**.
- **designer-AC12** Pending proposals also show at the top of `/profile`, using the same component (`ProposalList`), and as a **jade dot with no count** on the "Notes" tab (`aria-label` "Notes, new suggestions"). The dot clears when nothing is pending.
- **designer-AC13** **Care path** (`care_message` from motivation §6.2): a quiet `ScrollCard` with **no sticker, no seal, no proposals and no Keep/Skip buttons**, and the app-owned copy from `vocab.CARE_NOTE` (PROVISIONAL: fixed wording, not model text). The low-rating sticker is also suppressed that evening.
- **designer-AC14** Insight and proposal text never truncates mid-word without a way to expand it. Use `overflow-wrap:anywhere`. At 320 px a 200-char note plus 5 evidence chips fits with no horizontal scroll.

**Cross-cutting**
- **designer-AC15** Banned-word scan (existing test) covers every new M4 string. Copy is tentative and Maomao-voiced, with no "AI", "error", "failed" or "invalid" in visible text.
- **designer-AC16** All new strings live in `theme/vocab.ts` / `lib/copy.ts`. New UI uses existing tokens and classes (`.qj-btn`, `.qj-chip`, `.qj-input`, `.qj-banner--info`), with **no new colours or tokens**. The diff stripe uses `--jade`/`--ink-muted` only.

## 2. Risks: what the builder will likely get wrong
1. **Rendering the draft or insights as HTML.** The Markdown draft is user-owned text, so the risk is a "preview" built with `{@html marked()}`. In M4 it's a textarea, full stop.
2. **The reflection block appears below the fold.** It will naturally get appended after Gratitude and the save bar, and then nobody sees it (the same failure as the M3 fallback banner). AC9/AC11 pin the placement.
3. **The Accept/Reject vocabulary** comes straight from the API names. The UI must say Keep / Skip. Rejecting an AI suggestion isn't a failure.
4. **The onboarding footer eats the keyboard on a phone.** Sticky footer + soft keyboard + a textarea is the classic overlap. Test the 320×400 viewport.
5. **Losing answers.** A failed job, or navigating away mid-draft, must not reset the quiz. And answers must not linger after the save.
6. **Two stickers at once:** the Evening low-rating sticker plus an "idle" one in the reflection block. Rule: one sticker per screen, and none in reflection.
7. **Using the model's `care_message` verbatim** in a celebratory card style. Keep it quiet and app-owned (AC13).
8. **The Notes-tab badge turns into a red count.** It must be a jade dot with no number (screens §0).
9. **The onboarding route shows the tab bar**, or the tab bar's "Notes" highlight jumps between routes. Hide the nav on `/onboarding` only.
10. **Redirecting into onboarding** when the profile is empty would hijack Today. The invitation must stay optional (autonomy, motivation §1).

## 3. Backlog items I think belong in this sprint
**MUST (new, from this plan):** AC1–AC16 above as the M4 UI. I'm adding no other MUSTs. The M3 retro left none.

**SHOULD (existing, carried from the M3 retro; small and in files M4 touches anyway):**
- `BACKLOG:150` Async feedback placement: fallback banner under the MoonGate, **toasts at the top**, event sticker in the card gutter. Toasts-at-top is a precondition for AC7/AC11.
- `BACKLOG:96` + `:97` Evening save-bar paper backing + spacer, and the low-rating sticker beside the header seal. M4 adds the reflection block right there, so do them together.
- `BACKLOG:153` HerbLoader `[data-motion=reduce]` + the trailing `…` strip. Both M4 loaders need it.
- `BACKLOG:152` / `:114` `QuestCard showCoins` (pre-approved prop).
- `BACKLOG:151` Boss-first on Monday only.
- `BACKLOG:126` `minutes` chip + "Done when:" line (pre-approved view fields). COULD-slip if time runs short.

**Pre-approved theme edits for M4** (log each under "Theme edits" in PROGRESS.md):
- `vocab.ts`: the new strings, including `ONBOARDING_QUESTIONS` copy if the psychologist supplies it, `CARE_NOTE`, the reflection states and `PROFILE_TEMPLATE`.
- The props from the SHOULD list above.
- New, non-theme components go in `web/src/lib/components/` (`ProposalList.svelte`, `OnboardingStep.svelte`). That doesn't need a theme edit.

**Screenshot checklist for the tester (viewport shots, scripted; M3 process note 1):**
M4-01 onboarding Q1 light · M4-02 Likert Q 🌙 · M4-03 long-text Q at 320×400 (footer vs. textarea) · M4-04 drafting loader · M4-05 draft failed ·
M4-06 draft editor + save toast at top · M4-07 Evening sealed → reflection loading in the first viewport · M4-08 proposals ready (add/edit/remove) 390 + 320 ·
M4-09 after apply (済 on kept, one stale row) · M4-10 care path · M4-11 Notes-tab dot · M4-12 Today empty-profile invitation · M4-13 reduced motion via `data-motion`.

## 4. Question for the other agents
**To quest-psychologist (and the architect for the schema):** for the care path, is it OK if the UI shows **only fixed, app-owned wording** (`vocab.CARE_NOTE`) and ignores the model's `care_message` text? That would make the schema a boolean `care: true`. Or do you want the model's message shown, and if so, under what length cap and tone check?

## PROVISIONAL decisions in this plan
- Onboarding answers go in `localStorage` (one key), cleared on save. This differs from the Evening draft, which is memory-only, because the quiz is long and the job can fail.
- UI labels are Keep / Skip, not Accept / Reject.
- The care path uses fixed app copy and shows no sticker.
- Evidence chips are plain text until Archive (M6) exists.
- The empty-profile invitation on Today is a dismissible line, never a redirect.
- After sealing, the Evening save bar collapses so the reflection actions are never covered.
