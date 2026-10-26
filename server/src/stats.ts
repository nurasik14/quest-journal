/**
 * The garden's numbers (sprint M6 goals 1–7). Pure: no fs, no clock. The service layer (shop.ts `stats()`) gathers
 * the SAME inputs as the ledger and passes the ledger's own result in, so the streak, days logged and quests done
 * shown on the garden can never disagree with Today's (architect-AC2, psychologist-AC4: one streak truth).
 *
 * Honesty rules (psychologist-AC1/AC5/AC6): a missing, unrated or broken day never gets a satisfaction value and
 * is never counted as 0; a category average needs at least STATS_MIN_RATED rated days; let-go counts are reported
 * (as `let_go`) but the UI never renders them; the order is the fixed CATEGORIES order, never "best first".
 */
import { addDays } from "./clock";
import { CARE_PATTERN, CATEGORIES, STATS_MIN_RATED, type Category } from "./domain";
import { dayCounts, type BrokenInput, type DayInput, type Economy } from "./economy";
import type { Warning } from "./errors";

/** A day as the garden sees it: the ledger's DayInput plus the bits only the garden shows. */
export interface StatsDay extends DayInput {
  quests: readonly { title?: string; category?: string; status: DayInput["quests"][number]["status"]; difficulty: DayInput["quests"][number]["difficulty"] }[];
  energy?: number | null;
  private?: boolean;
}

/**
 * How a garden plot renders (designer-AC4):
 * - `rated`: number + fill
 * - `unrated`: logged (counts) but no rating
 * - `pending`: TODAY, not rated yet (stays dashed even with quests done, psychologist-AC3)
 * - `gap`: inside the logged range with nothing written ("not written", never "missed")
 * - `none`: before the first ever entry, or after today: no plot at all
 * - `broken`: the file can't be read (hatch, "can't be read"; neutral, never a bad day)
 */
export type PlotState = "rated" | "unrated" | "pending" | "gap" | "none" | "broken";

export interface HeatmapDay {
  date: string;
  satisfaction: number | null;
  rated: boolean;
  /** The ledger's counting-day rule (dayCounts): the same predicate as the streak. */
  counted: boolean;
  broken: boolean;
  private: boolean;
  state: PlotState;
  /** done + partial daily quests. */
  quests_done: number;
  quests_total: number;
}

export interface CategoryStat {
  category: Category;
  done: number;
  partial: number;
  /** Reported for completeness and the next sprint's analysis. NEVER rendered (psychologist-AC6). */
  let_go: number;
  /** Days with ≥1 done/partial quest of this category. */
  n: number;
  /** …of those, the days with a rating. */
  n_rated: number;
  /** Mean rating over the `n_rated` days; null below STATS_MIN_RATED (too few days to say). */
  avg_satisfaction: number | null;
  /** Mean check-in energy over the `n` days that have one; null below STATS_MIN_RATED (psychologist-AC7). */
  avg_energy: number | null;
}

export interface MonthAgo {
  date: string;
  satisfaction: number | null;
  /** ≤ 200 characters. Notes and gratitude are never included (architect-AC4, psychologist-AC10). */
  highlight: string;
  quests: { title: string; status: string }[];
}

export interface Stats {
  today: string;
  range: { from: string; to: string };
  /** Earliest date with any file (readable or broken), or null. */
  first_entry: string | null;
  heatmap: HeatmapDay[];
  by_category: CategoryStat[];
  streak: number;
  longest_streak: number;
  days_logged: number;
  quests_done: number;
  min_rated: number;
  this_day_last_month: MonthAgo | null;
  warnings: Warning[];
}

export interface StatsInput {
  days: readonly StatsDay[];
  broken: readonly BrokenInput[];
  today: string;
  from: string;
  to: string;
  /** The ledger's result over the same inputs: the ONE streak truth. */
  economy: Pick<Economy, "streak" | "longest_streak" | "days_logged" | "quests_done">;
}

export const HIGHLIGHT_PREVIEW_CHARS = 200;

const round1 = (x: number) => Math.round(x * 10) / 10;

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based: day 0 of the next month
}

/** Same day-of-month one calendar month back, clamped to that month's last day (Mar 31 → Feb 28/29). */
export function monthBack(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const pd = Math.min(d, daysInMonth(py, pm));
  return `${py}-${String(pm).padStart(2, "0")}-${String(pd).padStart(2, "0")}`;
}

function truncate(s: string, n: number): string {
  const cps = [...s];
  return cps.length <= n ? s : `${cps.slice(0, n - 1).join("").trimEnd()}…`;
}

/** Resurfacing with care (psychologist-AC9/AC10): skipped when empty or when the page holds care language. */
export function monthAgoCard(days: readonly StatsDay[], brokenDates: ReadonlySet<string>, today: string): MonthAgo | null {
  const date = monthBack(today);
  if (brokenDates.has(date)) return null;
  const d = days.find((x) => x.date === date);
  if (!d) return null;
  const highlight = (d.highlight ?? "").trim();
  const counting = d.quests.filter((q) => q.status === "done" || q.status === "partial");
  if (d.satisfaction === null && highlight === "" && counting.length === 0) return null;
  if (CARE_PATTERN.test(`${d.highlight ?? ""}\n${d.notes ?? ""}\n${d.gratitude ?? ""}`)) return null;
  return {
    date,
    satisfaction: d.satisfaction,
    highlight: truncate(highlight, HIGHLIGHT_PREVIEW_CHARS),
    // Count-up only (backlog #266): the unprompted card never lists let-go or open quests.
    quests: counting.map((q) => ({ title: q.title ?? "", status: q.status })).filter((q) => q.title !== ""),
  };
}

export function categoryStats(days: readonly StatsDay[], minRated: number = STATS_MIN_RATED): CategoryStat[] {
  const acc = new Map<Category, { done: number; partial: number; let_go: number; n: number; ratings: number[]; energies: number[] }>();
  for (const day of days) {
    const touched = new Set<Category>();
    for (const q of day.quests) {
      const c = q.category as Category | undefined;
      if (!c || !(CATEGORIES as readonly string[]).includes(c)) continue;
      let a = acc.get(c);
      if (!a) acc.set(c, (a = { done: 0, partial: 0, let_go: 0, n: 0, ratings: [], energies: [] }));
      if (q.status === "done") a.done++;
      else if (q.status === "partial") a.partial++;
      else if (q.status === "let_go") a.let_go++;
      if (q.status === "done" || q.status === "partial") touched.add(c);
    }
    for (const c of touched) {
      const a = acc.get(c)!;
      a.n++;
      if (typeof day.satisfaction === "number") a.ratings.push(day.satisfaction);
      if (typeof day.energy === "number") a.energies.push(day.energy);
    }
  }
  const mean = (xs: number[]) => round1(xs.reduce((s, x) => s + x, 0) / xs.length);
  const out: CategoryStat[] = [];
  for (const c of CATEGORIES) {
    const a = acc.get(c);
    if (!a) continue;
    out.push({
      category: c,
      done: a.done,
      partial: a.partial,
      let_go: a.let_go,
      n: a.n,
      n_rated: a.ratings.length,
      avg_satisfaction: a.ratings.length >= minRated ? mean(a.ratings) : null,
      avg_energy: a.ratings.length >= minRated && a.energies.length > 0 ? mean(a.energies) : null,
    });
  }
  return out;
}

export function computeStats(input: StatsInput): Stats {
  const { today, from, to } = input;
  const brokenDates = new Set(input.broken.map((b) => b.date).filter((d): d is string => typeof d === "string"));
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  const allDates = [...byDate.keys(), ...brokenDates].sort();
  const first = allDates[0] ?? null;

  const heatmap: HeatmapDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = byDate.get(d);
    const broken = !day && brokenDates.has(d);
    const satisfaction = day && typeof day.satisfaction === "number" ? day.satisfaction : null;
    const counted = day ? dayCounts(day) : false;
    let state: PlotState;
    if (d > today || first === null || d < first) state = "none";
    else if (broken) state = "broken";
    else if (satisfaction !== null) state = "rated";
    else if (d === today) state = "pending";
    else if (counted) state = "unrated";
    else state = "gap";
    heatmap.push({
      date: d,
      satisfaction,
      rated: satisfaction !== null,
      counted,
      broken,
      private: day?.private === true,
      state,
      quests_done: day ? day.quests.filter((q) => q.status === "done" || q.status === "partial").length : 0,
      quests_total: day ? day.quests.length : 0,
    });
  }

  const inRange = input.days.filter((d) => d.date >= from && d.date <= to && d.date <= today);
  const warnings: Warning[] = input.broken.map((b) => ({ file: b.file, code: b.code, message: b.message }));

  return {
    today,
    range: { from, to },
    first_entry: first,
    heatmap,
    by_category: categoryStats(inRange),
    streak: input.economy.streak,
    longest_streak: input.economy.longest_streak,
    days_logged: input.economy.days_logged,
    quests_done: input.economy.quests_done,
    min_rated: STATS_MIN_RATED,
    this_day_last_month: monthAgoCard(input.days, brokenDates, today),
    warnings,
  };
}

/** Max span of one /api/stats request, in days (inclusive). */
export const STATS_MAX_SPAN = 366;
export const STATS_DEFAULT_SPAN = 365;
