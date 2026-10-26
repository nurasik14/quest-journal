import { describe, expect, test } from "bun:test";
import { CATEGORIES, coinsFor, DIFFICULTIES, STATUSES, TARIFF } from "../src/domain";

describe("domain constants (psychologist-AC1..AC3)", () => {
  test("8 categories in order", () => {
    expect(CATEGORIES.length).toBe(8);
    expect([...CATEGORIES]).toEqual(["body", "mind", "social", "creative", "adventure", "care", "learning", "treat"]);
  });
  test("statuses", () => {
    expect([...STATUSES]).toEqual(["open", "done", "partial", "let_go"]);
  });
  test("tariff", () => {
    expect(TARIFF).toEqual({ easy: 10, medium: 20, hard: 35, boss: 100 });
  });

  const expected: Record<string, Record<string, number>> = {
    easy: { open: 0, done: 10, partial: 5, let_go: 0 },
    medium: { open: 0, done: 20, partial: 10, let_go: 0 },
    hard: { open: 0, done: 35, partial: 20, let_go: 0 },
  };
  for (const d of DIFFICULTIES) {
    for (const s of STATUSES) {
      test(`coinsFor(${d}, ${s}) = ${expected[d]![s]}`, () => {
        expect(coinsFor(d, s)).toBe(expected[d]![s]!);
      });
    }
  }
  test("coinsFor is never negative", () => {
    const all = DIFFICULTIES.flatMap((d) => STATUSES.map((s) => coinsFor(d, s)));
    expect(all.length).toBe(12);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
  });
});
