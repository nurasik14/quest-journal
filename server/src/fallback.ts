/**
 * Pure, deterministic selection from the fallback pool (`quests.yaml`).
 * - Daily: motivation.md §1.4 slot table + §9.10, architecture.md §2.1 (psychologist-AC3/AC4, architect-AC9).
 * - Boss: seeded by week, type differs from last week's when the pool allows (psychologist-AC11).
 * No I/O here. The caller passes history and gets plain objects back.
 */
import { addDays } from "./clock";
import { ENERGY_SLOTS, RECENT_TITLE_DAYS, type Difficulty } from "./domain";
import type { PoolBoss, PoolQuest } from "./schemas";

export type Rng = () => number;

/** FNV-1a 32-bit hash of a string (stable seed). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. */
export function seededRng(seed: string | number): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** One past day: which titles it used (case-insensitive matching). */
export interface HistoryDay {
  date: string;
  titles: string[];
}

export interface SelectDailyInput {
  pool: readonly PoolQuest[];
  energy: number;
  /** Logical date being generated (also the default seed). */
  date: string;
  /** Previous days (any order). Days on/after `date` are ignored. */
  history: readonly HistoryDay[];
  rng?: Rng;
}

export interface SelectedQuest {
  slot: number;
  pool: PoolQuest;
  difficulty: Difficulty;
}

export interface SelectDailyResult {
  quests: SelectedQuest[];
  /** Which relaxation level was needed (0 = all rules held). For tests and debugging. */
  relaxation: number;
}

const norm = (t: string) => t.trim().toLowerCase();
const isCostly = (q: PoolQuest) => q.cost !== undefined && q.cost !== "free";

function energySlots(energy: number): readonly Difficulty[] {
  const e = Math.min(5, Math.max(1, Math.round(energy))) as 1 | 2 | 3 | 4 | 5;
  return ENERGY_SLOTS[e];
}

/** Map of normalized title → most recent date it was used (strictly before `date`). */
function lastUsed(history: readonly HistoryDay[], date: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of history) {
    if (d.date >= date) continue;
    for (const t of d.titles) {
      const k = norm(t);
      const prev = m.get(k);
      if (!prev || d.date > prev) m.set(k, d.date);
    }
  }
  return m;
}

interface Rules {
  /** Exclude titles used within the last N days (0 = no recency rule). */
  windowDays: number;
  /** Honour each quest's own cooldown_days. */
  cooldown: boolean;
  care: boolean;
  money: boolean;
  distinct: boolean;
}

/**
 * Relaxation ladder: 14-day window → per-quest cooldown only → no recency → drop the care rule →
 * drop the money rule → drop distinct categories. Difficulty is never relaxed.
 */
const LADDER: Rules[] = [
  { windowDays: RECENT_TITLE_DAYS, cooldown: true, care: true, money: true, distinct: true },
  { windowDays: 0, cooldown: true, care: true, money: true, distinct: true },
  { windowDays: 0, cooldown: false, care: true, money: true, distinct: true },
  { windowDays: 0, cooldown: false, care: false, money: true, distinct: true },
  { windowDays: 0, cooldown: false, care: false, money: false, distinct: true },
  { windowDays: 0, cooldown: false, care: false, money: false, distinct: false },
];

export function selectDaily(input: SelectDailyInput): SelectDailyResult {
  const { pool, energy, date } = input;
  const rng = input.rng ?? seededRng(`${date}:${energy}`);
  const slots = energySlots(energy);
  const used = lastUsed(input.history, date);
  // One shuffle per call, so the result is deterministic and every relaxation level sees the same order.
  const order = shuffled(pool, rng);

  for (let level = 0; level < LADDER.length; level++) {
    const r = LADDER[level]!;
    const eligible = (q: PoolQuest): boolean => {
      const last = used.get(norm(q.title));
      if (last !== undefined) {
        if (r.windowDays > 0 && last > addDays(date, -r.windowDays - 1)) return false;
        if (r.cooldown && q.cooldown_days > 0 && last > addDays(date, -q.cooldown_days - 1)) return false;
      }
      if (r.money && energy <= 1 && isCostly(q)) return false;
      return true;
    };
    const perSlot = slots.map((d) => order.filter((q) => q.difficulty === d && eligible(q)));
    const picked = search(perSlot, r, energy);
    if (picked) {
      return {
        quests: picked.map((q, i) => ({ slot: i + 1, pool: q, difficulty: slots[i]! })),
        relaxation: level,
      };
    }
  }
  // Even with every rule relaxed some slot has no quest of that difficulty: fill what we can.
  const quests: SelectedQuest[] = [];
  const taken = new Set<PoolQuest>();
  slots.forEach((d, i) => {
    const q = order.find((x) => x.difficulty === d && !taken.has(x));
    if (q) {
      taken.add(q);
      quests.push({ slot: i + 1, pool: q, difficulty: d });
    }
  });
  return { quests, relaxation: LADDER.length };
}

/** Depth-first search over per-slot candidate lists for the first assignment satisfying the rules. */
function search(perSlot: PoolQuest[][], r: Rules, energy: number): PoolQuest[] | null {
  const chosen: PoolQuest[] = [];
  const ok = (): boolean => {
    if (r.care) {
      const cats = chosen.map((q) => q.category);
      if (energy <= 1 && !cats.includes("care")) return false;
      if (energy === 2 && !cats.some((c) => c === "care" || c === "treat")) return false;
    }
    return true;
  };
  let steps = 0;
  const go = (i: number): boolean => {
    if (++steps > 200_000) return false; // hard bound; the pool is small
    if (i === perSlot.length) return ok();
    for (const q of perSlot[i]!) {
      if (chosen.includes(q)) continue;
      if (r.distinct && chosen.some((c) => c.category === q.category)) continue;
      if (r.money && isCostly(q) && chosen.some(isCostly)) continue;
      chosen.push(q);
      if (go(i + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  return go(0) ? chosen.slice() : null;
}

export interface SelectBossInput {
  pool: readonly PoolBoss[];
  week: string;
  /** Last week's boss, if any (its type and title are avoided). */
  previous?: { type?: string; title?: string } | null;
  rng?: Rng;
}

export function selectBoss(input: SelectBossInput): PoolBoss | null {
  const { pool, week, previous } = input;
  if (pool.length === 0) return null;
  const rng = input.rng ?? seededRng(`boss:${week}`);
  const order = shuffled(pool, rng);
  const prevTitle = previous?.title ? norm(previous.title) : null;
  const prevType = previous?.type;
  return (
    order.find((b) => (prevType === undefined || b.type !== prevType) && norm(b.title) !== prevTitle) ??
    order.find((b) => norm(b.title) !== prevTitle) ??
    order[0] ??
    null
  );
}

export interface SelectRerollInput {
  pool: readonly PoolQuest[];
  date: string;
  energy: number;
  difficulty: Difficulty;
  rejected: { title: string; category: string; minutes?: number | undefined };
  reason?: string | null;
  /** The quests that stay (their categories and titles are avoided). */
  others: readonly { title: string; category: string; cost?: string | undefined }[];
  history: readonly HistoryDay[];
  /** Titles already used today (including earlier rejections). */
  todayTitles?: readonly string[];
  rng?: Rng;
}

/** Minutes a span-of-day word implies (H1 fix LOW-1): long enough that a "too long" swap never returns it. */
const SPAN_WORDS: readonly [RegExp, number][] = [
  [/\b(?:all|full|whole)[\s-]day\b|\bday[\s-]trip\b/i, 480],
  [/\bhalf[\s-](?:a[\s-])?day\b/i, 240],
  [/\bafternoon\b|\bevening\b/i, 180],
];

/**
 * Minutes a free-text title/why names, or null when it names none. Every signal counts and the largest
 * wins: "an hour", "2 hours", "1.5 hrs", "2h", "30 min", "10+ minutes", "4 Pomodoros" (25/5 = 30 each),
 * "an afternoon"/"evening" (180), "half a day" (240), "all day"/"day trip" (480).
 */
export function mentionedMinutes(text: string): number | null {
  const found: number[] = [];
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*-?\s*(?:hours?|hrs?|h)\b/gi)) found.push(Math.round(Number(m[1]) * 60));
  if (/\bhours?\b/i.test(text)) found.push(60); // "an hour", "hours of": at least long enough to exclude
  for (const m of text.matchAll(/(\d+)\+?\s*-?\s*(?:minutes?|mins?)\b/gi)) found.push(Number(m[1]));
  const pomo = [...text.matchAll(/(\d+)\s*pomodoros?\b/gi)].map((m) => Number(m[1]) * 30);
  if (pomo.length) found.push(...pomo);
  else if (/\bpomodoros?\b/i.test(text)) found.push(30);
  for (const [re, min] of SPAN_WORDS) if (re.test(text)) found.push(min);
  return found.length ? Math.max(...found) : null;
}

/**
 * Best estimate of how long a quest takes: the larger of its `minutes` field and what its title/why names
 * (a hand-entered `minutes: 15` on "Study for an hour" never makes it look short). Null when neither is known.
 */
export function estimateMinutes(q: { title: string; why?: string | null | undefined; minutes?: number | null | undefined }): number | null {
  const named = mentionedMinutes(`${q.title} ${q.why ?? ""}`);
  const field = typeof q.minutes === "number" ? q.minutes : null;
  if (field === null) return named;
  return named === null ? field : Math.max(field, named);
}

/**
 * A "too long" reroll never returns something longer (backlog #124, H1 fix LOW-1/LOW-2). When both the
 * rejected quest's and the candidate's minutes are known, the candidate must be strictly shorter. When the
 * rejected quest's length is unknown, any candidate known to take ≥ 10 minutes (field or text) is excluded.
 * A candidate whose length is unknown (no field, no duration words) is allowed only against a known length.
 */
export function fitsTooLong(q: Pick<PoolQuest, "title" | "why" | "minutes">, rejectedMinutes: number | null | undefined): boolean {
  const est = estimateMinutes(q);
  if (est === null) return true;
  if (typeof rejectedMinutes === "number") return est < rejectedMinutes;
  return est < 10;
}

/**
 * Pool replacement for one slot (psychologist-AC14/16): same difficulty, a category different from the
 * rejected one and from the other two, not a recent title, and free when money is ruled out. Relaxation:
 * the 14-day window first, then the "differs from the rejected category" rule. Never another slot's
 * category, never the rejected title itself. Returns null when nothing fits.
 */
export function selectReroll(input: SelectRerollInput): PoolQuest | null {
  const rng = input.rng ?? seededRng(`reroll:${input.date}:${input.rejected.title}`);
  const order = shuffled(input.pool, rng);
  const used = lastUsed(input.history, input.date);
  const today = new Set([input.rejected.title, ...input.others.map((o) => o.title), ...(input.todayTitles ?? [])].map(norm));
  const otherCats = new Set(input.others.map((o) => o.category));
  const noMoney = input.energy <= 1 || input.reason === "costs_money" || input.others.some((o) => o.cost !== undefined && o.cost !== "free");
  const levels = [
    { window: true, rejectedCat: true },
    { window: false, rejectedCat: true },
    { window: false, rejectedCat: false },
  ];
  for (const lv of levels) {
    const hit = order.find((q) => {
      if (q.difficulty !== input.difficulty) return false;
      if (today.has(norm(q.title))) return false;
      if (otherCats.has(q.category)) return false;
      if (lv.rejectedCat && q.category === input.rejected.category) return false;
      if (noMoney && isCostly(q)) return false;
      if (input.reason === "too_long" && !fitsTooLong(q, input.rejected.minutes)) return false;
      if (lv.window) {
        const last = used.get(norm(q.title));
        if (last !== undefined && last > addDays(input.date, -RECENT_TITLE_DAYS - 1)) return false;
      }
      return true;
    });
    if (hit) return hit;
  }
  return null;
}
