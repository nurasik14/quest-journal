import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { assertSafeDataDir, ConfigError, loadConfig, normalizeHost } from "../src/config";

describe("loadConfig (architect-AC2/AC3)", () => {
  test("defaults", () => {
    const c = loadConfig({});
    expect(c.host).toBe("127.0.0.1");
    expect(c.port).toBe(4317);
    expect(c.rolloverHour).toBe(4);
    expect(c.dataDir).toBe(join(homedir(), "quest-data"));
    expect(c.gitEnabled).toBe(true);
    expect(c.gitPush).toBe(false);
    expect(c.allowedHosts).toEqual(["localhost", "127.0.0.1"]);
    expect(c.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
  test("STREAK_BONUS defaults to 25 (psychologist-AC4)", () => {
    expect(loadConfig({}).streakBonus).toBe(25);
  });
  test("never binds 0.0.0.0 by default", () => {
    expect(loadConfig({}).host).not.toBe("0.0.0.0");
  });
  test("expands ~ in DATA_DIR", () => {
    expect(loadConfig({ DATA_DIR: "~/somewhere", HOME: "/home/x" }).dataDir).toBe("/home/x/somewhere");
  });
  test("reads env values", () => {
    const c = loadConfig({ HOST: "100.64.0.1", PORT: "5000", TZ: "Asia/Tashkent", ALLOWED_HOSTS: "pc.tail.ts.net, localhost", GIT_ENABLED: "false" });
    expect(c.port).toBe(5000);
    expect(c.tz).toBe("Asia/Tashkent");
    expect(c.gitEnabled).toBe(false);
    expect(c.allowedHosts).toEqual(["pc.tail.ts.net", "localhost", "100.64.0.1"]);
  });
  test("invalid TZ fails fast", () => {
    expect(() => loadConfig({ TZ: "Mars/Olympus" })).toThrow(ConfigError);
  });
  test("invalid PORT fails fast", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: "70000" })).toThrow(ConfigError);
  });
  test("QJ_FAKE_NOW is ignored in production", () => {
    expect(loadConfig({ QJ_FAKE_NOW: "2026-10-25T10:00:00Z" }).fakeNow).toBe("2026-10-25T10:00:00Z");
    expect(loadConfig({ QJ_FAKE_NOW: "2026-10-25T10:00:00Z", NODE_ENV: "production" }).fakeNow).toBeNull();
  });
});

describe("test-safety guard (architect-AC4)", () => {
  test("NODE_ENV=test refuses the default ~/quest-data", () => {
    expect(() => loadConfig({ NODE_ENV: "test" })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: "test", DATA_DIR: "~/quest-data" })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: "test", DATA_DIR: "~/quest-data/days" })).toThrow(ConfigError);
  });
  test("assertSafeDataDir refuses the real data dir under tests", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(() => assertSafeDataDir(join(homedir(), "quest-data"))).toThrow(ConfigError);
    expect(() => assertSafeDataDir(join(homedir(), "quest-data", "kb"))).toThrow(ConfigError);
    expect(() => assertSafeDataDir("/tmp/qj-elsewhere")).not.toThrow();
    expect(() => assertSafeDataDir(join(homedir(), "quest-data-other"))).not.toThrow();
  });
});

describe("normalizeHost", () => {
  test("strips ports and brackets", () => {
    expect(normalizeHost("LocalHost:4317")).toBe("localhost");
    expect(normalizeHost("[::1]:4317")).toBe("::1");
    expect(normalizeHost("127.0.0.1")).toBe("127.0.0.1");
  });
});
