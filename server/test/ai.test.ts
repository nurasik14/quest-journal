/** Sprint M3 G1–G5: the claude -p runner seam, failure table, retry policy, env allowlist, test guard, logs. */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  defaultAiCwd,
  assertRunnableBin,
  callAi,
  claudeArgv,
  createAiMonitor,
  createClaudeRunner,
  interpret,
  isRetryable,
  stripFences,
  type RawResult,
} from "../src/ai";
import { childEnv, ConfigError } from "../src/config";
import { envelope, scriptedRunner } from "./helpers";

const FAKE = resolve(import.meta.dir, "fixtures", "fake-claude.sh");
const exit = (exitCode: number, stdout = "", stderr = ""): RawResult => ({ type: "exit", exitCode, stdout, stderr, durationMs: 1 });

describe("interpret: the failure table (architect-AC3)", () => {
  const cases: [string, RawResult, string][] = [
    ["ENOENT", { type: "enoent", durationMs: 0 }, "claude_missing"],
    ["timeout", { type: "timeout", durationMs: 60_000 }, "timeout"],
    ["stdout over cap", { type: "overflow", durationMs: 1 }, "invalid_output"],
    ["aborted (preempted)", { type: "aborted", durationMs: 1 }, "preempted"],
    ["exit 1", exit(1, "", "boom"), "exit_1"],
    ["exit 137", exit(137), "exit_137"],
    ["auth text in stderr", exit(1, "", "Error: not logged in. Please run /login"), "claude_not_logged_in"],
    ["auth in is_error envelope", exit(1, JSON.stringify({ type: "result", is_error: true, result: "Invalid API key · Please run /login" })), "claude_not_logged_in"],
    ["usage limit", exit(1, JSON.stringify({ type: "result", is_error: true, result: "Claude usage limit reached. Resets at 5pm" })), "rate_limited"],
    ["is_error envelope", exit(0, JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "" })), "ai_error"],
    ["prose", exit(0, JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Sorry, no JSON." })), "invalid_output"],
    ["not JSON at all", exit(0, "hello"), "invalid_output"],
  ];
  for (const [name, raw, code] of cases) {
    test(name, () => {
      const r = interpret(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe(code as never);
    });
  }

  test("structured_output wins; fenced JSON in result is accepted (envelope drift)", () => {
    expect(interpret(envelope({ a: 1 }))).toEqual({ ok: true, payload: { a: 1 } });
    expect(interpret(envelope({ a: 2 }, { asResultText: true }))).toEqual({ ok: true, payload: { a: 2 } });
    expect(interpret(envelope({ a: 3 }, { asResultText: true, fence: true }))).toEqual({ ok: true, payload: { a: 3 } });
    expect(stripFences("```json\n{\"x\":1}\n```")).toBe('{"x":1}');
  });

  test("retry decisions", () => {
    for (const c of ["timeout", "ai_error", "invalid_output", "exit_1"] as const) expect(isRetryable(c)).toBe(true);
    for (const c of ["claude_missing", "claude_not_logged_in", "rate_limited", "preempted"] as const) expect(isRetryable(c)).toBe(false);
  });
});

describe("callAi: validation and retry policy", () => {
  const schema = z.object({ n: z.number() });
  const request = { kind: "generate_day" as const, system: "s", prompt: "p", schema: {}, timeoutMs: 1000 };

  test("1 retry on invalid output, then success", async () => {
    const r = scriptedRunner([envelope({ n: "x" }), envelope({ n: 2 })]);
    const res = await callAi({ runner: r, request, output: schema });
    expect(res).toEqual({ ok: true, value: { n: 2 }, attempts: 2 });
  });

  test("business-rule violation counts as invalid_output and is retried; 2 failures → code", async () => {
    const r = scriptedRunner([envelope({ n: 1 })]);
    const res = await callAi({ runner: r, request, output: schema, check: () => ({ violations: ["nope"] }) });
    expect(res).toEqual({ ok: false, code: "invalid_output", attempts: 2 });
    expect(r.calls).toHaveLength(2);
  });

  for (const [raw, code] of [
    [{ type: "enoent", durationMs: 0 }, "claude_missing"],
    [exit(1, "", "Please run /login"), "claude_not_logged_in"],
    [exit(1, "", "rate limit exceeded"), "rate_limited"],
  ] as const) {
    test(`no retry on ${code}`, async () => {
      const r = scriptedRunner([raw as RawResult, envelope({ n: 1 })]);
      const res = await callAi({ runner: r, request, output: schema });
      expect(res).toEqual({ ok: false, code: code as never, attempts: 1 });
      expect(r.calls).toHaveLength(1);
    });
  }

  test("timeout then exit_1 → 2 attempts, last code", async () => {
    const r = scriptedRunner([{ type: "timeout", durationMs: 1 }, exit(1)]);
    expect(await callAi({ runner: r, request, output: schema })).toEqual({ ok: false, code: "exit_1", attempts: 2 });
  });

  test("tone warnings are counted but never retried", async () => {
    const mon = createAiMonitor({ debug: false, log: () => {} });
    const r = scriptedRunner([envelope({ n: 1 })]);
    const res = await callAi({ runner: r, request, output: schema, monitor: mon, check: () => ({ violations: [], toneWarnings: ["tone:0"] }) });
    expect(res.ok).toBe(true);
    expect(r.calls).toHaveLength(1);
    expect(mon.status().tone_warnings).toBe(1);
  });

  test("logs carry codes only; the ring keeps output only with DEBUG=1 (architect-AC9)", async () => {
    const logs: string[] = [];
    const mon = createAiMonitor({ debug: false, log: (m) => logs.push(m) });
    const r = scriptedRunner([envelope({ n: "ZZOUTPUT" }), envelope({ n: 1 })]);
    await callAi({ runner: r, request: { ...request, prompt: "ZZPROMPT notes" }, output: schema, monitor: mon });
    expect(logs.join("\n")).not.toMatch(/ZZOUTPUT|ZZPROMPT/);
    expect(logs).toHaveLength(2);
    expect(mon.ring()).toEqual([]);
    expect(mon.status().last_ok_at).not.toBeNull();
    const dbg = createAiMonitor({ debug: true, log: () => {} });
    await callAi({ runner: scriptedRunner([envelope({ n: 1 })]), request, output: schema, monitor: dbg });
    expect(dbg.ring()).toHaveLength(1);
    expect(dbg.ring()[0]!.stdout_head).toContain('"n":1');
  });
});

describe("childEnv allowlist (architect-AC2)", () => {
  test("strips API keys, Claude session vars and unrelated secrets; keeps the basics", () => {
    const env = childEnv(
      { EXTRA: "1" },
      {
        PATH: "/bin",
        HOME: "/home/x",
        USER: "x",
        LANG: "C.UTF-8",
        LC_ALL: "C",
        XDG_CONFIG_HOME: "/c",
        TERM: "xterm",
        ANTHROPIC_API_KEY: "sk-test",
        ANTHROPIC_BASE_URL: "http://evil",
        CLAUDECODE: "1",
        CLAUDE_CODE_ENTRYPOINT: "cli",
        CLAUDE_CODE_USE_BEDROCK: "1",
        SECRET_X: "1",
        AWS_SECRET_ACCESS_KEY: "a",
      },
    );
    expect(Object.keys(env).sort()).toEqual(["EXTRA", "HOME", "LANG", "LC_ALL", "PATH", "TERM", "USER", "XDG_CONFIG_HOME"]);
  });
});

describe("real runner (spawn path, fake-claude.sh)", () => {
  test("argv: exact flag set, prompt not in argv, no --bare; cwd is the empty tmp dir (architect-AC1)", () => {
    const r = createClaudeRunner({ bin: FAKE, model: "sonnet" });
    const plan = r.plan({ kind: "generate_day", system: "SYS", prompt: "SECRET PROMPT TEXT", schema: { type: "object" }, timeoutMs: 1000 });
    expect(plan.argv).toEqual(claudeArgv(FAKE, "sonnet", { system: "SYS", schema: { type: "object" } }));
    expect(plan.argv.slice(1)).toEqual([
      "-p", "--output-format", "json", "--model", "sonnet", "--tools", "", "--setting-sources", "",
      "--strict-mcp-config", "--no-session-persistence", "--system-prompt", "SYS", "--json-schema", '{"type":"object"}',
    ]);
    expect(plan.argv.join(" ")).not.toContain("SECRET PROMPT");
    expect(plan.argv).not.toContain("--bare");
    expect(plan.stdin).toBe("SECRET PROMPT TEXT");
    expect(plan.cwd).toBe(defaultAiCwd());
  });

  test("test guard: bins outside server/test/fixtures are refused under NODE_ENV=test (architect-AC4)", () => {
    expect(() => assertRunnableBin("claude", "test")).toThrow(ConfigError);
    expect(() => assertRunnableBin("/home/x/.local/bin/claude", "test")).toThrow(ConfigError);
    expect(() => createClaudeRunner({ bin: "claude", model: "sonnet" })).toThrow(ConfigError);
    expect(() => assertRunnableBin(FAKE, "test")).not.toThrow();
    expect(() => assertRunnableBin("claude", "production")).not.toThrow();
  });

  async function runFake(mode: string, extra: Record<string, string> = {}, timeoutMs = 10_000, prompt = "hello prompt") {
    const dir = await mkdtemp(join(tmpdir(), "qj-fake-"));
    const log = join(dir, "log");
    const r = createClaudeRunner({
      bin: FAKE,
      model: "sonnet",
      env: { FAKE_CLAUDE_MODE: mode, FAKE_CLAUDE_LOG: log, ...extra },
      baseEnv: { ...process.env, ANTHROPIC_API_KEY: "sk-test", SECRET_X: "1", CLAUDECODE: "1" },
      killGraceMs: 500,
    });
    const raw = await r.run({ kind: "generate_day", system: "sys", prompt, schema: {}, timeoutMs });
    return { raw, log: await readFile(log, "utf8").catch(() => "") };
  }

  test("ok: prompt via stdin, envelope parsed", async () => {
    const { raw, log } = await runFake("ok", {}, 10_000, "x".repeat(1234));
    expect(raw.type).toBe("exit");
    const r = interpret(raw);
    expect(r.ok).toBe(true);
    expect(log).toContain("|1234|"); // stdin length, the prompt itself never logged
    expect(log).toContain(defaultAiCwd());
  });

  test("env reaching the child has no API key, no CLAUDECODE, no secrets", async () => {
    const { raw } = await runFake("env");
    expect(raw.type).toBe("exit");
    const keys = raw.type === "exit" ? (JSON.parse(raw.stdout).result as string) : "";
    expect(keys).toContain("PATH,");
    expect(keys).not.toMatch(/ANTHROPIC|CLAUDECODE|SECRET_X/);
  });

  test("exit 1 / auth / prose / big", async () => {
    expect(interpret((await runFake("exit1")).raw)).toEqual({ ok: false, code: "exit_1" });
    expect(interpret((await runFake("auth")).raw)).toEqual({ ok: false, code: "claude_not_logged_in" });
    expect(interpret((await runFake("prose")).raw)).toEqual({ ok: false, code: "invalid_output" });
    expect((await runFake("big")).raw.type).toBe("overflow");
  });

  test("ENOENT → claude_missing", async () => {
    const r = createClaudeRunner({ bin: join(resolve(import.meta.dir, "fixtures"), "does-not-exist"), model: "sonnet" });
    const raw = await r.run({ kind: "generate_day", system: "s", prompt: "p", schema: {}, timeoutMs: 1000 });
    expect(interpret(raw)).toEqual({ ok: false, code: "claude_missing" });
  });

  test("timeout: SIGTERM, then SIGKILL for a child that ignores TERM; bounded", async () => {
    const t0 = Date.now();
    const { raw } = await runFake("hang_ok", {}, 400);
    expect(raw.type).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(400 + 500 + 2_500);
  });

  test("abort signal kills the child (preemption)", async () => {
    const r = createClaudeRunner({ bin: FAKE, model: "sonnet", env: { FAKE_CLAUDE_MODE: "sleep", FAKE_CLAUDE_SLEEP: "5" }, killGraceMs: 300 });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);
    const t0 = Date.now();
    const raw = await r.run({ kind: "generate_boss", system: "s", prompt: "p", schema: {}, timeoutMs: 10_000, signal: ac.signal });
    expect(raw.type).toBe("aborted");
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  test("FAKE_CLAUDE_OUT payload file is honoured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qj-fake-"));
    const out = join(dir, "out.json");
    await writeFile(out, '{"hello":"world"}');
    const { raw } = await runFake("ok", { FAKE_CLAUDE_OUT: out });
    expect(interpret(raw)).toEqual({ ok: true, payload: { hello: "world" } });
  });
});
