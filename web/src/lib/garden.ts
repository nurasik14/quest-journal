/**
 * Pure helpers for the garden (Archive, sprint M6). No DOM, no fetch: unit-tested from server/test/m6-web.test.ts.
 * The page never recounts streaks or "logged" days: those come from the server (one streak truth).
 */
import type { HeatmapDay } from '../../../server/src/api-types';
import { COPY } from './copy';

export type GardenRange = '4w' | '3m';
export const RANGE_WEEKS: Record<GardenRange, number> = { '4w': 4, '3m': 13 };

const DAY_MS = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  return fmt(parse(date) + n * DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function mondayIndex(date: string): number {
  return (new Date(parse(date)).getUTCDay() + 6) % 7;
}

export function weekStart(date: string): string {
  return addDays(date, -mondayIndex(date));
}

/** The date window a range asks the server for: whole Mon–Sun weeks, ending today. */
export function rangeWindow(today: string, range: GardenRange): { from: string; to: string } {
  return { from: addDays(weekStart(today), -7 * (RANGE_WEEKS[range] - 1)), to: today };
}

/**
 * Garden level 1–5 for colour only (1–2→1 … 9–10→5). A hand-edited value outside 1–10 or a non-integer is
 * rounded, then clamped (designer-AC4, PROVISIONAL); the cell still prints the raw value.
 */
export function gardenLevel(s: number): 1 | 2 | 3 | 4 | 5 {
  const r = Math.min(10, Math.max(1, Math.round(s)));
  return Math.ceil(r / 2) as 1 | 2 | 3 | 4 | 5;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sat 25 Oct" */
export function shortDate(date: string): string {
  const d = new Date(parse(date));
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "25 Sep" */
export function dayMonth(date: string): string {
  const d = new Date(parse(date));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export interface GardenCell {
  date: string;
  /** null = no plot at all (before the first entry, or after today). */
  day: HeatmapDay | null;
}

export interface GardenRow {
  weekStart: string;
  /** Month label, only on the row holding the 1st of a month (or the oldest row). */
  label: string | null;
  cells: GardenCell[];
}

/** Weeks as rows, newest first, Mon→Sun columns (designer-AC3). */
export function buildRows(heatmap: readonly HeatmapDay[], today: string, range: GardenRange): GardenRow[] {
  const byDate = new Map(heatmap.map((h) => [h.date, h]));
  const weeks = RANGE_WEEKS[range];
  const newest = weekStart(today);
  const rows: GardenRow[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(newest, -7 * w);
    const cells: GardenCell[] = [];
    let label: string | null = null;
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const h = byDate.get(date) ?? null;
      cells.push({ date, day: h && h.state !== 'none' && date <= today ? h : null });
      // Only a month that has actually started gets a label (a future 1st in this week doesn't count).
      if (date.endsWith('-01') && date <= today) label = MONTHS[Number(date.slice(5, 7)) - 1]!;
    }
    if (w === weeks - 1 && label === null) label = MONTHS[Number(start.slice(5, 7)) - 1]!;
    rows.push({ weekStart: start, label, cells });
  }
  return rows;
}

/** Categories worth a row: at least one done/partial quest. A let-go-only category would be a let-go tally. */
export function shownCategories<T extends { done: number; partial: number }>(cats: readonly T[]): T[] {
  return cats.filter((c) => c.done + c.partial > 0);
}

/** Screen-reader label for one plot (designer-AC5). Never "missed", never "0". */
export function plotLabel(h: HeatmapDay): string {
  const when = shortDate(h.date);
  switch (h.state) {
    case 'rated':
      return COPY.plotLabel(when, COPY.plotRated(h.satisfaction ?? 0, h.quests_done, h.quests_total));
    case 'unrated':
      return COPY.plotLabel(when, COPY.gardenNoRating);
    case 'pending':
      return COPY.plotLabel(when, COPY.gardenNotYet);
    case 'broken':
      return COPY.plotLabel(when, COPY.gardenBroken);
    default:
      return COPY.plotLabel(when, COPY.gardenNoEntry);
  }
}

/** Days within this many logical days of today get a "Write in the ledger" link; older pages are read-only. */
export const WRITE_WINDOW_DAYS = 2;

export function canWrite(date: string, today: string): boolean {
  return date <= today && date >= addDays(today, -WRITE_WINDOW_DAYS);
}

/** `?date=YYYY-MM-DD` deep link (evidence chips on Notes). */
export function dateParam(search: string): string | null {
  const v = new URLSearchParams(search).get('date');
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parse(v)) ? v : null;
}

/** One bar per day of the window up to today: what the page noted as spent (0 = nothing noted). */
export function spendBars(heatmap: readonly HeatmapDay[], today: string): { date: string; amount: number }[] {
  return heatmap.filter((h) => h.date <= today).map((h) => ({ date: h.date, amount: h.spent ?? 0 }));
}
