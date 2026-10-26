# Motivation & Game Design Brainstorm (quest-psychologist)

> Phase 1b output. Scope: motivation science + game design for Quest Journal.
> Storage/API design is out of scope; anything with technical implications is marked **⚙ ARCH** and collected in §9 for `quest-architect`.
> Decisions made without the user (who was asleep) are marked **PROVISIONAL** and listed in §10.

**Design stance in one line:** the app is a *kind apothecary*, not a slot machine. Coins are receipts that say "you did a thing", not wages. The quests are suggestions you're free to turn down. A missed day is just data, never something you failed at.

Core frameworks used throughout:
- **Self-Determination Theory (SDT)**: people thrive when they feel *autonomy*, *competence* and *relatedness* (Deci & Ryan 2000). In games, the same three needs predict enjoyment and how long people keep playing (Ryan, Rigby & Przybylski 2006).
- **Cognitive Evaluation Theory**: expected, tangible rewards that depend on doing a task lower free-choice intrinsic motivation. Unexpected rewards and rewards that carry *information* (feedback) don't (Deci, Koestner & Ryan 1999 meta-analysis, 128 studies).
- **Flow / challenge–skill balance**: difficulty should match the energy available today (Csikszentmihalyi 1990).
- **Habit formation**: habits took a median of 66 days to become automatic (range 18–254). **Missing a single day did not materially hurt habit formation** (Lally et al. 2010). This is the scientific reason to be lenient about missed days.
- **Implementation intentions**: "if X, then I'll do Y" plans had an effect of d ≈ 0.65 on goal attainment (Gollwitzer & Sheeran 2006).
- **Immediate rewards**: an immediate reward predicts persistence better than a delayed one. It even raises intrinsic motivation for the task itself (Woolley & Fishbach 2016, *JCR*).

---

## 1. Quest taxonomy

### 1.1 Categories (8)
These slugs are used in YAML/JSON. They're short so the AI can't misspell them.

| Slug | Display (Apothecary flavor) | Purpose (SDT need) | Notes |
|---|---|---|---|
| `body` | Tonic | Competence, physical energy | No weight/calorie goals unless the user asks for them in their profile |
| `mind` | Focus draught | Competence, agency over study and admin | Deep work, planning, phone hygiene |
| `social` | Court gossip | Relatedness | Must be low-pressure. Never "make someone do X" |
| `creative` | Ink & brush | Autonomy, self-expression | Manga panels, writing, photography |
| `adventure` | Expedition | Novelty, curiosity | New cafés, routes, districts |
| `care` | Rest remedy (care/rest) | Recovery | **Earns coins and counts for the streak.** Rest is part of the game, not time away from it |
| `learning` | Herbal study | Competence, mastery | ML papers, implementation, Japanese from manga |
| `treat` | Sweet medicine (treat-yourself) | Savoring, temptation bundling | Small coins only (see §4.4 on overjustification) |

### 1.2 Example quests (tailored: university student, manga, cafés, ML)
Each one has a **concrete done-condition**, so "done" is never ambiguous.

**body**
- Take a 20-minute walk without headphones and notice three sounds. *(easy)*
- Do a 30-minute bodyweight session: push-ups, squats, plank, three rounds. *(medium)*
- Walk to a café 2+ km away instead of taking transport, then read one manga chapter there. *(medium, bundled with treat)*
- Walk or jog 5 km. *(hard)*
- Stretch for 10 minutes between two study blocks. *(easy)*

**mind**
- Do 4 Pomodoros (25/5) on the course you're avoiding most. *(medium)*
- Clear one admin task that's been nagging you: an email, a form, a registration. *(easy)*
- Keep the first hour after you wake up phone-free. *(medium)*
- Do one 2-hour deep-work block with notifications off and your phone in another room. *(hard)*
- Spend 10 minutes writing out your worries, then circle one item you can act on tomorrow. *(easy)*

**social**
- Message a friend you haven't talked to in a month. Ask about something specific. *(easy)*
- Invite a classmate for coffee or a co-working session at a café. *(medium)*
- Ask one question in a lecture or at office hours. *(medium)*
- Organize a manga or anime night with 2+ people. *(hard)*
- Give someone a specific, genuine compliment. *(easy)*

**creative**
- Sketch one manga panel of something that happened today. Stick figures are fine. *(easy)*
- Draw or write a yonkoma (4-panel comic) about student life. *(medium)*
- Write a 300-word scene in the style of a court-mystery manga. *(medium)*
- Make a 10-song playlist for one manga arc. *(easy)*
- Build a small generative piece with a model you trained or fine-tuned yourself. *(hard)*

**adventure**
- Visit a café you've never been to and rate it in your ledger (1–5 herbs). *(medium; costs money)*
- Take a different route home and note three things you've never noticed. *(easy)*
- Browse the manga section of a bookstore or library for 20 minutes without buying anything. *(easy)*
- Spend an afternoon in a district you've never explored. *(hard)*
- Order a dish you've never tried. *(easy; costs money)*

**care (rest)**
- 15-minute tea break with no screen. *(easy)*
- Lights out by 23:30, phone charging out of reach. *(medium)*
- Tidy your desk for 15 minutes so tomorrow starts cleanly. *(easy)*
- Cook one proper meal that has a vegetable in it. *(medium)*
- **Rest day**: no studying after 18:00, and no guilt. *(easy; see §4.3)*

**learning**
- Read one ML paper's abstract and figures, then write a 3-line summary. *(easy)*
- Implement one small thing from scratch in a notebook: attention, k-means, or a tiny MLP in NumPy. *(hard)*
- Spend 45 minutes on a Kaggle dataset or notebook. *(medium)*
- Learn 10 Japanese words from the manga you're reading right now. *(easy)*
- Rewrite today's lecture notes as a one-page summary. *(medium)*

**treat**
- Study for an hour at a café you like. Your drink is the reward. *(medium; temptation bundling, Milkman, Minson & Volpp 2014)*
- Read manga for 30 minutes right after your hardest task of the day. *(easy)*
- Have a slow breakfast: sit down, no phone. *(easy)*
- Go and watch golden hour or the sunset somewhere nice. *(easy)*

### 1.3 Difficulty definitions
Effort is defined by **time × friction**, not by how virtuous the task sounds.

| Difficulty | Coins | Time | Friction | Rule of thumb |
|---|---|---|---|---|
| easy | 10 | ≤ 20 min | Can start right now, from where you are | "I could do this in my pajamas" |
| medium | 20 | 20–60 min | Some planning, or leaving the room | "Needs a slot in my day" |
| hard | 35 | 60–180 min, or a social or emotional stretch | Planning plus willpower | "I'll feel proud tonight" |
| boss | 100 | Spread over the week | Several sessions | See §2 |

### 1.4 Energy check-in → difficulty mix
The morning check-in asks for energy on a 1–5 scale. The mix sets the **slot difficulties**, and the AI fills in the content.

| Energy | Label (Maomao) | Slots | Max coins | Extra rules |
|---|---|---|---|---|
| 1 | "Bedridden patient" | easy, easy, easy | 30 | At least one must be `care`. All three must work from home. The boss card shows "Paused today, no penalty" |
| 2 | "Weak pulse" | easy, easy, medium | 40 | At least one `care` or `treat`. The medium must be doable in 30 minutes or less |
| 3 | "Steady" | easy, medium, medium | 50 | Default |
| 4 | "Good color" | easy, medium, hard | 65 | — |
| 5 | "Ready to taste poison" | medium, medium, hard | 75 | Never more than one hard (avoids overreach on the days you feel great) |

Universal rules:
1. **Always include at least one quest that takes ≤ 15 minutes** (a "small win"). Early progress keeps people going. See the endowed-progress effect (Nunes & Drèze 2006) and the progress principle (Amabile & Kramer 2011).
2. **Use 3 different categories each day.** Over a rolling 7 days, cover at least 5 of the 8 categories.
3. **No more than one quest that costs money per day,** and only if the budget allows (§7).
4. **Weekday modulation:** class-heavy days push easy quests to the evenings. On weekends, adventure and social quests are more likely.
5. **Exam mode** (a profile flag or an insight): `learning` can fill 2 slots, but one slot is always `care`.

⚙ ARCH: the server should take the slot difficulties from this table and **set coins from difficulty itself**, ignoring any `coins` value the AI returns. That prevents inflation driven by the AI.

---

## 2. Weekly boss design

### 2.1 What makes a good boss
1. **Multi-session.** It needs 3–5 sittings across the week. No single heroic push.
2. **Has checkpoints, so partial credit is possible.** A boss is all-or-nothing in a game, but life isn't. Proposed payout: **4 checkpoints × 15 coins + 40 completion bonus = 100.** Finishing 3 of 4 checkpoints still earns 45. The goal-gradient effect makes the last checkpoint feel motivating instead of doomed (Kivetz, Urminsky & Zheng 2006).
3. **Produces an artifact.** A notebook, a comic, a review page or photos. Something you can look at on Sunday. This gives *competence* feedback (informational, which CET says doesn't undermine intrinsic motivation).
4. **Meaningful, not just big.** It's tied to a goal in `profile.md` or a theme in recent insights.
5. **Rotates between 5 types,** never repeating a type two weeks in a row: **Make** (creative), **Learn** (learning), **Explore** (adventure), **Connect** (social), **Restore** (body/care).
6. **Downscalable mid-week.** On Wednesday or Thursday, offer "shrink the boss" (drop one checkpoint, and the completion bonus stays). It's autonomy-preserving. This choice is made *before* failing, not after.
7. **Adapts to context.** In exam weeks, the boss becomes study-shaped *or* restorative, never a 4th big demand.
8. **Fits the budget.** Costs at most ~1 café meal of real money for the whole week.
9. **Ends without shame.** On Monday, an unfinished boss is archived with "The prescription expired. Maomao shrugs." There are no penalties and no carry-over debt.

### 2.2 Ten example bosses (8 required, plus 2 spares)

| # | Name | Type | Checkpoints | Artifact |
|---|---|---|---|---|
| 1 | **The Café Cartographer** | Explore | Visit 3 new cafés (one checkpoint each) and write a mini-review page ranking them | `weeks/…` review section |
| 2 | **Paper Autopsy** | Learn | Choose an ML paper → read it fully → reimplement the core idea in a toy notebook → write a 10-bullet explainer | Notebook + explainer |
| 3 | **Yonkoma Week** | Make | Four 4-panel comics on different days, and show one to a friend | 4 comics |
| 4 | **The Kaggle Trial** | Learn | Baseline submission → 2 improvement iterations → a short write-up of what helped | Leaderboard screenshot + notes |
| 5 | **Five Morning Tonics** | Restore | Move for 20+ minutes before 10:00 on 4 different mornings (each one is a checkpoint) | Log entries |
| 6 | **Gathering in the Jade Pavilion** | Connect | Pick a date → invite 2+ people → host a manga swap or study night → send a thank-you message | Photo or note |
| 7 | **The Exam Antidote** (exam weeks) | Learn | Summary sheet for one course → one timed past paper → review your mistakes → one full rest evening | Summary sheet |
| 8 | **Unknown District Expedition** | Explore | Pick a district → go → find one café or bookstore there → take 10 photos and write one ledger page | Photo set |
| 9 | **Spring Cleaning of the Apothecary** | Restore | Clear the desk → laundry → clean up Downloads and the desktop → back up notes | Before/after |
| 10 | **The Sleep Ledger** | Restore | In bed by 23:30 on 5 of 7 nights. Checkpoints are at 2, 3, 4 and 5 nights | Log entries |

⚙ ARCH: a boss needs a `checkpoints[]` list with a per-item done state in `weeks/YYYY-Www.md`, plus a `type` field so the 5 types can rotate, and a `shrunk: bool`.

---

## 3. Economy tuning

### 3.1 Income model (coin values from ARCHITECTURE.md are kept: 10 / 20 / 35 / boss 100)

Assumptions: an average energy of about 3 gives roughly 50 coins of max daily potential (§1.4). Daily quest completion is around 70%, which is typical for self-set goals and **intentionally not 100%**. Bosses are completed about 60% of the time with partial credit, so they're worth about 70 coins in expectation.

| Week type | Daily quests | Boss | Streak bonus | Mystery | **Total / week** |
|---|---|---|---|---|---|
| Low (energy ~2, 50% completion) | 40 × 0.5 × 7 = 140 | 30 | 0 | 5 | **≈ 175** |
| Typical (energy ~3, 70%) | 50 × 0.7 × 7 = 245 | 70 | 25 | 10 | **≈ 350** |
| Strong (energy ~4, 85%) | 65 × 0.85 × 7 = 387 | 100 | 25 | 15 | **≈ 525** |

### 3.2 The problem with the starting prices
ARCHITECTURE.md lists treat 30, café 80, manga 150 *as editable starting values*. In a typical week (≈350 coins), that would mean **a manga every 3 days, or 4 café meals a week.** Rewards would feel trivial. Worse, they'd outpace the student's real-money budget: the coins are free, but the manga isn't.

**PROVISIONAL repricing** (changes only `rewards.yaml` values, not the architecture):

| Reward | Price | Cooldown | Pure-saving time (typical week) | Target real-life cadence |
|---|---|---|---|---|
| Small treat (dessert, bubble tea) | **50** | 2 days | ~1 day | 2–3× per week |
| Café meal | **150** | 5 days | ~3 days | ~1× per week |
| Manga volume (physical) | **350** | 10 days | ~1 week | **~every 2–3 weeks** with normal treat spending |

**Expected weeks to earn a manga:**
- If you save everything: 350 / 350 ≈ **1 week** (typical) / 2 weeks (low week) / under 1 week (strong).
- With a "normal" spending pattern of 2 treats + 1 café per week (250/week), the surplus is about 100/week → **≈ 3.5 weeks**.
- With 1 treat + 1 café a week (200/week), the surplus is about 150/week → **≈ 2.3 weeks**.
- The design target is **a manga every 2–4 weeks, chosen by the user**. That's frequent enough to feel real and rare enough to feel earned.

### 3.3 Real-money guardrail
Coins are permission, but the money is real. A student budget needs an outer limit:
- `profile.md` has `monthly_reward_budget` (local currency). The shop shows "Real money used this month: X / budget" next to coin prices. Each reward has an optional `approx_cost`.
- If buying something would go over the monthly budget, the shop warns once in a neutral tone ("This would exceed this month's purse"). It doesn't block the purchase, because autonomy matters.
- **Free rewards** (lie-in, guilt-free gaming evening) exist so the shop is never useless when money is tight.

⚙ ARCH: optional `approx_cost` on rewards and a `monthly_reward_budget` in the profile, plus a sum over this month's purchases.

### 3.4 Inflation risk and controls
Sources of inflation, and the controls for each:
1. **The AI inflates difficulty labels** ("hard: drink water"). → The server sets coins from slot difficulty (§1.4), and the prompt includes the difficulty definitions. A test is in §8.
2. **Too much bonus stacking** (streaks + mystery + boss). → Streak bonuses are flat (not multiplicative), mystery rewards are small, and the boss is capped at 100.
3. **Hoarding.** A large balance makes the shop feel "solved" and coins stop feeling like anything. → A **wishlist with a progress bar** gives saving a target (goal gradient). Coins **never expire** (expiry feels like a loss and creates guilt).
4. **Drift over months.** → Monthly "market review": if the 4-week average income is more than ±30% from 350/week, the app *suggests* (never applies automatically) re-pricing. The user decides.
5. **Prices never rise automatically.** Auto-inflation feels like the game punishing you for getting better.

### 3.5 Streaks: lenient by design
- **What counts as a streak day** (PROVISIONAL): at least one of these: ≥1 quest done (including "smaller version", §4.2), the rest-day quest done, or the evening ledger saved. The streak measures *showing up*, not perfection.
- **Bonus:** **+25 coins for every 7 consecutive days** (flat, no escalation). Escalating streak multipliers make losing a streak hurt more over time, and that's how streak anxiety starts (loss aversion; Kahneman & Tversky 1979).
- **Numbers that never break** are shown more prominently than the current streak: *total days logged*, *total quests done*, *longest streak*. Counting things up builds a sense of competence, and nothing is ever taken away.
- **Streak-freeze tokens ("Preserved herbs"):** you earn 1 per completed 7-day streak and can hold at most 2. A missed day uses one **automatically** (no button that says "spend a token to save your streak!"). Tokens can't be bought with coins, so there's no pay-to-protect anxiety loop. Duolingo's streak freeze reduced churn for the same reason. Here it's a quiet safety net, not something to sell.
- **When a streak breaks anyway:** "The streak rests. You logged 23 days this month." There's no red text and no "you lost X".

⚙ ARCH: streak computation needs the "counts as a day" rule above, a token count held in the ledger, and automatic token use when a gap is detected. Gaps of 2+ days still use at most the tokens held.

### 3.6 Mystery rewards ("Maomao's curios"): kept small and unpredictable, never gambling
- About **10% of quest completions** trigger a surprise: +5 to +15 coins, *or* a collectible **curio card** (a herb or poison fact in Maomao's voice, purely cosmetic and shown in a cabinet).
- **Unexpected** rewards don't undermine intrinsic motivation, while expected contingent ones do (Deci, Koestner & Ryan 1999). That's why the drop rate isn't shown and isn't promised.
- **Hard limits (anti-dark-pattern):**
  - Mystery rewards only fire on *completing* something, **never on opening the app** (no login bonuses, which train compulsive checking).
  - No loot boxes, gacha or "mystery pouch" that you can buy with coins. Spending currency on a random outcome is gambling mechanics.
  - At most one per day.
- **Boss surprise:** completing a boss always unlocks a sticker reaction (Jinshi), and sometimes a rare curio as well.

⚙ ARCH: a seeded RNG per completion, which needs to be deterministic in tests (inject the RNG). Collected curios are stored somewhere (could be a list in the ledger).

### 3.7 Keeping rewards earned but guilt-free
- **No coin penalties, ever.** Failing or skipping a quest gives 0, never a negative number. Debt is guilt.
- **Buying is celebrated, not questioned.** Purchase screen: seal stamp plus "Prescribed: one manga. Take as directed." There's no "are you sure? that's 3 days of work".
- **Treats can be bought for "free" in emergencies:** once a month, "Apothecary's mercy" gives one small treat at price 0 on a hard day (energy 1 for 2+ days). This is for self-compassion; self-compassion predicts *more* motivation to improve after a setback, not less (Breines & Chen 2012).
- **Don't moralize spending.** The app never says "you've been spending a lot".

---

## 4. Anti-burnout and honesty

### 4.1 Missed days, handled kindly
- **The science:** in habit formation, missing a single day did not materially affect automaticity (Lally et al. 2010). What does hurt is the **"what-the-hell" effect** (abstinence violation): one slip gets framed as total failure, and people quit (Marlatt & Gordon 1985; Polivy & Herman). So the design goal is to make a slip *feel* like a slip.
- **Return screen** after a gap of 1+ days: "Welcome back. The herbs kept." It offers a **gentle restart day** at energy 2 regardless of the check-in. It doesn't list what you missed or show a guilt counter.
- **Fresh-start hooks:** Mondays, the 1st of the month and the start of a semester are moments when people are more likely to start a goal again (Dai, Milkman & Riis 2014). On those days the app gets a subtle "new page in the ledger" visual.
- **Backfilling is allowed:** you can log yesterday's quests or ledger up to 2 days later, labeled "written later". Forcing the gap to stay feeds the what-the-hell effect.
- **Never** send push notifications framed as loss ("Your streak is about to die!").

⚙ ARCH: allow edits to past day files from the UI (up to 2 days back) with a `backfilled: true` frontmatter flag. Hand edits must still work, as CLAUDE.md requires.

### 4.2 Honest outcomes: "done", "smaller version", "let go"
Rename **fail** → **"let go"**, and add a third outcome:
- ✅ **Done**: full coins.
- 🌱 **Smaller version**: "I did a scaled-down version" → coins for the next-lower difficulty (hard→20, medium→10, easy→5). This rewards honesty over lying, and it reinforces partial progress, which matters more for competence than all-or-nothing scoring.
- 🍂 **Let go**: 0 coins. An optional reason chip (no time / not feeling it / not possible / didn't fit) becomes a signal for the AI.

Why honesty holds up: there are no leaderboards, no penalties and no audience, so **lying has no payoff**. With self-reported data the only safeguard against cheating is removing the reason to cheat. The "smaller version" option covers the gray zone where people would otherwise round up.

⚙ ARCH: the quest status enum becomes `open | done | partial | let_go`, with an optional `reason`.

### 4.3 Rerolls should be cheap
- A reroll is an **autonomy** move: "not this one, but I'm still playing." If rerolls are expensive, a bad quest gets either done grudgingly (controlled motivation) or ignored (lost engagement). SDT predicts both hurt motivation in the long run.
- A reroll is also **the best signal the AI gets**: the user is actively rejecting something, so it's more informative than a skipped quest.
- **Proposal:** keep the architecture's **1 free reroll per day** (MVP). Add **reason chips** (too long / costs money / not today / boring / not me) so the negative signal says *why*. Later: a second reroll for 5 coins, and an "**easier version**" swap that's always free (it uses the same quest at a lower difficulty, adjusting the slot instead of the content).
- Rerolling never reduces coins, the streak, or anything else.

### 4.4 Rest-day quests
- A rest day is a **planned** recovery. Behavioral activation research shows that scheduling *pleasant* activities, not only productive ones, improves mood (Cuijpers et al. 2007 meta-analysis).
- **Mechanic:** once a week you can declare a **Rest Day** at check-in. All 3 slots become `care`/`treat` easy quests, one of which is "Rest without guilt: no study after 18:00." The boss is paused for the day, and the day counts for the streak.
- After 5+ straight days at energy ≥4 *or* 3+ straight days at energy ≤2, Maomao suggests a rest day ("Even a poison taster needs a day off"). It's a suggestion, not something forced.

### 4.5 Avoiding the overjustification effect
The risk: paying coins for things Nurasyl *already loves* (manga, cafés, ML tinkering) can turn play into work. Expected tangible rewards for an interesting activity reduce free-choice engagement (Lepper, Greene & Nisbett 1973; Deci, Koestner & Ryan 1999).

Concrete rules:
1. **Don't pay for the hobby itself. Pay for a stretch *within* it.** Not "read manga" but "read a manga genre you've never tried". Not "go to a café" but "try a *new* café and review it". The hobby stays free, and the quest pays for novelty and effort.
2. **`treat` quests pay little** (easy, 10), and they're bundled with an effortful task ("after your hardest task…"). The coins acknowledge that you *took the time*. They don't pay for the enjoyment.
3. **Feedback should be informational, not controlling.** Write "You've done 4 learning quests this week. Your ML streak looks steady" (competence information), not "Good job! +20!" (a controlling evaluation). Avoid "should" and "must" in all copy (CET: controlling language undermines motivation).
4. **Immediate acknowledgment** (the seal stamp animation the moment you finish) boosts motivation more than a delayed one (Woolley & Fishbach 2016). So the stamp shows on tap, not at the end of the day.
5. **Unpaid curiosities (later):** sometimes the AI adds a 4th *optional, coin-less* "curiosity", e.g. "If you're curious: look up why ginkgo smells." This keeps some activity outside the reward system on purpose, and it's a test of intrinsic interest. **If uptake on these is high, the system is healthy.**
6. **Testable metric:** monthly, compare how often coin-less curiosities and hobby activities mentioned in notes come up. If self-initiated hobby mentions drop while paid quests rise, cut the coins for that category.

---

## 5. Reflection prompts (Evening ledger)

### 5.1 Structure: under 3 minutes, with a 10-second minimum path
In order:
1. **Satisfaction rating 1–10** (herb leaves), with the **anchor text shown under the selected value**. Always shown, and the only required field.
2. **Mood tags** (multi-select, optional). It's a balanced set so the tags don't lean negative: *calm, energized, proud, curious, cozy, connected, tired, anxious, frustrated, lonely, bored, overwhelmed*. Labeling an emotion lowers its intensity (affect labeling; Lieberman et al. 2007).
3. **Highlight**: "One moment worth keeping." One line, optional but always shown first. This is savoring; a *peak* line also makes the History view meaningful later (peak-end memory; Kahneman et al. 1993).
4. **Rotating prompt**: one per day, optional (§5.2).
5. **Gratitude**: shown on **2 days a week** by default (PROVISIONAL: Wednesday and Sunday), up to 3 items. Counting blessings once a week improved well-being, while three times a week did not, probably because it got stale (Lyubomirsky, Sheldon & Schkade 2005). Daily mandatory gratitude is the stale version. Users can turn it on daily in settings.
6. **Notes**: free text. Expressive writing helps (Pennebaker 1997), but only when it's voluntary.

The **minimum valid ledger is the rating alone**, and it still counts for the streak.

⚙ ARCH: day-file frontmatter gets `mood_tags[]`, and `prompt_id` + an answer section in the body. Previous ratings stay hidden in the Evening view until today's rating is saved (prevents anchoring on yesterday).

### 5.2 Rotating prompts (24, with IDs for stats)
Rotation rule: don't repeat within 10 days. Weight toward categories with fewer recent answers. On Sundays, use the weekly-review set.

**Savoring**
- `sav-1` What did you taste, hear or see today that you'd like to remember?
- `sav-2` What small thing went better than expected?
- `sav-3` If today were a manga chapter, what would its title be?

**Competence / learning**
- `com-1` What did you understand today that you didn't understand yesterday?
- `com-2` What was hard, and what made it a little easier?
- `com-3` What would Maomao say about how you handled today's hardest moment?

**Autonomy / values**
- `aut-1` What did you do today because *you* wanted to, not because you had to?
- `aut-2` Which quest felt most like "you"? Which felt least?
- `aut-3` What did you say no to today, and was it the right call?

**Relatedness**
- `rel-1` Who made your day a little better?
- `rel-2` Who would you like to message tomorrow, and about what?
- `rel-3` What conversation stayed with you?

**Self-compassion** (Neff 2003; good for low-rating days, prioritized when the rating ≤ 4)
- `sc-1` What would you tell a friend who had the day you had?
- `sc-2` What is one thing you did today despite low energy?
- `sc-3` What do you need more of tomorrow: rest, people, or progress?

**Forward / implementation intentions** (Gollwitzer & Sheeran 2006)
- `fwd-1` Tomorrow, when ___ happens, I will ___.
- `fwd-2` What's the first 5-minute step for the thing you're avoiding?
- `fwd-3` What could get in the way tomorrow, and what's your plan if it does?

**Curiosity**
- `cur-1` What did you get curious about today?
- `cur-2` What's a question you'd like an ML paper to answer?
- `cur-3` Which café, place or manga would you like to try next?

**Weekly review (Sunday, shown in the weeks/ file)**
- `wk-1` Best day this week, and why?
- `wk-2` Which quest category gave you the most energy? Which drained you?
- `wk-3` One thing to keep, one to change, one to try next week.

### 5.3 Keeping the 1–10 rating meaningful: anchors
Without anchors, ratings drift (hedonic adaptation, plus "everything is a 7"). Show the anchor under the slider:

| Score | Anchor (shown in UI) |
|---|---|
| 1 | One of the worst days in a long time. |
| 2 | Very bad; most of the day hurt. |
| 3 | Bad; more bad than good. |
| 4 | Below par; flat or draining. |
| 5 | Ordinary; nothing much either way. |
| 6 | Decent; a few good moments. |
| 7 | Good; I'd happily have this day again. |
| 8 | Very good; something really stood out. |
| 9 | Great; I'll remember this week for it. |
| 10 | One of the best days this year. |

Rules that keep it meaningful:
- **The rating never affects coins.** If high ratings paid, the rating would stop measuring how the day went (Goodhart's law).
- **Anchors describe the whole day, not productivity.** A 9 can be a lazy café day.
- **Expected distribution:** most days fall between 5 and 7, and 1s and 10s are rare (each under ~5%). Monthly, if more than 40% of ratings are one value, show a soft "calibration" note with the anchor table. It's information, not a correction.
- **Monthly calibration exercise (later):** "Pick your best and worst day this month. Do their ratings still feel right?" Allow re-rating with an audit note.
- Rate first, notes second, so writing doesn't pull the number around.

---

## 6. Personalization signals

### 6.1 Signals to learn from (in rough order of reliability)

| Signal | What it tells the AI | Strength | Notes |
|---|---|---|---|
| Reroll + reason chip | "Not this, for this reason" | **Strong** negative | Context-specific: "too long" ≠ "dislike" |
| 👍 / 👎 on a quest | Explicit preference | Strong | Separate from completion: a 👍 on something you let go = "good idea, bad day" |
| Done / partial / let go + reason | Feasibility | Medium | Read *together with energy*: letting go at energy 1 says little |
| Category × satisfaction | Which categories go with good days | Weak–medium | **Confounded** (energy, weekday). Compare within the same energy band, and only when n ≥ 5 per bucket |
| Notes / highlight mentions | Interests, places, people (named by the user) | Medium | Only use things the user wrote, not inferences about them |
| Time of completion (if logged) | When you tend to do quests | Weak | Useful for "evening-friendly" quests |
| Boss outcomes per type | Which boss types fit | Medium | Needs at least 4 weeks |
| Profile edits | Ground truth | **Strongest** | Always overrides insights |

Learning rules:
- **Exploration:** at least 1 quest in every ~5 should come from a category or style with little data or a neutral history (an epsilon-greedy idea). Otherwise the system narrows into a filter bubble of "ML + café".
- **Decay:** negative signals fade after ~30 days. A 👎 in exam week shouldn't ban a category forever.
- **One 👎 never removes a category.** It only removes *that style* of quest.
- **Evidence threshold for insights:** each proposed insight cites **≥3 dated instances**, uses tentative language ("seems to", "on 4 of 6 days…"), and there are **at most 3 proposals per evening**.

### 6.2 What the AI must NOT infer (hard rules in the reflect prompt)
1. **No health or mental-health labels.** No "you might be depressed / ADHD / burned out" from ratings or notes. The AI can say "your last 5 ratings were ≤4, so maybe more rest quests?" but never diagnose.
2. **No inferences about sensitive traits:** sexuality, religion, politics, ethnicity, health conditions, family conflict. They're only allowed if the user wrote them into `profile.md`, and even then only as the user phrased them.
3. **No body or appearance goals** (weight, calories, eating less) unless the user explicitly writes them in the profile. Even then, no restriction quests.
4. **No guesses about money beyond the stated budget** ("you seem broke").
5. **No judgments about other people** mentioned in notes ("your friend X seems toxic").
6. **No causal claims from small samples** ("cafés make you happy"). Use correlational, tentative language.
7. **Missing data isn't a signal.** Missed days and empty notes mean nothing about mood.
8. **No covert persuasion.** Insights describe; they don't steer ("you should study more").

**Safety:** if notes contain crisis or self-harm language, the reflect step proposes **no insights**. Instead it shows a short, warm message suggesting the user reach out to someone they trust or a local crisis line. It doesn't play therapist. ⚙ ARCH: the reflect output schema needs a `care_message` field as an alternative to `insights[]`, and the UI needs to render it.

---

## 7. Quest-generation prompt guidance (`claude -p`)

### 7.1 Rules
**Variety**
- 3 distinct categories per day. No category used in *all three* of the last 3 days. At least 5 of 8 categories over a rolling 7 days (pass the category counts in).
- No title semantically similar to anything in the last 14 days (pass in the recent titles). Rerolled and 👎 quests are listed as "avoid this kind".
- Mix the *modes*: no more than one "sit at a desk" quest per day.

**Feasibility**
- Each quest has a clear **done-condition** and a **time estimate** that fits its difficulty (§1.3).
- Respect weekday and context (class days, exam mode, energy rules in §1.4).
- If the time of day is given and it's late, prefer quests you can finish today.
- No quests needing equipment or places the profile doesn't mention (no "go swimming" if there's no pool access).

**Budget**
- At most 1 quest per day costs money. Its cost must be ≤ the profile's `daily_quest_spend_cap` (PROVISIONAL default: the price of one coffee). Label the cost `free` / `low` / `medium`.
- Prefer free alternatives at energy 1–2.

**Safety**
- No dangerous physical challenges, no fasting or calorie restriction, no alcohol or substance quests, no going alone to unfamiliar places at night, no sleep deprivation ("pull an all-nighter").
- Social quests never involve deception, pressure, or contacting someone who isn't receptive. No romance quests unless the profile asks for them.
- Nothing illegal and nothing that violates university rules (no "use AI to write the assignment").
- Maomao's poison jokes are **flavor only**. Never suggest actually tasting, ingesting, or experimenting with substances or plants.

**Tone: Maomao's voice**
- `title`: **plain, imperative, readable**: "Visit a café you've never tried." Accessibility and scanning come first, so no flavor in titles.
- `why`: **one sentence in Maomao's voice**: dry, curious, blunt, a bit nerdy about herbs and poisons, quietly caring. Example: "Your eyes have the color of someone who's read too many loss curves. Fresh air is a cheaper tonic than coffee."
- Never sarcastic *at* the user's failures. Never use "should" or "must". Write original lines; don't quote the source material.
- English, with no emoji in the title.

**Output**
- JSON only, validated by zod. Coins are **set by the server from difficulty**, not by the model.

⚙ ARCH: I propose adding these optional fields to the AI quest schema: `minutes` (int), `cost` (`free|low|medium`), `done_when` (string), and on reroll an input field `reroll_reason`. `coins` in the model output is ignored or removed.

### 7.2 Final prompt template: daily generation
The canonical text is in **Seed data → Final quest-generation prompt template** at the end of this doc, so there's only one copy to keep in sync. Placeholders are `{{…}}`, and the server fills them. The slot list comes from §1.4.

### 7.3 Reroll variant (append to the same context)
```text
## Reroll
Replace ONLY slot {{slot_index}} ({{slot_difficulty}}). The rejected quest was:
"{{rejected_title}}" ({{rejected_category}}) — reason: {{reroll_reason}}.
Do not propose anything similar in activity, place, or cost. Keep the other two quests' categories distinct: {{other_categories}}.
Return ONLY {"quests":[ one quest object ]}.
```

### 7.4 Weekly boss variant
```text
## Weekly boss
Write ONE weekly boss quest for ISO week {{iso_week}}. Boss type this week: {{boss_type}} (Make | Learn | Explore | Connect | Restore; last week was {{last_boss_type}}).
Mode: {{mode}}. It must take 3–5 sessions across the week, produce a visible artifact, cost at most {{weekly_spend_cap}} in real money, and split into exactly 4 checkpoints, each checkable on its own.
Voice: Jinshi presents it, Maomao annotates it — a short "why" (≤ 200 chars) in Maomao's voice.
Return ONLY: {"boss":{"title":string,"why":string,"type":string,"checkpoints":[string,string,string,string],"artifact":string,"cost":"free"|"low"|"medium"}}
```

### 7.5 Testable checks for the generated output (for the tester)
- 3 quests, 3 distinct valid categories, difficulties exactly equal to the slots.
- ≤1 quest with `cost != free`; at energy 1, all `free`.
- At least one quest with `minutes ≤ 15`.
- No title has a normalized Levenshtein similarity above 0.8 with any of the last 14 days' titles (a cheap similarity check).
- A blocklist regex on output (`fast|calorie|alcohol|beer|all-nighter|vodka|diet`, etc.) triggers a retry and then a fallback.
- `minutes` is consistent with difficulty: easy ≤ 20, medium ≤ 60, hard ≤ 180.

---

## 8. Ideas backlog (ranked)

| Rank | Idea | Tag | Why / test |
|---|---|---|---|
| 1 | Energy → slot-difficulty table (§1.4), with the server setting coins from difficulty | **MVP** | Core flow match; prevents inflation. Test: unit test the table plus coin assignment |
| 2 | Quest outcomes `done / smaller version / let go` (no "fail") | **MVP** | Honesty and competence. Test: coin math per outcome |
| 3 | Lenient streak rule (quest OR rest OR ledger) + flat +25/7 days | **MVP** | Test: streak unit tests with gaps |
| 4 | Repriced shop: treat 50 / café 150 / manga 350, plus free rewards | **MVP** | Economy sanity. Simulate 30 fake days → about 1 manga per 2–4 weeks |
| 5 | Rating anchors shown under the leaves; rating never affects coins | **MVP** | Measurement validity |
| 6 | Reroll reason chips (one tap) | **MVP** | Best signal for personalization; tiny UI |
| 7 | Prompt rules + output checks (§7.5) | **MVP** | Test with the stubbed spawn |
| 8 | Fallback pool honoring cooldowns + category variety (seed YAML below) | **MVP** | Works without Claude |
| 9 | Kind return screen after a gap, plus a gentle-restart mode | **MVP** | What-the-hell effect protection. Just copy plus a mode flag |
| 10 | Boss with 4 checkpoints and partial credit | **MVP** | Goal gradient. Test: payout math 15×n + 40 |
| 11 | Rest-day declaration (1/week) | **MVP** | Burnout guard |
| 12 | Streak-freeze tokens (earned, auto-applied, max 2) | later | Needs streak logic stable first |
| 13 | Rotating evening prompts with IDs + no-repeat-in-10-days | later | MVP can ship with a fixed highlight/notes/gratitude set |
| 14 | Gratitude on 2 days/week instead of daily | later | (Do this together with #13) |
| 15 | Mood tags | later | ARCH mentions mood. Cheap but needs stats UI to matter |
| 16 | Mystery curios (10%, completion-only, never purchasable) | later | Needs a cosmetic cabinet view |
| 17 | Wishlist progress bar (goal gradient) | later | Shop already has a wishlist in ARCH |
| 18 | Real-money monthly budget meter | later | Protects the student budget |
| 19 | Boss "shrink" mid-week | later | Autonomy |
| 20 | Rest-day suggestion after 5 high / 3 low energy days | later | Simple heuristic |
| 21 | Backfill up to 2 days with a `backfilled` flag | later | Reduces gaps |
| 22 | Unpaid "curiosity" 4th card + uptake metric | later | Overjustification canary |
| 23 | Category × satisfaction within the same energy band (n≥5) | later | Avoids confounded stats in History |
| 24 | Monthly market review (suggest re-price at ±30% income drift) | maybe | Only matters after months of use |
| 25 | Apothecary's mercy (free treat once a month on hard stretches) | maybe | Self-compassion. Watch for abuse (there's no one to abuse it but the user) |
| 26 | Monthly rating-calibration exercise | maybe | Measurement nerd feature |
| 27 | Café review collection (from adventure quests) as a "map" page | maybe | Fun artifact; overlaps History |
| 28 | Second reroll for 5 coins / free "easier version" swap | maybe | Only if 1/day proves too tight (watch reroll usage) |
| 29 | Gentle morning reminder notification (no loss framing) | maybe | PWA push over Tailscale is non-trivial |
| 30 | Publish selected days to the blog (`publish: true`) with prompt answers | maybe | Privacy first; already noted in ARCH |

**Rejected on purpose (dark patterns):** login bonuses; coin-purchased loot boxes; expiring coins; coin penalties or debt; streak-loss notifications; leaderboards or social comparison; countdown timers on quests; "are you sure?" guilt on purchases; red badge counts; auto-raising prices.

---

## 9. Flags for quest-architect (⚙ ARCH, consolidated)
1. **Coins are set server-side from difficulty**; ignore or remove `coins` from the AI schema. Slot difficulties come from the energy table (§1.4).
2. **Optional AI quest fields:** `minutes`, `cost` (`free|low|medium`), `done_when`. Input for reroll: `reroll_reason`.
3. **Quest status enum:** `open | done | partial | let_go` + optional `reason`. Partial pays the next-lower difficulty (easy partial = 5).
4. **Boss:** `type`, `checkpoints[4]` with done state, `shrunk`, payout 15 × checkpoints + 40 bonus if all done.
5. **Streak rule:** a day counts if (≥1 done/partial) OR rest-day quest done OR ledger saved. +25 per 7-day run. Freeze tokens (max 2) earned per 7-day run and auto-consumed.
6. **Mystery drops:** an injectable RNG, ~10% on completion, max 1/day, +5–15 coins or a curio id.
7. **Day frontmatter additions:** `mode` (normal/exam/rest_day/gentle_restart), `mood_tags[]`, `prompt_id`, `backfilled`.
8. **Rewards:** optional `approx_cost`, plus `tier` (`free|small|medium|large|grand`). Profile gets `monthly_reward_budget` and `daily_quest_spend_cap`.
9. **Reflect output:** `care_message` as an alternative path, and at most 3 insight proposals, each with ≥3 cited dates.
10. **Fallback selection from `quests.yaml`:** filter by `cooldown_days` (last use date of the same `id`), fill slots by difficulty, keep 3 distinct categories, and avoid categories used in all of the last 3 days.
11. **Evening view:** hide earlier ratings until today's rating is saved.
12. **Category slugs:** `care` = "care/rest", `treat` = "treat-yourself".

## 10. PROVISIONAL decisions (made without the user; easy to change)
- Shop prices raised from the ARCHITECTURE.md starting values (30/80/150) to **50/150/350**, because at the planned coin rates the originals would give a manga every ~3 days. Coin values per difficulty are **unchanged**.
- Streak bonus = **+25 flat per 7 days**.
- Streak counts on quest OR rest OR ledger.
- Gratitude is prompted **Wednesday and Sunday**.
- Default `daily_quest_spend_cap` = the price of one coffee. `monthly_reward_budget` is unset until onboarding, and the currency is unknown, so seed rewards use coins only.
- The ISO week starts Monday and the boss expires Sunday 23:59 local time.
- "fail" is renamed "let go", and "smaller version" is added.
- The 1 free reroll/day from the architecture is kept as is.
- The city is unknown, so the seed quests are city-agnostic.

---

## Seed data

Both files are also written to `docs/brainstorm/seed/quests.yaml` and `docs/brainstorm/seed/rewards.yaml` (the same content as below, so it can be copied straight into `~/quest-data/` during scaffolding). Coins follow the difficulty table: easy 10, medium 20, hard 35.

### quests.yaml (48 quests, 6 per category)
The pool has 48 quests, 6 per category. In total there are 27 easy, 15 medium and 6 hard. Six categories have 3 easy, 2 medium and 1 hard. `care` has 4 easy and 2 medium, and `treat` has 5 easy and 1 medium. That's enough for the fallback to fill any energy mix from §1.4. The canonical file is `docs/brainstorm/seed/quests.yaml`. It's included here in full:

```yaml
# Fallback quest pool — used when `claude -p` is unavailable or fails validation.
# Fields: id, title, why, category, difficulty (easy|medium|hard), coins, cooldown_days
# Categories: body, mind, social, creative, adventure, care (care/rest), learning, treat (treat-yourself)
# Coins follow difficulty: easy 10, medium 20, hard 35 (server may recompute from difficulty).
quests:
  # ---------- body ----------
  - id: body-walk-20
    title: "Take a 20-minute walk without headphones"
    why: "Ears that only hear podcasts forget what the wind sounds like. Go collect three sounds for me."
    category: body
    difficulty: easy
    coins: 10
    cooldown_days: 2
  - id: body-stretch-10
    title: "Stretch for 10 minutes between two study blocks"
    why: "A spine bent over a laptop all day grows like a crooked ginseng root. Unbend it."
    category: body
    difficulty: easy
    coins: 10
    cooldown_days: 1
  - id: body-water-morning
    title: "Drink a full glass of water before your first coffee"
    why: "The cheapest tonic in the palace, and still nobody takes it."
    category: body
    difficulty: easy
    coins: 10
    cooldown_days: 1
  - id: body-workout-30
    title: "Do a 30-minute bodyweight workout: push-ups, squats, plank x3"
    why: "Muscles are a medicine cabinet you carry around. Restock it."
    category: body
    difficulty: medium
    coins: 20
    cooldown_days: 2
  - id: body-walk-to-cafe
    title: "Walk to a café at least 2 km away instead of taking transport"
    why: "The coffee tastes better when the legs have paid for it. I've tested this."
    category: body
    difficulty: medium
    coins: 20
    cooldown_days: 4
  - id: body-5k
    title: "Walk or jog 5 km in one go"
    why: "A long walk clears the head better than most things I could brew. Most."
    category: body
    difficulty: hard
    coins: 35
    cooldown_days: 4

  # ---------- mind ----------
  - id: mind-admin-one
    title: "Finish one nagging admin task (an email, form or payment)"
    why: "Small unfinished things fester like an untreated splinter. Pull one out."
    category: mind
    difficulty: easy
    coins: 10
    cooldown_days: 2
  - id: mind-plan-tomorrow
    title: "Write tomorrow's plan in five lines before bed"
    why: "A prescription written the night before is half swallowed by morning."
    category: mind
    difficulty: easy
    coins: 10
    cooldown_days: 1
  - id: mind-worry-dump
    title: "Do a 10-minute worry dump, then circle one item to act on"
    why: "Poisons are less frightening once you've written down their names."
    category: mind
    difficulty: easy
    coins: 10
    cooldown_days: 3
  - id: mind-pomodoro-4
    title: "Do 4 Pomodoros (25/5) on the course you're avoiding most"
    why: "The bitterest medicine is the one you keep putting back on the shelf."
    category: mind
    difficulty: medium
    coins: 20
    cooldown_days: 1
  - id: mind-phone-free-hour
    title: "Keep the first hour after waking phone-free"
    why: "Let your own thoughts arrive before everyone else's do."
    category: mind
    difficulty: medium
    coins: 20
    cooldown_days: 3
  - id: mind-deep-work-2h
    title: "Do one 2-hour deep-work block, phone in another room"
    why: "Two quiet hours do more than six distracted ones. That's arithmetic, not magic."
    category: mind
    difficulty: hard
    coins: 35
    cooldown_days: 3

  # ---------- social ----------
  - id: social-message-friend
    title: "Message a friend you haven't talked to in a month"
    why: "Friendships dry out like herbs left in the sun. A little water is enough."
    category: social
    difficulty: easy
    coins: 10
    cooldown_days: 4
  - id: social-compliment
    title: "Give someone a specific, genuine compliment"
    why: "Vague praise is like weak tea. Name the exact thing."
    category: social
    difficulty: easy
    coins: 10
    cooldown_days: 2
  - id: social-call-family
    title: "Call a family member and talk for 10+ minutes"
    why: "Someone out there wonders whether you're eating properly. Answer them."
    category: social
    difficulty: easy
    coins: 10
    cooldown_days: 5
  - id: social-ask-question
    title: "Ask one question in a lecture or at office hours"
    why: "A question asked out loud is worth three you looked up at 2 a.m."
    category: social
    difficulty: medium
    coins: 20
    cooldown_days: 4
  - id: social-cafe-invite
    title: "Invite a classmate to a café co-working session"
    why: "Studying next to someone is an old trick. Even the palace scribes did it."
    category: social
    difficulty: medium
    coins: 20
    cooldown_days: 7
  - id: social-manga-night
    title: "Host a manga or anime night with at least 2 people"
    why: "A story shared with friends lasts longer than one read alone. Bring snacks."
    category: social
    difficulty: hard
    coins: 35
    cooldown_days: 21

  # ---------- creative ----------
  - id: creative-panel-sketch
    title: "Sketch one manga panel of something that happened today"
    why: "Stick figures are allowed. Even the court painters started with lines."
    category: creative
    difficulty: easy
    coins: 10
    cooldown_days: 3
  - id: creative-playlist
    title: "Make a 10-song playlist for a manga arc you love"
    why: "Every good story deserves a soundtrack, even an unofficial one."
    category: creative
    difficulty: easy
    coins: 10
    cooldown_days: 7
  - id: creative-photo-theme
    title: "Take 5 photos on one theme (green things, lanterns or signs)"
    why: "A theme turns a walk into a hunt. I'm partial to green things, for professional reasons."
    category: creative
    difficulty: easy
    coins: 10
    cooldown_days: 5
  - id: creative-yonkoma
    title: "Draw or write a 4-panel comic (yonkoma) about student life"
    why: "Setup, development, twist, punchline. It works for comics and for poisonings."
    category: creative
    difficulty: medium
    coins: 20
    cooldown_days: 7
  - id: creative-mystery-scene
    title: "Write a 300-word scene in the style of a court-mystery manga"
    why: "Plant one clue the reader will miss. I always notice them, though."
    category: creative
    difficulty: medium
    coins: 20
    cooldown_days: 7
  - id: creative-ml-art
    title: "Make a small generative piece with a model you trained or fine-tuned"
    why: "The art is yours if the model learned its habits from you."
    category: creative
    difficulty: hard
    coins: 35
    cooldown_days: 14

  # ---------- adventure ----------
  - id: adv-new-route
    title: "Take a different route home and note three new things"
    why: "The same path every day makes the eyes lazy. Wake them up."
    category: adventure
    difficulty: easy
    coins: 10
    cooldown_days: 3
  - id: adv-bookstore-browse
    title: "Browse a bookstore or library manga section for 20 minutes, no buying"
    why: "Scouting first is cheaper than tasting everything. I'd know."
    category: adventure
    difficulty: easy
    coins: 10
    cooldown_days: 7
  - id: adv-new-dish
    title: "Order a dish you've never tried before"
    why: "A new flavor, safely prepared by someone else. The best kind of experiment."
    category: adventure
    difficulty: easy
    coins: 10
    cooldown_days: 5
  - id: adv-new-cafe
    title: "Visit a café you've never been to and rate it 1–5 herbs"
    why: "Every café is a field sample. Record your findings in the ledger."
    category: adventure
    difficulty: medium
    coins: 20
    cooldown_days: 7
  - id: adv-museum
    title: "Visit a museum, gallery or exhibition (free days count)"
    why: "Other people's obsessions, neatly labeled. Very educational."
    category: adventure
    difficulty: medium
    coins: 20
    cooldown_days: 14
  - id: adv-new-district
    title: "Spend an afternoon exploring a district you've never been to"
    why: "Maps lie by omission. Go and see what they left out. Come back before dark."
    category: adventure
    difficulty: hard
    coins: 35
    cooldown_days: 14

  # ---------- care (care/rest) ----------
  - id: care-tea-break
    title: "Take a 15-minute tea break with no screen"
    why: "Steep the tea and do nothing else. This is medicine, not laziness."
    category: care
    difficulty: easy
    coins: 10
    cooldown_days: 1
  - id: care-tidy-desk
    title: "Tidy your desk for 15 minutes"
    why: "An apothecary who can't find her mortar is a danger to everyone."
    category: care
    difficulty: easy
    coins: 10
    cooldown_days: 3
  - id: care-rest-day
    title: "Rest day: no studying after 18:00, and no guilt"
    why: "Herbs need to dry before they're useful. So do students."
    category: care
    difficulty: easy
    coins: 10
    cooldown_days: 6
  - id: care-nap-20
    title: "Rest with your eyes closed for 20 minutes"
    why: "Even the emperor's guards switch shifts. Close your eyes."
    category: care
    difficulty: easy
    coins: 10
    cooldown_days: 1
  - id: care-early-bed
    title: "Lights out by 23:30, phone charging out of reach"
    why: "Sleep is the one remedy I can't brew for you."
    category: care
    difficulty: medium
    coins: 20
    cooldown_days: 1
  - id: care-cook-meal
    title: "Cook one proper meal with a vegetable in it"
    why: "Instant noodles aren't a food group, no matter what the dormitory claims."
    category: care
    difficulty: medium
    coins: 20
    cooldown_days: 2

  # ---------- learning ----------
  - id: learn-paper-skim
    title: "Read one ML paper's abstract and figures, write a 3-line summary"
    why: "Read the label before the whole bottle. Then decide whether to open it."
    category: learning
    difficulty: easy
    coins: 10
    cooldown_days: 2
  - id: learn-jp-words
    title: "Learn 10 Japanese words from the manga you're reading now"
    why: "The words you meet in a story stick better than the ones in a list."
    category: learning
    difficulty: easy
    coins: 10
    cooldown_days: 2
  - id: learn-rubber-duck
    title: "Explain one concept from class out loud in 5 minutes"
    why: "If you can't explain it to the cat, you don't know it yet."
    category: learning
    difficulty: easy
    coins: 10
    cooldown_days: 3
  - id: learn-kaggle-45
    title: "Spend 45 minutes on a Kaggle dataset or notebook"
    why: "A dataset is just a garden nobody has weeded yet. Get your hands dirty."
    category: learning
    difficulty: medium
    coins: 20
    cooldown_days: 3
  - id: learn-lecture-summary
    title: "Rewrite today's lecture notes as a one-page summary"
    why: "Grind the notes down to a fine powder. Only the essential part should remain."
    category: learning
    difficulty: medium
    coins: 20
    cooldown_days: 2
  - id: learn-implement-scratch
    title: "Implement one algorithm from scratch in a notebook (attention, k-means or an MLP)"
    why: "You don't understand a poison until you've isolated it yourself. Same with attention."
    category: learning
    difficulty: hard
    coins: 35
    cooldown_days: 5

  # ---------- treat (treat-yourself) ----------
  - id: treat-slow-breakfast
    title: "Have a slow breakfast: sit down, no phone"
    why: "Food eaten while scrolling is barely tasted. Wasteful."
    category: treat
    difficulty: easy
    coins: 10
    cooldown_days: 3
  - id: treat-manga-after-hard
    title: "Read manga for 30 minutes right after your hardest task"
    why: "Sweet medicine after the bitter dose. That's how I'd prescribe it."
    category: treat
    difficulty: easy
    coins: 10
    cooldown_days: 2
  - id: treat-golden-hour
    title: "Go and watch the golden hour or sunset somewhere nice"
    why: "The light at that hour is free and it doesn't keep. Go before it ends."
    category: treat
    difficulty: easy
    coins: 10
    cooldown_days: 4
  - id: treat-new-genre
    title: "Read the first chapter of a manga genre you've never tried"
    why: "You may hate it. Data is data. Report back."
    category: treat
    difficulty: easy
    coins: 10
    cooldown_days: 7
  - id: treat-cafe-study
    title: "Study for an hour at a café you like, and enjoy the drink"
    why: "Work paired with a pleasure goes down easier. An old apothecary trick."
    category: treat
    difficulty: medium
    coins: 20
    cooldown_days: 5
  - id: treat-anime-earned
    title: "Watch one anime episode after a finished study block"
    why: "A reward that comes right after the work tastes the sweetest."
    category: treat
    difficulty: easy
    coins: 10
    cooldown_days: 2
```

**Pool coverage check:** `care` and `treat` have no `hard` quests. That's on purpose: a "hard rest" or a "hard treat" contradicts §4.4–4.5. Hard slots are filled from the other 6 categories. **Fallback rule:** if no quest of the required difficulty is available after cooldown filtering, ignore cooldowns for that slot, and then downgrade to the next difficulty if needed.

### rewards.yaml (15 rewards)
The canonical file is `docs/brainstorm/seed/rewards.yaml`. `tier: free` means the reward needs no real money.

```yaml
# Palace market — shop items.
# Fields: id, title, price (coins), cooldown_days, tier (free|small|medium|large|grand)
# "free" tier = costs no real money (permission rewards). Others imply real spending.
# PROVISIONAL prices (see §3): typical income ≈ 350 coins/week,
# so treat ≈ 2–3×/week, café meal ≈ 1×/week, manga ≈ every 2–4 weeks depending on other spending.
rewards:
  # ---------- free (no real money) ----------
  - id: skip-one-chore
    title: "Skip one optional chore today, guilt-free"
    price: 30
    cooldown_days: 7
    tier: free
  - id: lie-in
    title: "A lie-in: no alarm tomorrow morning"
    price: 40
    cooldown_days: 6
    tier: free
  - id: gaming-evening
    title: "Guilt-free gaming or anime binge evening"
    price: 60
    cooldown_days: 5
    tier: free
  # ---------- small ----------
  - id: treat
    title: "A treat: dessert, bubble tea or a favorite snack"
    price: 50
    cooldown_days: 2
    tier: small
  - id: specialty-drink
    title: "A specialty coffee or matcha latte"
    price: 60
    cooldown_days: 2
    tier: small
  # ---------- medium ----------
  - id: cafe-meal
    title: "A café meal"
    price: 150
    cooldown_days: 5
    tier: medium
  - id: new-cafe-brunch
    title: "A slow brunch at a café you've wanted to try"
    price: 220
    cooldown_days: 10
    tier: medium
  - id: manga-digital
    title: "One digital manga volume"
    price: 250
    cooldown_days: 7
    tier: medium
  - id: stationery
    title: "A nice notebook or pen for sketching"
    price: 200
    cooldown_days: 21
    tier: medium
  # ---------- large ----------
  - id: manga-volume
    title: "One physical manga volume"
    price: 350
    cooldown_days: 10
    tier: large
  - id: cinema
    title: "A cinema ticket (an anime film if one is showing)"
    price: 300
    cooldown_days: 14
    tier: large
  # ---------- grand ----------
  - id: tech-book
    title: "An ML/technical book or a paid course"
    price: 900
    cooldown_days: 45
    tier: grand
  - id: day-trip
    title: "A day trip somewhere new"
    price: 1200
    cooldown_days: 45
    tier: grand
  - id: manga-boxset
    title: "A manga box set or an art book"
    price: 1500
    cooldown_days: 60
    tier: grand
  - id: figure
    title: "A figure or merch item from a favorite series"
    price: 1800
    cooldown_days: 90
    tier: grand
```

Notes: the grand tier is about 3–5 typical weeks of saving and is meant for wishlist goals. A cooldown is a *pacing* aid, not a punishment. The UI shows "available again in N days" in a neutral tone.

### Final quest-generation prompt template
This is the canonical daily-generation prompt for `server/ai.ts` (`claude -p <prompt> --output-format json --model sonnet`). The reroll and boss variants are in §7.3 and §7.4.

How the server fills it:
- `{{…}}` placeholders are filled by the server.
- `{{slots}}` and `{{slot_rules}}` come from the energy table in §1.4. In rest-day or gentle-restart mode, the slots are forced to easy, and the categories are limited to `care`/`treat` (rest day) or include one `care` (gentle restart).
- `{{history_summary}}` has one line per day, e.g. `2026-10-24 E3 R7 | learning/medium/done👍, care/easy/done, social/easy/let_go(no time)`. Keep it under ~1.5k tokens.
- Empty sections render as `(none)`.
- With `--output-format json`, the model's text is in the wrapper's `result` field. Strip a stray code fence before parsing with zod, then retry once and fall back to `quests.yaml`.

```text
You are Maomao, the apothecary from the Inner Court, writing today's three "prescriptions" (small real-life quests) for Nurasyl, a university student. You are dry, curious, blunt, a little obsessed with herbs and poisons, and quietly kind. You never shame, and you never say "should" or "must".

## About Nurasyl (user-written profile — ground truth, overrides everything below)
{{profile_md}}

## Approved observations (insights)
{{insights_md}}

## Today
- Date: {{date}} ({{weekday}}), local time {{time}}
- Energy check-in: {{energy}}/5
- Mode: {{mode}}
- Coin balance: {{balance}}; wishlist target: {{wishlist_top}}
- Real-money cap for any single quest today: {{daily_spend_cap}}

## Required slots (fill exactly, in this order)
{{slots}}
Slot rules: {{slot_rules}}

## Recent history (last 14 days, one line per day)
{{history_summary}}
Category counts, last 7 days: {{category_counts}}

## Avoid
- Anything similar to these recent titles: {{recent_titles}}
- Kinds of quests recently rejected (rerolled or 👎, with reasons): {{rejected}}

## Rules
1. Exactly three quests, in three DIFFERENT categories, chosen from: body, mind, social, creative, adventure, care, learning, treat.
2. Prefer categories underused in the last 7 days. At least one quest must be finishable in 15 minutes or less.
3. Difficulty definitions — easy: ≤20 min, can start right away. medium: 20–60 min, needs a slot in the day or leaving the room. hard: 60–180 min, or a real social/emotional stretch. Match each slot's difficulty honestly; never label something harder than it is.
4. Every quest needs a concrete, checkable done-condition.
5. At most ONE quest may cost money, and only up to the cap. At energy 1–2, prefer free quests.
6. For hobbies Nurasyl already loves (manga, cafés, ML), prescribe a stretch within them (a new genre, a new café, a new technique), not just the hobby itself.
7. Fit the day: respect the weekday, the mode, and anything the profile says about schedule, places and equipment. Don't assume access to things the profile doesn't mention.
8. Safety: no dangerous physical challenges, no fasting or calorie restriction, no alcohol or substances, no solo night trips to unfamiliar places, no all-nighters, no academic dishonesty, no pressure or deception in social quests. Poison talk is flavor only — never suggest tasting, ingesting or experimenting with anything.
9. Don't diagnose or comment on mental or physical health.
10. title: plain imperative English, ≤ 70 characters, no emoji, no flavor text. why: ONE sentence in Maomao's voice, ≤ 160 characters, original (never quote the source material).

## Output
Return ONLY a JSON object — no prose, no code fences — with exactly 3 items in "quests":
{"quests":[{"title":"...","why":"...","category":"body|mind|social|creative|adventure|care|learning|treat","difficulty":"easy|medium|hard","minutes":15,"cost":"free|low|medium","done_when":"..."}]}
```

---

### References (brief)
- Amabile, T. & Kramer, S. (2011). *The Progress Principle.*
- Breines, J. & Chen, S. (2012). Self-compassion increases self-improvement motivation. *PSPB.*
- Csikszentmihalyi, M. (1990). *Flow.*
- Cuijpers, P., van Straten, A. & Warmerdam, L. (2007). Behavioral activation treatments of depression: a meta-analysis. *Clin Psych Review.*
- Dai, H., Milkman, K. & Riis, J. (2014). The fresh start effect. *Management Science.*
- Deci, E., Koestner, R. & Ryan, R. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. *Psych Bulletin.*
- Deci, E. & Ryan, R. (2000). The "what" and "why" of goal pursuits. *Psych Inquiry.*
- Gollwitzer, P. & Sheeran, P. (2006). Implementation intentions and goal achievement: a meta-analysis. *Adv. Exp. Soc. Psych.*
- Kahneman, D. & Tversky, A. (1979). Prospect theory. *Econometrica.* · Kahneman et al. (1993). When more pain is preferred to less (peak-end). *Psych Science.*
- Kivetz, R., Urminsky, O. & Zheng, Y. (2006). The goal-gradient hypothesis resurrected. *JMR.*
- Lally, P. et al. (2010). How are habits formed. *Eur J Soc Psych.*
- Lepper, M., Greene, D. & Nisbett, R. (1973). Undermining children's intrinsic interest with extrinsic reward. *JPSP.*
- Lieberman, M. et al. (2007). Putting feelings into words (affect labeling). *Psych Science.*
- Lyubomirsky, S., Sheldon, K. & Schkade, D. (2005). Pursuing happiness. *Rev Gen Psych.* (Weekly vs 3×/week gratitude; summarized in [APA Monitor](https://www.apa.org/monitor/oct06/key).)
- Marlatt, G. & Gordon, J. (1985). *Relapse Prevention* (abstinence violation effect).
- Milkman, K., Minson, J. & Volpp, K. (2014). Holding the Hunger Games hostage at the gym (temptation bundling). *Management Science.*
- Neff, K. (2003). Self-compassion. *Self and Identity.*
- Nunes, J. & Drèze, X. (2006). The endowed progress effect. *JCR.*
- Pennebaker, J. (1997). Writing about emotional experiences as a therapeutic process. *Psych Science.*
- Ryan, R., Rigby, C. S. & Przybylski, A. (2006). The motivational pull of video games. *Motivation & Emotion.*
- Woolley, K. & Fishbach, A. (2016). For the fun of it: harnessing immediate rewards to increase persistence in long-term goals. *JCR* 42(6). ([Cornell summary](https://news.cornell.edu/node/300311))
