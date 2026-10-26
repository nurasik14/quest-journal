/**
 * Memory-only Evening draft (BACKLOG MUST, psychologist + designer, sprint M3 G26).
 * Module-level `$state`, so unsaved text survives in-app navigation (Ledger → Today → Ledger) and a 412,
 * but never touches localStorage/IndexedDB (privacy, architect risk 11): a reload or closed tab drops it,
 * which is why the page also sets `beforeunload` while dirty.
 */
import type { EveningForm, FormKey } from './eveningForm';

export interface EveningDraft {
  date: string;
  form: EveningForm;
  loaded: EveningForm;
  etag: string;
  theirs: EveningForm | null;
  staleFields: FormKey[];
  staleUpdated: FormKey[];
}

export const eveningDraft = $state<{ current: EveningDraft | null }>({ current: null });

export function keepDraft(d: EveningDraft): void {
  eveningDraft.current = structuredClone(d);
}

export function takeDraft(date: string): EveningDraft | null {
  const d = eveningDraft.current;
  // $state values are proxies, which structuredClone can't copy: snapshot first.
  return d && d.date === date ? $state.snapshot(d) : null;
}

export function clearDraft(date?: string): void {
  if (!date || eveningDraft.current?.date === date) eveningDraft.current = null;
}
