/** Sprint M5: the pure ledger (economy.ts / domain.ts). No I/O, no clock. */
import { describe, expect, test } from "bun:test";
import { addDays } from "../src/clock";
import { bossCoinsFor } from "../src/domain";
import { availableOn, computeEconomy, dayCounts, paceEstimate, streakWalk, type DayInput, type EconomyInputs } from "../src/economy";

const T = "2026-10-25";
const done = (d: "easy" | "medium" | "hard" = "easy") => ({ difficulty: d, status: "done" as const });

/** `n` consecutive counting days ending at `end` (inclusive). */
function run(end: string, n: number, make: (date: string) => DayInput = (date) => ({ date, quests: [done()], satisfaction: null })): DayInput[] {
  return Array.from({ length: n }, (_, i) => make(addDays(end, -(n - 1 - i))));
}

function inputs(over: Partial<EconomyInputs>): EconomyInputs {
  return { days: [], weeks: [], spend: { purchases: [], adjustments: [] }, broken: [], today: T, ...over };
}

describe("bossCoinsFor (psychologist-AC4, architect-AC3 cap)", () => {
  test.each([
    ["done", 0, 4, undefined, 100],
    ["done", 4, 4, undefined, 100],
    ["done", 1, 4, undefined, 100],
    ["open", 2, 4, undefined, 30],
    ["open", 4, 4, undefined, 60],
    ["open", 0, 4, undefined, 0],
    ["partial", 0, 0, undefined, 50],
    ["partial", 4, 4, undefined, 60],
    ["partial", 1, 4, undefined, 50],
    ["let_go", 3, 4, undefined, 45],
    ["let_go", 0, 0, undefined, 0],
    ["done", 0, 0, 500, 100],
    ["done", 0, 0, -5, 0],
    ["open", 4, 4, 40, 40],
    ["open", 9, 4, undefined, 60],
  ] as const)("(%s, %d/%d, snapshot %p) → %d", (status, ticked, total, snap, want) => {
    expect(bossCoinsFor(status, ticked, total, snap)).toBe(want);
  });
});

describe("dayCounts (psychologist-AC7 ∪ architect-AC5)", () => {
  test("partial-only counts; rating with everything let go counts; notes-only counts; energy-only doesn't", () => {
    expect(dayCounts({ date: T, quests: [{ difficulty: "hard", status: "partial" }], satisfaction: null })).toBe(true);
    expect(dayCounts({ date: T, quests: [{ difficulty: "easy", status: "let_go" }], satisfaction: 3 })).toBe(true);
    expect(dayCounts({ date: T, quests: [], satisfaction: null, notes: "a line" })).toBe(true);
    expect(dayCounts({ date: T, quests: [{ difficulty: "easy", status: "open" }], satisfaction: null, notes: "  \n" })).toBe(false);
  });
});

describe("streakWalk (architect-AC5, psychologist-AC8–11)", () => {
  test("7-day run → bonus 25 + 1 herb", () => {
    const w = streakWalk(run(T, 7), T);
    expect(w).toMatchObject({ streak: 7, freeze_tokens: 1, streak_bonus_total: 25, days_logged: 7, next_bonus_in_days: 7 });
  });
  test("7 days, gap 1, 3 days → streak 10, herbs 0 (bridged)", () => {
    const days = [...run("2026-10-21", 7), ...run(T, 3)]; // 10-22 is the gap
    const w = streakWalk(days, T);
    expect(w.streak).toBe(10);
    expect(w.freeze_tokens).toBe(0);
    expect(w.events.filter((e) => e.type === "token_used").map((e) => e.date)).toEqual(["2026-10-22"]);
  });
  test("7 days, gap of 4, then today → streak 1, a rest, the herb kept (H1 #236: no burn on an unbridgeable gap)", () => {
    const w = streakWalk([...run("2026-10-20", 7), ...run(T, 1)], T); // run 10-14..10-20, gaps 10-21..10-24
    expect(w.streak).toBe(1);
    expect(w.events.filter((e) => e.type === "rest")).toHaveLength(1);
    expect(w.events.filter((e) => e.type === "token_used")).toHaveLength(0);
    expect(w.freeze_tokens).toBe(1);
  });
  test("psychologist fixture: 7 days, gap 2 → reset", () => {
    const fixture = [...run("2026-10-22", 7), ...run(T, 1)]; // run 10-16..10-22, gaps 10-23, 10-24, today counts
    const w = streakWalk(fixture, T);
    expect(w.events.map((e) => e.type)).toEqual(["bonus", "token_earned", "rest"]); // H1 #236: the herb is kept
    expect(w.streak).toBe(1);
    expect(w.longest_streak).toBe(7);
  });
  test("14 days (2 herbs), gap 2, 1 day → 15", () => {
    const fixture = [...run("2026-10-22", 14), ...run(T, 1)];
    const w = streakWalk(fixture, T);
    expect(w.streak).toBe(15);
    expect(w.freeze_tokens).toBe(0);
    expect(w.streak_bonus_total).toBe(50);
  });
  test("gap 3 with 2 herbs → rests", () => {
    const fixture = [...run("2026-10-21", 14), ...run(T, 1)]; // gaps 10-22, 10-23, 10-24
    const w = streakWalk(fixture, T);
    expect(w.streak).toBe(1);
    expect(w.longest_streak).toBe(14);
  });
  test("21 days → herbs capped at 2, bonus 75; 14 days → 50 and recomputing ×3 is stable", () => {
    expect(streakWalk(run(T, 21), T)).toMatchObject({ freeze_tokens: 2, streak_bonus_total: 75 });
    const days = run(T, 14);
    const a = streakWalk(days, T);
    expect(streakWalk(days, T)).toEqual(a);
    expect(streakWalk(days, T)).toEqual(a);
    expect(a.streak_bonus_total).toBe(50);
  });
  test("today not counting yet never uses a herb or ends the run (P-AC8)", () => {
    const fixture = run(addDays(T, -1), 7);
    const w = streakWalk(fixture, T);
    expect(w).toMatchObject({ streak: 7, freeze_tokens: 1 });
    expect(w.events.some((e) => e.type === "token_used" || e.type === "rest")).toBe(false);
    const six = streakWalk(run(addDays(T, -1), 6), T);
    expect(six).toMatchObject({ streak: 6, freeze_tokens: 0 });
  });
  test("a broken day is neutral: 6 days, broken, 1 day → streak 7, bonus 25 (P-AC11)", () => {
    const fixture = [...run("2026-10-23", 6), ...run(T, 1)];
    const w = streakWalk(fixture, T, { neutral: ["2026-10-24"] });
    expect(w.streak).toBe(7);
    expect(w.streak_bonus_total).toBe(25);
  });
  test("future-dated days are ignored by the walk", () => {
    const w = streakWalk([...run(T, 2), { date: addDays(T, 3), quests: [done()], satisfaction: null }], T);
    expect(w.streak).toBe(2);
  });
  test("a backfilled day joins two runs retroactively (deterministic, PROVISIONAL)", () => {
    const before = streakWalk([...run("2026-10-21", 4), ...run(T, 3)], T); // gap on 10-22
    expect(before.streak).toBe(3);
    const after = streakWalk([...run("2026-10-21", 4), { date: "2026-10-22", quests: [], satisfaction: 5 }, ...run(T, 3)], T);
    expect(after.streak).toBe(8);
    expect(after.streak_bonus_total).toBe(25);
  });
  test("DST week (calendar dates, no hour math): 2026-10-19..2026-10-27 is 9 days", () => {
    const w = streakWalk(run("2026-10-27", 9), "2026-10-27");
    expect(w.streak).toBe(9);
  });
});

describe("computeEconomy (architect-AC1/2/6/11/12, psychologist-AC2/6)", () => {
  const days: DayInput[] = [
    { date: "2026-10-24", quests: [done("hard"), { difficulty: "medium", status: "partial" }, { difficulty: "easy", status: "let_go" }], satisfaction: 6 },
    { date: T, quests: [done("medium"), done("easy")], satisfaction: null },
  ];
  test("same inputs → deep-equal output (pure)", () => {
    const i = inputs({ days, weeks: [{ week: "2026-W43", boss: { status: "done", checkpoints: [{ done: true }] } }] });
    expect(computeEconomy(i)).toEqual(computeEconomy(i));
  });
  test("earnings: 35 + 10 + 20 + 10 + boss 100 = 175; spend and adjustments", () => {
    const e = computeEconomy(
      inputs({
        days,
        weeks: [{ week: "2026-W43", boss: { status: "done" } }],
        spend: {
          purchases: [
            { id: "a", item_id: "treat", price: 50, date: T, voided_at: null },
            { id: "b", item_id: "treat", price: 50, date: T, voided_at: "2026-10-25T11:00:00+05:00" },
          ],
          adjustments: [{ amount: -5 }],
        },
      }),
    );
    expect(e.earned_total).toBe(175);
    expect(e.spent_total).toBe(50);
    expect(e.adjustments_total).toBe(-5);
    expect(e.balance).toBe(120);
    expect(e.earned_today).toBe(30);
    expect(e.quests_done).toBe(5);
  });
  test("future files earn 0 + warning; next week's boss earns 0", () => {
    const e = computeEconomy(
      inputs({ days: [{ date: "2026-10-30", quests: [done("hard")], satisfaction: null }], weeks: [{ week: "2026-W45", boss: { status: "done" } }] }),
    );
    expect(e.earned_total).toBe(0);
    expect(e.warnings.map((w) => w.code)).toEqual(["future_file", "future_file"]);
  });
  test("hand-edited coins: 9999 is clamped to 100 with a warning (psychologist-AC6)", () => {
    const e = computeEconomy(inputs({ days: [{ date: T, quests: [{ difficulty: "easy", status: "done", coins: 9999 }], satisfaction: null }] }));
    expect(e.earned_total).toBe(100);
    expect(e.warnings[0]?.code).toBe("coins_clamped");
  });
  test("broken purchases.yaml → balance null (never read as zero)", () => {
    const e = computeEconomy(inputs({ days, spend: null, broken: [{ file: "purchases.yaml", code: "unparseable_file", message: "x" }] }));
    expect(e.balance).toBeNull();
    expect(e.spent_total).toBeNull();
    expect(e.earned_total).toBe(75);
    expect(e.warnings[0]?.file).toBe("purchases.yaml");
  });
  test("negative balance after an undo is returned as-is (architect-AC12)", () => {
    const e = computeEconomy(inputs({ days: [], spend: { purchases: [{ id: "a", item_id: "x", price: 20, date: T, voided_at: null }], adjustments: [] } }));
    expect(e.balance).toBe(-20);
  });
  test("bonus_today only on the day the 7th count lands; events_recent = today/yesterday", () => {
    const e = computeEconomy(inputs({ days: run(T, 7) }));
    expect(e.bonus_today).toBe(25);
    expect(e.earned_total).toBe(70 + 25);
    expect(e.events_recent.map((x) => x.type)).toEqual(["bonus", "token_earned"]);
    const e2 = computeEconomy(inputs({ days: run(T, 8) }));
    expect(e2.bonus_today).toBe(0);
  });
  test("streak bonus is configurable (STREAK_BONUS)", () => {
    expect(computeEconomy(inputs({ days: run(T, 7), streakBonus: 40 })).streak_bonus_total).toBe(40);
  });
  test("days_logged_month counts this calendar month only", () => {
    const e = computeEconomy(inputs({ days: run(T, 30) }));
    expect(e.days_logged).toBe(30);
    expect(e.days_logged_month).toBe(25);
  });
  test("pace: 14-day average with zeros included", () => {
    const e = computeEconomy(inputs({ days: [{ date: T, quests: [done("hard")], satisfaction: null }] }));
    expect(e.pace_per_day).toBe(2.5);
  });
});

describe("shop helpers", () => {
  const p = (date: string, voided: string | null = null) => ({ id: date, item_id: "cafe", price: 150, date, voided_at: voided });
  test("availableOn: logical days; cooldown 0 = none; voided don't count", () => {
    expect(availableOn([p("2026-10-24")], "cafe", 5, T)).toBe("2026-10-29");
    expect(availableOn([p("2026-10-20")], "cafe", 5, T)).toBeNull();
    expect(availableOn([p("2026-10-24")], "cafe", 0, T)).toBeNull();
    expect(availableOn([p("2026-10-24", "x")], "cafe", 5, T)).toBeNull();
    expect(availableOn([p("2026-10-24")], "treat", 5, T)).toBeNull();
  });
  test("paceEstimate needs ≥7 logged days and a positive pace", () => {
    expect(paceEstimate(100, { pace_per_day: 50, days_logged: 7 })).toBe(2);
    expect(paceEstimate(101, { pace_per_day: 50, days_logged: 7 })).toBe(3);
    expect(paceEstimate(100, { pace_per_day: 50, days_logged: 6 })).toBeNull();
    expect(paceEstimate(100, { pace_per_day: 0, days_logged: 30 })).toBeNull();
    expect(paceEstimate(0, { pace_per_day: 50, days_logged: 30 })).toBeNull();
  });
});

describe("econ:sim (psychologist B8): motivation §3.1 numbers through the real ledger", () => {
  test("typical ≈ 300–400 taels/week and a manga in 2–4 weeks with 2 treats + 1 café a week", async () => {
    const { PROFILES, simulate } = await import("../src/econ-sim");
    const [low, typical, strong] = PROFILES.map((p) => simulate(p, 4));
    expect(typical!.perWeek).toBeGreaterThanOrEqual(300);
    expect(typical!.perWeek).toBeLessThanOrEqual(400);
    expect(typical!.weeksToManga).toBeGreaterThanOrEqual(2);
    expect(typical!.weeksToManga).toBeLessThanOrEqual(4);
    expect(low!.perWeek).toBeLessThan(typical!.perWeek);
    expect(strong!.perWeek).toBeGreaterThan(typical!.perWeek);
    expect(strong!.perWeek).toBeLessThanOrEqual(600);
  });
});
