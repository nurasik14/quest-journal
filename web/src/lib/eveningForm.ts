/**
 * Pure helpers for the Evening ledger form (M2 BUG-1). Kept free of Svelte so `bun test` covers them.
 *
 * - A save sends only the fields the user changed since the page was loaded, so a field they never
 *   touched can't overwrite a newer hand edit of that field.
 * - After a 412, the newer on-disk version becomes the new baseline: untouched fields adopt it,
 *   fields the user edited keep the user's text (and the panel shows the on-disk version next to them).
 */
import type { EveningBody } from '../../../server/src/api-types';

export interface EveningForm {
  satisfaction: number | null;
  mood: string[];
  highlight: string;
  notes: string;
  gratitude: string;
}

export const FORM_KEYS = ['satisfaction', 'mood', 'highlight', 'notes', 'gratitude'] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export const emptyForm = (): EveningForm => ({ satisfaction: null, mood: [], highlight: '', notes: '', gratitude: '' });

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
  const next: EveningForm = { ...theirs, mood: [...theirs.mood] };
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
    else next[k] = form[k];
    if (changedOnDisk && !same(form[k], theirs[k])) conflicts.push(k);
  }
  return { form: next, conflicts, updated };
}
