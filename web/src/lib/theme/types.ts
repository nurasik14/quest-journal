/**
 * Shared types for the Quest Journal theme components.
 * View-model shapes are deliberately loose so they accept both the
 * architect's API (status: open|done|failed) and the psychologist's
 * proposal (open|done|partial|let_go). See design-system.md §8 (PROVISIONAL).
 */

export type ThemeName = 'light' | 'dark' | 'system';

/** Quest status. `failed` (architecture) renders exactly like `let_go` (motivation doc). */
export type QuestStatus = 'open' | 'done' | 'partial' | 'let_go' | 'failed';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'boss';

export type Feedback = 'up' | 'down' | null;

/** Psychologist's 8 categories + the architect's enum. Unknown strings fall back to `mind` styling. */
export type Category =
  | 'body'
  | 'mind'
  | 'social'
  | 'creative'
  | 'adventure'
  | 'care'
  | 'learning'
  | 'treat'
  | 'outside'
  | 'chores'
  | 'rest';

export interface QuestView {
  id: string;
  title: string;
  why?: string;
  category: Category | (string & {});
  difficulty: Difficulty;
  coins: number;
  status: QuestStatus;
  feedback?: Feedback;
  source?: 'ai' | 'pool' | 'manual';
  /** Optional boss checkpoints (motivation §2.1; not in the API yet). */
  checkpoints?: { label: string; done: boolean }[];
}

export type RerollReason = 'too_long' | 'costs_money' | 'not_today' | 'boring' | 'not_me';

export type SealKind = 'done' | 'partial' | 'boss' | 'bought';

export type StickerEvent =
  | 'quest_done'
  | 'boss'
  | 'boss_done'
  | 'reroll'
  | 'streak'
  | 'low_rating'
  | 'shop_buy'
  | 'idle'
  | 'loading'
  | 'welcome_back'
  | 'rest_day';

/**
 * Real images in /decor/img: Tang/Song court paintings and Ming herbal pages (public domain / CC BY),
 * plus one photo of a real apothecary drawer cabinet. Credits in IMAGE_SOURCES.md.
 */
export type DecorPhoto =
  | 'drawers'
  | 'band-evening'
  | 'band-garden'
  | 'band-notes'
  | 'hero-consorts'
  | 'loader-pestle';

/** Single-colour SVGs in /decor (icons + fallbacks). */
export type DecorSvg =
  | 'lattice-ice'
  | 'lattice-coin'
  | 'lattice-fret'
  | 'lattice-corner'
  | 'lantern'
  | 'plum-blossom'
  | 'plum-branch'
  | 'ginkgo'
  | 'mortar-pestle'
  | 'moon-gate'
  | 'herb-sprig'
  | 'sycee'
  | 'cloud'
  | 'cat'
  | 'leaf'
  | 'scroll'
  | 'brush'
  | 'seal-grain'
  | 'teacup'
  | 'book'
  | 'fan'
  | 'footprints';

export interface StickerEntry {
  files: string[];
  fallback: DecorSvg;
  caption?: string;
}

export interface StickerManifest {
  version: number;
  base: string;
  pick?: 'seeded' | 'first' | 'random';
  events: Partial<Record<StickerEvent, StickerEntry>> & Record<string, StickerEntry | undefined>;
}
