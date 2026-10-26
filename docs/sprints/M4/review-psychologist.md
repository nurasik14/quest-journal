# Sprint M4: review / retro (quest-psychologist)

> 2026-10-26 · Inputs: `docs/sprints/M4/{plan-*,sprint-goal}.md`, `docs/PROGRESS.md` §M4, `docs/test-reports/2026-10-26-M4.md`,
> `server/src/{domain,reflect-rules,prompts,kb}.ts`, `web/src/lib/copy.ts`, `web/src/routes/Evening.svelte`, screenshots `M4-08`, `M4-12`.
> The user is asleep, so open decisions are marked **PROVISIONAL**.

## Verdict
**Accepted, with one wellbeing gap to fix next sprint.** M4 is the sprint where the app starts saying things *about* Nurasyl, and the
build protects his authorship well:
- Nothing is pre-accepted.
- Every op is editable before Keep.
- What he declines stays declined.
- The care path is local and uses fixed text.
- Two real calls ignored a hostile note.

The gap is narrow but real. The care note only appears when the reflect gate gets far enough to run, so a **private** day (the most
likely place to write something heavy), AI-off, or a backfilled older page with crisis language gets no care line (§2.1).

## 1. Psychologist ACs, checked one by one
| AC | Result | Evidence / note |
|---|---|---|
| 1 Fifteen skippable questions, no sensitive topics | PASS | `copy.ts` `ONBOARDING_QUESTIONS` matches my list. The `m4-web` banned-topic grep passes. Skip and empty Next both advance (tester AC18) |
| 2 Preferences, not personality labels | PASS | Prompt rule 4 + `PERSONALITY_WARNING`. The tester's fixture produced `personality_label` |
| 3 Draft only from answers | PASS | Prompt rules 1/3/5. The builder's real call (8 of 15 answered) invented nothing. The "Blue Bottle" fixture → `invented_specific` |
| 4 The user writes the last word | **PARTIAL** | The draft never writes `profile.md`, and "Write my notes myself" plus the If-Match/412 flow work. **But tester MED-1:** choosing "replace" after a 412 loses the hand-edited profile from git for good. His own words being overwritten without a recoverable copy is exactly what this AC was meant to prevent |
| 5 Answers are data | PASS | `<answers>` escaping verified live, and the draft is a plain textarea |
| 6 Profile takes effect | PASS | Template → `profile_empty:true`. After a save, `ZZPROFILE` appears in the generate_day stdin |
| 7 No coins for reflection | PASS (only 0→0) | Not tested with non-zero earnings. That matters once M5 adds the balance → new item |
| 8 When reflect runs | PASS | C3 variant. 5 identical saves → 1 call. A pending proposal blocks re-runs. Private → no job |
| 9 Evidence ≥3 distinct valid dates | PASS | The builder made `edit` stricter too (≥3, with ≥1 new). I accept that: it's stricter in the safe direction |
| 10 Forbidden inferences | PASS, with LOW-1 | The regex matches my spec, 15 positives / 11 negatives. **The profile exception is a substring match** (`fat` is excused by "fatigue", `diet` by "dietitian"). Fix with word boundaries |
| 11 Tentative, descriptive wording | PASS | Prompt rules 3/4/7, `CAUSAL_WARNING`, sanitiser. The "never about other people in notes" rule is enforced by the prompt only and has no fixture (acceptable, noted) |
| 12 Declined stays declined | PASS, with NIT-2 | Declined ops are dropped live. Gap: an *accepted-then-edited* insight can be re-proposed in the model's original wording on another date |
| 13 Care path | **PARTIAL** | The pattern is checked before any spawn (0 spawns, nothing persisted), and the copy is verbatim (`M4-12`, no sticker). **Gate order:** `maybeReflect` checks `ai_off`, `not_recent` and `private` *before* `hasCareLanguage` (`kb.ts:547-551`), and the Evening only shows the care card on `reflect_skip === 'care'`. **Coverage:** misses "ending it all", "end my life", "better off without me" (tester observation) |
| 14 Autonomy-first approval | PASS | Keep/Skip with `aria-pressed`, nothing pre-chosen, an editable textarea, one-tap Skip all, and the edited text is stored (`M4-08`) |
| 15 Shown only after the seal, dot not count, 7-day hide | PASS | The block appears after Seal. The rating was already sealed above it, so there's no anchoring. The 8-day-old proposal is hidden but still on disk |
| 16 Journey | PASS | Tester AC12/13: one bullet, CRLF and comments byte-identical, stale row copy |
| 17 Injection | PASS | Two real calls (builder + tester) **did not obey**. A stub that did obey was still capped and needed Accept |
| 18 Fallback copy by cause | PASS | The 3 variants are verbatim in `m4-web` |
| 19 Blocklist narrowed | PASS | Phrase forms + benign corpus. "Order a beer" / "get drunk" still match |
| 20 Reroll honesty / small win | NOT TAKEN | Backlog items #124/#125 stay open (SHOULD). Carry them to M5: the `too_long` reroll lies on the pool path |

## 2. What must change
1. **The care check runs first and everywhere (SHOULD, top of the list).** `CARE_PATTERN` is local: nothing leaves the machine, so
   privacy is no reason to skip it.
   - Order in `maybeReflect`: the care check comes before `ai_off`, `not_recent` and `private`.
   - The Evening shows the care card on private and past pages too.
   - Scan highlight + notes + gratitude.
   - A private day still never reaches the AI. Only the static line shows.

   Rationale: people mark the hardest entries private. A care line that disappears exactly then is the wrong default. Its false-positive
   cost is one gentle sentence. Its false-negative cost is silence at the worst moment.
2. **Widen `CARE_PATTERN`, conservatively.** Add `end(ing)? it all`, `end my (own )?life`, `take my (own )?life`, `better off (dead|without me)`,
   `no reason to (live|go on)`, `don't want to exist`. **Do not add** "want to disappear" ("I want to disappear into this manga") or `kms`
   ("ran 5 kms"). Both go in the negative fixtures, together with "this exam is killing me" and "the finale will end the arc".
3. **MED-1 is an authorship bug, not just a git nit.** Mirror the evening `hand_edit` snapshot on `PUT /api/kb/*`. I agree with MUST: it
   loses the user's own hand-written text. (The architect filed it in the backlog, and I endorse that item rather than duplicating it.)
4. **LOW-1:** use a `\bterm\b` profile exception in `blockedTerms`. Positives: "fatigue"/"fat", "dietitian"/"diet".
5. **Care card heading (COULD):** in `M4-12` the care line sits under "Maomao's notes". A crisis pointer shouldn't sound like it comes from
   a fictional character's diary. Drop the heading on the care state, or use a plain "A note" (designer owns it).

## 3. What's good (keep doing this)
- **The asymmetry is right.** Adding an insight takes 3 dated, non-private, sent days. Skipping it takes one tap. Declined ops are remembered for
  30 days. That makes the cost of a wrong label higher for the model than for him, as autonomy-supportive design asks for (Ryan & Deci 2000).
- **No pre-checked Keep, no "Accept all".** Review stays a choice instead of rubber-stamping.
- **Reflection earns nothing.** Coins stay away from journaling, which avoids the overjustification effect (Deci, Koestner & Ryan 1999).
- **Copy honesty.** The §F truth table shipped verbatim, and the fallback banner now tells the truth about *why*.
- **The suspicious flag stays neutral** with a plain line: "This one reads like an instruction. Keep it only if you wrote it that way."
  That respects the user's choice and still warns him.

## 4. Answers to open questions
- **Q14/Q15 rewording (builder #169):** **signed off.** "How would you like Maomao to talk to you…" and "Anything else you'd like the
  apothecary to know?" are better than mine: invitational rather than prescriptive.
- **Suspicious op pre-set to Skip? (architect):** **No, keep it neutral** (PROVISIONAL). Pre-setting Skip is a default nudge (Johnson &
  Goldstein 2003) that overrides his judgment on his own notebook. The flag line plus "nothing pre-chosen" is enough, since nothing is written without his tap.
- **Backfilling yesterday triggers reflect (builder #164):** **keep it** (PROVISIONAL). Writing yesterday's page the next morning is normal
  journaling behaviour, and that entry is as valid as evidence as any other. Cost: at most one call per day per date. If real use shows
  backfill bursts, cap it at one auto-reflect per calendar day instead.
- **Rating mentioned in an insight (tester observation, "higher satisfaction on all 5 park days"):** that's within the rules. Aggregate
  rating correlations are the point of insights. Rule 7 forbids quoting *one day's* number. No change.
- **Dates recited in insight text (builder #167):** agree. Add the prompt rule "dates go in evidence, not in the text". Leave it at COULD.

## 5. Process note (for M5)
- **My spec gap:** AC13 said "CARE_PATTERN → no AI call" but never said "**regardless of other gates**". From now on, any safety AC states
  its precedence explicitly and comes with a gate-order test (a private + care fixture, an AI-off + care fixture).
- **M5 is the economy sprint**, my highest-risk area for guilt mechanics. In planning I'll make these required:
  - one copy-truth row per coin/streak string
  - a non-zero coin-invariance fixture (onboarding/decide/evening don't move a balance of, say, 135)
  - promoting `econ:sim` (B8) so the "weeks to a manga" claim is tested and not just asserted
- Carry-overs that keep slipping (reroll honesty #124/#125, gentle restart #117) should be explicitly *in or out* of M5's sprint goal,
  not silently dropped again. Gentle restart matters most before streaks ship: a lapse plus a visible streak reset is the classic abandonment trigger
  (Lally et al. 2010; the "what-the-hell effect", Polivy & Herman 1985).
