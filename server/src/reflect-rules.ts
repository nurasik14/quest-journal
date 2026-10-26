/**
 * Reflect + onboarding AI contracts and the pure per-op validator (sprint M4 goal 5–8; architect-AC5–7,
 * psychologist-AC9–13). zod and the `--json-schema` come from the same constants.
 *
 * Invalid ops are DROPPED individually (no retry); only envelope/zod failures count toward the retry.
 */
import { z } from "zod";
import { addDays } from "./clock";
import {
  CAUSAL_WARNING,
  INSIGHT_BLOCKLIST,
  INSIGHT_LIMITS,
  ONBOARDING_LIMITS,
  PERSONALITY_WARNING,
  SUSPICIOUS_OP,
} from "./domain";
import { sanitizeOpText, type InsightItem } from "./insights";
import { titleSimilarity } from "./quest-rules";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^i-\d{4}$/;

// ---------------------------------------------------------------- reflect contract

const evidence = z.array(z.string().regex(DATE)).min(1).max(INSIGHT_LIMITS.maxEvidence);
const opText = z.string().min(1).max(400); // sanitised + capped to 200 afterwards

export const aiReflectOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), text: opText, evidence }),
  z.object({ op: z.literal("edit"), id: z.string().regex(ID), text: opText, evidence }),
  z.object({ op: z.literal("remove"), id: z.string().regex(ID), reason: z.string().min(1).max(400) }),
]);
export type AiReflectOp = z.infer<typeof aiReflectOpSchema>;

/** `ops` may hold more than 3; only the first 3 are considered (psychologist-AC9 "4 ops → first 3 kept"). */
export const aiReflectSchema = z.object({ ops: z.array(aiReflectOpSchema).max(10), care: z.boolean() });
export type AiReflect = z.infer<typeof aiReflectSchema>;

const dateJson = { type: "string", description: "YYYY-MM-DD" };
const evidenceJson = { type: "array", minItems: 1, maxItems: INSIGHT_LIMITS.maxEvidence, items: dateJson };
export const reflectJsonSchema: object = {
  type: "object",
  additionalProperties: false,
  required: ["ops", "care"],
  properties: {
    care: { type: "boolean" },
    ops: {
      type: "array",
      maxItems: INSIGHT_LIMITS.opsPerReflect,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["op", "text", "evidence"],
            properties: { op: { type: "string", enum: ["add"] }, text: { type: "string", minLength: 1, maxLength: 200 }, evidence: evidenceJson },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["op", "id", "text", "evidence"],
            properties: {
              op: { type: "string", enum: ["edit"] },
              id: { type: "string", description: "i-NNNN" },
              text: { type: "string", minLength: 1, maxLength: 200 },
              evidence: evidenceJson,
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["op", "id", "reason"],
            properties: {
              op: { type: "string", enum: ["remove"] },
              id: { type: "string", description: "i-NNNN" },
              reason: { type: "string", minLength: 1, maxLength: 200 },
            },
          },
        ],
      },
    },
  },
};

// ---------------------------------------------------------------- onboarding contract

export const aiOnboardingSchema = z.object({ draft: z.string().trim().min(1).max(ONBOARDING_LIMITS.draft) });
export const onboardingJsonSchema: object = {
  type: "object",
  additionalProperties: false,
  required: ["draft"],
  properties: { draft: { type: "string", minLength: 1, maxLength: ONBOARDING_LIMITS.draft } },
};

// ---------------------------------------------------------------- validated ops

export type ValidOp =
  | { op: "add"; text: string; evidence: string[]; flag?: "suspicious" }
  | { op: "edit"; id: string; text: string; evidence: string[]; base_text: string; flag?: "suspicious" }
  | { op: "remove"; id: string; reason: string; base_text: string; flag?: "suspicious" };

export interface ReflectRuleContext {
  /** The reflected date. */
  date: string;
  /** Dates whose history lines were actually sent in the prompt (the target date is always allowed). */
  sentDates: ReadonlySet<string>;
  /** Day files: date → private? (absent = no parseable file). */
  days: ReadonlyMap<string, { private: boolean }>;
  items: readonly InsightItem[];
  atCap: boolean;
  profile: string | null;
  /** Texts the user declined in the last 30 days. */
  declined: readonly string[];
}

export interface ReflectValidation {
  ops: ValidOp[];
  /** Reason codes per dropped op, e.g. `evidence:0`, `blocked:1` (codes only, never text). */
  dropped: string[];
  toneWarnings: string[];
}

/** Terms from INSIGHT_BLOCKLIST in `text` that the user didn't write in his own profile. */
export function blockedTerms(text: string, profile: string | null): string[] {
  const prof = profile ?? "";
  const out: string[] = [];
  for (const m of text.matchAll(INSIGHT_BLOCKLIST)) {
    const term = m[0].toLowerCase();
    // Whole-word exception (backlog #174): "fatigue" in the profile doesn't excuse "fat".
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(prof)) out.push(term);
  }
  return out;
}

export function isDeclined(text: string, declined: readonly string[]): boolean {
  return declined.some((d) => titleSimilarity(text, d) > 0.8);
}

/** Pure per-op validation (architect-AC5, psychologist-AC9–12). */
export function validateReflect(out: AiReflect, ctx: ReflectRuleContext): ReflectValidation {
  const ops: ValidOp[] = [];
  const dropped: string[] = [];
  const toneWarnings: string[] = [];
  if (out.care) return { ops, dropped: out.ops.map((_, i) => `care:${i}`), toneWarnings };
  const oldest = addDays(ctx.date, -INSIGHT_LIMITS.evidenceMaxAgeDays);
  const byId = new Map(ctx.items.map((it) => [it.id, it]));
  const touched = new Set<string>();

  const validDates = (ev: readonly string[]): string[] => {
    const distinct = [...new Set(ev)];
    // Every date must be valid; one hallucinated date sinks the op (it shows the model wasn't grounded).
    const ok = distinct.every((d) => {
      if (d > ctx.date || d < oldest) return false;
      if (d !== ctx.date && !ctx.sentDates.has(d)) return false;
      const info = ctx.days.get(d);
      return info !== undefined && !info.private;
    });
    return ok ? distinct.sort() : [];
  };

  out.ops.slice(0, INSIGHT_LIMITS.opsPerReflect).forEach((op, i) => {
    const textIn = op.op === "remove" ? op.reason : op.text;
    const text = sanitizeOpText(textIn);
    if (!text) return void dropped.push(`empty:${i}`);
    if (blockedTerms(text, ctx.profile).length) return void dropped.push(`blocked:${i}`);
    const flag = SUSPICIOUS_OP.test(text) ? ({ flag: "suspicious" } as const) : {};
    if (op.op !== "remove" && CAUSAL_WARNING.test(text)) toneWarnings.push(`causal:${i}`);

    if (op.op === "add") {
      if (ctx.atCap) return void dropped.push(`cap:${i}`);
      const ev = validDates(op.evidence);
      if (ev.length < INSIGHT_LIMITS.minEvidence) return void dropped.push(`evidence:${i}`);
      if (isDeclined(text, ctx.declined)) return void dropped.push(`declined:${i}`);
      if (ctx.items.some((it) => titleSimilarity(it.text, text) > 0.8)) return void dropped.push(`duplicate:${i}`);
      ops.push({ op: "add", text, evidence: ev, ...flag });
      return;
    }
    const target = byId.get(op.id);
    if (!target) return void dropped.push(`unknown_id:${i}`);
    if (touched.has(op.id)) return void dropped.push(`same_id:${i}`);
    if (op.op === "edit") {
      const ev = validDates(op.evidence);
      if (ev.length < INSIGHT_LIMITS.minEvidence) return void dropped.push(`evidence:${i}`);
      if (!ev.some((d) => !target.evidence.includes(d))) return void dropped.push(`no_new_evidence:${i}`);
      if (isDeclined(text, ctx.declined)) return void dropped.push(`declined:${i}`);
      touched.add(op.id);
      ops.push({ op: "edit", id: op.id, text, evidence: ev, base_text: target.text, ...flag });
      return;
    }
    touched.add(op.id);
    ops.push({ op: "remove", id: op.id, reason: text, base_text: target.text, ...flag });
  });
  return { ops, dropped, toneWarnings };
}

// ---------------------------------------------------------------- onboarding soft checks

/** Capitalised multi-word names (e.g. "Blue Bottle") outside headings. */
const NAME_RE = /(?<![\p{L}'’])[A-Z]\p{Ll}+(?:\s+[A-Z]\p{Ll}+)+(?![\p{L}'’])/gu;

/** Soft tone warnings on a draft (logged codes only): personality labels, invented specifics (psych-AC2/3). */
export function onboardingToneWarnings(draft: string, answers: readonly { question: string; answer: string }[]): string[] {
  const out: string[] = [];
  if (PERSONALITY_WARNING.test(draft)) out.push("personality_label");
  const hay = answers.map((a) => a.answer).join("\n").toLowerCase();
  const body = draft
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  for (const m of body.matchAll(NAME_RE)) {
    if (!hay.includes(m[0].toLowerCase())) {
      out.push("invented_specific");
      break;
    }
  }
  return out;
}
