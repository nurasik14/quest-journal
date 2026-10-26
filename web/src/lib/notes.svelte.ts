/**
 * App-wide "Notes" state (designer-AC12): how many insight suggestions are pending, for the jade dot on the
 * Notes tab (a dot, never a count). Refreshed from /api/today and after every decide.
 */
import { api } from './api';

export const notes = $state<{ pending: number; profileEmpty: boolean | null; inviteDismissed: boolean }>({
  pending: 0,
  profileEmpty: null,
  // Memory only (designer-AC4: nothing else goes into storage). Comes back after a reload; that's fine.
  inviteDismissed: false
});

export async function refreshNotes(): Promise<void> {
  try {
    const r = await api.proposals();
    notes.pending = r.data.proposals.length;
  } catch {
    /* offline: keep the last value */
  }
}
