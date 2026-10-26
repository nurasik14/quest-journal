/** Sprint M3 G6/G7/G16/G17/G19/G25: AI output contracts, hostile business-rule fixtures, reroll/boss rules. */
import { describe, expect, test } from "bun:test";
import { REROLL_REASONS, SAFETY_BLOCKLIST, questEarnings } from "../src/domain";
import { selectReroll } from "../src/fallback";
import {
  aiBossSchema,
  aiDaySchema,
  dayJsonSchema,
  normalizeTitle,
  titleSimilarity,
  validateBoss,
  validateDay,
  validateReroll,
  type AiQuest,
} from "../src/quest-rules";
import { REROLL_REASONS as THEME_REROLL } from "../../web/src/lib/theme/vocab";
import { VALID_BOSS, VALID_DAY } from "./helpers";

const day = () => aiDaySchema.parse(structuredClone(VALID_DAY));
const ctx3 = { energy: 3, recentTitles: [] as string[] };

describe("contract (architect-AC5)", () => {
  test("model-supplied coins/status/id are stripped by zod", () => {
    const raw = structuredClone(VALID_DAY) as { quests: Record<string, unknown>[] };
    raw.quests[0]!.coins = 9999;
    raw.quests[0]!.status = "done";
    raw.quests[0]!.id = "../x";
    const parsed = aiDaySchema.parse(raw);
    expect(Object.keys(parsed.quests[0]!).sort()).toEqual(["category", "cost", "difficulty", "done_when", "minutes", "title", "why"]);
  });
  test("JSON schema: additionalProperties false, exact count, enums from domain", () => {
    const s = dayJsonSchema(3) as any;
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.quests.minItems).toBe(3);
    expect(s.properties.quests.items.additionalProperties).toBe(false);
    expect(s.properties.quests.items.properties.category.enum).toHaveLength(8);
  });
  test("too-long title/why fail zod (hard caps 80/240)", () => {
    const raw = structuredClone(VALID_DAY);
    raw.quests[0]!.title = "x".repeat(81);
    expect(aiDaySchema.safeParse(raw).success).toBe(false);
  });
});

describe("validateDay: one hostile fixture per rule (G7)", () => {
  test("valid day passes", () => {
    expect(validateDay(day(), ctx3).violations).toEqual([]);
  });
  const bad: [string, (q: AiQuest[]) => void, number, string][] = [
    ["slots: energy 2 gets a hard", (q) => (q[2]!.difficulty = "hard"), 2, "slot:2"],
    ["slots out of order", (q) => {
      q[0]!.difficulty = "medium";
      q[1]!.difficulty = "easy";
    }, 3, "slot:0"],
    ["duplicate categories", (q) => (q[1]!.category = "body"), 3, "categories"],
    ["two costly quests", (q) => {
      q[0]!.cost = "low";
      q[1]!.cost = "low";
    }, 3, "money"],
    ["energy 1 with any cost", (q) => {
      q.forEach((x) => (x.difficulty = "easy"));
      q[0]!.category = "care";
      q[0]!.cost = "low";
    }, 1, "money"],
    ["easy quest at 45 minutes", (q) => (q[0]!.minutes = 45), 3, "minutes:0"],
    ["no small win (all > 15 min)", (q) => (q[0]!.minutes = 20), 3, "small_win"],
    ["safety: mushroom tasting", (q) => (q[0]!.title = "Taste a wild mushroom like Maomao"), 3, "safety:0"],
    ["safety: in done_when", (q) => (q[1]!.done_when = "After skipping a meal"), 3, "safety:1"],
    ["emoji in title", (q) => (q[0]!.title = "Stretch 🌿 by the window"), 3, "emoji:0"],
    ["energy 1 without care", (q) => q.forEach((x) => (x.difficulty = "easy")), 1, "care"],
    ["energy 2 without care/treat", (q) => (q[1]!.difficulty = "easy"), 2, "care"],
  ];
  for (const [name, mutate, energy, code] of bad) {
    test(name, () => {
      const d = day();
      mutate(d.quests);
      expect(validateDay(d, { energy, recentTitles: [] }).violations).toContain(code);
    });
  }
  test("wrong count", () => {
    const d = day();
    d.quests.pop();
    expect(validateDay(d, ctx3).violations).toEqual(["count"]);
  });
  test("repeat: café vs cafe and punctuation are 'similar' (psychologist-AC3)", () => {
    const d = day();
    d.quests[1]!.title = "Visit a cafe you've never tried";
    expect(validateDay(d, { energy: 3, recentTitles: ["Visit a café you’ve never tried."] }).violations).toContain("repeat:1");
    expect(titleSimilarity("Visit a cafe you've never tried", "Visit a café you've never tried.")).toBeGreaterThan(0.8);
    expect(normalizeTitle("Visit a Café!")).toBe("visit a cafe");
  });
  test("energy 5 waives the small win", () => {
    const d = day();
    d.quests[0]!.difficulty = "medium";
    d.quests[0]!.minutes = 30;
    d.quests[2]!.difficulty = "hard";
    d.quests[2]!.minutes = 90;
    expect(validateDay(d, { energy: 5, recentTitles: [] }).violations).toEqual([]);
  });
  test("should/must is only a tone warning", () => {
    const d = day();
    d.quests[0]!.why = "You should stretch.";
    const r = validateDay(d, ctx3);
    expect(r.violations).toEqual([]);
    expect(r.toneWarnings).toEqual(["tone:0"]);
  });
});

describe("SAFETY_BLOCKLIST phrase forms (M4, psychologist-AC19 / backlog #464 #478)", () => {
  const negatives = [
    "Breakfast with a friend",
    "Steadfast reading",
    "Wine-red ink sketch",
    "A wine-red notebook for sketches",
    "Read for its own sake",
    "Tea drunk slowly by the window",
    "Walk fast to the library",
    "A varied diet of manga genres",
    "Drink a glass of water before class",
    "Fast-forward through your notes",
  ];
  const positives = [
    "Get drunk at karaoke",
    "Order a beer at the café",
    "Try a juice fast",
    "Count calories",
    "Try intermittent fasting",
    "Pull an all-nighter",
    "Forage for herbs",
    "Weigh yourself",
    "Have some wine with dinner",
    "Go on a diet for a week",
    "Skip breakfast",
    "Taste a wild mushroom",
  ];
  test.each(negatives)("passes: %s", (t) => expect(SAFETY_BLOCKLIST.test(t)).toBe(false));
  test.each(positives)("blocks: %s", (t) => expect(SAFETY_BLOCKLIST.test(t)).toBe(true));
  test("benign corpus: every seed pool title/why/checkpoint passes", async () => {
    const { parse } = await import("yaml");
    const text = await Bun.file(new URL("../../docs/brainstorm/seed/quests.yaml", import.meta.url)).text();
    const pool = parse(text) as { quests?: { title: string; why?: string }[]; boss?: { title: string; why?: string; checkpoints?: string[] }[] };
    const strings = [
      ...(pool.quests ?? []).flatMap((q) => [q.title, q.why ?? ""]),
      ...(pool.boss ?? []).flatMap((b) => [b.title, b.why ?? "", ...(b.checkpoints ?? [])]),
    ];
    expect(strings.length).toBeGreaterThan(50);
    expect(strings.filter((s) => SAFETY_BLOCKLIST.test(s))).toEqual([]);
  });
});

describe("validateReroll (psychologist-AC14)", () => {
  const base = {
    energy: 3,
    difficulty: "medium" as const,
    rejected: { title: "Sketch one object on your desk", category: "creative", minutes: 30 },
    reason: null,
    others: [
      { title: "Stretch", category: "body", cost: "free" },
      { title: "Message", category: "social", cost: "free" },
    ],
    recentTitles: [],
  };
  const repl = (o: Partial<AiQuest> = {}): { quests: AiQuest[] } => ({
    quests: [{ title: "Read one chapter of a new manga", why: "New ink.", category: "learning", difficulty: "medium", minutes: 25, cost: "free", done_when: "Chapter read", ...o }],
  });
  test("valid replacement", () => expect(validateReroll(repl(), base).violations).toEqual([]));
  test("same category as rejected", () => expect(validateReroll(repl({ category: "creative" }), base).violations).toContain("same_category"));
  test("collides with another slot's category", () => expect(validateReroll(repl({ category: "body" }), base).violations).toContain("categories"));
  test("wrong difficulty", () => expect(validateReroll(repl({ difficulty: "hard", minutes: 90 }), base).violations).toContain("slot:0"));
  test("costs_money → must be free", () =>
    expect(validateReroll(repl({ cost: "low" }), { ...base, reason: "costs_money" }).violations).toContain("money"));
  test("too_long → fewer minutes than the rejected one", () => {
    expect(validateReroll(repl({ minutes: 30 }), { ...base, reason: "too_long" }).violations).toContain("too_long");
    expect(validateReroll(repl({ minutes: 20 }), { ...base, reason: "too_long" }).violations).toEqual([]);
  });
  test("may not repeat the rejected title", () =>
    expect(validateReroll(repl({ title: "Sketch one object on your desk." }), base).violations).toContain("repeat:0"));
});

describe("validateBoss (psychologist-AC17)", () => {
  const b = () => aiBossSchema.parse(structuredClone(VALID_BOSS));
  test("valid", () => expect(validateBoss(b(), { lastType: "learn" }).violations).toEqual([]));
  test("same type as last week", () => expect(validateBoss(b(), { lastType: "make" }).violations).toContain("type_repeat"));
  test("3 checkpoints", () => {
    const x = b();
    x.boss.checkpoints.pop();
    expect(validateBoss(x, {}).violations).toContain("checkpoints");
  });
  test("medium cost", () => {
    const x = b();
    x.boss.cost = "medium";
    expect(validateBoss(x, {}).violations).toContain("money");
  });
});

describe("selectReroll (pool path, psychologist-AC16)", () => {
  const pool = [
    { title: "A", why: "", category: "creative", difficulty: "medium", cooldown_days: 0 },
    { title: "B", why: "", category: "body", difficulty: "medium", cooldown_days: 0 },
    { title: "C", why: "", category: "learning", difficulty: "medium", cooldown_days: 0, cost: "low" },
    { title: "D", why: "", category: "mind", difficulty: "medium", cooldown_days: 0 },
    { title: "E", why: "", category: "mind", difficulty: "easy", cooldown_days: 0 },
  ] as any[];
  const input = {
    pool,
    date: "2026-10-26",
    energy: 3,
    difficulty: "medium" as const,
    rejected: { title: "A", category: "creative" },
    others: [{ title: "B", category: "body" }],
    history: [],
  };
  test("never the rejected category or another slot's; same difficulty", () => {
    for (let i = 0; i < 20; i++) {
      const q = selectReroll({ ...input, rng: () => (i * 0.049) % 1 });
      expect(q).not.toBeNull();
      expect(["learning", "mind"]).toContain(q!.category);
      expect(q!.difficulty).toBe("medium");
    }
  });
  test("costs_money → free only", () => {
    for (let i = 0; i < 10; i++) expect(selectReroll({ ...input, reason: "costs_money", rng: () => (i * 0.09) % 1 })!.title).toBe("D");
  });
  test("nothing fits → null", () => {
    expect(selectReroll({ ...input, pool: [pool[0], pool[1]] })).toBeNull();
  });
});

describe("REROLL_REASONS parity + questEarnings (G17/G25)", () => {
  test("domain ids equal the theme ids", () => {
    expect(THEME_REROLL.map((r) => r.id)).toEqual([...REROLL_REASONS]);
  });
  test.each([
    [{ difficulty: "hard", status: "done" }, 35],
    [{ difficulty: "hard", status: "partial" }, 20],
    [{ difficulty: "easy", status: "partial" }, 5],
    [{ difficulty: "medium", status: "let_go" }, 0],
    [{ difficulty: "medium", status: "open" }, 0],
    [{ difficulty: "medium", status: "done", coins: 15 }, 15],
    [{ difficulty: "medium", status: "partial", coins: 6 }, 6],
    [{ difficulty: "easy", status: "done", coins: 500 }, 100],
    [{ difficulty: "easy", status: "done", coins: -4 }, 0],
  ] as const)("%o → %i", (q, n) => {
    expect(questEarnings(q as any)).toBe(n);
  });
});
