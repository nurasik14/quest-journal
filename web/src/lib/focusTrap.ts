/**
 * Focus-trap helpers for modal sheets (M6 fix 1, MED-1). Pure so they can be unit-tested without a DOM.
 *
 * The old selector counted the radios of a read-only `HerbRating`, which are disabled through `<fieldset disabled>`:
 * their own `.disabled` is false, but they can't take focus, so `first.focus()` was a no-op and Shift+Tab escaped.
 * `:disabled` matches fieldset-disabled descendants, so the filter below uses it.
 */

export const FOCUSABLE_SELECTOR =
  'a[href], button, textarea, input, select, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** The parts of an Element the filter needs (lets tests pass plain objects). */
export interface FocusCandidate {
  matches(selector: string): boolean;
  tabIndex: number;
  getClientRects(): { length: number };
  closest?(selector: string): unknown;
}

/** True when the node can really take keyboard focus: not disabled (incl. via a fieldset), in the tab order, rendered, not inert. */
export function canTakeFocus(n: FocusCandidate): boolean {
  if (n.matches(':disabled')) return false;
  if (n.tabIndex < 0) return false;
  if (n.getClientRects().length === 0) return false;
  if (n.closest?.('[inert]')) return false;
  return true;
}

export function focusables<T extends FocusCandidate>(nodes: Iterable<T>): T[] {
  return [...nodes].filter(canTakeFocus);
}

/**
 * Where Tab should go: a node to focus, `'stay'` (swallow the Tab), or `null` (let the browser move focus normally).
 * `inside` = whether the active element is inside the sheet. `precedes(a, b)` = a comes before b in document order;
 * it is only used when focus sits on a non-tabbable node inside the sheet (e.g. the tabindex=-1 title).
 */
export function trapTarget<T>(
  nodes: readonly T[],
  active: unknown,
  inside: boolean,
  shift: boolean,
  precedes: (a: unknown, b: T) => boolean,
): T | 'stay' | null {
  if (nodes.length === 0) return 'stay';
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  if (!inside) return shift ? last : first;
  if (!nodes.includes(active as T)) {
    // e.g. on the title: Shift+Tab before the first control, or Tab after the last one, must wrap, not leave.
    if (shift && (active === first || precedes(active, first))) return last;
    if (!shift && !precedes(active, last)) return first;
    return null;
  }
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}
