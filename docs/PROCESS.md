# Agile process (run by the manager agent)

Sprint 0 is discovery: architect + psychologist brainstorm in parallel.
Then there's one sprint per milestone (M1–M6 from `.orchestrator/prompts/builder-common.md`). Each sprint loops through these steps:

1. **Planning** (in parallel): architect, psychologist and designer each write `docs/sprints/<M>/plan-<role>.md` with acceptance criteria, risks and suggestions from their angle. They read `docs/BACKLOG.md` and the last retro.
2. **Build:** the builder merges the plans into `docs/sprints/<M>/sprint-goal.md`, which lists the acceptance criteria and the MUST backlog items it takes on. Then it implements them.
3. **Test:** the tester checks against `sprint-goal.md`. FAIL or PARTIAL leads to a builder fix round and a retest (at most 2 fix loops, then leftovers go to the backlog as MUST).
4. **Review/retro** (in parallel): architect, psychologist and designer review the increment and the test report. They write `docs/sprints/<M>/review-<role>.md` (what went well, what to change, process notes) and add backlog items.

After M6, hardening sprints repeat steps 2–4 on the open MUST/SHOULD items until no MUST items remain (at most 2 hardening sprints).
