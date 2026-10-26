/**
 * HTTP AI runners: the Anthropic API (your own key), Ollama (local, free) and any OpenAI-compatible endpoint
 * (OpenAI, OpenRouter, Groq, Google Gemini, LM Studio, llama.cpp server, vLLM...).
 *
 * They plug into the same `AiRunner` seam as the `claude -p` runner. Each one turns its HTTP reply into the
 * `RawResult` shape `interpret()` already understands (a claude-style JSON envelope on "stdout"), so retries,
 * zod validation, business rules, pool fallback and the health monitor all work unchanged:
 *
 * - 2xx with JSON           → exit 0, `{type:"result", subtype:"success", structured_output}`
 * - 2xx with non-JSON text  → exit 0, `{..., result: text}` → `invalid_output` (retried once)
 * - 401/403                 → exit 1 + "authentication failed" → `claude_not_logged_in` (no retry, pool)
 * - 429 / quota / overload  → exit 1 + "rate limit" → `rate_limited` (no retry, pool)
 * - other HTTP errors       → exit 1 → `exit_1` (retried once)
 * - connection refused/DNS  → `enoent` → `claude_missing` (no retry, pool)
 * - timeout / abort         → `timeout` / `aborted`
 *
 * Like the CLI runner, nothing here logs prompt text or model output.
 */
import type { AiRequest, AiRunner, RawResult } from "./ai";

export type AiProvider = "claude-cli" | "anthropic" | "ollama" | "openai";
export const AI_PROVIDERS: readonly AiProvider[] = ["claude-cli", "anthropic", "ollama", "openai"];

/** `schema` = send the JSON Schema (strict structured output), `json` = plain JSON mode, `off` = prompt only. */
export type JsonMode = "schema" | "json" | "off";
export const JSON_MODES: readonly JsonMode[] = ["schema", "json", "off"];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  "claude-cli": "sonnet",
  anthropic: "claude-sonnet-5",
  ollama: "qwen3.5",
  openai: "gpt-4o-mini",
};

export const DEFAULT_BASE_URLS: Record<Exclude<AiProvider, "claude-cli">, string> = {
  anthropic: "https://api.anthropic.com",
  ollama: "http://localhost:11434",
  openai: "https://api.openai.com/v1",
};

const MAX_BODY = 256 * 1024;

export interface HttpRunnerOptions {
  baseUrl: string;
  model: string;
  apiKey?: string | null;
  jsonMode?: JsonMode;
  /** Ollama only: context window in tokens (Ollama's default is far too small for the quest prompt). */
  numCtx?: number;
  maxTokens?: number;
  temperature?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

/** HTTP runners only: the schema has to travel inside the prompt too, because many models ignore `format`. */
export function systemWithSchema(system: string, schema: object): string {
  return (
    `${system}\n\nReply with ONE JSON object and nothing else: no prose, no markdown fences, no comments.` +
    ` It must match this JSON Schema exactly:\n${JSON.stringify(schema)}`
  );
}

/** Remove reasoning blocks some local models print before the answer (`<think>…</think>`). */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

function parseJson(text: string): unknown {
  const t = stripThinking(text);
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)\n?```/i.exec(t);
  const body = (fenced ? fenced[1]! : t).trim();
  try {
    return JSON.parse(body);
  } catch {
    // Last resort: the outermost {...} in the reply.
    const a = body.indexOf("{");
    const b = body.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(body.slice(a, b + 1));
      } catch {
        /* fall through */
      }
    }
    return undefined;
  }
}

function ok(text: string, durationMs: number): RawResult {
  const parsed = parseJson(text);
  const env =
    parsed !== undefined && parsed !== null && typeof parsed === "object"
      ? { type: "result", subtype: "success", is_error: false, structured_output: parsed }
      : { type: "result", subtype: "success", is_error: false, result: stripThinking(text).slice(0, 4000) };
  return { type: "exit", exitCode: 0, stdout: JSON.stringify(env), stderr: "", durationMs };
}

/** Map an HTTP failure onto the words `interpret()` looks for. Never includes the request. */
function httpError(status: number, body: string, durationMs: number): RawResult {
  let hint = `http ${status}`;
  if (status === 401 || status === 403) hint += " authentication failed (check your API key)";
  else if (status === 429 || /rate.?limit|quota|overloaded|too many requests/i.test(body)) hint += " rate limit reached";
  else if (status === 529 || status === 503) hint += " overloaded";
  const env = { type: "result", subtype: "error", is_error: true, result: `${hint}: ${body.slice(0, 300)}` };
  return { type: "exit", exitCode: 1, stdout: JSON.stringify(env), stderr: hint, durationMs };
}

function isConnectError(e: unknown): boolean {
  const s = `${(e as { code?: string })?.code ?? ""} ${String(e)}`;
  return /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ConnectionRefused|Unable to connect|FailedToOpenSocket|getaddrinfo/i.test(s);
}

async function readCapped(res: Response): Promise<string | null> {
  const text = await res.text();
  return text.length > MAX_BODY ? null : text;
}

type Extract = (body: unknown) => string | null;

function createHttpRunner(
  model: string,
  build: (req: AiRequest, attempt: number) => { url: string; headers: Record<string, string>; body: unknown },
  extract: Extract,
  fetchImpl: typeof fetch,
  /** Optional second try with a simpler body when the first one is rejected as a bad request (400/422). */
  hasFallbackBody = false,
): AiRunner {
  const controllers = new Set<AbortController>();
  return {
    model,
    killAll() {
      for (const c of controllers) c.abort();
    },
    async run(req) {
      const t0 = Date.now();
      const ctrl = new AbortController();
      controllers.add(ctrl);
      let why: "timeout" | "aborted" | null = null;
      const timer = setTimeout(() => {
        why = "timeout";
        ctrl.abort();
      }, req.timeoutMs);
      const onAbort = () => {
        why ??= "aborted";
        ctrl.abort();
      };
      if (req.signal?.aborted) onAbort();
      req.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        for (let attempt = 0; ; attempt++) {
          const r = build(req, attempt);
          const res = await fetchImpl(r.url, {
            method: "POST",
            headers: { "content-type": "application/json", ...r.headers },
            body: JSON.stringify(r.body),
            signal: ctrl.signal,
          });
          const text = await readCapped(res);
          const durationMs = Date.now() - t0;
          if (text === null) return { type: "overflow", durationMs };
          if (!res.ok) {
            if (hasFallbackBody && attempt === 0 && (res.status === 400 || res.status === 422)) continue;
            return httpError(res.status, text, durationMs);
          }
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            return ok(text, durationMs);
          }
          const content = extract(json);
          if (content === null) {
            const env = { type: "result", subtype: "error", is_error: true, result: "no content in the reply" };
            return { type: "exit", exitCode: 0, stdout: JSON.stringify(env), stderr: "", durationMs };
          }
          return ok(content, durationMs);
        }
      } catch (e) {
        const durationMs = Date.now() - t0;
        if (why) return { type: why, durationMs };
        if (isConnectError(e)) return { type: "enoent", durationMs };
        return { type: "exit", exitCode: 1, stdout: "", stderr: String(e).slice(0, 200), durationMs };
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener("abort", onAbort);
        controllers.delete(ctrl);
      }
    },
  };
}

const trimSlash = (u: string) => u.replace(/\/+$/, "");
const bearer = (key: string | null | undefined): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {});

// ---------------------------------------------------------------- Anthropic Messages API

/**
 * `POST /v1/messages` with your own `ANTHROPIC_API_KEY` (billed per token). Uses structured outputs
 * (`output_config.format`) when `jsonMode` is `schema`; if the API rejects the schema (400), it retries once
 * with the schema in the prompt only.
 */
export function createAnthropicRunner(o: HttpRunnerOptions): AiRunner {
  const base = trimSlash(o.baseUrl);
  const mode = o.jsonMode ?? "schema";
  return createHttpRunner(
    o.model,
    (req, attempt) => ({
      url: `${base}/v1/messages`,
      headers: { "x-api-key": o.apiKey ?? "", "anthropic-version": "2023-06-01" },
      body: {
        model: o.model,
        max_tokens: o.maxTokens ?? 4096,
        system: systemWithSchema(req.system, req.schema),
        messages: [{ role: "user", content: req.prompt }],
        ...(mode === "schema" && attempt === 0 ? { output_config: { format: { type: "json_schema", schema: req.schema } } } : {}),
      },
    }),
    (b) => {
      const content = (b as { content?: { type?: string; text?: string }[] })?.content;
      if (!Array.isArray(content)) return null;
      const text = content.filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => c.text).join("");
      return text.length ? text : null;
    },
    o.fetchImpl ?? fetch,
    mode === "schema",
  );
}

// ---------------------------------------------------------------- Ollama (native /api/chat)

/**
 * Ollama's native API rather than its OpenAI shim, because only the native one lets us raise `num_ctx`
 * (the default context silently cuts the quest prompt) and turn thinking off for reasoning models.
 * `format` gets the JSON Schema (Ollama ≥ 0.5) or `"json"`.
 */
export function createOllamaRunner(o: HttpRunnerOptions): AiRunner {
  const base = trimSlash(o.baseUrl).replace(/\/v1$/, "");
  const mode = o.jsonMode ?? "schema";
  return createHttpRunner(
    o.model,
    (req, attempt) => ({
      url: `${base}/api/chat`,
      headers: bearer(o.apiKey),
      body: {
        model: o.model,
        stream: false,
        // `think` is rejected by some older builds/models; the fallback body drops it.
        ...(attempt === 0 ? { think: false } : {}),
        messages: [
          { role: "system", content: systemWithSchema(req.system, req.schema) },
          { role: "user", content: req.prompt },
        ],
        ...(mode === "schema" ? { format: req.schema } : mode === "json" ? { format: "json" } : {}),
        options: { num_ctx: o.numCtx ?? 16384, temperature: o.temperature ?? 0.7 },
      },
    }),
    (b) => {
      const c = (b as { message?: { content?: unknown } })?.message?.content;
      return typeof c === "string" && c.length ? c : null;
    },
    o.fetchImpl ?? fetch,
    true,
  );
}

// ---------------------------------------------------------------- OpenAI-compatible chat completions

/**
 * `POST {base}/chat/completions`: OpenAI, OpenRouter, Groq, Google Gemini (OpenAI endpoint), LM Studio,
 * llama.cpp, vLLM. `schema` sends `response_format: json_schema`; if the server rejects it (400/422), the
 * runner retries once with `json_object`.
 */
export function createOpenAiRunner(o: HttpRunnerOptions): AiRunner {
  const base = trimSlash(o.baseUrl);
  const mode = o.jsonMode ?? "schema";
  const format = (schema: object, attempt: number) => {
    if (mode === "off") return {};
    if (mode === "schema" && attempt === 0) {
      return { response_format: { type: "json_schema", json_schema: { name: "reply", schema, strict: false } } };
    }
    return { response_format: { type: "json_object" } };
  };
  return createHttpRunner(
    o.model,
    (req, attempt) => ({
      url: `${base}/chat/completions`,
      headers: bearer(o.apiKey),
      body: {
        model: o.model,
        max_tokens: o.maxTokens ?? 4096,
        temperature: o.temperature ?? 0.7,
        messages: [
          { role: "system", content: systemWithSchema(req.system, req.schema) },
          { role: "user", content: req.prompt },
        ],
        ...format(req.schema, attempt),
      },
    }),
    (b) => {
      const c = (b as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      return typeof c === "string" && c.length ? c : null;
    },
    o.fetchImpl ?? fetch,
    mode !== "off",
  );
}
