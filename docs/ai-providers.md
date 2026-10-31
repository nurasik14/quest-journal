# Choosing an AI provider

[← Back to README](../README.md)

Set `AI_PROVIDER` in `.env`. Everything else in the app works the same with every provider.

| Provider | `AI_PROVIDER` | Cost | Quest quality | Your journal leaves the PC? |
|---|---|---|---|---|
| Claude subscription (Pro/Max) via the `claude` CLI | `claude-cli` (default) | included in your plan | best | yes, to Anthropic |
| Claude API key | `anthropic` | pay per token, a few cents a day | best | yes, to Anthropic |
| Ollama, local model | `ollama` | free | good with a 7–10B model, rougher below that | **no** |
| Google Gemini, Groq, OpenRouter (free tiers) | `openai` | free within their limits | good | yes, to that company |
| OpenAI, LM Studio, llama.cpp, vLLM | `openai` | depends | depends on the model | LM Studio/llama.cpp: no |

The model sees your profile, approved insights, and the last 14 days of notes, highlights and ratings (never gratitude,
never private days). If that shouldn't leave your computer, use Ollama.

Check what the server picked: the startup log prints an `AI:` line, and `curl -s localhost:4317/api/health` shows
`"provider"`, `"model"`, `"available"` and `"last_error"` under `claude` (the field kept its old name).

## Option 1: Claude subscription (default)

If you have Claude Pro or Max, the app runs your own `claude` CLI in the background (`claude -p`). There's no API key
and nothing is billed per call.

1. Install Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`
2. Run `claude` once and log in.
3. Leave `AI_PROVIDER` unset, or set it to `claude-cli`.

```ini
AI_PROVIDER=claude-cli
AI_MODEL=sonnet              # or opus, haiku
```

The app looks for `claude` on `PATH` and in `~/.local/bin`. Set `CLAUDE_BIN=/full/path/to/claude` if it lives
elsewhere. Any `ANTHROPIC_API_KEY` in the environment is stripped before `claude` runs, so a stray key can't move you
from the subscription to API billing.

## Option 2: Claude API key

1. Create a key at [console.anthropic.com](https://console.anthropic.com/) (Settings → API keys) and add some credit.
2. Put it in `.env`:

```ini
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-5     # or claude-haiku-4-5 to spend less
```

A day is about two calls (morning quests and the evening reflection) plus the weekly boss once a week. Each call
sends up to about 6,000 tokens of prompt and gets a short reply, so with Sonnet a day costs a few cents, more if a
retry is needed. The app asks for structured JSON output
(`output_config.format`). If the API rejects the schema, it retries once with the schema in the prompt only.

## Option 3: Ollama, free and local

Nothing leaves your machine and nothing costs money. You need a few GB of disk and a reasonably recent computer. A GPU
helps but isn't required.

1. Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh` on Linux, or the app from
   [ollama.com/download](https://ollama.com/download) on macOS and Windows.
2. Pull a model: `ollama pull qwen3.5`
3. Set:

```ini
AI_PROVIDER=ollama
AI_MODEL=qwen3.5
# AI_BASE_URL=http://localhost:11434   # default; point it at another machine on your network if you like
# OLLAMA_NUM_CTX=16384                 # context window; the default is fine
# AI_TIMEOUT_MS=180000                 # default for ollama: 3 minutes per call
```

Which model? These are times for one day of quests on a laptop with an RTX 4050 (6 GB) and 16 GB RAM, all run against
this app's demo data:

| Model | Download | Time per day | Notes |
|---|---|---|---|
| `qwen3.5` (9.7B) | 6.6 GB | 20–35 s | Recommended. Varied, on-tone quests; the weekly boss sometimes needs its retry. |
| `qwen3.5:2b` | 2.7 GB | ~13 s | Fine on weak machines. Quests are simpler and the "why" lines wander. |
| `llama3.2:3b` | 2.0 GB | ~7 s | Fast, plain English, little of the Maomao voice. |
| `qwen2.5:3b` | 1.9 GB | 5–7 s | Often breaks the app's rules (wrong difficulty, repeats), so you get pool quests. |

Without a GPU, expect several times slower. That's fine, because quests are written once in the morning. Small local
models follow the rules less reliably than Claude, so you'll see the pool fallback banner more often. Every quest still
passes the same checks before you see it.

The app uses Ollama's native `/api/chat` endpoint rather than its OpenAI-compatible one. Only the native endpoint lets
it raise the context window (Ollama's default would silently cut the prompt) and turn off "thinking" on reasoning
models, which otherwise makes them very slow.

## Option 4: free cloud tiers and other OpenAI-compatible APIs

`AI_PROVIDER=openai` works with anything that speaks the OpenAI Chat Completions API. Set the base URL, a key and a
model. Model names change often, so check the provider's model list. The ones below were current when this was written.

Google Gemini (free tier with daily limits; key from [aistudio.google.com](https://aistudio.google.com/apikey)):

```ini
AI_PROVIDER=openai
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=your-gemini-key
AI_MODEL=gemini-3.8-flash
```

Groq (free tier with rate limits; key from [console.groq.com](https://console.groq.com/keys)):

```ini
AI_PROVIDER=openai
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
AI_MODEL=openai/gpt-oss-20b
```

OpenRouter (models ending in `:free` cost nothing; key from [openrouter.ai](https://openrouter.ai/keys)):

```ini
AI_PROVIDER=openai
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=sk-or-...
AI_MODEL=<any model id ending in :free>
```

OpenAI itself: `AI_PROVIDER=openai`, `OPENAI_API_KEY=sk-...` (or `AI_API_KEY`), and `AI_MODEL` set to a current model.
The base URL defaults to `https://api.openai.com/v1`.

LM Studio, llama.cpp `llama-server` or vLLM on your own machine: start their local server and point `AI_BASE_URL` at it
(LM Studio's default is `http://localhost:1234/v1`, llama.cpp's is `http://localhost:8080/v1`). No key is needed.

`AI_JSON_MODE` controls how strictly the reply is forced into JSON:

- `schema` (default) sends the full JSON Schema as `response_format: json_schema`. If the server rejects that, the app
  retries once with `json_object`.
- `json` sends `json_object` (plain JSON mode).
- `off` sends nothing and relies on the prompt. Use it for servers that reject `response_format` entirely.

With every provider the schema is also written into the system prompt, so models that ignore `response_format` still
know the shape.

## When the model fails

| You see | Meaning | Fix |
|---|---|---|
| Banner "From the apothecary's own shelf…" on Today | The model failed twice or couldn't be reached, so the quests came from your pool | Check `last_error` in `/api/health` |
| `last_error: "claude_missing"` | `claude` binary not found, or the HTTP server refused the connection (Ollama not running?) | `ollama serve`, or fix `CLAUDE_BIN` / `AI_BASE_URL` |
| `last_error: "claude_not_logged_in"` | 401/403: wrong or missing API key, or the CLI needs a new login | Fix the key, or run `claude` and log in |
| `last_error: "rate_limited"` | 429 or overloaded: a free tier's limit, or your plan's usage limit | Wait, or switch model/provider |
| `last_error: "timeout"` | The model took longer than `AI_TIMEOUT_MS` | Use a smaller model or raise the timeout |
| `last_error: "invalid_output"` | The reply wasn't valid JSON or broke the rules | Try a bigger model. With `DEBUG=1`, `GET /api/debug/ai` shows the last replies and which rule failed |
