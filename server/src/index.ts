/** Server entry point: load config, init the data repo, serve the API. */
import { aiStartupLine, createApp } from "./app";
import { fixedClock, logicalDate, systemClock, type Clock } from "./clock";
import { bindWarning, loadConfig } from "./config";
import { createGit } from "./git";
import { initDataRepo } from "./init";
import { createStore } from "./store";

export async function main(): Promise<void> {
  const config = loadConfig();
  const bw = bindWarning(config.host);
  if (bw) console.warn(bw);
  if (config.aiEnabled && config.aiProvider === "claude-cli") {
    if (config.claudeBinResolved) console.log(`[config] claude: ${config.claudeBinResolved}`);
    else console.warn(`[config] claude not found (CLAUDE_BIN=${config.claudeBin}, searched PATH and ~/.local/bin): quests come from the pool.`);
  }
  if (config.gitPush) console.warn("[config] GIT_PUSH=true is ignored: pushing isn't implemented (never pushes).");

  let clock: Clock = systemClock;
  if (config.fakeNow) {
    const base = new Date(config.fakeNow);
    if (Number.isNaN(base.getTime())) throw new Error(`QJ_FAKE_NOW is not a valid date: ${config.fakeNow}`);
    // A fake clock that keeps ticking from the given instant.
    const offset = base.getTime() - Date.now();
    clock = { now: () => new Date(Date.now() + offset) };
    console.warn(`[config] QJ_FAKE_NOW active: ${fixedClock(base).now().toISOString()}`);
  }

  const git = createGit({ dataDir: config.dataDir, enabled: config.gitEnabled, debounceMs: config.gitDebounceMs });
  const init = await initDataRepo({ dataDir: config.dataDir, seedDir: config.seedDir, git });
  for (const w of init.warnings) console.warn(`[init] ${w}`);
  if (init.created.length) console.log(`[init] created in ${config.dataDir}: ${init.created.join(", ")}`);

  const store = createStore({ dataDir: config.dataDir });
  const app = createApp({ config, clock, store, git });
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({ hostname: config.host, port: config.port, fetch: app.fetch });
  } catch (e) {
    // e.g. EADDRINUSE: commit what init wrote now, so it isn't swept into a later "(+hand edits)" commit.
    await git.flush(10_000);
    git.close();
    throw e;
  }
  console.log(`[server] AI: ${aiStartupLine(app.ai ? { model: app.ai.model } : null, config)}`);
  console.log(`[server] Quest Journal on http://${config.host}:${server.port} (data: ${config.dataDir})`);
  console.log(
    `[server] tz ${config.tz}, day starts ${String(config.rolloverHour).padStart(2, "0")}:00, logical date ${logicalDate(clock.now(), config.tz, config.rolloverHour)}` +
      (config.serveWeb ? `, serving ${config.webDist}` : ""),
  );

  let stopping = false;
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${sig}: flushing pending commit…`);
    await server.stop();
    // Kill any running claude child before the git flush (architect-AC12).
    app.jobs.stop();
    app.ai?.killAll?.();
    await git.flush(10_000); // bounded: a wedged hook can't block shutdown (architect-AC19)
    git.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`[server] failed to start: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
