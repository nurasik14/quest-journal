/**
 * AI output contracts (zod + JSON Schema) and the pure business-rule validators (sprint M3 G6/G7/G16/G19,
 * architect-AC5/6/16, psychologist-AC1–7/14/17). Everything is generated from the `domain.ts` constants.
 *
 * The model never sets `coins`, `id`, `slot`, `status` or `source`: unknown keys are stripped by zod (the
 * JSON Schema we send says `additionalProperties: false`), and the server maps fields explicitly.
 */
import { z } from "zod";
import {
  BOSS_TYPES,
  CATEGORIES,
  COSTS,
  DIFFICULTIES,
  ENERGY_SLOTS,
  LIMITS,
  MAX_MINUTES,
  SAFETY_BLOCKLIST,
  SMALL_WIN_MINUTES,
  TONE_WARNING,
  type Category,
  type Difficulty,
  type RerollReason,
} from "./domain";
import { fitsTooLong } from "./fallback";

// ---------------------------------------------------------------- contracts

export const aiQuestSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.title),
  why: z.string().trim().max(LIMITS.why),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  minutes: z.number().int().min(1).max(MAX_MINUTES.hard),
  cost: z.enum(COSTS),
  done_when: z.string().trim().min(1).max(LIMITS.why),
});
export type AiQuest = z.infer<typeof aiQuestSchema>;

export const aiDaySchema = z.object({ quests: z.array(aiQuestSchema) });
export const aiRerollSchema = z.object({ quests: z.array(aiQuestSchema) });

export const aiBossSchema = z.object({
  boss: z.object({
    title: z.string().trim().min(1).max(LIMITS.title),
    why: z.string().trim().max(LIMITS.why),
    type: z.enum(BOSS_TYPES),
    checkpoints: z.array(z.string().trim().min(1).max(160)),
    artifact: z.string().trim().min(1).max(160),
    cost: z.enum(COSTS),
  }),
});
export type AiBoss = z.infer<typeof aiBossSchema>["boss"];

const questJson = {
  type: "object",
  additionalProperties: false,
  required: ["title", "why", "category", "difficulty", "minutes", "cost", "done_when"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 70 },
    why: { type: "string", maxLength: 160 },
    category: { type: "string", enum: [...CATEGORIES] },
    difficulty: { type: "string", enum: [...DIFFICULTIES] },
    minutes: { type: "integer", minimum: 1, maximum: MAX_MINUTES.hard },
    cost: { type: "string", enum: [...COSTS] },
    done_when: { type: "string", minLength: 1, maxLength: 160 },
  },
} as const;

export function dayJsonSchema(count: number): object {
  return {
    type: "object",
    additionalProperties: false,
    required: ["quests"],
    properties: { quests: { type: "array", minItems: count, maxItems: count, items: questJson } },
  };
}

export const bossJsonSchema: object = {
  type: "object",
  additionalProperties: false,
  required: ["boss"],
  properties: {
    boss: {
      type: "object",
      additionalProperties: false,
      required: ["title", "why", "type", "checkpoints", "artifact", "cost"],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 70 },
        why: { type: "string", maxLength: 200 },
        type: { type: "string", enum: [...BOSS_TYPES] },
        checkpoints: { type: "array", minItems: 4, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 160 } },
        artifact: { type: "string", minLength: 1, maxLength: 160 },
        cost: { type: "string", enum: ["free", "low"] },
      },
    },
  },
};

// ---------------------------------------------------------------- similarity

/** Lowercase, strip accents and punctuation, collapse spaces ("Visit a café!" → "visit a cafe"). */
export function normalizeTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** 1 − distance / max length on normalized titles (1 = identical). */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  const m = Math.max(x.length, y.length);
  return m === 0 ? 1 : 1 - levenshtein(x, y) / m;
}

export const SIMILARITY_LIMIT = 0.8;

export function tooSimilar(title: string, recent: readonly string[]): boolean {
  return recent.some((r) => titleSimilarity(title, r) > SIMILARITY_LIMIT);
}

const EMOJI = /\p{Extended_Pictographic}/u;
const isCostly = (q: { cost?: string | undefined }) => q.cost !== undefined && q.cost !== "free";

function questViolations(q: AiQuest, i: number, recent: readonly string[]): string[] {
  const v: string[] = [];
  if (EMOJI.test(q.title)) v.push(`emoji:${i}`);
  if (SAFETY_BLOCKLIST.test(`${q.title}\n${q.why}\n${q.done_when}`)) v.push(`safety:${i}`);
  if (q.minutes > MAX_MINUTES[q.difficulty]) v.push(`minutes:${i}`);
  if (tooSimilar(q.title, recent)) v.push(`repeat:${i}`);
  return v;
}

function toneOf(q: AiQuest, i: number): string[] {
  return TONE_WARNING.test(q.why) ? [`tone:${i}`] : [];
}

// ---------------------------------------------------------------- day

export interface DayRuleContext {
  energy: number;
  /** Titles from the last 14 days, including rejected ones (private days too: never sent, still avoided). */
  recentTitles: readonly string[];
}

export function slotsFor(energy: number): readonly Difficulty[] {
  const e = Math.min(5, Math.max(1, Math.round(energy))) as 1 | 2 | 3 | 4 | 5;
  return ENERGY_SLOTS[e];
}

/** Business rules for a generated day (G7). Returns violation codes; empty = valid. */
export function validateDay(out: { quests: AiQuest[] }, ctx: DayRuleContext): { violations: string[]; toneWarnings: string[] } {
  const v: string[] = [];
  const qs = out.quests;
  const slots = slotsFor(ctx.energy);
  if (qs.length !== slots.length) return { violations: ["count"], toneWarnings: [] };
  if (new Set(qs.map((q) => q.category)).size !== qs.length) v.push("categories");
  qs.forEach((q, i) => {
    if (q.difficulty !== slots[i]) v.push(`slot:${i}`);
  });
  if (new Set(qs.map((q) => normalizeTitle(q.title))).size !== qs.length) v.push("duplicate");
  qs.forEach((q, i) => v.push(...questViolations(q, i, ctx.recentTitles)));
  const costly = qs.filter(isCostly).length;
  if (costly > 1 || (ctx.energy <= 1 && costly > 0)) v.push("money");
  if (ctx.energy < 5 && !qs.some((q) => q.minutes <= SMALL_WIN_MINUTES)) v.push("small_win");
  const cats = qs.map((q) => q.category);
  if (ctx.energy <= 1 && !cats.includes("care")) v.push("care");
  if (ctx.energy === 2 && !cats.some((c) => c === "care" || c === "treat")) v.push("care");
  return { violations: v, toneWarnings: qs.flatMap(toneOf) };
}

// ---------------------------------------------------------------- reroll

export interface RerollRuleContext {
  energy: number;
  difficulty: Difficulty;
  rejected: { title: string; category: string; minutes?: number | undefined };
  reason: RerollReason | null;
  /** The two quests that stay. */
  others: readonly { title: string; category: string; cost?: string | undefined }[];
  recentTitles: readonly string[];
}

export function validateReroll(out: { quests: AiQuest[] }, ctx: RerollRuleContext): { violations: string[]; toneWarnings: string[] } {
  if (out.quests.length !== 1) return { violations: ["count"], toneWarnings: [] };
  const q = out.quests[0]!;
  const v: string[] = [];
  if (q.difficulty !== ctx.difficulty) v.push("slot:0");
  if (q.category === ctx.rejected.category) v.push("same_category");
  if (ctx.others.some((o) => o.category === q.category)) v.push("categories");
  const avoid = [...ctx.recentTitles, ctx.rejected.title, ...ctx.others.map((o) => o.title)];
  v.push(...questViolations(q, 0, avoid));
  if (isCostly(q) && (ctx.energy <= 1 || ctx.reason === "costs_money" || ctx.others.some(isCostly))) v.push("money");
  // Both lengths count text too (H1 fix LOW-1): "minutes: 20" on "Do 4 Pomodoros" is not short.
  if (ctx.reason === "too_long" && ctx.rejected.minutes !== undefined && !fitsTooLong(q, ctx.rejected.minutes)) v.push("too_long");
  return { violations: v, toneWarnings: toneOf(q, 0) };
}

// ---------------------------------------------------------------- boss

export interface BossRuleContext {
  lastType?: string | undefined;
  recentBossTitles?: readonly string[];
}

export function validateBoss(out: { boss: AiBoss }, ctx: BossRuleContext): { violations: string[]; toneWarnings: string[] } {
  const b = out.boss;
  const v: string[] = [];
  if (b.checkpoints.length !== LIMITS.checkpoints) v.push("checkpoints");
  if (ctx.lastType !== undefined && b.type === ctx.lastType) v.push("type_repeat");
  if (b.cost === "medium") v.push("money");
  if (EMOJI.test(b.title)) v.push("emoji");
  if (SAFETY_BLOCKLIST.test([b.title, b.why, b.artifact, ...b.checkpoints].join("\n"))) v.push("safety");
  if (ctx.recentBossTitles && tooSimilar(b.title, ctx.recentBossTitles)) v.push("repeat");
  return { violations: v, toneWarnings: TONE_WARNING.test(b.why) ? ["tone"] : [] };
}

export type { Category };
