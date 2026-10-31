# How it works

[← Back to README](../README.md)

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

## When a page can't be read

If a hand edit breaks a file (say `satisfaction: 14`, or bad YAML), the app won't overwrite it or guess. The page shows
the line number and your text, read-only, and the Garden draws a hatched "can't be read" plot that never counts as a
bad day or breaks a streak. Fix the line in your editor and the app picks it up on the next load.
