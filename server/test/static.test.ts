import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDirs, makeTempDataDir, makeTestApp, req } from "./helpers";

afterAll(cleanupTempDirs);

async function withDist() {
  const dist = await makeTempDataDir("qj-dist-");
  await mkdir(join(dist, "assets"), { recursive: true });
  await writeFile(join(dist, "index.html"), "<!doctype html><title>QJ</title>");
  await writeFile(join(dist, "assets", "app-abc123.js"), "console.log(1)");
  await writeFile(join(dist, "manifest.json"), "{}");
  await writeFile(join(dist, ".secret"), "nope");
  const t = await makeTestApp({ env: { SERVE_WEB: "true", WEB_DIST: dist } });
  return { ...t, dist };
}

describe("SPA serving (architect-AC4/AC5)", () => {
  test("index, client routes, assets and cache headers", async () => {
    const t = await withDist();
    let res = await req(t.app, "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain("<title>QJ</title>");
    res = await req(t.app, "/evening/2026-10-25");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>QJ</title>");
    res = await req(t.app, "/assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await req(t.app, "/assets/missing.js")).status).toBe(404);
  });

  test("unknown /api paths stay JSON 404, never HTML", async () => {
    const t = await withDist();
    const res = await req(t.app, "/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const typo = await req(t.app, "/api/todayy");
    expect(typo.headers.get("content-type")).toContain("application/json");
  });

  test("traversal and dotfiles are never served", async () => {
    const t = await withDist();
    for (const p of ["/%2e%2e/package.json", "/..%2fserver/src/config.ts", "/assets/..%2f..%2f..%2fetc%2fpasswd", "/.secret", "/%2esecret", "/..%5cpackage.json"]) {
      const res = await req(t.app, p);
      const body = await res.text();
      expect(body).not.toContain('"name"');
      expect(body).not.toContain("nope");
      expect(body).not.toContain("root:");
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(body).toContain("<title>QJ</title>");
    }
  });

  test("off by default outside production", async () => {
    const t = await makeTestApp();
    expect(t.config.serveWeb).toBe(false);
    expect((await req(t.app, "/")).status).toBe(404);
  });
});
