/**
 * Configuration. This is the ONLY module that reads `process.env`; everything else
 * receives a `Config` object (architect-AC2).
 */
import { accessSync, constants as fsConstants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { assertValidTimeZone } from "./clock";
import { DEFAULT_STREAK_BONUS } from "./domain";
import { AI_PROVIDERS, DEFAULT_BASE_URLS, DEFAULT_MODELS, JSON_MODES, type AiProvider, type JsonMode } from "./ai-http";

export interface Config {
  dataDir: string;
  host: string;
  port: number;
  tz: string;
  rolloverHour: number;
  allowedHosts: string[];
  claudeBin: string;
  /**
   * `CLAUDE_BIN` resolved to an absolute executable at startup (architect-AC17): a bare name is looked up on
   * `PATH` plus `~/.local/bin` (a systemd user unit's PATH is short). `null` = not found → AI falls back to the pool.
   */
  claudeBinResolved: string | null;
  /**
   * Which model backend writes quests: `claude-cli` (default, your Claude subscription via `claude -p`),
   * `anthropic` (API key), `ollama` (local, free) or `openai` (any OpenAI-compatible endpoint).
   */
  aiProvider: AiProvider;
  aiModel: string;
  /** HTTP providers only. Defaults per provider (see `DEFAULT_BASE_URLS`). */
  aiBaseUrl: string | null;
  /** HTTP providers only: `AI_API_KEY`, else `ANTHROPIC_API_KEY` (anthropic) / `OPENAI_API_KEY` (openai). */
  aiApiKey: string | null;
  aiJsonMode: JsonMode;
  /** Ollama context window in tokens. */
  ollamaNumCtx: number;
  aiTimeoutMs: number;
  /** `AI_ENABLED=false` → pool only (no claude spawns). */
  aiEnabled: boolean;
  /** `AI_BOSS_ON_OPEN=false` → the first open of a week doesn't queue an AI boss call (smoke budget, M4). */
  aiBossOnOpen: boolean;
  gitEnabled: boolean;
  gitPush: boolean;
  gitPushIntervalMin: number;
  gitDebounceMs: number;
  streakBonus: number;
  debug: boolean;
  /** ISO datetime; only honored outside production. */
  fakeNow: string | null;
  nodeEnv: string;
  seedDir: string;
  webDist: string;
  /** Serve the built SPA from `webDist` (default: production only). */
  serveWeb: boolean;
}

export type Env = Record<string, string | undefined>;

export class ConfigError extends Error {
  override name = "ConfigError";
}

export const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/** realpath of `p`, or of its nearest existing ancestor joined with the missing tail (follows symlinks). */
export function realpathLoose(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    const parent = dirname(abs);
    if (parent === abs) return abs;
    return join(realpathLoose(parent), abs.slice(parent.length).replace(/^[\\/]+/, ""));
  }
}

/**
 * Throws if DATA_DIR resolves inside the app repo (in every environment), so journal files or a nested
 * data repo can never end up in the code repo (architect-AC21). Follows `..` and symlinks.
 */
export function assertDataDirOutsideRepo(dataDir: string, repoRoot: string = REPO_ROOT): void {
  const d = realpathLoose(dataDir);
  const r = realpathLoose(repoRoot);
  if (isWithin(d, r)) {
    throw new ConfigError(`DATA_DIR (${d}) is inside the app repo (${r}). Keep your journal in a separate directory.`);
  }
}

function homeOf(env: Env): string {
  return env.HOME && env.HOME.length > 0 ? env.HOME : homedir();
}

export function expandHome(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

/** The user's real data repo. Tests must never resolve to it. */
export function realDataDir(home: string = homedir()): string {
  return resolve(home, "quest-data");
}

function isWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** True when running under `bun test` (bun sets NODE_ENV=test). */
export function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test";
}

/**
 * Throws if a test run would touch the real `~/quest-data` (architect-AC4).
 * Called by loadConfig, createStore and initDataRepo.
 */
export function assertSafeDataDir(dataDir: string, testRuntime: boolean = isTestRuntime()): void {
  if (!testRuntime) return;
  const real = realDataDir();
  const resolved = resolve(dataDir);
  if (isWithin(resolved, real)) {
    throw new ConfigError(
      `Refusing to use ${resolved} under NODE_ENV=test: tests must use a temp DATA_DIR, never ~/quest-data`,
    );
  }
}

function int(env: Env, key: string, def: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`${key} must be an integer in ${min}..${max}, got ${JSON.stringify(raw)}`);
  }
  return n;
}

function bool(env: Env, key: string, def: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return def;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new ConfigError(`${key} must be true/false, got ${JSON.stringify(env[key])}`);
}

function str(env: Env, key: string, def: string): string {
  const raw = env[key];
  return raw === undefined || raw.trim() === "" ? def : raw.trim();
}

function oneOf<T extends string>(env: Env, key: string, allowed: readonly T[], def: T): T {
  const raw = str(env, key, def).toLowerCase();
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ConfigError(`${key} must be one of ${allowed.join(", ")}, got ${JSON.stringify(env[key])}`);
  }
  return raw as T;
}

/** The API key for an HTTP provider. `claude-cli` never gets one (it must stay on the subscription). */
function aiApiKey(env: Env, provider: AiProvider): string | null {
  if (provider === "claude-cli") return null;
  const own = env.AI_API_KEY?.trim();
  if (own) return own;
  const fallback = provider === "anthropic" ? env.ANTHROPIC_API_KEY : provider === "openai" ? env.OPENAI_API_KEY : undefined;
  return fallback?.trim() || null;
}

/** Strip brackets and port from a host string, lowercase it. */
export function normalizeHost(h: string): string {
  let s = h.trim().toLowerCase();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    return end > 0 ? s.slice(1, end) : s;
  }
  const colon = s.indexOf(":");
  if (colon >= 0 && s.indexOf(":", colon + 1) === -1) s = s.slice(0, colon);
  return s;
}

export function loadConfig(env: Env = process.env): Config {
  const home = homeOf(env);
  const nodeEnv = str(env, "NODE_ENV", "development");
  const dataDir = resolve(expandHome(str(env, "DATA_DIR", "~/quest-data"), home));
  if (nodeEnv === "test" && isWithin(dataDir, realDataDir(home))) {
    throw new ConfigError("NODE_ENV=test requires DATA_DIR to point at a temp dir, not ~/quest-data");
  }

  assertDataDirOutsideRepo(dataDir);

  const tz = str(env, "TZ", Intl.DateTimeFormat().resolvedOptions().timeZone);
  try {
    assertValidTimeZone(tz);
  } catch {
    throw new ConfigError(`TZ is not a valid IANA time zone: ${JSON.stringify(tz)}`);
  }

  const host = str(env, "HOST", "127.0.0.1");
  const listed = str(env, "ALLOWED_HOSTS", "localhost,127.0.0.1").split(",");
  // Exact names only (architect-AC15): a wildcard would undo the DNS-rebinding guard. Fail loudly (PROVISIONAL).
  const wild = listed.find((h) => /[*?]/.test(h));
  if (wild !== undefined) {
    throw new ConfigError(
      `ALLOWED_HOSTS takes exact host names only, got ${JSON.stringify(wild.trim())}. Add your full <machine>.<tailnet>.ts.net name instead.`,
    );
  }
  // PROVISIONAL: the configured HOST is always allowed too, so a non-default bind works out of the box.
  // A wildcard bind address (0.0.0.0 / ::) is not a host name anyone sends, so it is not added.
  const allowedHosts = Array.from(
    new Set(
      [...listed, ...(isWildcardBind(host) ? [] : [host])]
        .map(normalizeHost)
        .filter((h) => h.length > 0),
    ),
  );
  const claudeBin = str(env, "CLAUDE_BIN", "claude");
  const aiProvider = oneOf(env, "AI_PROVIDER", AI_PROVIDERS, "claude-cli");

  return {
    dataDir,
    host,
    port: int(env, "PORT", 4317, 1, 65535),
    tz,
    rolloverHour: int(env, "DAY_ROLLOVER_HOUR", 4, 0, 23),
    allowedHosts,
    claudeBin,
    claudeBinResolved: resolveClaudeBin(claudeBin, env),
    aiProvider,
    aiModel: str(env, "AI_MODEL", DEFAULT_MODELS[aiProvider]),
    aiBaseUrl: aiProvider === "claude-cli" ? null : str(env, "AI_BASE_URL", DEFAULT_BASE_URLS[aiProvider]),
    aiApiKey: aiApiKey(env, aiProvider),
    aiJsonMode: oneOf(env, "AI_JSON_MODE", JSON_MODES, "schema"),
    ollamaNumCtx: int(env, "OLLAMA_NUM_CTX", 16_384, 2_048, 1_048_576),
    // Local models on a laptop are slower than Claude: give them more time by default.
    aiTimeoutMs: int(env, "AI_TIMEOUT_MS", aiProvider === "ollama" ? 180_000 : 60_000, 1_000, 600_000),
    aiEnabled: bool(env, "AI_ENABLED", true),
    aiBossOnOpen: bool(env, "AI_BOSS_ON_OPEN", true),
    gitEnabled: bool(env, "GIT_ENABLED", true),
    gitPush: bool(env, "GIT_PUSH", false),
    gitPushIntervalMin: int(env, "GIT_PUSH_INTERVAL_MIN", 15, 1, 1440),
    gitDebounceMs: int(env, "GIT_DEBOUNCE_MS", 5_000, 0, 600_000),
    streakBonus: int(env, "STREAK_BONUS", DEFAULT_STREAK_BONUS, 0, 1000),
    debug: str(env, "DEBUG", "") === "1",
    fakeNow: nodeEnv !== "production" ? (env.QJ_FAKE_NOW?.trim() || null) : null,
    nodeEnv,
    seedDir: resolve(expandHome(str(env, "SEED_DIR", join(REPO_ROOT, "docs", "brainstorm", "seed")), home)),
    webDist: resolve(expandHome(str(env, "WEB_DIST", join(REPO_ROOT, "web", "dist")), home)),
    serveWeb: bool(env, "SERVE_WEB", nodeEnv === "production"),
  };
}

/** `0.0.0.0` / `::` (and their spellings): reachable from every interface. */
export function isWildcardBind(host: string): boolean {
  const h = normalizeHost(host);
  return h === "0.0.0.0" || h === "::" || h === "0:0:0:0:0:0:0:0" || h === "*";
}

/** One-line startup warning for a non-loopback bind, or null (architect-AC15). */
export function bindWarning(host: string): string | null {
  const h = normalizeHost(host);
  if (h === "127.0.0.1" || h === "localhost" || h === "::1") return null;
  if (isWildcardBind(h)) {
    return `[config] HOST=${host}: the journal is reachable from your whole network. Prefer HOST=127.0.0.1 + \`tailscale serve\` (see README).`;
  }
  return `[config] HOST=${host}: the journal is reachable by anyone who can reach that address.`;
}

function isExecutable(p: string): boolean {
  try {
    if (!statSync(p).isFile()) return false;
    accessSync(p, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve `CLAUDE_BIN` to an absolute executable (architect-AC17). A path (contains `/`) is checked as is
 * (`~` expanded). A bare name is searched on `PATH`, then `~/.local/bin` (where the claude installer puts it).
 * Returns null when nothing executable is found; never throws.
 */
export function resolveClaudeBin(bin: string, env: Env = process.env): string | null {
  const home = homeOf(env);
  if (bin.includes("/")) {
    const p = resolve(expandHome(bin, home));
    return isExecutable(p) ? p : null;
  }
  const dirs = [...(env.PATH ?? "").split(":").filter((d) => d.length > 0 && isAbsolute(d)), join(home, ".local", "bin")];
  for (const d of dirs) {
    const p = join(d, bin);
    if (isExecutable(p)) return p;
  }
  return null;
}

/** Variables a child process (git, claude) may inherit. Everything else is stripped (architect-AC2). */
const CHILD_ENV_KEYS = new Set(["PATH", "HOME", "USER", "LOGNAME", "LANG", "TERM", "TMPDIR", "TZ"]);
const CHILD_ENV_PREFIXES = ["LC_", "XDG_"];

/**
 * Allowlisted environment for subprocesses: no `ANTHROPIC_API_KEY` (it would make `claude` bill the API,
 * breaking "free beyond Max"), no `CLAUDECODE`/`CLAUDE_CODE_*` (a nested session would misbehave), no
 * unrelated secrets. `extra` is added verbatim and wins.
 */
export function childEnv(extra: Record<string, string> = {}, env: Env = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (CHILD_ENV_KEYS.has(k) || CHILD_ENV_PREFIXES.some((p) => k.startsWith(p))) out[k] = v;
  }
  return { ...out, ...extra };
}
