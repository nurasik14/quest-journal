import { afterAll, describe, expect, test } from "bun:test";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { etagOf } from "../src/store";
import { cleanupTempDirs, makeTestApp, req } from "./helpers";

afterAll(cleanupTempDirs);

const DAY = `---
date: 2026-10-25
energy: 3
satisfaction: 7
mood: [calm]
weather: rainy
quests:
  - {id: 2026-10-25-1, slot: 1, title: Walk, why: Air, category: body, difficulty: easy, coins: 10, status: done}
---
## Highlight
river

## Notes
notes here

## Gratitude
tea
`;

describe("GET /api/health (architect-AC18)", () => {
  test("shape, logical date from injected clock", async () => {
    const t = await makeTestApp({ now: "2026-10-26T03:59:00+05:00" });
    const res = await req(t.app, "/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.date).toBe("2026-10-25");
    expect(body.now).toBe("2026-10-26T03:59:00+05:00");
    expect(body.tz).toBe("Asia/Tashkent");
    expect(body.rollover_hour).toBe(4);
    expect(body.data_dir_ok).toBe(true);
    expect(body.git).toEqual({ enabled: false, last_commit_at: null, last_error: null });
    expect(body.broken_files).toEqual([]);
  });
  test("a broken day file is reported, not a 5xx", async () => {
    const t = await makeTestApp();
    await writeFile(join(t.dataDir, "days/2026-10-24.md"), "---\nquests: [\n---\n");
    const res = await req(t.app, "/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.broken_files).toEqual([expect.objectContaining({ file: "days/2026-10-24.md", code: "unparseable_file" })]);
  });
  test("missing data dir → data_dir_ok false, still 200", async () => {
    const t = await makeTestApp({ init: false });
    const { rm } = await import("node:fs/promises");
    await rm(t.dataDir, { recursive: true, force: true });
    const res = await req(t.app, "/api/health");
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data_dir_ok).toBe(false);
  });
});

describe("GET /api/days/:date (architect-AC19/AC20, psychologist-AC14)", () => {
  test("returns the Day shape with an ETag; alias route matches", async () => {
    const t = await makeTestApp();
    await writeFile(join(t.dataDir, "days/2026-10-25.md"), DAY);
    const res = await req(t.app, "/api/days/2026-10-25");
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe(`"${etagOf(DAY)}"`);
    expect(etagOf(DAY)).toMatch(/^[0-9a-f]{16}$/);
    const day = (await res.json()) as Record<string, any>;
    expect(day).toMatchObject({
      date: "2026-10-25",
      energy: 3,
      satisfaction: 7,
      mood: ["calm"],
      private: false,
      rerolls_used: 0,
      generation: null,
      highlight: "river",
      notes: "notes here",
      gratitude: "tea",
      etag: etagOf(DAY),
    });
    expect(day.quests[0]).toMatchObject({ id: "2026-10-25-1", status: "done", feedback: null, completed_at: null });
    const alias = await req(t.app, "/api/day/2026-10-25");
    expect(alias.status).toBe(200);
    expect(await alias.json()).toEqual(day);
  });
  test("missing file → 404 not_found with neutral copy", async () => {
    const t = await makeTestApp();
    for (const date of ["2026-10-20", "2027-01-01"]) {
      const res = await req(t.app, `/api/days/${date}`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe("not_found");
      expect(body.error.message).not.toMatch(/missed|failed|streak|lost/i);
    }
  });
  test("bad dates and traversal → 400, no fs access outside DATA_DIR", async () => {
    const t = await makeTestApp();
    for (const p of ["2026-02-30", "2026-13-01", "..%2F..%2Fetc%2Fpasswd", "..%2Fkb%2Fprofile", "20261025", "2026-10-25.md"]) {
      const res = await req(t.app, `/api/days/${p}`);
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(((await res.json()) as any).error.code).toBe("bad_request");
    }
    expect((await req(t.app, "/api/days/2026-02-30")).status).toBe(400);
    expect((await req(t.app, "/api/days/..%2F..%2Fetc%2Fpasswd")).status).toBe(400);
    expect((await req(t.app, "/api/day/..%2Fkb%2Fprofile")).status).toBe(400);
    expect(await readdir(join(t.dataDir, "days"))).toEqual([]);
  });
  test("broken file → 422 with code, file and raw text", async () => {
    const t = await makeTestApp();
    const broken = "---\ndate: 2026-10-25\nenergy: [\n---\n## Notes\nmy words\n";
    await writeFile(join(t.dataDir, "days/2026-10-25.md"), broken);
    const res = await req(t.app, "/api/days/2026-10-25");
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("unparseable_file");
    expect(body.error.details.file).toBe("days/2026-10-25.md");
    expect(body.error.details.raw).toBe(broken);
    await writeFile(join(t.dataDir, "days/2026-10-25.md"), "---\ndate: 2026-10-25\nenergy: 7\n---\n");
    const res2 = await req(t.app, "/api/days/2026-10-25");
    expect(res2.status).toBe(422);
    expect(((await res2.json()) as any).error.code).toBe("invalid_file");
  });
});

describe("API guards (architect-AC21)", () => {
  test("foreign Host header → 421", async () => {
    const t = await makeTestApp();
    const res = await req(t.app, "/api/health", { headers: { host: "evil.example" } });
    expect(res.status).toBe(421);
    expect(((await res.json()) as any).error.code).toBe("misdirected_host");
    expect((await req(t.app, "/api/health", { headers: { host: "127.0.0.1:4317" } })).status).toBe(200);
  });
  test("configured ALLOWED_HOSTS are honored", async () => {
    const t = await makeTestApp({ env: { ALLOWED_HOSTS: "pc.tail1234.ts.net" } });
    expect((await req(t.app, "/api/health", { headers: { host: "pc.tail1234.ts.net" } })).status).toBe(200);
    expect((await req(t.app, "/api/health", { headers: { host: "localhost" } })).status).toBe(421);
  });
  test("unknown api route → 404 JSON error with no-store", async () => {
    const t = await makeTestApp();
    const res = await req(t.app, "/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(((await res.json()) as any).error.code).toBe("not_found");
  });
  test("mutations: cross-origin → 403, non-JSON → 415", async () => {
    const t = await makeTestApp();
    const evil = await req(t.app, "/api/anything", { method: "POST", headers: { origin: "http://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(evil.status).toBe(403);
    const form = await req(t.app, "/api/anything", { method: "POST", headers: { origin: "http://localhost:5173", "content-type": "text/plain" }, body: "x" });
    expect(form.status).toBe(415);
    const ok = await req(t.app, "/api/anything", { method: "POST", headers: { origin: "http://localhost:5173", "content-type": "application/json" }, body: "{}" });
    expect(ok.status).toBe(404);
  });
});
