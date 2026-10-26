/**
 * Knowledge base use cases (sprint M4): kb read/write with ETags, the onboarding draft job, the reflect job,
 * proposal storage and the decide step. Routes in app.ts stay thin.
 *
 * Safety model (architect "persistent injection path"):
 * - model output reaches `insights.md` ONLY through `decide` with an explicit accept, after sanitising;
 * - `profile.md` is written ONLY by `PUT /api/kb/profile` (the user's own save), never by a job;
 * - care results and onboarding drafts live in memory (job results) only; nothing is logged but codes.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { z } from "zod";
import { callAi, type AiMonitor, type AiRunner } from "./ai";
import { addDays, isValidDate, isoWithOffset, logicalDate, weekdayName, type Clock } from "./clock";
import type { Config } from "./config";
import { CARE_PATTERN, CURRENT_SCHEMA, INSIGHT_LIMITS, KB_MAX_CHARS, ONBOARDING_LIMITS, SUSPICIOUS_OP } from "./domain";
import { StoreError, type Warning } from "./errors";
import type { Git } from "./git";
import {
  applyLineOps,
  atCap,
  formatId,
  idNumber,
  parseInsights,
  sanitizeOpText,
  type LineOp,
  type ParsedInsights,
} from "./insights";
import type { Job, ProposalJson, ProposalOpJson, ReflectSkip } from "./api-types";
import type { Jobs } from "./jobs";
import { FrontmatterError, parseYamlText, stringifyYaml } from "./markdown";
import { buildOnboardingPrompt, buildReflectPrompt, isEmptyKb, type HistoryInput } from "./prompts";
import {
  aiOnboardingSchema,
  aiReflectSchema,
  onboardingJsonSchema,
  onboardingToneWarnings,
  reflectJsonSchema,
  validateReflect,
  type ValidOp,
} from "./reflect-rules";
import { atomicWrite, etagOf, withFileLock, type DayRecord, type KbName, type Store, KB_NAMES } from "./store";
import { ApiError } from "./today";

// ---------------------------------------------------------------- request bodies

export const kbPutBody = z.strictObject({ content: z.string() });

export const onboardingBody = z.strictObject({
  answers: z
    .array(
      z.strictObject({
        question: z.string().max(ONBOARDING_LIMITS.question),
        answer: z.string().max(ONBOARDING_LIMITS.answer),
      }),
    )
    .min(1)
    .max(ONBOARDING_LIMITS.items),
});
export type OnboardingAnswers = z.infer<typeof onboardingBody>["answers"];

export const decideBody = z.strictObject({
  decisions: z
    .array(z.strictObject({ op_id: z.string().min(1).max(40), accept: z.boolean(), text: z.string().max(1_000).optional() }))
    .min(1)
    .max(10),
});
export type DecideInput = z.infer<typeof decideBody>;

export const PROPOSAL_STATUSES = ["pending", "decided", "all"] as const;

// ---------------------------------------------------------------- proposal file

const DECISIONS = ["accepted", "rejected", "stale"] as const;
type Decision = (typeof DECISIONS)[number];

const proposalOpSchema = z.looseObject({
  op_id: z.string(),
  op: z.enum(["add", "edit", "remove"]),
  id: z.string().optional(),
  text: z.string().optional(),
  reason: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  base_text: z.string().optional(),
  flag: z.string().optional(),
  decision: z.enum(DECISIONS).nullable().default(null),
  assigned_id: z.string().optional(),
  proposed_text: z.string().optional(),
});
const proposalSchema = z.looseObject({
  schema: z.number().int().optional(),
  id: z.string(),
  created_at: z.string().optional(),
  input_hash: z.string().optional(),
  base_insights_etag: z.string().nullable().optional(),
  status: z.enum(["pending", "decided"]),
  ops: z.array(proposalOpSchema),
});
type ProposalFile = z.infer<typeof proposalSchema>;
type ProposalOp = z.infer<typeof proposalOpSchema>;

const PROPOSAL_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.yaml$/;

function opJson(o: ProposalOp): ProposalOpJson {
  const out: ProposalOpJson = { op_id: o.op_id, op: o.op, evidence: [...o.evidence], decision: o.decision };
  if (o.id !== undefined) out.id = o.id;
  if (o.text !== undefined) out.text = o.text;
  if (o.reason !== undefined) out.reason = o.reason;
  if (o.base_text !== undefined) out.base_text = o.base_text;
  if (o.flag !== undefined) out.flag = o.flag;
  return out;
}

function proposalJson(p: ProposalFile, etag: string): ProposalJson {
  return { id: p.id, date: p.id, created_at: p.created_at ?? null, status: p.status, etag, ops: p.ops.map(opJson) };
}

/** Everything that goes into a reflect call for a date (never gratitude). Equal hash → no new call. */
export function reflectInputHash(rec: DayRecord): string {
  const d = rec.day;
  const payload = {
    s: d.satisfaction,
    m: d.mood,
    h: rec.highlight,
    n: rec.notes,
    q: d.quests.map((q) => [q.id, q.status, q.feedback ?? null]),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export function hasCareLanguage(rec: Pick<DayRecord, "highlight" | "notes"> & { gratitude?: string }): boolean {
  return CARE_PATTERN.test(`${rec.highlight}\n${rec.notes}\n${rec.gratitude ?? ""}`);
}

function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const QUARANTINE = new Set(["unparseable_file", "invalid_file", "newer_schema"]);
const isQuarantine = (e: unknown) => e instanceof StoreError && QUARANTINE.has(e.code);

export type { ReflectSkip };

export interface KbDeps {
  config: Config;
  clock: Clock;
  store: Store;
  git: Git;
  jobs: Jobs;
  ai: AiRunner | null;
  monitor?: AiMonitor;
}

export function createKbService(deps: KbDeps) {
  const { config, clock, store, git, jobs, ai, monitor } = deps;
  const today = () => logicalDate(clock.now(), config.tz, config.rolloverHour);
  const stamp = () => isoWithOffset(clock.now(), config.tz);
  /** Last reflect input hash per date that was enqueued (5 identical saves → 1 call). */
  const lastHash = new Map<string, string>();
  let reflectFlags = 0;

  const proposalRel = (date: string) => `kb/proposals/${date}.yaml`;
  const insightsRel = store.paths.kb("insights");

  // ------------------------------------------------------------ kb files

  async function readKbText(name: KbName): Promise<string | null> {
    try {
      return (await store.readKb(name))?.content ?? null;
    } catch {
      return null;
    }
  }

  function kbJson(name: KbName, content: string, etag: string) {
    if (name === "insights") {
      const p = parseInsights(content);
      return { content, etag, items: p.items.map(({ id, text, evidence }) => ({ id, text, evidence })), unparsed_lines: p.unparsed_lines };
    }
    return { content, etag, empty: isEmptyKb(content) };
  }

  function assertKbName(name: string): KbName {
    if (!(KB_NAMES as readonly string[]).includes(name)) throw new ApiError(404, "not_found", "No such notes page.");
    return name as KbName;
  }

  // ------------------------------------------------------------ proposals

  async function readProposal(date: string): Promise<{ file: ProposalFile; etag: string; text: string } | null> {
    const rel = proposalRel(date);
    let text: string;
    try {
      text = await readFile(store.abs(rel), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
    let raw: unknown;
    try {
      raw = parseYamlText(text);
    } catch (e) {
      const fe = e as FrontmatterError;
      throw new StoreError("unparseable_file", `Fix ${rel} in your editor: ${fe.message}`, rel, {
        ...(fe.line !== undefined ? { line: fe.line } : {}),
      });
    }
    if (raw && typeof raw === "object" && typeof (raw as { schema?: unknown }).schema === "number" && (raw as { schema: number }).schema > CURRENT_SCHEMA.proposals) {
      throw new StoreError("newer_schema", `${rel} uses a newer schema. Read-only.`, rel);
    }
    const res = proposalSchema.safeParse(raw);
    if (!res.success || res.data.id !== date) {
      throw new StoreError("invalid_file", `${rel} has values the app doesn't understand`, rel);
    }
    return { file: res.data, etag: etagOf(text), text };
  }

  async function proposalDates(): Promise<string[]> {
    try {
      const names = await readdir(store.abs("kb/proposals"));
      return names
        .map((n) => PROPOSAL_FILE_RE.exec(n)?.[1])
        .filter((d): d is string => d !== undefined && isValidDate(d))
        .sort()
        .reverse();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  /** All readable proposals, newest first (broken ones are skipped; they show in /api/health). */
  async function allProposals(): Promise<{ file: ProposalFile; etag: string }[]> {
    const out: { file: ProposalFile; etag: string }[] = [];
    for (const d of await proposalDates()) {
      try {
        const p = await readProposal(d);
        if (p) out.push(p);
      } catch (e) {
        if (!isQuarantine(e)) throw e;
      }
    }
    return out;
  }

  const visible = (date: string) => date >= addDays(today(), -INSIGHT_LIMITS.showDays);

  async function listProposals(status: (typeof PROPOSAL_STATUSES)[number]): Promise<ProposalJson[]> {
    const all = await allProposals();
    return all
      .filter((p) => (status === "all" ? true : p.file.status === status))
      .filter((p) => status !== "pending" || visible(p.file.id))
      .map((p) => proposalJson(p.file, p.etag));
  }

  /**
   * Declined op texts of the last 30 days. `all` feeds the local similarity check; `prompt` (sent to Claude as
   * <declined>) leaves out ops flagged `suspicious`, so a rejected instruction-like text never re-enters the
   * prompt (architect-AC18, M4 review).
   */
  async function declinedTexts(date: string): Promise<{ all: string[]; prompt: string[] }> {
    const from = addDays(date, -INSIGHT_LIMITS.declinedDays);
    const all: string[] = [];
    const prompt: string[] = [];
    for (const p of await allProposals()) {
      if (p.file.id < from) continue;
      for (const o of p.file.ops) {
        if (o.decision === "rejected" && o.op !== "remove" && o.text) {
          const t = o.proposed_text ?? o.text;
          all.push(t);
          if (o.flag !== "suspicious" && !SUSPICIOUS_OP.test(sanitizeOpText(t))) prompt.push(t);
        }
      }
    }
    return { all, prompt };
  }

  /** Highest insight id ever used: in insights.md and in every proposal (ids are never reused). */
  async function maxInsightId(parsed: ParsedInsights): Promise<number> {
    let max = parsed.items.reduce((m, it) => Math.max(m, idNumber(it.id)), 0);
    for (const line of parsed.lines) for (const m of line.matchAll(/\bi-(\d{4})\b/g)) max = Math.max(max, Number(m[1]));
    for (const p of await allProposals()) {
      for (const o of p.file.ops) {
        if (o.id) max = Math.max(max, idNumber(o.id));
        if (o.assigned_id) max = Math.max(max, idNumber(o.assigned_id));
      }
    }
    return max;
  }

  // ------------------------------------------------------------ reflect

  async function readDaySafe(date: string): Promise<DayRecord | null> {
    try {
      return await store.readDay(date);
    } catch (e) {
      if (isQuarantine(e)) return null;
      throw e;
    }
  }

  async function nonPrivateDays(date: string, back: number): Promise<number> {
    let n = 0;
    for (let i = 0; i <= back; i++) {
      const r = await readDaySafe(addDays(date, -i));
      if (r && !r.day.private) n++;
    }
    return n;
  }

  async function runReflect(date: string, manual: boolean, signal: AbortSignal): Promise<{ result: unknown }> {
    let rec: DayRecord | null;
    try {
      rec = await store.readDay(date);
    } catch (e) {
      if (isQuarantine(e)) throw coded("unparseable_file", "That page needs a fix first.");
      throw e;
    }
    if (!rec) throw coded("not_found", "No ledger page for this date.");
    if (rec.day.private) return { result: { outcome: "private" } };
    if (hasCareLanguage(rec)) return { result: { outcome: "care" } };
    if (!ai) throw coded("claude_missing", "Claude is off.");

    const history: HistoryInput[] = [];
    const days = new Map<string, { private: boolean }>([[date, { private: false }]]);
    for (let i = 1; i <= 14; i++) {
      const d = addDays(date, -i);
      const r = await readDaySafe(d);
      if (!r) continue;
      days.set(d, { private: r.day.private === true });
      // Gratitude is deliberately not copied (privacy).
      history.push({ date: d, day: r.day, highlight: r.highlight, notes: r.notes });
    }
    const profile = await readKbText("profile");
    const insightsText = await readKbText("insights");
    const parsed = parseInsights(insightsText);
    const consolidation = atCap(parsed);
    const declined = await declinedTexts(date);
    const built = buildReflectPrompt({
      date,
      weekday: weekdayName(date),
      profile,
      // The model sees the insight lines with their ids (edit/remove targets).
      insights: insightsText,
      history,
      entry: { satisfaction: rec.day.satisfaction, mood: rec.day.mood, highlight: rec.highlight, notes: rec.notes, quests: rec.day.quests },
      declined: declined.prompt,
      consolidation,
    });
    const res = await callAi({
      runner: ai,
      request: { kind: "reflect", system: built.system, prompt: built.prompt, schema: reflectJsonSchema, timeoutMs: config.aiTimeoutMs },
      output: aiReflectSchema,
      ...(monitor ? { monitor } : {}),
      signal,
      now: stamp,
    });
    if (!res.ok) throw coded(res.code, "Claude didn't answer.");
    if (res.value.care) return { result: { outcome: "care" } };
    const v = validateReflect(res.value, {
      date,
      sentDates: new Set(built.sentDates),
      days,
      items: parsed.items,
      atCap: consolidation,
      profile,
      declined: declined.all,
    });
    if (v.ops.length === 0) return { result: { outcome: "none", dropped: v.dropped.length } };

    const rel = proposalRel(date);
    const hash = reflectInputHash(rec);
    return withFileLock(store.abs(rel), async () => {
      let existing: Awaited<ReturnType<typeof readProposal>> = null;
      try {
        existing = await readProposal(date);
      } catch (e) {
        if (isQuarantine(e)) return { result: { outcome: "superseded" } }; // never rewrite a broken hand edit
        throw e;
      }
      if (existing && (!manual || existing.file.ops.some((o) => o.decision !== null))) return { result: { outcome: "superseded" } };
      const file = {
        schema: CURRENT_SCHEMA.proposals,
        id: date,
        created_at: stamp(),
        input_hash: hash,
        base_insights_etag: insightsText === null ? null : etagOf(insightsText),
        status: "pending",
        ops: v.ops.map((o, i) => toFileOp(o, `p-${date}-${i + 1}`)),
      };
      const text = stringifyYaml(file);
      await atomicWrite(store.abs(rel), text);
      reflectFlags += v.ops.filter((o) => o.flag === "suspicious").length;
      git.touch({ kind: "reflect", ref: date }, [rel]);
      const parsedFile = proposalSchema.parse(file);
      return { result: { outcome: "proposed", proposal: proposalJson(parsedFile, etagOf(text)), dropped: v.dropped.length } };
    });
  }

  function toFileOp(o: ValidOp, opId: string): Record<string, unknown> {
    const base: Record<string, unknown> = { op_id: opId, op: o.op };
    if (o.op === "add") Object.assign(base, { text: o.text, evidence: o.evidence });
    else if (o.op === "edit") Object.assign(base, { id: o.id, text: o.text, evidence: o.evidence, base_text: o.base_text });
    else Object.assign(base, { id: o.id, reason: o.reason, evidence: [], base_text: o.base_text });
    if (o.flag) base.flag = o.flag;
    base.decision = null;
    return base;
  }

  function enqueueReflect(date: string, manual: boolean): Job {
    return jobs.enqueue("reflect", `reflect:${date}`, ({ signal }) => runReflect(date, manual, signal));
  }

  // ------------------------------------------------------------ decide

  async function decide(id: string, body: DecideInput, ifMatch: string) {
    if (!isValidDate(id)) throw new ApiError(404, "not_found", "No such suggestion.");
    const rel = proposalRel(id);
    return withFileLock(store.abs(rel), async () => {
      const cur = await readProposal(id); // broken → StoreError 422
      if (!cur) throw new ApiError(404, "not_found", "No such suggestion.");
      if (ifMatch !== cur.etag) throw new StoreError("stale", `${rel} changed since it was loaded`, rel, { current_etag: cur.etag });
      const ops = cur.file.ops;
      // Validate everything before touching anything.
      const plan: { op: ProposalOp; accept: boolean; text?: string }[] = [];
      for (const d of body.decisions) {
        const op = ops.find((o) => o.op_id === d.op_id);
        if (!op) throw new ApiError(400, "bad_request", "Unknown suggestion item.", { op_id: d.op_id });
        if (op.decision !== null) {
          const same = d.accept ? op.decision === "accepted" || op.decision === "stale" : op.decision === "rejected";
          if (!same) throw new ApiError(409, "already_decided", "That suggestion was already decided.", { op_id: d.op_id });
          continue; // repeat → no-op
        }
        if (plan.some((p) => p.op.op_id === op.op_id)) throw new ApiError(400, "bad_request", "Each item once, please.");
        let text: string | undefined;
        if (d.accept && d.text !== undefined && op.op !== "remove") {
          text = sanitizeOpText(d.text);
          if (!text) throw new ApiError(400, "bad_request", "The note is empty.");
        }
        plan.push({ op, accept: d.accept, ...(text !== undefined ? { text } : {}) });
      }

      const insightsAbs = store.abs(insightsRel);
      return withFileLock(insightsAbs, async () => {
        let insightsText: string;
        try {
          insightsText = await readFile(insightsAbs, "utf8");
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          insightsText = "";
        }
        if (plan.length === 0) {
          return { proposal: proposalJson(cur.file, cur.etag), insights: kbJson("insights", insightsText, etagOf(insightsText)), accepted: 0 };
        }
        let parsed = parseInsights(insightsText);
        let nextId = (await maxInsightId(parsed)) + 1;
        const lineOps: LineOp[] = [];
        let accepted = 0;
        const now = stamp();
        for (const p of plan) {
          const op = p.op;
          if (!p.accept) {
            op.decision = "rejected";
            op.decided_at = now;
            continue;
          }
          const finalText = p.text ?? op.text ?? "";
          if (op.op === "add") {
            const newId = formatId(nextId++);
            lineOps.push({ op: "add", id: newId, text: finalText, evidence: op.evidence });
            op.assigned_id = newId;
          } else {
            const target = parsed.items.find((it) => it.id === op.id);
            // Hand-edited since (or gone): never overwrite the user's words (architect-AC11).
            if (!target || target.text !== op.base_text || lineOps.some((l) => l.id === op.id)) {
              op.decision = "stale";
              op.decided_at = now;
              continue;
            }
            if (op.op === "edit") lineOps.push({ op: "edit", id: op.id!, text: finalText, evidence: op.evidence });
            else lineOps.push({ op: "remove", id: op.id! });
          }
          if (p.text !== undefined && p.text !== op.text) {
            op.proposed_text ??= op.text;
            op.text = p.text;
          }
          op.decision = "accepted";
          op.decided_at = now;
          accepted++;
        }
        let newInsights = insightsText;
        if (lineOps.length) {
          newInsights = applyLineOps(insightsText, lineOps);
          await atomicWrite(insightsAbs, newInsights);
          parsed = parseInsights(newInsights);
        }
        if (ops.every((o) => o.decision !== null)) cur.file.status = "decided";
        const out = stringifyYaml(cur.file);
        await atomicWrite(store.abs(rel), out);
        if (accepted > 0) git.touch({ kind: "insights", ref: id, detail: "accepted", count: accepted }, [insightsRel, rel]);
        else git.touch({ kind: "proposal", ref: id, detail: "decided" }, [rel]);
        return {
          proposal: proposalJson(proposalSchema.parse(cur.file), etagOf(out)),
          insights: kbJson("insights", newInsights, etagOf(newInsights)),
          accepted,
        };
      });
    });
  }

  // ------------------------------------------------------------ public API

  return {
    async getKb(nameIn: string) {
      const name = assertKbName(nameIn);
      const rec = await store.readKb(name);
      const content = rec?.content ?? "";
      return kbJson(name, content, rec?.etag ?? etagOf(""));
    },

    async putKb(nameIn: string, content: string, ifMatch: string) {
      const name = assertKbName(nameIn);
      if (content.length > KB_MAX_CHARS) throw new ApiError(400, "too_large", `Notes pages hold at most ${KB_MAX_CHARS} characters.`);
      const before = await store.readKb(name);
      const expected = ifMatch === "*" ? "*" : ifMatch;
      // A missing file has the etag of "" (what GET reports), so accept that as well as "*".
      const effective = before === null && expected === etagOf("") ? "*" : expected;
      // Tester M4 MED-1 / architect-AC16: a hand-edited page is committed BEFORE it can be replaced, so the
      // user's own words stay recoverable from git (mirrors the evening path, today.ts).
      const rel = store.paths.kb(name);
      if (before !== null && before.etag !== store.lastWrittenEtag(rel) && before.content !== content) {
        git.touch({ kind: name === "profile" ? "profile" : "insights", detail: "hand_edit" }, [rel]);
        await git.flush(KB_SNAPSHOT_MS);
      }
      const rec = await store.writeKb(name, content, { expectedEtag: effective });
      if (before?.content !== content) git.touch({ kind: name === "profile" ? "profile" : "insights" }, [store.paths.kb(name)]);
      return kbJson(name, rec.content, rec.etag);
    },

    async profileEmpty(): Promise<boolean> {
      return isEmptyKb(await readKbText("profile"));
    },

    startOnboarding(answers: OnboardingAnswers): Job {
      return jobs.enqueue("onboarding", "onboarding", async ({ signal }) => {
        if (!ai) throw coded("claude_missing", "Claude is off.");
        const built = buildOnboardingPrompt(answers);
        const res = await callAi({
          runner: ai,
          request: { kind: "onboarding", system: built.system, prompt: built.prompt, schema: onboardingJsonSchema, timeoutMs: config.aiTimeoutMs },
          output: aiOnboardingSchema,
          ...(monitor ? { monitor } : {}),
          signal,
          now: stamp,
        });
        if (!res.ok) throw coded(res.code, "Claude didn't answer.");
        const draft = res.value.draft.replace(/\r\n/g, "\n").trim() + "\n";
        return { result: { draft, tone_warnings: onboardingToneWarnings(draft, answers) } };
      });
    },

    /** After an evening save: enqueue reflect only when it can matter (sprint goal 3). */
    async maybeReflect(date: string, rec: DayRecord): Promise<{ job: Job | null; skip: ReflectSkip | null }> {
      // Care first and everywhere (psychologist-AC24): the check is local, so it runs before every gate.
      if (hasCareLanguage(rec)) return { job: null, skip: "care" };
      if (!ai) return { job: null, skip: "ai_off" };
      const t = today();
      if (date !== t && date !== addDays(t, -1)) return { job: null, skip: "not_recent" };
      if (rec.day.private) return { job: null, skip: "private" };
      if (rec.day.satisfaction === null && !rec.highlight.trim() && !rec.notes.trim()) return { job: null, skip: "empty" };
      try {
        if (await readProposal(date)) return { job: null, skip: "exists" };
      } catch (e) {
        if (isQuarantine(e)) return { job: null, skip: "exists" };
        throw e;
      }
      const hash = reflectInputHash(rec);
      if (lastHash.get(date) === hash) return { job: null, skip: "unchanged" };
      if ((await nonPrivateDays(date, 14)) < INSIGHT_LIMITS.minEvidence) return { job: null, skip: "few_days" };
      const active = jobs.active().find((j) => j.key === `reflect:${date}`);
      if (active) return { job: active, skip: null };
      lastHash.set(date, hash);
      return { job: enqueueReflect(date, false), skip: null };
    },

    /** Manual "Try again" (architect-AC4). */
    async startReflect(date: string): Promise<Job> {
      if (!isValidDate(date)) throw new ApiError(400, "bad_request", "Dates look like YYYY-MM-DD.");
      const t = today();
      if (date > t) throw new ApiError(409, "future_date", "That page isn't open yet.");
      if (date < addDays(t, -1)) throw new ApiError(409, "too_old", "Reflections are for today and yesterday.");
      const rec = await store.readDay(date);
      if (!rec) throw new ApiError(404, "not_found", "No ledger page for this date yet.");
      if (rec.day.private) throw new ApiError(409, "private_day", "This page is private.");
      const existing = await readProposal(date);
      if (existing?.file.ops.some((o) => o.decision !== null)) throw new ApiError(409, "already_decided", "This page's notes were already decided.");
      lastHash.set(date, reflectInputHash(rec));
      return enqueueReflect(date, true);
    },

    listProposals,
    async pendingCount(): Promise<number> {
      return (await listProposals("pending")).length;
    },
    async getProposal(date: string): Promise<ProposalJson | null> {
      if (!isValidDate(date)) return null; // architect-AC17: no traversal into other YAML files
      const p = await readProposal(date);
      return p ? proposalJson(p.file, p.etag) : null;
    },
    decide,

    /** Broken proposal files for /api/health (never throws). */
    async scanBroken(): Promise<Warning[]> {
      const out: Warning[] = [];
      for (const d of await proposalDates().catch(() => [] as string[])) {
        try {
          await readProposal(d);
        } catch (e) {
          if (e instanceof StoreError) out.push({ file: e.file ?? proposalRel(d), code: e.code, message: e.message });
          else out.push({ file: proposalRel(d), code: "read_error", message: e instanceof Error ? e.message : String(e) });
        }
      }
      return out;
    },
    reflectFlags: () => reflectFlags,
  };
}

export type KbService = ReturnType<typeof createKbService>;

/** How long a kb PUT waits for the snapshot commit of a hand-edited page. */
const KB_SNAPSHOT_MS = 5_000;
