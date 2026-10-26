/** Shared test helpers: temp DATA_DIRs (never ~/quest-data), fake clocks, app factory. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AiMonitor, AiRequest, AiRunner, RawResult } from "../src/ai";
import { createApp } from "../src/app";
import { fixedClock } from "../src/clock";
import { assertSafeDataDir, loadConfig, type Config } from "../src/config";
import { createGit, type Git } from "../src/git";
import { initDataRepo } from "../src/init";
import { createStore } from "../src/store";

export const SEED_DIR = resolve(import.meta.dir, "..", "..", "docs", "brainstorm", "seed");

const created: string[] = [];

export async function makeTempDataDir(prefix = "qj-test-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  assertSafeDataDir(dir, true);
  created.push(dir);
  return dir;
}

export async function cleanupTempDirs(): Promise<void> {
  await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true })));
}

export const fakeClock = fixedClock;

/** Isolates git from the developer's global config (signing, hooks, identity). */
export const GIT_TEST_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

export interface TestApp {
  app: ReturnType<typeof createApp>;
  config: Config;
  store: ReturnType<typeof createStore>;
  git: Git;
  clock: ReturnType<typeof fixedClock>;
  dataDir: string;
}

export async function makeTestApp(
  opts: { env?: Record<string, string>; now?: string; init?: boolean; ai?: AiRunner | null; monitor?: AiMonitor; inlineWaitMs?: number } = {},
): Promise<TestApp> {
  const dataDir = await makeTempDataDir();
  const config = loadConfig({
    NODE_ENV: "test",
    DATA_DIR: dataDir,
    TZ: "Asia/Tashkent",
    GIT_ENABLED: "false",
    SEED_DIR: SEED_DIR,
    ...opts.env,
  });
  const clock = fixedClock(opts.now ?? "2026-10-25T10:00:00+05:00");
  const git = createGit({ dataDir, enabled: config.gitEnabled, debounceMs: 0, env: GIT_TEST_ENV });
  if (opts.init !== false) await initDataRepo({ dataDir, seedDir: config.seedDir, git });
  const store = createStore({ dataDir });
  const app = createApp({
    config,
    clock,
    store,
    git,
    ...(opts.ai !== undefined ? { ai: opts.ai } : {}),
    ...(opts.monitor ? { monitor: opts.monitor } : {}),
    ...(opts.inlineWaitMs !== undefined ? { inlineWaitMs: opts.inlineWaitMs } : {}),
  });
  return { app, config, store, git, clock, dataDir };
}

export function req(app: TestApp["app"], path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("host")) headers.set("host", "localhost:4317");
  return app.request(`http://localhost:4317${path}`, { ...init, headers });
}

export async function sha256File(path: string): Promise<string> {
  const buf = await Bun.file(path).arrayBuffer();
  return new Bun.CryptoHasher("sha256").update(buf).digest("hex");
}

// ---------------------------------------------------------------- AI test doubles (sprint M3)

/** A successful `claude -p --output-format json` envelope carrying `payload` as structured output. */
export function envelope(payload: unknown, opts: { asResultText?: boolean; fence?: boolean } = {}): RawResult {
  const text = JSON.stringify(payload);
  const env = opts.asResultText
    ? { type: "result", subtype: "success", is_error: false, result: opts.fence ? `Here:\n\`\`\`json\n${text}\n\`\`\`` : text }
    : { type: "result", subtype: "success", is_error: false, result: "", structured_output: payload };
  return { type: "exit", exitCode: 0, stdout: JSON.stringify(env), stderr: "", durationMs: 5 };
}

export type Step = RawResult | ((req: AiRequest) => RawResult | Promise<RawResult>);

/** Scripted runner: returns the steps in order (the last one repeats). Records every request. */
export function scriptedRunner(steps: Step[], model = "sonnet"): AiRunner & { calls: AiRequest[] } {
  const calls: AiRequest[] = [];
  let i = 0;
  return {
    model,
    calls,
    async run(req) {
      calls.push(req);
      const step = steps[Math.min(i++, steps.length - 1)]!;
      return typeof step === "function" ? step(req) : step;
    },
  };
}

/** A step that blocks until `release()` (or the request's abort signal) fires. */
export function gate(result: Step): { step: Step; release: () => void; started: Promise<void> } {
  let release!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((r) => (markStarted = r));
  const released = new Promise<void>((r) => (release = r));
  return {
    release,
    started,
    step: async (req) => {
      markStarted();
      const aborted = new Promise<"aborted">((r) => req.signal?.addEventListener("abort", () => r("aborted"), { once: true }));
      const which = await Promise.race([released.then(() => "go" as const), aborted]);
      if (which === "aborted") return { type: "aborted", durationMs: 1 };
      return typeof result === "function" ? result(req) : result;
    },
  };
}

export const VALID_DAY = {
  quests: [
    { title: "Stretch for ten minutes by the window", why: "Stiff shoulders make poor tea.", category: "body", difficulty: "easy", minutes: 10, cost: "free", done_when: "Ten minutes stretched" },
    { title: "Sketch one object on your desk", why: "Ink is cheaper than worry.", category: "creative", difficulty: "medium", minutes: 30, cost: "free", done_when: "One sketch exists" },
    { title: "Message a classmate about a study session", why: "Gossip spreads; so can notes.", category: "social", difficulty: "medium", minutes: 25, cost: "free", done_when: "Message sent" },
  ],
};

export const VALID_BOSS = {
  boss: {
    title: "Draw a four-panel comic about your week",
    why: "A week pressed flat between panels keeps longer than one left loose.",
    type: "make",
    checkpoints: ["Pick a theme", "Sketch panels 1-2", "Sketch panels 3-4", "Ink and share"],
    artifact: "A finished comic page",
    cost: "free",
  },
};
