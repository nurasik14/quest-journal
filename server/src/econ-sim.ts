/**
 * Economy simulation (psychologist B8, sprint M5 SHOULD): N weeks of synthetic days at the motivation.md §3.1
 * completion rates, run through the REAL pure ledger (`computeEconomy`). Deterministic (low-discrepancy
 * sequence, no RNG), so the numbers can be asserted in a test. `bun run econ:sim` prints the table.
 */
import { addDays, isoWeek } from "./clock";
import { ENERGY_SLOTS, TARIFF, type Difficulty } from "./domain";
import { computeEconomy, type DayInput, type WeekInput } from "./economy";

export interface SimProfile {
  name: string;
  energy: 1 | 2 | 3 | 4 | 5;
  /** Share of daily quests marked done (the rest are let go). */
  rate: number;
  /** Boss: share of weeks sealed; other weeks tick this many checkpoints. */
  bossDone: number;
  bossTicks: number;
}

export const PROFILES: readonly SimProfile[] = [
  { name: "low", energy: 2, rate: 0.5, bossDone: 0, bossTicks: 2 },
  { name: "typical", energy: 3, rate: 0.7, bossDone: 0.6, bossTicks: 2 },
  { name: "strong", energy: 4, rate: 0.85, bossDone: 1, bossTicks: 4 },
];

const PHI = 0.6180339887498949;

export interface SimResult {
  profile: string;
  weeks: number;
  earned: number;
  perWeek: number;
  /** Weeks until 350 taels are saved with 2 treats (50) + 1 café meal (150) bought every week. */
  weeksToManga: number | null;
}

export function simulate(p: SimProfile, weeks = 4, start = "2026-11-02"): SimResult {
  const days: DayInput[] = [];
  const weekInputs: WeekInput[] = [];
  const slots: readonly Difficulty[] = ENERGY_SLOTS[p.energy];
  let k = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(start, i);
    days.push({
      date,
      satisfaction: 6,
      quests: slots.map((difficulty) => ({ difficulty, status: (k++ * PHI) % 1 < p.rate ? ("done" as const) : ("let_go" as const) })),
    });
  }
  for (let w = 0; w < weeks; w++) {
    const sealed = (w * PHI + 0.3) % 1 < p.bossDone;
    weekInputs.push({
      week: isoWeek(addDays(start, w * 7)),
      boss: { status: sealed ? "done" : "open", coins: TARIFF.boss, checkpoints: [0, 1, 2, 3].map((c) => ({ done: c < p.bossTicks })) },
    });
  }
  const today = addDays(start, weeks * 7 - 1);
  const e = computeEconomy({ days, weeks: weekInputs, spend: { purchases: [], adjustments: [] }, broken: [], today });
  const perWeek = e.earned_total / weeks;
  const surplus = perWeek - (2 * 50 + 150);
  return {
    profile: p.name,
    weeks,
    earned: e.earned_total,
    perWeek: Math.round(perWeek),
    weeksToManga: surplus > 0 ? Math.round((350 / surplus) * 10) / 10 : null,
  };
}

if (import.meta.main) {
  const weeks = Number(process.argv[2] ?? 4);
  console.log(`profile   weeks  earned  per-week  weeks-to-manga (2 treats + 1 café / week)`);
  for (const p of PROFILES) {
    const r = simulate(p, weeks);
    console.log(
      `${r.profile.padEnd(9)} ${String(r.weeks).padStart(5)}  ${String(r.earned).padStart(6)}  ${String(r.perWeek).padStart(8)}  ${r.weeksToManga ?? "never (spending ≥ income)"}`,
    );
  }
}
