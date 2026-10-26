/**
 * The ONE client copy of the ledger (designer-AC1, psychologist-AC1). Every `{economy}` the API returns is fed
 * through `setEconomy`, and every balance badge reads from here, so Today and the Market can never disagree.
 * Memory only.
 */
import type { Economy } from '../../../server/src/api-types';
import { api } from './api';
import { bonusMoment, type BonusMemory } from './ledgerRules';

export { fmtTaels } from './ledgerRules';

export const ledger = $state<{ economy: Economy | null }>({ economy: null });

const memory: BonusMemory = { seeded: false, seen: new Set() };

/**
 * Store a fresh economy. With `today` (Today's responses), returns true when this update is the moment a streak
 * bonus landed, i.e. the once-only toast should show. Derived from server data, never a client counter.
 */
export function setEconomy(e: Economy | null | undefined, today?: string): boolean {
  if (!e) return false;
  const prev = ledger.economy;
  ledger.economy = e;
  return today ? bonusMoment(memory, prev, e, today) : false;
}

export async function refreshEconomy(): Promise<void> {
  try {
    ledger.economy = (await api.economy()).data;
  } catch {
    /* offline: keep the last value */
  }
}
