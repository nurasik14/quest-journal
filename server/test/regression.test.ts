/**
 * Regression tests from the M1 test report and the M2 backlog: DST (BUG-1), DATA_DIR inside the repo,
 * git timeouts, and the tester's file/HTTP probes (CRLF, BOM, empty, no frontmatter, traversal, Host spoof).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { logicalDate } from "../src/clock";
import { assertDataDirOutsideRepo, ConfigError, loadConfig, REPO_ROOT } from "../src/config";
import { createGit } from "../src/git";
import { createStore } from "../src/store";
import { cleanupTempDirs, makeTempDataDir, makeTestApp, req } from "./helpers";

afterAll(cleanupTempDirs);

describe("DST-correct logicalDate (architect-AC20, M1 BUG-1)", () => {
  const cases: [string, string, string][] = [
    // Europe/Berlin fall back 2026-10-25 03:00 CEST → 02:00 CET
    ["2026-10-25T02:30:00Z", "Europe/Berlin", "2026-10-24"], // 03:30 CET
    ["2026-10-25T02:59:00Z", "Europe/Berlin", "2026-10-24"], // 03:59 CET
    ["2026-10-25T03:00:00Z", "Europe/Berlin", "2026-10-25"], // 04:00 CET
    ["2026-10-25T03:30:00Z", "Europe/Berlin", "2026-10-25"], // 04:30 CET
    // Europe/Berlin spring forward 2026-03-29 02:00 CET → 03:00 CEST
    ["2026-03-29T01:30:00Z", "Europe/Berlin", "2026-03-28"], // 03:30 CEST
    ["2026-03-29T02:00:00Z", "Europe/Berlin", "2026-03-29"], // 04:00 CEST
    ["2026-03-29T02:30:00Z", "Europe/Berlin", "2026-03-29"], // 04:30 CEST
    // America/New_York fall back 2026-11-01, spring forward 2026-03-08
    ["2026-11-01T08:30:00Z", "America/New_York", "2026-10-31"], // 03:30 EST
    ["2026-11-01T09:00:00Z", "America/New_York", "2026-11-01"], // 04:00 EST
    ["2026-11-01T09:30:00Z", "America/New_York", "2026-11-01"], // 04:30 EST
    ["2026-03-08T07:30:00Z", "America/New_York", "2026-03-07"], // 03:30 EDT
    ["2026-03-08T08:00:00Z", "America/New_York", "2026-03-08"], // 04:00 EDT
    ["2026-03-08T08:30:00Z", "America/New_York", "2026-03-08"], // 04:30 EDT
    // Asia/Almaty (no DST)
    ["2026-10-25T22:59:00Z", "Asia/Almaty", "2026-10-25"], // 03:59 +05
    ["2026-10-25T23:00:00Z", "Asia/Almaty", "2026-10-26"], // 04:00 +05
  ];
  for (const [iso, tz, want] of cases) {
    test(`${iso} in ${tz} → ${want}`, () => expect(logicalDate(new Date(iso), tz, 4)).toBe(want));
  }
});

describe("DATA_DIR inside the app repo is refused (architect-AC21)", () => {
  test("direct, via .., and in every environment", () => {
    for (const NODE_ENV of ["development", "production", "test"]) {
      expect(() => loadConfig({ NODE_ENV, DATA_DIR: join(REPO_ROOT, "data") })).toThrow(ConfigError);
      expect(() => loadConfig({ NODE_ENV, DATA_DIR: join(REPO_ROOT, "server", "..", "x") })).toThrow(/inside the app repo/);
    }
    expect(() => loadConfig({ NODE_ENV: "development", DATA_DIR: REPO_ROOT })).toThrow(ConfigError);
  });
  test("via a symlink", async () => {
    const tmp = await makeTempDataDir();
    const link = join(tmp, "link");
    await symlink(REPO_ROOT, link);
    expect(() => assertDataDirOutsideRepo(join(link, "data"))).toThrow(ConfigError);
    expect(() => assertDataDirOutsideRepo(tmp)).not.toThrow();
  });
});

describe("git timeouts (architect-AC19)", () => {
  test("a git call that never returns → last_error, flush still resolves", async () => {
    const dir = await makeTempDataDir();
    const git = createGit({
      dataDir: dir,
      enabled: true,
      debounceMs: 0,
      timeoutMs: 50,
      runner: () => new Promise(() => {}),
      log: () => {},
    });
    git.touch({ kind: "evening", ref: "2026-10-26" });
    await git.flush();
    expect(git.status().last_error).toMatch(/timed out/);
  });
  test("flush(maxWaitMs) is bounded even if the queue is wedged", async () => {
    const dir = await makeTempDataDir();
    const git = createGit({ dataDir: dir, enabled: true, debounceMs: 0, timeoutMs: 60_000, runner: () => new Promise(() => {}), log: () => {} });
    git.touch({ kind: "evening", ref: "2026-10-26" });
    const t0 = Date.now();
    await git.flush(50);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(git.status().last_error).toMatch(/flush timed out/);
  });
  test("the HTTP request still succeeds while git hangs", async () => {
    const t = await makeTestApp({ now: "2026-10-26T10:00:00+05:00" });
    const git = createGit({ dataDir: t.dataDir, enabled: true, debounceMs: 0, timeoutMs: 50, runner: () => new Promise(() => {}), log: () => {} });
    const { createApp } = await import("../src/app");
    const app = createApp({ config: t.config, clock: t.clock, store: t.store, git });
    const res = await req(app, "/api/days/2026-10-26/evening", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": "*" },
      body: JSON.stringify({ satisfaction: 5 }),
    });
    expect(res.status).toBe(200);
    await git.flush(500);
  });
});

describe("M1 tester probes, ported", () => {
  async function store(files: Record<string, string>) {
    const dir = await makeTempDataDir();
    await mkdir(join(dir, "days"), { recursive: true });
    for (const [rel, text] of Object.entries(files)) await writeFile(join(dir, rel), text);
    return createStore({ dataDir: dir });
  }
  test("CRLF file reads", async () => {
    const s = await store({ "days/2026-10-25.md": "---\r\ndate: 2026-10-25\r\nsatisfaction: 6\r\n---\r\n## Notes\r\nhi\r\n" });
    const r = await s.readDay("2026-10-25");
    expect(r?.day.satisfaction).toBe(6);
    expect(r?.notes).toBe("hi");
  });
  test("UTF-8 BOM reads", async () => {
    const s = await store({ "days/2026-10-25.md": "﻿---\ndate: 2026-10-25\nenergy: 2\n---\n" });
    expect((await s.readDay("2026-10-25"))?.day.energy).toBe(2);
  });
  test("empty file and no-frontmatter file read as empty days", async () => {
    const s = await store({ "days/2026-10-25.md": "", "days/2026-10-24.md": "## Notes\njust notes\n" });
    expect((await s.readDay("2026-10-25"))?.day.quests).toEqual([]);
    expect((await s.readDay("2026-10-24"))?.notes).toBe("just notes");
  });
  test("missing closing --- → unparseable_file", async () => {
    const s = await store({ "days/2026-10-25.md": "---\ndate: 2026-10-25\nenergy: [\n" });
    await expect(s.readDay("2026-10-25")).rejects.toMatchObject({ code: "unparseable_file" });
  });
  test("traversal variants never reach a file", async () => {
    const t = await makeTestApp();
    for (const p of ["/api/days/..%2F..%2Fetc%2Fpasswd", "/api/days/%2e%2e", "/api/days/2026-10-25.md", "/api/days/..%5C..%5Cx"]) {
      const res = await req(t.app, p);
      expect([400, 404]).toContain(res.status);
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });
  test("Host spoof variants → 421", async () => {
    const t = await makeTestApp();
    for (const host of ["evil.example", "localhost.evil.example:4317", "127.0.0.1.nip.io", "evil.example:80@localhost"]) {
      expect((await req(t.app, "/api/health", { headers: { host } })).status).toBe(421);
    }
    expect((await req(t.app, "/api/health", { headers: { host: "localhost:5173" } })).status).toBe(200);
  });
  test("dev-proxy style request (Host localhost:5173, Origin http://localhost:5173) passes the guards", async () => {
    const t = await makeTestApp({ now: "2026-10-26T10:00:00+05:00" });
    const res = await req(t.app, "/api/today/checkin", {
      method: "POST",
      headers: { host: "localhost:5173", origin: "http://localhost:5173", "content-type": "application/json" },
      body: JSON.stringify({ energy: 3 }),
    });
    expect(res.status).toBe(202);
  });
});

test("REPO_ROOT points at the app repo", () => {
  expect(resolve(REPO_ROOT, "server", "src", "config.ts")).toBe(resolve(import.meta.dir, "..", "src", "config.ts"));
});
