/** Pure client ledger rules (testable under `bun test`; the rune store lives in economy.svelte.ts). */
import type { Economy } from '../../../server/src/api-types';
import { COPY } from './copy';
import { shiftDate, weekdayOf } from './questView';

export interface BonusMemory {
  seeded: boolean;
  seen: Set<string>;
}

/**
 * True exactly once per bonus date, at the moment a streak bonus lands while the app is open (designer-AC8,
 * psychologist-AC21). The first economy of a session only seeds memory, so a reload never replays the toast.
 */
export function bonusMoment(mem: BonusMemory, prev: Economy | null, next: Economy, today: string): boolean {
  if (!mem.seeded) {
    mem.seeded = true;
    if (next.bonus_today > 0) mem.seen.add(today);
    return false;
  }
  if (next.bonus_today > 0 && !mem.seen.has(today) && (prev?.bonus_today ?? 0) === 0) {
    mem.seen.add(today);
    return true;
  }
  return false;
}

/** Display a balance: U+2212 for negatives, no colour, no copy (designer-AC5, architect-AC12). */
export function fmtTaels(n: number): string {
  return (n < 0 ? '−' : '') + new Intl.NumberFormat('en').format(Math.abs(n));
}

/**
 * The buy sheet's "Balance after" line, shown only when the purchase can actually happen (test report M5 LOW-3):
 * never a negative preview that reads like a debt. null = hide the line (the sheet explains instead).
 */
export function balanceAfterText(balance: number | null, price: number): string | null {
  if (balance === null || balance < price) return null;
  return COPY.balanceAfter(fmtTaels(balance - price));
}

/** The minimal day shape the counting rule needs (DayJson fits). */
export interface CountableDay {
  quests: readonly { status: string }[];
  satisfaction: number | null;
  highlight?: string;
  notes?: string;
  gratitude?: string;
}

/** The server's `dayCounts` (economy.ts), mirrored: a quest done/partial, a rating, or any evening text. */
export function todayCounts(d: CountableDay | null | undefined): boolean {
  if (!d) return false;
  if (d.quests.some((q) => q.status === 'done' || q.status === 'partial')) return true;
  if (d.satisfaction !== null && d.satisfaction !== undefined) return true;
  return [d.highlight, d.notes, d.gratitude].some((t) => typeof t === 'string' && t.trim() !== '');
}

export type InfoKind = 'welcome' | 'herb' | 'rest';

export interface InfoLine {
  kind: InfoKind;
  /** The value Dismiss stores in `qj.infoDismissed`. */
  key: string;
  text: string;
}

/**
 * Today's one quiet info line (designer-AC9, psychologist-AC23). It belongs to the return moment (H1 #237): it is
 * gone as soon as today counts, which comes from the day data, so it stays gone after a reload. Dismiss stores
 * `"<date>:<kind>"` (H1 #228), so the same line never comes back the same day and the next day starts fresh.
 * Welcome back wins and hides streak talk.
 */
export function infoLineFor(input: {
  date: string;
  welcomeBack: boolean;
  day: CountableDay | null | undefined;
  econ: Pick<Economy, 'events_recent' | 'days_logged_month'> | null;
  dismissed: string | null;
}): InfoLine | null {
  const { date, econ } = input;
  if (!econ || todayCounts(input.day)) return null;
  const yesterday = shiftDate(date, -1);
  let line: InfoLine | null = null;
  if (input.welcomeBack) line = { kind: 'welcome', key: `${date}:welcome`, text: COPY.welcomeBack };
  else {
    const used = econ.events_recent.find((e) => e.type === 'token_used' && e.date === yesterday);
    const rest = econ.events_recent.find((e) => e.type === 'rest' && e.date === yesterday);
    if (used) line = { kind: 'herb', key: `${date}:herb`, text: COPY.tokenUsed(weekdayOf(used.date)) };
    else if (rest) line = { kind: 'rest', key: `${date}:rest`, text: COPY.streakRests(econ.days_logged_month) };
  }
  if (line && input.dismissed === line.key) return null;
  return line;
}

/** H1 #227: the evening save's one toast. A bonus that lands on that save is told in the same sentence. */
export function sealedToast(bonusLanded: boolean, bonusToday: number): string {
  return bonusLanded && bonusToday > 0 ? COPY.sealedWithBonus(bonusToday) : COPY.sealed;
}

/**
 * H1 #225: what the Market sheet offers. `buy` only when the purchase can actually happen right now; otherwise the
 * sheet shows why (the sunk note) and offers "Save toward this" as its primary action, never a Buy that can only 409.
 * An unknown balance (broken purchases file) never offers Buy either.
 */
export function sheetMode(balance: number | null, price: number, availableOn: string | null, today: string): 'buy' | 'save' {
  if (availableOn !== null && availableOn > today) return 'save';
  if (balance === null || balance < price) return 'save';
  return 'buy';
}
