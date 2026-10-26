/**
 * The ledger (sprint M5, architecture.md §2.4): earnings are DERIVED from quest status in day/week files,
 * spending is STORED in purchases.yaml. Everything here is pure: no fs, no clock, no randomness
 * (architect-AC1). The service layer (shop.ts) gathers the inputs and every coin surface calls
 * `computeEconomy`, so the header, /api/economy, /api/shop and every mutation response always agree.
 *
 * Fail-safe asymmetry (architect plan "why M5 is an integrity sprint"): a broken EARNING file is skipped
 * (balance understated, safe); a broken SPENDING file makes the balance `null` (never read as zero).
 */
import { addDays, isoWeek } from "./clock";
import {
  bossCoinsFor,
  DEFAULT_STREAK_BONUS,
  FREEZE_TOKEN_CAP,
  MAX_QUEST_COINS,
  PACE_MIN_LOGGED_DAYS,
  PACE_WINDOW_DAYS,
  questEarnings,
  STREAK_RUN,
  type Difficulty,
  type Status,
} from "./domain";
import type { Economy, StreakEvent } from "./api-types";
import type { Warning } from "./errors";

export type { Economy, StreakEvent };

// ---------------------------------------------------------------- inputs (minimal shapes, easy to fixture)

export interface QuestLike {
  difficulty: Difficulty;
  status: Status;
  coins?: number | undefined;
}

export interface DayInput {
  date: string;
  quests: readonly QuestLike[];
  satisfaction: number | null;
  highlight?: string;
  notes?: string;
  gratitude?: string;
}

export interface BossLike {
  status: Status;
  coins?: number | undefined;
  checkpoints?: readonly { done: boolean }[] | undefined;
}

export interface WeekInput {
  week: string;
  boss: BossLike | null;
}

export interface PurchaseLike {
  id: string;
  item_id: string;
  price: number;
  date: string;
  voided_at: string | null;
}

export interface SpendInput {
  purchases: readonly PurchaseLike[];
  adjustments: readonly { amount: number }[];
}

/** A file the economy couldn't read. `kind` decides the fail-safe direction. */
export interface BrokenInput {
  file: string;
  code: string;
  message: string;
  /** For day files: the date it would cover (the streak walk treats it as neutral). */
  date?: string;
}

export interface EconomyInputs {
  days: readonly DayInput[];
  weeks: readonly WeekInput[];
  /** `null` = purchases.yaml is broken → balance null. A missing file is `{purchases:[],adjustments:[]}`. */
  spend: SpendInput | null;
  broken: readonly BrokenInput[];
  /** Logical today (YYYY-MM-DD). */
  today: string;
  streakBonus?: number;
}

// ---------------------------------------------------------------- outputs

export interface StreakResult {
  streak: number;
  longest_streak: number;
  freeze_tokens: number;
  streak_bonus_total: number;
  next_bonus_in_days: number;
  days_logged: number;
  events: StreakEvent[];
}

// ---------------------------------------------------------------- rules

/** Does a logical day count toward the streak? (sprint goal 5: done/partial OR rating OR any evening text) */
export function dayCounts(d: DayInput): boolean {
  if (d.quests.some((q) => q.status === "done" || q.status === "partial")) return true;
  if (d.satisfaction !== null && d.satisfaction !== undefined) return true;
  return [d.highlight, d.notes, d.gratitude].some((t) => typeof t === "string" && t.trim() !== "");
}

export function bossEarnings(b: BossLike | null): number {
  if (!b) return 0;
  const cps = b.checkpoints ?? [];
  return bossCoinsFor(b.status, cps.filter((c) => c.done).length, cps.length, b.coins ?? null);
}

/**
 * Chronological replay from the first counting day to `today` (architect-AC5 / psychologist-AC7–11).
 * `days`: the readable day files; `neutral`: dates whose file is broken (skipped: never counts, never breaks).
 */
export function streakWalk(
  days: readonly DayInput[],
  today: string,
  opts: { neutral?: Iterable<string>; bonus?: number } = {},
): StreakResult {
  const bonus = opts.bonus ?? DEFAULT_STREAK_BONUS;
  const neutral = new Set(opts.neutral ?? []);
  const counting = new Set(days.filter((d) => d.date <= today && dayCounts(d)).map((d) => d.date));
  const events: StreakEvent[] = [];
  let run = 0;
  let longest = 0;
  let tokens = 0;
  let bonusTotal = 0;
  let logged = 0;
  const first = [...counting].sort()[0];
  if (first !== undefined) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (neutral.has(d) && !counting.has(d)) continue; // a YAML typo never takes a streak away (P-AC11)
      if (counting.has(d)) {
        run++;
        logged++;
        longest = Math.max(longest, run);
        if (run % STREAK_RUN === 0) {
          bonusTotal += bonus;
          events.push({ date: d, type: "bonus", amount: bonus });
          if (tokens < FREEZE_TOKEN_CAP) {
            tokens++;
            events.push({ date: d, type: "token_earned" });
          }
        }
      } else if (d < today && run > 0) {
        // A past non-counting day: preserved herbs bridge the gap automatically, but only when they can bridge
        // ALL of it (backlog #236). A gap longer than the herbs held rests on its first day and spends nothing:
        // burning herbs on a gap that ends in a rest anyway would take them for no reason.
        if (tokens > 0 && gapAhead(d, today, counting, neutral) <= tokens) {
          tokens--;
          events.push({ date: d, type: "token_used" });
        } else {
          run = 0;
          events.push({ date: d, type: "rest" });
        }
      }
      // Today not counting yet: nothing happens (P-AC8).
    }
  }
  return {
    streak: run,
    longest_streak: longest,
    freeze_tokens: tokens,
    streak_bonus_total: bonusTotal,
    next_bonus_in_days: STREAK_RUN - (run % STREAK_RUN),
    days_logged: logged,
    events,
  };
}

/**
 * Remaining length of the gap starting at `from`: past (`< today`), non-counting days up to the next counting
 * day, with neutral (broken) days skipped and not counted. Today is never part of a gap: it can still count (P-AC8).
 */
export function gapAhead(from: string, today: string, counting: ReadonlySet<string>, neutral: ReadonlySet<string>): number {
  let n = 0;
  for (let d = from; d < today && !counting.has(d); d = addDays(d, 1)) if (!neutral.has(d)) n++;
  return n;
}

/** The one pure ledger function (architect-AC1). */
export function computeEconomy(input: EconomyInputs): Economy {
  const { today } = input;
  const thisWeek = isoWeek(today);
  const warnings: Warning[] = input.broken.map((b) => ({ file: b.file, code: b.code, message: b.message }));
  let earnedDaily = 0;
  let earnedToday = 0;
  let questsDone = 0;
  const readable: DayInput[] = [];

  for (const d of input.days) {
    if (d.date > today) {
      warnings.push({ file: `days/${d.date}.md`, code: "future_file", message: "Dated after today; it earns nothing yet." });
      continue;
    }
    readable.push(d);
    let dayEarned = 0;
    for (const q of d.quests) {
      if (typeof q.coins === "number" && q.coins > MAX_QUEST_COINS) {
        warnings.push({ file: `days/${d.date}.md`, code: "coins_clamped", message: `A quest's coins were capped at ${MAX_QUEST_COINS}.` });
      }
      dayEarned += questEarnings(q);
      if (q.status === "done" || q.status === "partial") questsDone++;
    }
    earnedDaily += dayEarned;
    if (d.date === today) earnedToday = dayEarned;
  }

  let earnedBoss = 0;
  for (const w of input.weeks) {
    if (w.week > thisWeek) {
      warnings.push({ file: `weeks/${w.week}.md`, code: "future_file", message: "Dated after this week; it earns nothing yet." });
      continue;
    }
    if (w.boss && typeof w.boss.coins === "number" && w.boss.coins > MAX_QUEST_COINS) {
      warnings.push({ file: `weeks/${w.week}.md`, code: "coins_clamped", message: `The weekly quest's coins were capped at ${MAX_QUEST_COINS}.` });
    }
    earnedBoss += bossEarnings(w.boss);
    if (w.boss?.status === "done") questsDone++;
  }

  const neutral = input.broken.map((b) => b.date).filter((d): d is string => typeof d === "string");
  const walk = streakWalk(readable, today, { neutral, bonus: input.streakBonus ?? DEFAULT_STREAK_BONUS });
  const earnedTotal = earnedDaily + earnedBoss + walk.streak_bonus_total;

  let spent: number | null = null;
  let adjustments: number | null = null;
  if (input.spend) {
    spent = input.spend.purchases.filter((p) => !p.voided_at).reduce((s, p) => s + Math.max(0, p.price), 0);
    adjustments = input.spend.adjustments.reduce((s, a) => s + (Number.isFinite(a.amount) ? Math.trunc(a.amount) : 0), 0);
  }

  const month = today.slice(0, 7);
  const countingDates = new Set(readable.filter(dayCounts).map((d) => d.date));
  const daysLoggedMonth = [...countingDates].filter((d) => d.startsWith(month)).length;
  const yesterday = addDays(today, -1);
  const bonusToday = walk.events.filter((e) => e.date === today && e.type === "bonus").reduce((s, e) => s + (e.amount ?? 0), 0);

  // Pace: daily earnings + bonuses over the last 14 logical days, zero days included (never optimistic).
  const from = addDays(today, -(PACE_WINDOW_DAYS - 1));
  let windowSum = 0;
  for (const d of readable) if (d.date >= from) windowSum += d.quests.reduce((s, q) => s + questEarnings(q), 0);
  for (const e of walk.events) if (e.type === "bonus" && e.date >= from) windowSum += e.amount ?? 0;

  return {
    balance: spent === null || adjustments === null ? null : earnedTotal - spent + adjustments,
    earned_total: earnedTotal,
    spent_total: spent,
    adjustments_total: adjustments,
    earned_today: earnedToday,
    streak: walk.streak,
    longest_streak: walk.longest_streak,
    freeze_tokens: walk.freeze_tokens,
    streak_bonus_total: walk.streak_bonus_total,
    next_bonus_in_days: walk.next_bonus_in_days,
    days_logged: walk.days_logged,
    days_logged_month: daysLoggedMonth,
    quests_done: questsDone,
    bonus_today: bonusToday,
    events_recent: walk.events.filter((e) => e.date >= yesterday),
    pace_per_day: Math.round((windowSum / PACE_WINDOW_DAYS) * 100) / 100,
    warnings,
  };
}

// ---------------------------------------------------------------- shop helpers (pure)

/** First logical date the item can be bought again, or null when it's available (architect-AC9). */
export function availableOn(purchases: readonly PurchaseLike[], itemId: string, cooldownDays: number, today: string): string | null {
  if (cooldownDays <= 0) return null;
  const last = purchases
    .filter((p) => p.item_id === itemId && !p.voided_at)
    .map((p) => p.date)
    .sort()
    .at(-1);
  if (last === undefined) return null;
  const next = addDays(last, cooldownDays);
  return next > today ? next : null;
}

/**
 * "About N days at your recent pace" (psychologist-AC17): only with ≥7 logged days and a positive average;
 * otherwise null (the UI then shows no hint at all).
 */
export function paceEstimate(need: number, econ: Pick<Economy, "pace_per_day" | "days_logged">): number | null {
  if (need <= 0) return null;
  if (econ.days_logged < PACE_MIN_LOGGED_DAYS || econ.pace_per_day <= 0) return null;
  return Math.ceil(need / econ.pace_per_day);
}
