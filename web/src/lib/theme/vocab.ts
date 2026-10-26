/**
 * UI vocabulary: the Apothecary flavour in one place, so screens never
 * hard-code copy. Tone rules (motivation §4.5): informational, never
 * controlling; no "should/must"; no loss framing; no red for failure.
 */
import type { Category, DecorSvg, Difficulty, QuestStatus, RerollReason, SealKind, StickerEvent } from './types';

export interface CategoryInfo {
  /** Apothecary display name */
  label: string;
  /** Plain-language subtitle (shown under the chip on wide layouts / in stats) */
  plain: string;
  icon: DecorSvg;
  /** CSS custom property holding the accent colour */
  colorVar: string;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  body: { label: 'Tonic', plain: 'Body', icon: 'herb-sprig', colorVar: '--cat-body' },
  mind: { label: 'Focus draught', plain: 'Mind', icon: 'mortar-pestle', colorVar: '--cat-mind' },
  social: { label: 'Court gossip', plain: 'Social', icon: 'fan', colorVar: '--cat-social' },
  creative: { label: 'Ink & brush', plain: 'Creative', icon: 'brush', colorVar: '--cat-creative' },
  adventure: { label: 'Expedition', plain: 'Adventure', icon: 'footprints', colorVar: '--cat-adventure' },
  care: { label: 'Rest remedy', plain: 'Care & rest', icon: 'teacup', colorVar: '--cat-care' },
  learning: { label: 'Herbal study', plain: 'Learning', icon: 'book', colorVar: '--cat-learning' },
  treat: { label: 'Sweet medicine', plain: 'Treat yourself', icon: 'plum-blossom', colorVar: '--cat-treat' },
  // Architect's enum aliases
  outside: { label: 'Expedition', plain: 'Outside', icon: 'footprints', colorVar: '--cat-adventure' },
  rest: { label: 'Rest remedy', plain: 'Rest', icon: 'teacup', colorVar: '--cat-care' },
  chores: { label: 'Palace chores', plain: 'Chores', icon: 'scroll', colorVar: '--cat-chores' }
};

export function categoryInfo(cat: string): CategoryInfo {
  return (CATEGORIES as Record<string, CategoryInfo>)[cat] ?? {
    label: cat.charAt(0).toUpperCase() + cat.slice(1),
    plain: cat,
    icon: 'herb-sprig',
    colorVar: '--cat-mind'
  };
}

export const DIFFICULTY: Record<Difficulty, { label: string; leaves: number }> = {
  easy: { label: 'Mild dose', leaves: 1 },
  medium: { label: 'Standard dose', leaves: 2 },
  hard: { label: 'Strong dose', leaves: 3 },
  boss: { label: 'Weekly prescription', leaves: 4 }
};

export const STATUS: Record<QuestStatus, { label: string; action: string; note: string }> = {
  open: { label: 'Open', action: 'Reopen', note: '' },
  done: { label: 'Done', action: 'Done', note: 'Sealed in the ledger.' },
  partial: { label: 'Smaller version', action: 'Smaller version', note: 'A smaller dose still counts.' },
  let_go: { label: 'Let go', action: 'Let go', note: 'No penalty, and that tells the apothecary something.' },
  failed: { label: 'Let go', action: 'Let go', note: 'No penalty, and that tells the apothecary something.' }
};

export const SEAL: Record<SealKind, { glyph: string; label: string }> = {
  done: { glyph: '済', label: 'Done' },
  partial: { glyph: '半', label: 'Smaller version done' },
  boss: { glyph: '勝', label: 'Weekly prescription complete' },
  bought: { glyph: '買', label: 'Purchased' }
};

/** Energy check-in labels (motivation §1.4) */
export const ENERGY_LABELS = [
  'Bedridden patient',
  'Weak pulse',
  'Steady',
  'Good color',
  'Ready to taste poison'
] as const;

/** Satisfaction anchors (motivation §5.3), index 0 = rating 1 */
export const RATING_ANCHORS = [
  'One of the worst days in a long time.',
  'Very bad; most of the day hurt.',
  'Bad; more bad than good.',
  'Below par; flat or draining.',
  'Ordinary; nothing much either way.',
  'Decent; a few good moments.',
  "Good; I'd happily have this day again.",
  'Very good; something really stood out.',
  "Great; I'll remember this week for it.",
  'One of the best days this year.'
] as const;

/** Balanced mood tags (motivation §5.1) */
export const MOOD_TAGS = [
  'calm',
  'energized',
  'proud',
  'curious',
  'cozy',
  'connected',
  'tired',
  'anxious',
  'frustrated',
  'lonely',
  'bored',
  'overwhelmed'
] as const;

export const REROLL_REASONS: { id: RerollReason; label: string }[] = [
  { id: 'too_long', label: 'Too long' },
  { id: 'costs_money', label: 'Costs money' },
  { id: 'not_today', label: 'Not today' },
  { id: 'boring', label: 'Boring' },
  { id: 'not_me', label: 'Not me' }
];

export const LOADING = {
  generate: 'Maomao is grinding herbs…',
  reroll: 'Fetching another prescription…',
  boss: 'Consulting the Jade Pavilion…',
  reflect: 'Maomao is reading your ledger…',
  onboarding: 'Maomao is writing up her notes on you…',
  slow: 'Still grinding. Good medicine takes a moment.',
  verySlow: "Claude is slow today. If it doesn't answer, the apothecary's own shelf has backups."
} as const;

export const FALLBACK_NOTE =
  "From the apothecary's own shelf: Claude couldn't be reached, so these come from your saved pool.";

export const NAV = [
  { id: 'today', label: 'Today', icon: 'scroll' },
  { id: 'evening', label: 'Ledger', icon: 'brush' },
  { id: 'market', label: 'Market', icon: 'sycee' },
  { id: 'archive', label: 'Garden', icon: 'plum-blossom' },
  { id: 'profile', label: 'Notes', icon: 'moon-gate' }
] as const satisfies readonly { id: string; label: string; icon: DecorSvg }[];

export const STICKER_FALLBACK: Record<StickerEvent, DecorSvg> = {
  quest_done: 'herb-sprig',
  boss: 'lantern',
  boss_done: 'lantern',
  reroll: 'cat',
  streak: 'plum-blossom',
  low_rating: 'ginkgo',
  shop_buy: 'sycee',
  idle: 'mortar-pestle',
  loading: 'mortar-pestle',
  welcome_back: 'teacup',
  rest_day: 'teacup'
};
