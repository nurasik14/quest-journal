/**
 * One toast at a time, polite live region, 4 s by default (designer §0). M5: an optional action (Undo) and a
 * longer life (8 s) that pauses while the toast is focused or hovered (designer-AC14, PROVISIONAL).
 */
export interface ToastAction {
  label: string;
  run: () => void;
}

export const toast = $state<{ text: string | null; seq: number; action: ToastAction | null }>({ text: null, seq: 0, action: null });
let timer: ReturnType<typeof setTimeout> | null = null;
let remaining = 0;
let startedAt = 0;
let held = false;

function arm(ms: number) {
  if (timer) clearTimeout(timer);
  remaining = ms;
  startedAt = Date.now();
  timer = setTimeout(() => {
    toast.text = null;
    toast.action = null;
  }, ms);
}

export function showToast(text: string, ms = 4000, action: ToastAction | null = null) {
  toast.text = text;
  toast.action = action;
  toast.seq++;
  held = false;
  arm(ms);
}

/** Pause (focus/hover) or resume the countdown. */
export function holdToast(hold: boolean) {
  if (hold === held || toast.text === null) return;
  held = hold;
  if (hold) {
    if (timer) clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  } else {
    arm(Math.max(remaining, 1500));
  }
}

export function dismissToast() {
  if (timer) clearTimeout(timer);
  timer = null;
  toast.text = null;
  toast.action = null;
}
