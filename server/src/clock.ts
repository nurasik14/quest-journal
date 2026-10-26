/** Time seams: an injectable clock plus pure logical-date / ISO-week helpers. */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string | Date): Clock & { set(iso: string | Date): void } {
  let t = new Date(iso);
  if (Number.isNaN(t.getTime())) throw new Error(`fixedClock: invalid date ${String(iso)}`);
  return {
    now: () => new Date(t.getTime()),
    set(next) {
      t = new Date(next);
    },
  };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

/** True for `YYYY-MM-DD` strings that are real calendar dates. */
export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** True for `YYYY-Www` strings naming an existing ISO week. */
export function isValidWeek(s: string): boolean {
  const m = WEEK_RE.exec(s);
  if (!m) return false;
  const w = Number(m[2]);
  return w >= 1 && w <= isoWeeksInYear(Number(m[1]));
}

/** Throws a RangeError if `tz` isn't a valid IANA zone. */
export function assertValidTimeZone(tz: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone: tz });
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function wallParts(instant: Date, tz: string): WallParts {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, fmt);
  }
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 0,
    day: out.day ?? 0,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Local calendar date of an instant in `tz`. */
export function localDate(instant: Date, tz: string): string {
  const p = wallParts(instant, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * The logical day: the local calendar date in `tz`, minus one calendar day while the wall-clock hour is
 * before `rolloverHour`. Wall-clock based, so it's correct on DST-transition days (M1 BUG-1).
 */
export function logicalDate(now: Date, tz: string, rolloverHour: number): string {
  const p = wallParts(now, tz);
  const today = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour < rolloverHour ? addDays(today, -1) : today;
}

/** ISO 8601 timestamp with the zone's UTC offset, e.g. `2026-10-25T19:02:11+05:00`. */
export function isoWithOffset(instant: Date, tz: string): string {
  const p = wallParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMin = Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function isoWeeksInYear(year: number): number {
  // A year has 53 ISO weeks if Dec 28 falls in week 53.
  return isoWeekParts(Date.UTC(year, 11, 28)).week;
}

function isoWeekParts(utcMs: number): { year: number; week: number } {
  const d = new Date(utcMs);
  const dow = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dow); // Thursday of this week
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((d.getTime() - jan1) / 86_400_000 / 7) + 1;
  return { year, week };
}

/** ISO week id (`YYYY-Www`, ISO week-year) of a `YYYY-MM-DD` logical date. */
export function isoWeek(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m || !isValidDate(date)) throw new Error(`isoWeek: invalid date ${date}`);
  const { year, week } = isoWeekParts(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${pad(year, 4)}-W${pad(week)}`;
}

/** Add days to a `YYYY-MM-DD` date (calendar arithmetic, tz-free). */
export function addDays(date: string, n: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`addDays: invalid date ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function weekdayName(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`weekdayName: invalid date ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()]!;
}
