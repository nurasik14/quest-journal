/**
 * Pure helpers for the Evening ledger form (M2 BUG-1). Kept free of Svelte so `bun test` covers them.
 *
 * - A save sends only the fields the user changed since the page was loaded, so a field they never
 *   touched can't overwrite a newer hand edit of that field.
 * - After a 412, the newer on-disk version becomes the new baseline: untouched fields adopt it,
 *   fields the user edited keep the user's text (and the panel shows the on-disk version next to them).
 */
import type { EveningBody, SpendCategory, SpentJson } from '../../../server/src/api-types';

/** Kinds of spending, in picker order. Mirrors server/src/domain.ts SPEND_CATEGORIES (type-only import rule). */
export const SPEND_CATEGORIES = ['entertainment', 'grocery', 'cafe', 'electronics', 'subscription', 'other'] as const satisfies readonly SpendCategory[];

/** A stored value as a known category: missing or unknown = 'other' (same rule as the server's spendCategoryOf). */
export function spendCategoryOf(v: unknown): SpendCategory {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (SPEND_CATEGORIES as readonly string[]).includes(s) ? (s as SpendCategory) : 'other';
}

/** One money entry as the form holds it (the note is '' when there is none). */
export interface SpentEntry {
  amount: number;
  note: string;
  category: SpendCategory;
}

export interface EveningForm {
  satisfaction: number | null;
  mood: string[];
  highlight: string;
  notes: string;
  gratitude: string;
  spent: SpentEntry[];
}

export const FORM_KEYS = ['satisfaction', 'mood', 'highlight', 'notes', 'gratitude', 'spent'] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export const emptyForm = (): EveningForm => ({ satisfaction: null, mood: [], highlight: '', notes: '', gratitude: '', spent: [] });

/** The page's `spent:` list as form rows (a hand-written `- 38` arrives as `{ amount: 38 }`). */
export function spentRows(list: readonly SpentJson[] | undefined | null): SpentEntry[] {
  return (list ?? []).map((e) => ({ amount: e.amount, note: e.note ?? '', category: spendCategoryOf(e.category) }));
}

/** Sum of the rows, to the cent. */
export function spentTotal(rows: readonly { amount: number }[]): number {
  return Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
}

/**
 * Parse what was typed in the amount box: "38", "38.5", "38,50", "HK$ 12". Returns null when it isn't
 * a usable amount (empty, negative, more than 2 decimals' worth of nonsense, absurdly large).
 */
export function parseAmount(text: string): number | null {
  let t = text.replace(/[^0-9.,]/g, '');
  // "38,50" is a decimal comma; "1,200" is a thousands separator.
  t = !t.includes('.') && /^\d+,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return null;
  const n = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? n : null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Fields whose value differs from the loaded baseline. */
export function changedKeys(form: EveningForm, loaded: EveningForm): FormKey[] {
  return FORM_KEYS.filter((k) => !same(form[k], loaded[k]));
}

/** The PUT body: changed fields only. A rating-only re-seal with nothing changed sends just the rating. */
export function saveBody(form: EveningForm, loaded: EveningForm): EveningBody {
  const body: EveningBody = {};
  for (const k of changedKeys(form, loaded)) {
    if (k === 'mood') body.mood = [...form.mood];
    else if (k === 'satisfaction') body.satisfaction = form.satisfaction;
    else if (k === 'spent')
      body.spent = form.spent.map((e) => (e.note.trim() ? { amount: e.amount, note: e.note.trim(), category: e.category } : { amount: e.amount, category: e.category }));
    else body[k] = form[k];
  }
  if (Object.keys(body).length === 0) body.satisfaction = form.satisfaction;
  return body;
}

/**
 * Rebase the user's edits onto the newer on-disk version after a 412.
 * - `form`: user edits kept, untouched fields = theirs.
 * - `conflicts`: real conflicts only (M2 R-BUG-3): the user edited the field *and* it changed on disk
 *   since the page was loaded *and* the two versions differ. The stale panel shows the on-disk text.
 * - `updated`: fields the user didn't touch that changed on disk and were silently adopted, so the
 *   panel can say so.
 */
export function rebaseForm(
  form: EveningForm,
  loaded: EveningForm,
  theirs: EveningForm
): { form: EveningForm; conflicts: FormKey[]; updated: FormKey[] } {
  const edited = new Set(changedKeys(form, loaded));
  const next: EveningForm = { ...theirs, mood: [...theirs.mood], spent: theirs.spent.map((e) => ({ ...e })) };
  const conflicts: FormKey[] = [];
  const updated: FormKey[] = [];
  for (const k of FORM_KEYS) {
    const changedOnDisk = !same(theirs[k], loaded[k]);
    if (!edited.has(k)) {
      if (changedOnDisk) updated.push(k);
      continue;
    }
    if (k === 'mood') next.mood = [...form.mood];
    else if (k === 'satisfaction') next.satisfaction = form.satisfaction;
    else if (k === 'spent') next.spent = form.spent.map((e) => ({ ...e }));
    else next[k] = form[k];
    if (changedOnDisk && !same(form[k], theirs[k])) conflicts.push(k);
  }
  return { form: next, conflicts, updated };
}
