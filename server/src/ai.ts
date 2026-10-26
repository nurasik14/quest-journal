/**
 * AI engine seam (architecture.md §2.6, sprint M3 G1–G5).
 *
 * - `AiRunner` is the only thing that ever talks to `claude`. Tests inject scripted runners; the real one
 *   (`createClaudeRunner`) spawns `CLAUDE_BIN -p …` with the prompt on stdin, an allowlisted env, an empty
 *   cwd, no tools/settings/MCP, a timeout (SIGTERM → SIGKILL after 5 s) and a 256 KB stdout cap.
 * - `interpret()` turns a raw result into a payload or an error code (the failure table, architect-AC3).
 * - `callAi()` validates with zod + business rules and applies the retry policy: 1 retry on
 *   `timeout|exit_*|ai_error|invalid_output`; never on `claude_missing|claude_not_logged_in|rate_limited`.
 * Nothing here logs prompt text, notes or model output (architect-AC9).
 */
import { chmodSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import type { z } from "zod";
import { childEnv, ConfigError } from "./config";

export type AiKind = "generate_day" | "reroll" | "generate_boss" | "reflect" | "onboarding";

export interface AiRequest {
  kind: AiKind;
  system: string;
  prompt: string;
  /** JSON Schema passed to `--json-schema`. */
  schema: object;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type RawResult =
  | { type: "exit"; exitCode: number; stdout: string; stderr: string; durationMs: number }
  | { type: "enoent"; durationMs: number }
  | { type: "timeout"; durationMs: number }
  | { type: "overflow"; durationMs: number }
  | { type: "aborted"; durationMs: number };

export interface AiRunner {
  run(req: AiRequest): Promise<RawResult>;
  /** Kill every running child (shutdown). */
  killAll?(): void;
  /** Model name recorded in `generation.model`. */
  readonly model: string;
}

export const AI_ERROR_CODES = [
  "claude_missing",
  "claude_not_logged_in",
  "rate_limited",
  "timeout",
  "ai_error",
  "invalid_output",
  "preempted",
] as const;
/** `exit_<n>` codes are dynamic. */
export type AiErrorCode = (typeof AI_ERROR_CODES)[number] | `exit_${number}`;

export const STDOUT_CAP = 256 * 1024;
export const KILL_GRACE_MS = 5_000;

const AUTH_RE = /\b(?:not logged in|please (?:run )?\/?login|log ?in required|invalid api key|authentication(?:_error| failed)?|unauthori[sz]ed|oauth token (?:has )?expired)\b/i;
const RATE_RE = /\b(?:rate[ _-]?limit(?:ed)?|usage limit|limit reached|too many requests|overloaded|quota)\b/i;

// ---------------------------------------------------------------- interpretation

export type Interpreted = { ok: true; payload: unknown } | { ok: false; code: AiErrorCode };

/** Strip one surrounding ```json … ``` fence (and leading/trailing prose lines around it). */
export function stripFences(text: string): string {
  const t = text.trim();
  const m = /```(?:json)?\s*\n?([\s\S]*?)\n?```/i.exec(t);
  return (m ? m[1]! : t).trim();
}

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(stripFences(text));
  } catch {
    return undefined;
  }
}

/** The failure table (architect-AC3). Pure. */
export function interpret(raw: RawResult): Interpreted {
  switch (raw.type) {
    case "enoent":
      return { ok: false, code: "claude_missing" };
    case "timeout":
      return { ok: false, code: "timeout" };
    case "overflow":
      return { ok: false, code: "invalid_output" };
    case "aborted":
      return { ok: false, code: "preempted" };
  }
  const { exitCode, stdout, stderr } = raw;
  let env: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) env = parsed as Record<string, unknown>;
  } catch {
    env = null;
  }
  const resultText = typeof env?.result === "string" ? env.result : "";
  const errorish = exitCode !== 0 || env === null || env.is_error === true || (env.subtype !== undefined && env.subtype !== "success");
  if (errorish) {
    const hay = `${stderr}\n${resultText}\n${env === null ? stdout.slice(0, 4000) : ""}`;
    if (AUTH_RE.test(hay)) return { ok: false, code: "claude_not_logged_in" };
    if (RATE_RE.test(hay)) return { ok: false, code: "rate_limited" };
  }
  if (exitCode !== 0) return { ok: false, code: `exit_${exitCode}` };
  if (env === null) return { ok: false, code: "invalid_output" };
  if (env.type !== undefined && env.type !== "result") return { ok: false, code: "ai_error" };
  if (env.is_error === true || (env.subtype !== undefined && env.subtype !== "success")) return { ok: false, code: "ai_error" };
  // Envelope drift (architect risk 8): prefer structured_output, else the fenced/plain JSON in `result`.
  if (env.structured_output !== undefined && env.structured_output !== null) return { ok: true, payload: env.structured_output };
  const payload = parseJsonLoose(resultText);
  if (payload === undefined) return { ok: false, code: "invalid_output" };
  return { ok: true, payload };
}

export function isRetryable(code: AiErrorCode): boolean {
  return code === "timeout" || code === "ai_error" || code === "invalid_output" || code.startsWith("exit_");
}

// ---------------------------------------------------------------- call with validation + retry

export interface DebugEntry {
  job_kind: AiKind;
  attempt: number;
  duration_ms: number;
  result: RawResult["type"];
  exit_code: number | null;
  code: AiErrorCode | "ok";
  violations: string[];
  tone_warnings: string[];
  stdout_head?: string;
  at: string;
}

/** Status for `/api/health` (codes only, never content) + the DEBUG ring (architect-AC9/13). */
export interface AiMonitor {
  record(e: DebugEntry, raw?: RawResult): void;
  status(): { last_ok_at: string | null; last_error: AiErrorCode | null; tone_warnings: number };
  ring(): DebugEntry[];
}

export function createAiMonitor(opts: { debug: boolean; log?: (m: string) => void; now?: () => string }): AiMonitor {
  const ring: DebugEntry[] = [];
  let lastOk: string | null = null;
  let lastError: AiErrorCode | null = null;
  let tone = 0;
  const log = opts.log ?? ((m: string) => console.warn(`[ai] ${m}`));
  return {
    record(e, raw) {
      if (e.code === "ok") {
        lastOk = e.at;
        lastError = null;
      } else if (e.code !== "preempted") {
        lastError = e.code;
      }
      tone += e.tone_warnings.length;
      // Codes and numbers only (architect-AC9).
      log(`${e.job_kind} attempt ${e.attempt}: ${e.code} in ${e.duration_ms} ms (exit ${e.exit_code ?? "-"})${e.violations.length ? ` rules=${e.violations.join("|")}` : ""}`);
      if (!opts.debug) return;
      const entry = { ...e };
      if (raw?.type === "exit") entry.stdout_head = raw.stdout.slice(0, 2000);
      ring.push(entry);
      while (ring.length > 20) ring.shift();
    },
    status: () => ({ last_ok_at: lastOk, last_error: lastError, tone_warnings: tone }),
    ring: () => ring.map((e) => ({ ...e })),
  };
}

export interface CheckResult {
  violations: string[];
  toneWarnings?: string[];
}

export type CallResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; code: AiErrorCode; attempts: number };

export interface CallOptions<S extends z.ZodType> {
  runner: AiRunner;
  request: Omit<AiRequest, "signal">;
  output: S;
  /** Business rules after zod; any violation → `invalid_output`. */
  check?: (value: z.infer<S>) => CheckResult;
  monitor?: AiMonitor;
  signal?: AbortSignal;
  maxAttempts?: number;
  now?: () => string;
}

/** Run, interpret, validate, retry once. Never throws for AI failures (returns a code instead). */
export async function callAi<S extends z.ZodType>(o: CallOptions<S>): Promise<CallResult<z.infer<S>>> {
  const max = o.maxAttempts ?? 2;
  const now = o.now ?? (() => new Date().toISOString());
  let last: AiErrorCode = "ai_error";
  for (let attempt = 1; attempt <= max; attempt++) {
    if (o.signal?.aborted) return { ok: false, code: "preempted", attempts: attempt - 1 };
    let raw: RawResult;
    try {
      raw = await o.runner.run({ ...o.request, ...(o.signal ? { signal: o.signal } : {}) });
    } catch (e) {
      if (e instanceof ConfigError) throw e; // the test guard must be loud
      raw = { type: "exit", exitCode: 127, stdout: "", stderr: "", durationMs: 0 };
    }
    const base = {
      job_kind: o.request.kind,
      attempt,
      duration_ms: raw.durationMs,
      result: raw.type,
      exit_code: raw.type === "exit" ? raw.exitCode : null,
      at: now(),
    };
    const res = interpret(raw);
    let violations: string[] = [];
    let tone: string[] = [];
    if (res.ok) {
      const parsed = o.output.safeParse(res.payload);
      if (!parsed.success) {
        violations = ["schema"];
      } else {
        const checked = o.check?.(parsed.data) ?? { violations: [] };
        violations = checked.violations;
        tone = checked.toneWarnings ?? [];
        if (violations.length === 0) {
          o.monitor?.record({ ...base, code: "ok", violations, tone_warnings: tone }, raw);
          return { ok: true, value: parsed.data, attempts: attempt };
        }
      }
      last = "invalid_output";
    } else {
      last = res.code;
    }
    o.monitor?.record({ ...base, code: last, violations, tone_warnings: tone }, raw);
    if (last === "preempted" || !isRetryable(last)) return { ok: false, code: last, attempts: attempt };
  }
  return { ok: false, code: last, attempts: max };
}

// ---------------------------------------------------------------- the real runner

export const FIXTURES_DIR = resolve(import.meta.dir, "..", "test", "fixtures");

function within(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Test guard (architect-AC4): under NODE_ENV=test the real runner refuses unless CLAUDE_BIN is a path inside
 * `server/test/fixtures/`. Mirrors the DATA_DIR guard. Throws ConfigError.
 */
export function assertRunnableBin(bin: string, nodeEnv: string = process.env.NODE_ENV ?? ""): void {
  if (nodeEnv !== "test") return;
  if (!bin.includes("/") || !within(resolve(bin), FIXTURES_DIR)) {
    throw new ConfigError(`Refusing to spawn ${JSON.stringify(bin)} under NODE_ENV=test: point CLAUDE_BIN at server/test/fixtures/`);
  }
}

export function claudeArgv(bin: string, model: string, req: Pick<AiRequest, "system" | "schema">): string[] {
  return [
    bin,
    "-p",
    "--output-format",
    "json",
    "--model",
    model,
    "--tools",
    "",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt",
    req.system,
    "--json-schema",
    JSON.stringify(req.schema),
  ];
}

let aiCwdMemo: string | null = null;

/**
 * The claude child's working directory (architect-AC19): `$XDG_RUNTIME_DIR/quest-journal-ai` (per-user, 0700)
 * or, when that's unset, a private `mkdtemp` under `os.tmpdir()`. Never the shared, predictable
 * `/tmp/quest-journal-ai`. Created lazily with mode 0700; memoized per process.
 */
export function defaultAiCwd(env: Record<string, string | undefined> = process.env): string {
  if (aiCwdMemo) return aiCwdMemo;
  const xdg = env.XDG_RUNTIME_DIR;
  aiCwdMemo = xdg && isAbsolute(xdg) ? join(xdg, "quest-journal-ai") : mkdtempSync(join(tmpdir(), "quest-journal-ai-"));
  return aiCwdMemo;
}

/** mkdir -p with 0700, and tighten an existing dir we own to 0700. */
export function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* not ours: claude still runs, the mode stays as it is */
  }
}

export interface ClaudeRunnerOptions {
  bin: string;
  model: string;
  /** Extra env (tests). Always passed through `childEnv()`. */
  env?: Record<string, string>;
  /** Base env to filter (default process.env). */
  baseEnv?: Record<string, string | undefined>;
  cwd?: string;
  nodeEnv?: string;
  killGraceMs?: number;
}

export interface SpawnPlan {
  argv: string[];
  cwd: string;
  env: Record<string, string>;
  stdin: string;
}

export function createClaudeRunner(o: ClaudeRunnerOptions): AiRunner & { plan(req: AiRequest): SpawnPlan } {
  assertRunnableBin(o.bin, o.nodeEnv);
  const cwd = o.cwd ?? defaultAiCwd();
  const grace = o.killGraceMs ?? KILL_GRACE_MS;
  const children = new Set<{ pid: number; kill(sig?: number | NodeJS.Signals): void }>();
  /** Signal the child's whole process group (claude spawns helpers that would otherwise hold the pipes). */
  const signalTree = (c: { pid: number; kill(sig?: number | NodeJS.Signals): void }, sig: NodeJS.Signals) => {
    try {
      process.kill(-c.pid, sig);
    } catch {
      try {
        c.kill(sig);
      } catch {
        /* already gone */
      }
    }
  };

  const plan = (req: AiRequest): SpawnPlan => ({
    argv: claudeArgv(o.bin, o.model, req),
    cwd,
    env: childEnv(o.env ?? {}, o.baseEnv ?? process.env),
    stdin: req.prompt,
  });

  return {
    model: o.model,
    plan,
    killAll() {
      for (const c of children) signalTree(c, "SIGKILL");
    },
    async run(req) {
      assertRunnableBin(o.bin, o.nodeEnv);
      const p = plan(req);
      ensurePrivateDir(p.cwd);
      const t0 = Date.now();
      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(p.argv, {
          cwd: p.cwd,
          env: p.env,
          stdin: new Blob([p.stdin]),
          stdout: "pipe",
          stderr: "pipe",
          // Own process group, so a timeout/abort/shutdown kills the whole tree (no orphans, architect risk 6).
          detached: true,
        } as Parameters<typeof Bun.spawn>[1]);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EACCES" || /ENOENT|not found/i.test(String(e))) return { type: "enoent", durationMs: Date.now() - t0 };
        throw e;
      }
      children.add(proc);
      let outcome: "timeout" | "overflow" | "aborted" | null = null;
      let killTimer: ReturnType<typeof setTimeout> | null = null;
      const terminate = (why: "timeout" | "overflow" | "aborted") => {
        if (outcome) return;
        outcome = why;
        signalTree(proc, "SIGTERM");
        killTimer = setTimeout(() => signalTree(proc, "SIGKILL"), grace);
      };
      const timer = setTimeout(() => terminate("timeout"), req.timeoutMs);
      const onAbort = () => terminate("aborted");
      if (req.signal?.aborted) onAbort();
      req.signal?.addEventListener("abort", onAbort, { once: true });

      const readCapped = async (stream: ReadableStream<Uint8Array>, cap: number, enforce: boolean): Promise<string> => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        const reader = stream.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > cap) {
            if (enforce) terminate("overflow");
            continue; // keep draining so the child can exit
          }
          chunks.push(value);
        }
        return Buffer.concat(chunks).toString("utf8");
      };
      // Hard deadline: a grandchild holding the pipes open can't keep this promise pending forever.
      let hardTimer: ReturnType<typeof setTimeout> | null = null;
      const hard = new Promise<"hard">((r) => {
        hardTimer = setTimeout(() => r("hard"), req.timeoutMs + grace + 2_000);
      });
      try {
        const all = Promise.all([
          readCapped(proc.stdout as ReadableStream<Uint8Array>, STDOUT_CAP, true),
          readCapped(proc.stderr as ReadableStream<Uint8Array>, 64 * 1024, false),
          proc.exited,
        ]);
        const settled = await Promise.race([all, hard]);
        const durationMs = Date.now() - t0;
        if (settled === "hard") {
          terminate("timeout");
          return { type: outcome ?? "timeout", durationMs };
        }
        const [stdout, stderr, exitCode] = settled;
        if (outcome) return { type: outcome, durationMs };
        return { type: "exit", exitCode, stdout, stderr, durationMs };
      } finally {
        if (hardTimer) clearTimeout(hardTimer);
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        req.signal?.removeEventListener("abort", onAbort);
        children.delete(proc);
      }
    },
  };
}

/** Runner used when AI is off: every call reports `claude_missing` instantly (never spawns). */
export function disabledRunner(): AiRunner {
  return { model: "none", run: async () => ({ type: "enoent", durationMs: 0 }) };
}
