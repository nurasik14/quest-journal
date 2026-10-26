/**
 * Client-side day-rollover check. The server owns "today" (tz + rollover hour from /api/today); this mirrors
 * server/src/clock.ts#logicalDate so a page left OPEN and VISIBLE across the rollover (e.g. a phone propped on
 * the desk, a desktop tab) notices the new day without waiting for a visibilitychange that never comes.
 * Pure: no timers, no DOM; unit-tested in server/test/rollover-web.test.ts.
 */

/** How often a visible Today page re-checks the clock (cheap: no network unless the day changed). */
export const ROLLOVER_CHECK_MS = 60_000;

const fmtCache = new Map<string, Intl.DateTimeFormat>();

/** The logical date (YYYY-MM-DD) of `now` in `tz`, minus a day while the wall hour is before `rolloverHour`. */
export function clientLogicalDate(now: Date, tz: string, rolloverHour: number): string {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });
    fmtCache.set(tz, fmt);
  }
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(now)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  let d = new Date(Date.UTC(p.year ?? 0, (p.month ?? 1) - 1, p.day ?? 1));
  if ((p.hour ?? 0) % 24 < rolloverHour) d = new Date(d.getTime() - 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * The instant the logical day next turns over (the next local `rolloverHour`:00 in `tz`). Found by binary
 * search on clientLogicalDate, so DST days (23/25 h, skipped or repeated hours) need no offset maths.
 * Returns null for a bad tz. Exact to the millisecond.
 */
export function nextRolloverAt(now: Date, tz: string, rolloverHour: number): Date | null {
  let today: string;
  try {
    today = clientLogicalDate(now, tz, rolloverHour);
  } catch {
    return null;
  }
  let lo = now.getTime();
  let hi = lo + 27 * 3_600_000; // a logical day is at most 25 h long
  if (clientLogicalDate(new Date(hi), tz, rolloverHour) === today) return null;
  // Invariant: lo is still `today`, hi is already the next day. ~27 steps to millisecond precision.
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (clientLogicalDate(new Date(mid), tz, rolloverHour) === today) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

/** Second-precision remaining time as a clock: "03:12:05", "00:45:59", "00:00:01". Rounds up, never negative. */
export function formatUntil(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * True when the page shows a day other than the current logical day, i.e. it should refetch /api/today.
 * Fails safe: a bad tz never throws (it just reports "no change"; visibilitychange still covers that case).
 */
export function dayHasRolled(shown: { date: string; tz: string; rollover_hour: number } | null, now: Date): boolean {
  if (!shown) return false;
  try {
    return clientLogicalDate(now, shown.tz, shown.rollover_hour) !== shown.date;
  } catch {
    return false;
  }
}
