/** HTTP AI providers (Anthropic API, Ollama, OpenAI-compatible): request shape, reply parsing, error mapping. */
import { afterAll, describe, expect, test } from "bun:test";
import { callAi, interpret, type AiRequest } from "../src/ai";
import {
  createAnthropicRunner,
  createOllamaRunner,
  createOpenAiRunner,
  stripThinking,
  systemWithSchema,
} from "../src/ai-http";
import { aiAvailability, aiStartupLine } from "../src/app";
import { loadConfig } from "../src/config";
import { z } from "zod";
import { makeTempDataDir, cleanupTempDirs } from "./helpers";

afterAll(cleanupTempDirs);

const schema = { type: "object", required: ["quests"], properties: { quests: { type: "array" } } };
const req: AiRequest = { kind: "generate_day", system: "SYS", prompt: "PROMPT", schema, timeoutMs: 5_000 };
const answer = { quests: [{ title: "Walk" }] };

interface Seen {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/** A scripted fetch: each call gets the next response (status + body); every request is recorded. */
function scripted(replies: { status?: number; body: unknown }[]) {
  const seen: Seen[] = [];
  let i = 0;
  const f = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    const r = replies[Math.min(i++, replies.length - 1)]!;
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, seen };
}

describe("helpers", () => {
  test("stripThinking drops <think> blocks", () => {
    expect(stripThinking("<think>hmm</think>\n{\"a\":1}")).toBe('{"a":1}');
    expect(stripThinking("reasoning...</think>{\"a\":1}")).toBe('{"a":1}');
  });
  test("systemWithSchema carries the schema in the prompt", () => {
    const s = systemWithSchema("SYS", schema);
    expect(s.startsWith("SYS")).toBe(true);
    expect(s).toContain(JSON.stringify(schema));
  });
});

describe("Ollama runner", () => {
  test("native /api/chat with format=schema, think=false and num_ctx; parses message.content", async () => {
    const { f, seen } = scripted([{ body: { message: { role: "assistant", content: JSON.stringify(answer) } } }]);
    const r = createOllamaRunner({ baseUrl: "http://localhost:11434/v1/", model: "qwen2.5:7b", numCtx: 8192, fetchImpl: f });
    const out = interpret(await r.run(req));
    expect(out).toEqual({ ok: true, payload: answer });
    expect(seen[0]!.url).toBe("http://localhost:11434/api/chat");
    expect(seen[0]!.body.format).toEqual(schema);
    expect(seen[0]!.body.think).toBe(false);
    expect(seen[0]!.body.stream).toBe(false);
    expect((seen[0]!.body.options as { num_ctx: number }).num_ctx).toBe(8192);
    expect(seen[0]!.headers.get("authorization")).toBeNull();
  });

  test("a 400 (e.g. `think` unsupported) retries once without `think`", async () => {
    const { f, seen } = scripted([{ status: 400, body: { error: "does not support thinking" } }, { body: { message: { content: JSON.stringify(answer) } } }]);
    const out = interpret(await createOllamaRunner({ baseUrl: "http://x", model: "m", fetchImpl: f }).run(req));
    expect(out.ok).toBe(true);
    expect(seen.length).toBe(2);
    expect("think" in seen[1]!.body).toBe(false);
  });

  test("json mode sends format=json; fenced and <think>-prefixed replies still parse", async () => {
    const { f, seen } = scripted([{ body: { message: { content: "<think>x</think>\n```json\n" + JSON.stringify(answer) + "\n```" } } }]);
    const out = interpret(await createOllamaRunner({ baseUrl: "http://x", model: "m", jsonMode: "json", fetchImpl: f }).run(req));
    expect(out).toEqual({ ok: true, payload: answer });
    expect(seen[0]!.body.format).toBe("json");
  });

  test("connection refused → claude_missing (pool, no retry)", async () => {
    const f = (async () => {
      throw Object.assign(new Error("Unable to connect. Is the computer able to access the url?"), { code: "ConnectionRefused" });
    }) as unknown as typeof fetch;
    const raw = await createOllamaRunner({ baseUrl: "http://x", model: "m", fetchImpl: f }).run(req);
    expect(raw.type).toBe("enoent");
    expect(interpret(raw)).toEqual({ ok: false, code: "claude_missing" });
  });

  test("a non-JSON reply → invalid_output", async () => {
    const { f } = scripted([{ body: { message: { content: "Sure! Here are your quests: walk, read." } } }]);
    expect(interpret(await createOllamaRunner({ baseUrl: "http://x", model: "m", fetchImpl: f }).run(req))).toEqual({ ok: false, code: "invalid_output" });
  });
});

describe("OpenAI-compatible runner", () => {
  test("chat/completions with bearer key and json_schema; parses choices[0].message.content", async () => {
    const { f, seen } = scripted([{ body: { choices: [{ message: { content: JSON.stringify(answer) } }] } }]);
    const r = createOpenAiRunner({ baseUrl: "https://api.groq.com/openai/v1", model: "llama", apiKey: "k-123", fetchImpl: f });
    expect(interpret(await r.run(req))).toEqual({ ok: true, payload: answer });
    expect(seen[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer k-123");
    expect((seen[0]!.body.response_format as { type: string }).type).toBe("json_schema");
    const msgs = seen[0]!.body.messages as { role: string; content: string }[];
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]).toEqual({ role: "user", content: "PROMPT" });
  });

  test("json_schema rejected (400) → one retry with json_object", async () => {
    const { f, seen } = scripted([{ status: 400, body: { error: { message: "response_format json_schema not supported" } } }, { body: { choices: [{ message: { content: JSON.stringify(answer) } }] } }]);
    expect(interpret(await createOpenAiRunner({ baseUrl: "http://x/v1", model: "m", fetchImpl: f }).run(req)).ok).toBe(true);
    expect((seen[1]!.body.response_format as { type: string }).type).toBe("json_object");
  });

  test("off mode sends no response_format", async () => {
    const { f, seen } = scripted([{ body: { choices: [{ message: { content: JSON.stringify(answer) } }] } }]);
    await createOpenAiRunner({ baseUrl: "http://x/v1", model: "m", jsonMode: "off", fetchImpl: f }).run(req);
    expect("response_format" in seen[0]!.body).toBe(false);
  });

  test("401 → claude_not_logged_in, 429 → rate_limited, 500 → exit_1 (retryable)", async () => {
    const run = async (status: number) => interpret(await createOpenAiRunner({ baseUrl: "http://x", model: "m", jsonMode: "off", fetchImpl: scripted([{ status, body: { error: "nope" } }]).f }).run(req));
    expect(await run(401)).toEqual({ ok: false, code: "claude_not_logged_in" });
    expect(await run(429)).toEqual({ ok: false, code: "rate_limited" });
    expect(await run(500)).toEqual({ ok: false, code: "exit_1" });
  });
});

describe("Anthropic runner", () => {
  test("/v1/messages with x-api-key, version header and output_config json_schema", async () => {
    const { f, seen } = scripted([{ body: { content: [{ type: "text", text: JSON.stringify(answer) }] } }]);
    const r = createAnthropicRunner({ baseUrl: "https://api.anthropic.com/", model: "claude-sonnet-5", apiKey: "sk-ant-test", fetchImpl: f });
    expect(interpret(await r.run(req))).toEqual({ ok: true, payload: answer });
    expect(seen[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(seen[0]!.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(seen[0]!.headers.get("anthropic-version")).toBe("2023-06-01");
    expect(seen[0]!.body.output_config).toEqual({ format: { type: "json_schema", schema } });
    expect(seen[0]!.body.messages).toEqual([{ role: "user", content: "PROMPT" }]);
  });

  test("schema rejected (400) → one retry without output_config; thinking blocks are ignored", async () => {
    const { f, seen } = scripted([
      { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "schema keyword not supported" } } },
      { body: { content: [{ type: "thinking", thinking: "..." }, { type: "text", text: JSON.stringify(answer) }] } },
    ]);
    expect(interpret(await createAnthropicRunner({ baseUrl: "http://x", model: "m", apiKey: "k", fetchImpl: f }).run(req))).toEqual({ ok: true, payload: answer });
    expect("output_config" in seen[1]!.body).toBe(false);
  });

  test("529 overloaded → rate_limited", async () => {
    const { f } = scripted([{ status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }]);
    expect(interpret(await createAnthropicRunner({ baseUrl: "http://x", model: "m", apiKey: "k", fetchImpl: f }).run(req))).toEqual({ ok: false, code: "rate_limited" });
  });
});

describe("timeouts and aborts", () => {
  const hang = (async (_u: string, init: RequestInit) =>
    new Promise((_, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;

  test("timeout → timeout", async () => {
    const raw = await createOpenAiRunner({ baseUrl: "http://x", model: "m", fetchImpl: hang }).run({ ...req, timeoutMs: 30 });
    expect(raw.type).toBe("timeout");
  });

  test("caller abort → preempted", async () => {
    const ctrl = new AbortController();
    const p = createOllamaRunner({ baseUrl: "http://x", model: "m", fetchImpl: hang }).run({ ...req, signal: ctrl.signal });
    ctrl.abort();
    expect(interpret(await p)).toEqual({ ok: false, code: "preempted" });
  });
});

describe("callAi end to end over an HTTP runner", () => {
  test("zod validation + one retry on a bad first answer", async () => {
    const { f, seen } = scripted([{ body: { message: { content: "{\"wrong\":true}" } } }, { body: { message: { content: JSON.stringify(answer) } } }]);
    const res = await callAi({
      runner: createOllamaRunner({ baseUrl: "http://x", model: "m", fetchImpl: f }),
      request: req,
      output: z.object({ quests: z.array(z.object({ title: z.string() })) }),
    });
    expect(res).toEqual({ ok: true, value: answer, attempts: 2 });
    expect(seen.length).toBe(2);
  });
});

describe("config + startup line", () => {
  test("defaults stay on the claude CLI with no key", async () => {
    const dir = await makeTempDataDir();
    const c = loadConfig({ NODE_ENV: "test", DATA_DIR: dir, ANTHROPIC_API_KEY: "sk-ant-should-not-be-used" });
    expect(c.aiProvider).toBe("claude-cli");
    expect(c.aiModel).toBe("sonnet");
    expect(c.aiApiKey).toBeNull();
    expect(c.aiBaseUrl).toBeNull();
  });

  test("ollama: local URL, longer timeout, no key", async () => {
    const dir = await makeTempDataDir();
    const c = loadConfig({ NODE_ENV: "test", DATA_DIR: dir, AI_PROVIDER: "Ollama", AI_MODEL: "llama3.2:3b" });
    expect(c.aiProvider).toBe("ollama");
    expect(c.aiBaseUrl).toBe("http://localhost:11434");
    expect(c.aiModel).toBe("llama3.2:3b");
    expect(c.aiTimeoutMs).toBe(180_000);
    expect(c.ollamaNumCtx).toBe(16_384);
  });

  test("anthropic picks up ANTHROPIC_API_KEY; AI_API_KEY wins; openai reads OPENAI_API_KEY", async () => {
    const dir = await makeTempDataDir();
    expect(loadConfig({ NODE_ENV: "test", DATA_DIR: dir, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a" }).aiApiKey).toBe("a");
    expect(loadConfig({ NODE_ENV: "test", DATA_DIR: dir, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a", AI_API_KEY: "b" }).aiApiKey).toBe("b");
    const o = loadConfig({ NODE_ENV: "test", DATA_DIR: dir, AI_PROVIDER: "openai", OPENAI_API_KEY: "o", AI_BASE_URL: "https://openrouter.ai/api/v1" });
    expect(o.aiApiKey).toBe("o");
    expect(o.aiBaseUrl).toBe("https://openrouter.ai/api/v1");
  });

  test("unknown provider / json mode fail loudly", async () => {
    const dir = await makeTempDataDir();
    expect(() => loadConfig({ NODE_ENV: "test", DATA_DIR: dir, AI_PROVIDER: "gpt" })).toThrow(/AI_PROVIDER/);
    expect(() => loadConfig({ NODE_ENV: "test", DATA_DIR: dir, AI_JSON_MODE: "yaml" })).toThrow(/AI_JSON_MODE/);
  });

  test("availability and startup line per provider", () => {
    const base = { claudeBin: "claude", claudeBinResolved: null, aiTimeoutMs: 1000 };
    expect(aiAvailability({ ...base, aiProvider: "anthropic", aiApiKey: null })).toEqual({ available: false, reason: "api_key_missing" });
    expect(aiAvailability({ ...base, aiProvider: "ollama", aiApiKey: null }).available).toBe(true);
    expect(aiStartupLine({ model: "m" }, { ...base, aiProvider: "anthropic", aiApiKey: null })).toContain("NOT SET");
    expect(aiStartupLine({ model: "qwen" }, { ...base, aiProvider: "ollama", aiBaseUrl: "http://localhost:11434" })).toBe(
      "ollama at http://localhost:11434, model qwen, timeout 1000 ms",
    );
  });
});
