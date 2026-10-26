import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addDays } from "../src/clock";
import { ENERGY_SLOTS, MOOD_SUGGESTIONS, RATING_ANCHORS } from "../src/domain";
import { seededRng, selectBoss, selectDaily, type HistoryDay } from "../src/fallback";
import { parseYamlText } from "../src/markdown";
import { questPoolFileSchema, type PoolQuest } from "../src/schemas";
import { MOOD_TAGS, RATING_ANCHORS as THEME_ANCHORS } from "../../web/src/lib/theme/vocab";
import { SEED_DIR } from "./helpers";

const seedPool = questPoolFileSchema.parse(parseYamlText(await readFile(join(SEED_DIR, "quests.yaml"), "utf8")));
const isCostly = (q: PoolQuest) => q.cost !== undefined && q.cost !== "free";

describe("selectDaily: slot table (psychologist-AC3)", () => {
  for (const energy of [1, 2, 3, 4, 5] as const) {
    test(`energy ${energy} × 20 seeds`, () => {
      for (let s = 0; s < 20; s++) {
        const date = addDays("2026-10-01", s);
        const { quests, relaxation } = selectDaily({ pool: seedPool.daily, energy, date, history: [] });
        expect(quests.map((q) => q.difficulty)).toEqual([...ENERGY_SLOTS[energy]]);
        expect(quests.map((q) => q.pool.difficulty)).toEqual([...ENERGY_SLOTS[energy]]);
        expect(quests.filter((q) => q.difficulty === "hard").length).toBeLessThanOrEqual(1);
        if (energy <= 2) expect(quests.some((q) => q.difficulty === "hard")).toBe(false);
        expect(relaxation).toBe(0);
      }
    });
  }
});

describe("selectDaily: constraints (psychologist-AC4, architect-AC9)", () => {
  test("100 seeds: distinct categories, care rules, ≤1 costly, none costly at energy 1", () => {
    for (let s = 0; s < 100; s++) {
      const energy = (s % 5) + 1;
      const date = addDays("2026-01-01", s);
      const { quests } = selectDaily({ pool: seedPool.daily, energy, date, history: [] });
      const cats = quests.map((q) => q.pool.category);
      expect(new Set(cats).size).toBe(3);
      if (energy === 1) {
        expect(cats).toContain("care");
        expect(quests.some((q) => isCostly(q.pool))).toBe(false);
      }
      if (energy === 2) expect(cats.some((c) => c === "care" || c === "treat")).toBe(true);
      expect(quests.filter((q) => isCostly(q.pool)).length).toBeLessThanOrEqual(1);
    }
  });

  test("deterministic: same date+energy+pool → same quests", () => {
    const a = selectDaily({ pool: seedPool.daily, energy: 3, date: "2026-10-26", history: [] });
    const b = selectDaily({ pool: seedPool.daily, energy: 3, date: "2026-10-26", history: [] });
    expect(a.quests.map((q) => q.pool.title)).toEqual(b.quests.map((q) => q.pool.title));
  });

  test("titles from the last 14 days are excluded while enough remain", () => {
    const date = "2026-10-26";
    const first = selectDaily({ pool: seedPool.daily, energy: 3, date, history: [] });
    const history: HistoryDay[] = [{ date: addDays(date, -10), titles: first.quests.map((q) => q.pool.title) }];
    const second = selectDaily({ pool: seedPool.daily, energy: 3, date, history });
    for (const q of second.quests) expect(first.quests.map((x) => x.pool.title)).not.toContain(q.pool.title);
    expect(second.relaxation).toBe(0);
  });

  test("history on/after the date is ignored", () => {
    const date = "2026-10-26";
    const a = selectDaily({ pool: seedPool.daily, energy: 3, date, history: [] });
    const b = selectDaily({ pool: seedPool.daily, energy: 3, date, history: [{ date, titles: a.quests.map((q) => q.pool.title) }] });
    expect(b.quests.map((q) => q.pool.title)).toEqual(a.quests.map((q) => q.pool.title));
  });

  test("every care quest on cooldown (and recently used) at energy 1 still returns 3 easy quests", () => {
    const date = "2026-10-26";
    const careTitles = seedPool.daily.filter((q) => q.category === "care").map((q) => q.title);
    const history: HistoryDay[] = [{ date: addDays(date, -1), titles: careTitles }];
    const { quests, relaxation } = selectDaily({ pool: seedPool.daily, energy: 1, date, history });
    expect(quests).toHaveLength(3);
    expect(quests.every((q) => q.difficulty === "easy")).toBe(true);
    expect(relaxation).toBeGreaterThan(0);
  });

  test("a tiny pool relaxes categories but never difficulty", () => {
    const pool: PoolQuest[] = [
      { title: "A", why: "", category: "body", difficulty: "easy", cooldown_days: 0 },
      { title: "B", why: "", category: "body", difficulty: "medium", cooldown_days: 0 },
      { title: "C", why: "", category: "body", difficulty: "medium", cooldown_days: 0 },
      { title: "D", why: "", category: "body", difficulty: "hard", cooldown_days: 0 },
    ];
    const { quests } = selectDaily({ pool, energy: 3, date: "2026-10-26", history: [] });
    expect(quests.map((q) => q.difficulty)).toEqual(["easy", "medium", "medium"]);
    const e5 = selectDaily({ pool, energy: 5, date: "2026-10-26", history: [] });
    expect(e5.quests.map((q) => q.difficulty)).toEqual(["medium", "medium", "hard"]);
  });

  test("a pool missing a difficulty fills what it can (no hard swapped in for easy)", () => {
    const pool: PoolQuest[] = [{ title: "Only hard", why: "", category: "body", difficulty: "hard", cooldown_days: 0 }];
    const { quests } = selectDaily({ pool, energy: 1, date: "2026-10-26", history: [] });
    expect(quests).toHaveLength(0);
  });

  test("seed pool marks money-costing quests with cost (psychologist B3)", () => {
    const costly = seedPool.daily.filter(isCostly).map((q) => q.id);
    expect(costly).toEqual(expect.arrayContaining(["adv-new-dish", "adv-new-cafe", "adv-museum", "body-walk-to-cafe"]));
  });
});

describe("selectBoss (psychologist-AC11)", () => {
  test("seeded by week and deterministic", () => {
    const a = selectBoss({ pool: seedPool.boss, week: "2026-W44" });
    const b = selectBoss({ pool: seedPool.boss, week: "2026-W44" });
    expect(a?.title).toBe(b?.title);
  });
  test("type differs from last week's when the pool allows", () => {
    for (let w = 1; w <= 30; w++) {
      const week = `2026-W${String(w).padStart(2, "0")}`;
      const prev = selectBoss({ pool: seedPool.boss, week: "x", rng: seededRng(w) })!;
      const next = selectBoss({ pool: seedPool.boss, week, previous: prev })!;
      expect(next.type).not.toBe(prev.type);
      expect(next.title).not.toBe(prev.title);
    }
  });
  test("empty pool → null", () => {
    expect(selectBoss({ pool: [], week: "2026-W44" })).toBeNull();
  });
});

describe("shared vocabulary (psychologist B6)", () => {
  test("domain MOOD_SUGGESTIONS / RATING_ANCHORS equal the theme vocab", () => {
    expect([...MOOD_SUGGESTIONS]).toEqual([...MOOD_TAGS]);
    expect([...RATING_ANCHORS]).toEqual([...THEME_ANCHORS]);
    expect(RATING_ANCHORS).toHaveLength(10);
    expect(RATING_ANCHORS[6]).toBe("Good; I'd happily have this day again.");
  });
});
