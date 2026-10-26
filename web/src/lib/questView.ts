/** Map API quest shapes to the theme's `QuestView` (checkpoint `text` → `label`). */
import type { BossJson, QuestJson } from '../../../server/src/api-types';
import type { QuestView } from './theme/types';

export function toQuestView(q: QuestJson | BossJson): QuestView {
  const view: QuestView = {
    id: q.id,
    title: q.title,
    why: q.why,
    category: q.category,
    difficulty: q.difficulty,
    coins: coinsShown(q),
    status: q.status,
    feedback: q.feedback ?? null,
    source: q.source
  };
  if ('checkpoints' in q && Array.isArray(q.checkpoints)) {
    view.checkpoints = q.checkpoints.map((c) => ({ label: c.text, done: c.done === true }));
  }
  return view;
}

/**
 * The card's chip (designer-AC6, psychologist-AC20): what it EARNED once settled (partial tier, boss
 * `bossCoinsFor`), otherwise the snapshot it can earn. Let-go cards hide the chip (`showCoins=false`).
 */
export function coinsShown(q: QuestJson | BossJson): number {
  const earned = 'earned' in q && typeof q.earned === 'number' ? q.earned : null;
  if (earned !== null && (q.status === 'done' || q.status === 'partial' || earned > 0)) return earned;
  return typeof q.coins === 'number' ? q.coins : q.difficulty === 'boss' ? 100 : 0;
}

/** Monday/Tuesday: boss above the dailies (to introduce it); from Wednesday below (designer §1, PROVISIONAL). */
export function bossFirst(weekday: string): boolean {
  // Monday only (H1 #151): the boss card is ~600 px at 390, so a second boss-first day opens with no dailies in view.
  return weekday === 'Monday';
}

/** Gratitude prompt days (motivation §5.1, PROVISIONAL: Wednesday and Sunday). */
export function gratitudeDay(weekday: string): boolean {
  return weekday === 'Wednesday' || weekday === 'Sunday';
}

/** Weekday name for a YYYY-MM-DD date (pure calendar math, no clock). */
export function weekdayOf(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] ?? '';
}

/** Calendar arithmetic on YYYY-MM-DD (never the device clock). */
export function shiftDate(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function prettyDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${weekdayOf(date)}, ${Number(m[3])} ${months[Number(m[2]) - 1] ?? ''}`;
}
