import { afterAll, describe, expect, test } from "bun:test";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGit, type CommitReason, type Git } from "../src/git";
import { cleanupTempDirs, makeTestApp, req, sha256File, type TestApp } from "./helpers";

afterAll(cleanupTempDirs);

// 2026-10-26 is a Monday (ISO 2026-W44). Test TZ is Asia/Tashkent (+05:00), rollover 04:00.
const MON = "2026-10-26T10:00:00+05:00";

type Json = Record<string, any>;

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

async function call(t: TestApp, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await req(t.app, path, body === undefined ? { method, headers } : { method, ...json(body, headers) });
  const text = await res.text();
  let data: Json = {};
  try {
    data = JSON.parse(text) as Json;
  } catch {
    /* not json */
  }
  return { res, status: res.status, data };
}

/** A Git double that records touches. */
function spyGit(): Git & { touches: CommitReason[] } {
  const touches: CommitReason[] = [];
  const real = createGit({ dataDir: "/nonexistent", enabled: false });
  return { ...real, touches, touch: (r) => void touches.push(r) };
}

async function makeApp(now = MON) {
  const t = await makeTestApp({ now });
  const git = spyGit();
  const { createApp } = await import("../src/app");
  const app = createApp({ config: t.config, clock: t.clock, store: t.store, git });
  return { ...t, app, git };
}

describe("GET /api/today (architect-AC6/7/8)", () => {
  test("fresh day: needs check-in, no energy on disk, week + pool boss created once", async () => {
    const t = await makeApp();
    const { status, data } = await call(t, "GET", "/api/today");
    expect(status).toBe(200);
    expect(data.date).toBe("2026-10-26");
    expect(data.week_id).toBe("2026-W44");
    expect(data.weekday).toBe("Monday");
    expect(data.tz).toBe("Asia/Tashkent");
    expect(data.rollover_hour).toBe(4);
    expect(data.day).toBeNull();
    expect(data.needs_checkin).toBe(true);
    expect(data.needs_generation).toBe(false);
    expect(data.earned_today).toBe(0);
    expect(data.week.boss.id).toBe("2026-W44-boss");
    expect(data.week.boss.coins).toBe(100);
    expect(data.week.boss.source).toBe("pool");
    expect(data.week.boss.checkpoints).toHaveLength(4);
    expect(data.week.boss.checkpoints.every((c: Json) => c.done === false && typeof c.text === "string")).toBe(true);
    // psychologist-AC1: the day file isn't created by a GET
    expect(await readdir(join(t.dataDir, "days"))).toEqual([]);
    expect(t.git.touches).toEqual([{ kind: "boss", ref: "2026-W44", detail: "pool" }]);
  });

  test("5 concurrent GETs in a new week → 1 file, 1 commit reason; repeat GETs don't write", async () => {
    const t = await makeApp();
    const all = await Promise.all(Array.from({ length: 5 }, () => call(t, "GET", "/api/today")));
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(new Set(all.map((r) => r.data.week.boss.title)).size).toBe(1);
    expect(await readdir(join(t.dataDir, "weeks"))).toEqual(["2026-W44.md"]);
    expect(t.git.touches).toHaveLength(1);
    const file = join(t.dataDir, "weeks/2026-W44.md");
    const m1 = (await stat(file)).mtimeMs;
    await Bun.sleep(15);
    await call(t, "GET", "/api/today");
    expect((await stat(file)).mtimeMs).toBe(m1);
  });

  test("a hand-made week file is never overwritten", async () => {
    const t = await makeApp();
    const text = "---\nweek: 2026-W44\nboss: null\nmine: yes\n---\n## Review\nhand\n";
    await writeFile(join(t.dataDir, "weeks/2026-W44.md"), text);
    const { data } = await call(t, "GET", "/api/today");
    expect(data.week.boss).toBeNull();
    expect(await readFile(join(t.dataDir, "weeks/2026-W44.md"), "utf8")).toBe(text);
  });

  test("the boss type differs from last week's", async () => {
    const t = await makeApp();
    await call(t, "GET", "/api/today");
    const w44 = (await call(t, "GET", "/api/today")).data.week.boss;
    t.clock.set("2026-11-02T10:00:00+05:00");
    const w45 = (await call(t, "GET", "/api/today")).data.week.boss;
    expect(w45.id).toBe("2026-W45-boss");
    if (w44.type) expect(w45.type).not.toBe(w44.type);
  });

  test("quarantined day → 200 with day_error + raw; the week still renders", async () => {
    const t = await makeApp();
    const raw = "---\nenergy: 3\nquests: [\n---\n## Notes\nmy words\n";
    await writeFile(join(t.dataDir, "days/2026-10-26.md"), raw);
    const { status, data } = await call(t, "GET", "/api/today");
    expect(status).toBe(200);
    expect(data.day).toBeNull();
    expect(data.day_error).toMatchObject({ code: "unparseable_file", file: "days/2026-10-26.md", raw });
    expect(typeof data.day_error.line).toBe("number");
    expect(data.needs_checkin).toBe(false);
    expect(data.week.boss).not.toBeNull();
  });

  test("invalid day (satisfaction 11) → day_error with field, never the zod message", async () => {
    const t = await makeApp();
    await writeFile(join(t.dataDir, "days/2026-10-26.md"), "---\nsatisfaction: 11\n---\n");
    const { data } = await call(t, "GET", "/api/today");
    expect(data.day_error).toMatchObject({ code: "invalid_file", field: "satisfaction" });
    expect(JSON.stringify(data.day_error)).not.toMatch(/Too big|Invalid/);
  });

  test("quarantined week → week_error, the day still renders", async () => {
    const t = await makeApp();
    await writeFile(join(t.dataDir, "weeks/2026-W44.md"), "---\nboss: {\n---\n");
    const { status, data } = await call(t, "GET", "/api/today");
    expect(status).toBe(200);
    expect(data.week).toBeNull();
    expect(data.week_error.code).toBe("unparseable_file");
    expect(data.needs_checkin).toBe(true);
  });

  test("logical date at 03:59 is still yesterday", async () => {
    const t = await makeApp("2026-10-27T03:59:00+05:00");
    expect((await call(t, "GET", "/api/today")).data.date).toBe("2026-10-26");
  });
});

describe("POST /api/today/checkin (architect-AC9/10/11, psychologist-AC2/5)", () => {
  test("202 with a succeeded pool job; slots match energy; tariff coins; job is pollable", async () => {
    const t = await makeApp();
    const { status, data } = await call(t, "POST", "/api/today/checkin", { energy: 4 });
    expect(status).toBe(202);
    expect(data.job).toMatchObject({ kind: "generate_day", key: "generate_day:2026-10-26", status: "succeeded", source: "pool" });
    expect(data.day.energy).toBe(4);
    expect(data.day.generation).toMatchObject({ source: "pool", model: null });
    const qs = data.day.quests as Json[];
    expect(qs.map((q) => q.difficulty)).toEqual(["easy", "medium", "hard"]);
    expect(qs.map((q) => q.coins)).toEqual([10, 20, 35]);
    expect(qs.map((q) => q.id)).toEqual(["2026-10-26-1", "2026-10-26-2", "2026-10-26-3"]);
    expect(new Set(qs.map((q) => q.category)).size).toBe(3);
    expect(qs.every((q) => q.status === "open" && q.source === "pool" && q.feedback === null)).toBe(true);
    const job = await call(t, "GET", `/api/jobs/${data.job.id}`);
    expect(job.status).toBe(200);
    expect(job.data.status).toBe("succeeded");
    expect((await call(t, "GET", "/api/jobs/nope")).status).toBe(404);
    expect(t.git.touches).toContainEqual({ kind: "checkin", ref: "2026-10-26" });
    expect(t.git.touches).toContainEqual({ kind: "day", ref: "2026-10-26", detail: "pool" });
  });

  test("pool coins are ignored (coins: 999 → 10)", async () => {
    const t = await makeApp();
    const pool = await readFile(join(t.dataDir, "quests.yaml"), "utf8");
    await writeFile(join(t.dataDir, "quests.yaml"), pool.replace(/coins: \d+/g, "coins: 999"));
    const { data } = await call(t, "POST", "/api/today/checkin", { energy: 1 });
    expect((data.day.quests as Json[]).map((q) => q.coins)).toEqual([10, 10, 10]);
  });

  test("double-tap: 2 concurrent check-ins → exactly 3 quests", async () => {
    const t = await makeApp();
    const [a, b] = await Promise.all([
      call(t, "POST", "/api/today/checkin", { energy: 3 }),
      call(t, "POST", "/api/today/checkin", { energy: 3 }),
    ]);
    expect([a.status, b.status].every((s) => s === 200 || s === 202)).toBe(true);
    const day = (await call(t, "GET", "/api/days/2026-10-26")).data;
    expect(day.quests).toHaveLength(3);
  });

  test("a later check-in only updates energy, never reshuffles (psychologist-AC2)", async () => {
    const t = await makeApp();
    const first = (await call(t, "POST", "/api/today/checkin", { energy: 3 })).data.day.quests as Json[];
    await call(t, "GET", "/api/today");
    const again = await call(t, "POST", "/api/today/checkin", { energy: 1 });
    expect(again.status).toBe(200);
    expect(again.data.day.energy).toBe(1);
    expect((again.data.day.quests as Json[]).map((q) => [q.id, q.title])).toEqual(first.map((q) => [q.id, q.title]));
    const today = (await call(t, "GET", "/api/today")).data;
    expect((today.day.quests as Json[]).map((q) => q.title)).toEqual(first.map((q) => q.title));
  });

  test("bad bodies → 400 (strict: unknown keys, out of range)", async () => {
    const t = await makeApp();
    expect((await call(t, "POST", "/api/today/checkin", { energy: 0 })).status).toBe(400);
    expect((await call(t, "POST", "/api/today/checkin", { energy: 6 })).status).toBe(400);
    expect((await call(t, "POST", "/api/today/checkin", { energy: 3, coins: 9 })).status).toBe(400);
    expect((await call(t, "POST", "/api/today/checkin", {})).status).toBe(400);
  });

  test("/api/today/generate: 409 needs_checkin, then 409 already_generated", async () => {
    const t = await makeApp();
    expect((await call(t, "POST", "/api/today/generate", {})).data.error.code).toBe("needs_checkin");
    await call(t, "POST", "/api/today/checkin", { energy: 2 });
    const r = await call(t, "POST", "/api/today/generate", {});
    expect(r.status).toBe(409);
    expect(r.data.error.code).toBe("already_generated");
  });

  test("needs_generation after a check-in without quests (e.g. pool missing), then generate works", async () => {
    const t = await makeApp();
    const pool = await readFile(join(t.dataDir, "quests.yaml"), "utf8");
    await writeFile(join(t.dataDir, "quests.yaml"), "quests: []\n");
    const ci = await call(t, "POST", "/api/today/checkin", { energy: 3 });
    expect(ci.status).toBe(202);
    expect(ci.data.job.status).toBe("failed");
    expect(ci.data.job.error.code).toBe("pool_empty");
    const today = (await call(t, "GET", "/api/today")).data;
    expect(today.needs_generation).toBe(true);
    await writeFile(join(t.dataDir, "quests.yaml"), pool);
    const g = await call(t, "POST", "/api/today/generate", {});
    expect(g.status).toBe(202);
    expect(g.data.job.status).toBe("succeeded");
    expect((await call(t, "GET", "/api/today")).data.day.quests).toHaveLength(3);
  });
});

describe("PATCH /api/quests/:id (architect-AC12/13/14, psychologist-AC6–10)", () => {
  async function ready() {
    const t = await makeApp();
    await call(t, "POST", "/api/today/checkin", { energy: 4 });
    t.git.touches.length = 0;
    return t;
  }
  const dayFile = (t: TestApp) => join(t.dataDir, "days/2026-10-26.md");

  test("done / partial / let_go / open with completed_at and earned_today", async () => {
    const t = await ready();
    const hard = "2026-10-26-3";
    let r = await call(t, "PATCH", `/api/quests/${hard}`, { status: "done" });
    expect(r.status).toBe(200);
    expect(r.data.quest.status).toBe("done");
    expect(r.data.quest.completed_at).toBe("2026-10-26T10:00:00+05:00");
    expect(r.data.earned_today).toBe(35);
    r = await call(t, "PATCH", `/api/quests/${hard}`, { status: "partial" });
    expect(r.data.earned_today).toBe(20);
    r = await call(t, "PATCH", `/api/quests/${hard}`, { status: "let_go" });
    expect(r.data.earned_today).toBe(0);
    expect(r.data.quest.completed_at).toBeNull();
    r = await call(t, "PATCH", `/api/quests/${hard}`, { status: "open" });
    expect(r.data.quest.status).toBe("open");
    expect(r.data.earned_today).toBe(0);
    const text = await readFile(dayFile(t), "utf8");
    expect(text).toContain("status: open");
    expect(t.git.touches.map((x) => x.detail)).toEqual(["done", "partial", "let_go", "open"]);
  });

  test("same value again → 200 no-op, no write, no commit", async () => {
    const t = await ready();
    await call(t, "PATCH", "/api/quests/2026-10-26-1", { status: "done" });
    const before = await sha256File(dayFile(t));
    const n = t.git.touches.length;
    const r = await call(t, "PATCH", "/api/quests/2026-10-26-1", { status: "done" });
    expect(r.status).toBe(200);
    expect(await sha256File(dayFile(t))).toBe(before);
    expect(t.git.touches.length).toBe(n);
  });

  test("let go: reason optional; with a chip it's stored; leaving let_go clears it", async () => {
    const t = await ready();
    await call(t, "PATCH", "/api/quests/2026-10-26-1", { status: "let_go" });
    expect(await readFile(dayFile(t), "utf8")).not.toContain("reason:");
    await call(t, "PATCH", "/api/quests/2026-10-26-1", { reason: "no_time" });
    expect(await readFile(dayFile(t), "utf8")).toContain("reason: no_time");
    await call(t, "PATCH", "/api/quests/2026-10-26-1", { status: "open" });
    expect(await readFile(dayFile(t), "utf8")).not.toContain("reason:");
    const bad = await call(t, "PATCH", "/api/quests/2026-10-26-1", { reason: "no_time" });
    expect(bad.status).toBe(400);
  });

  test("feedback is independent of status and toggles back to null", async () => {
    const t = await ready();
    await call(t, "PATCH", "/api/quests/2026-10-26-2", { status: "let_go" });
    let r = await call(t, "PATCH", "/api/quests/2026-10-26-2", { feedback: "up" });
    expect(r.data.quest).toMatchObject({ status: "let_go", feedback: "up" });
    r = await call(t, "PATCH", "/api/quests/2026-10-26-2", { feedback: null });
    expect(r.data.quest.feedback).toBeNull();
  });

  test("aliases and unknown keys are rejected on write", async () => {
    const t = await ready();
    expect((await call(t, "PATCH", "/api/quests/2026-10-26-1", { status: "failed" })).status).toBe(400);
    expect((await call(t, "PATCH", "/api/quests/2026-10-26-1", { status: "done", coins: 999 })).status).toBe(400);
    expect((await call(t, "PATCH", "/api/quests/2026-10-26-1", {})).status).toBe(400);
  });

  test("strict id routing: yesterday → 409 not_today; junk → 400; unknown → 404", async () => {
    const t = await ready();
    expect((await call(t, "PATCH", "/api/quests/2026-10-25-1", { status: "done" })).data.error.code).toBe("not_today");
    expect((await call(t, "PATCH", "/api/quests/..%2F..%2Fx", { status: "done" })).status).toBe(400);
    expect((await call(t, "PATCH", "/api/quests/hello", { status: "done" })).status).toBe(400);
    expect((await call(t, "PATCH", "/api/quests/2026-02-30-1", { status: "done" })).status).toBe(400);
    expect((await call(t, "PATCH", "/api/quests/2026-10-26-3b", { status: "done" })).status).toBe(404);
  });

  test("right after the 04:00 rollover yesterday's quest is closed", async () => {
    const t = await ready();
    t.clock.set("2026-10-27T04:00:00+05:00");
    const r = await call(t, "PATCH", "/api/quests/2026-10-26-1", { status: "done" });
    expect(r.status).toBe(409);
    expect(r.data.error.code).toBe("not_today");
  });

  test("checkpoints only for the boss", async () => {
    const t = await ready();
    expect((await call(t, "PATCH", "/api/quests/2026-10-26-1", { checkpoints: [{ index: 0, done: true }] })).status).toBe(400);
  });

  test("boss: checkpoint toggles one at a time, text untouched, no auto-complete; out of range → 400", async () => {
    const t = await ready();
    const before = (await call(t, "GET", "/api/today")).data.week.boss;
    let r = await call(t, "PATCH", "/api/quests/2026-W44-boss", { checkpoints: [{ index: 1, done: true }] });
    expect(r.status).toBe(200);
    expect(r.data.quest.checkpoints.map((c: Json) => c.done)).toEqual([false, true, false, false]);
    expect(r.data.quest.checkpoints.map((c: Json) => c.text)).toEqual(before.checkpoints.map((c: Json) => c.text));
    for (const i of [0, 2, 3]) r = await call(t, "PATCH", "/api/quests/2026-W44-boss", { checkpoints: [{ index: i, done: true }] });
    expect(r.data.quest.status).toBe("open");
    expect((await call(t, "PATCH", "/api/quests/2026-W44-boss", { checkpoints: [{ index: 4, done: true }] })).status).toBe(400);
    r = await call(t, "PATCH", "/api/quests/2026-W44-boss", { status: "done" });
    expect(r.data.quest.status).toBe("done");
    expect(t.git.touches).toContainEqual({ kind: "boss", ref: "2026-W44", detail: "checkpoint" });
    expect(t.git.touches).toContainEqual({ kind: "boss", ref: "2026-W44", detail: "done" });
  });

  test("boss of another week → 409", async () => {
    const t = await ready();
    t.clock.set("2026-11-02T10:00:00+05:00");
    expect((await call(t, "PATCH", "/api/quests/2026-W44-boss", { status: "done" })).data.error.code).toBe("not_this_week");
  });

  test("PATCH on a hand-edited file only changes the targeted quest (diff limited)", async () => {
    const t = await ready();
    const text = await readFile(dayFile(t), "utf8");
    await writeFile(dayFile(t), text.replace("---\n", "---\nweather: rainy\n"));
    await call(t, "PATCH", "/api/quests/2026-10-26-2", { status: "done" });
    const after = await readFile(dayFile(t), "utf8");
    expect(after).toContain("weather: rainy");
    const diff = after.split("\n").filter((l, i) => l !== text.replace("---\n", "---\nweather: rainy\n").split("\n")[i]);
    expect(diff.join("\n")).toMatch(/status: done|completed_at/);
    expect(diff.length).toBeLessThanOrEqual(2);
  });
});

describe("PUT /api/days/:date/evening (architect-AC15/16/17, psychologist-AC14/19/20)", () => {
  const etagOf = async (t: TestApp, date: string) => (await req(t.app, `/api/days/${date}`)).headers.get("etag") ?? "";

  test("428 without If-Match; * creates; then stale * → 412; stale etag → 412 with current_etag", async () => {
    const t = await makeApp();
    expect((await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 6 })).status).toBe(428);
    const created = await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 6 }, { "if-match": "*" });
    expect(created.status).toBe(200);
    expect(created.res.headers.get("etag")).toMatch(/^"[0-9a-f]{16}"$/);
    expect(created.data.day.satisfaction).toBe(6);
    expect(created.data.reflect_job).toBeNull();
    const again = await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 7 }, { "if-match": "*" });
    expect(again.status).toBe(412);
    const stale = await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 7 }, { "if-match": '"0000000000000000"' });
    expect(stale.status).toBe(412);
    expect(stale.data.error.code).toBe("stale");
    expect(stale.data.error.details.current_etag).toBe(created.res.headers.get("etag")!.replaceAll('"', ""));
    const ok = await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 7 }, { "if-match": created.res.headers.get("etag")! });
    expect(ok.status).toBe(200);
    expect(t.git.touches.filter((x) => x.kind === "evening")).toHaveLength(2);
  });

  test("the rating alone is valid and creates only the owned sections; null clears", async () => {
    const t = await makeApp();
    const r = await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 6 }, { "if-match": "*" });
    const text = await readFile(join(t.dataDir, "days/2026-10-26.md"), "utf8");
    expect(text).toContain("satisfaction: 6");
    expect(text.match(/^## /gm)).toHaveLength(3);
    const c = await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: null }, { "if-match": r.res.headers.get("etag")! });
    expect(c.data.day.satisfaction).toBeNull();
  });

  test("future date → 409, bad date → 400, long text → 400, unknown key → 400", async () => {
    const t = await makeApp();
    expect((await call(t, "PUT", "/api/days/2026-10-27/evening", { satisfaction: 5 }, { "if-match": "*" })).status).toBe(409);
    expect((await call(t, "PUT", "/api/days/2026-02-30/evening", { satisfaction: 5 }, { "if-match": "*" })).status).toBe(400);
    expect((await call(t, "PUT", "/api/days/2026-10-26/evening", { notes: "x".repeat(10_001) }, { "if-match": "*" })).status).toBe(400);
    expect((await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 5, coins: 1 }, { "if-match": "*" })).status).toBe(400);
    expect((await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 11 }, { "if-match": "*" })).status).toBe(400);
    expect((await call(t, "PUT", "/api/days/2026-10-26/evening", { mood: ["x".repeat(25)] }, { "if-match": "*" })).status).toBe(400);
  });

  test("past days are editable", async () => {
    const t = await makeApp();
    expect((await call(t, "PUT", "/api/days/2026-10-20/evening", { satisfaction: 5 }, { "if-match": "*" })).status).toBe(200);
  });

  test("mood: trimmed, lowercased, deduped; a hand-written tag round-trips verbatim", async () => {
    const t = await makeApp();
    await writeFile(join(t.dataDir, "days/2026-10-26.md"), "---\ndate: 2026-10-26\nmood: [Rainy]\n---\n");
    const etag = await etagOf(t, "2026-10-26");
    const r = await call(t, "PUT", "/api/days/2026-10-26/evening", { mood: ["Rainy", " Calm ", "calm", ""] }, { "if-match": etag });
    expect(r.data.day.mood).toEqual(["Rainy", "calm"]);
  });

  test("no-op save on a hand-edited file with comments + CRLF → byte-identical, same ETag, no commit", async () => {
    const t = await makeApp();
    const file = join(t.dataDir, "days/2026-10-26.md");
    const text = [
      "---",
      "# my own comment",
      "date: 2026-10-26",
      "satisfaction: 6   # good day",
      "mood: [calm, Rainy]",
      "weather: rainy",
      "---",
      "Preamble I wrote.",
      "",
      "## Highlight",
      "the river",
      "",
      "## Notes",
      "some notes",
      "",
      "## Mine",
      "keep me",
      "",
      "## Gratitude",
      "tea",
      "",
    ].join("\r\n");
    await writeFile(file, text);
    const etag = await etagOf(t, "2026-10-26");
    const before = await sha256File(file);
    const day = (await call(t, "GET", "/api/days/2026-10-26")).data;
    const body = { satisfaction: day.satisfaction, mood: day.mood, highlight: day.highlight, notes: day.notes, gratitude: day.gratitude };
    const r = await call(t, "PUT", "/api/days/2026-10-26/evening", body, { "if-match": etag });
    expect(r.status).toBe(200);
    expect(r.res.headers.get("etag")).toBe(etag);
    expect(await sha256File(file)).toBe(before);
    expect(t.git.touches.some((x) => x.kind === "evening")).toBe(false);

    // one real change: only that section changes; unknown keys/sections and the preamble survive
    const r2 = await call(t, "PUT", "/api/days/2026-10-26/evening", { ...body, notes: "new notes" }, { "if-match": etag });
    expect(r2.status).toBe(200);
    const after = await readFile(file, "utf8");
    expect(after).toContain("weather: rainy");
    expect(after).toContain("Preamble I wrote.");
    expect(after).toContain("keep me");
    expect(after).toContain("new notes");
    expect(after).toContain("the river");
    expect(t.git.touches.some((x) => x.kind === "evening")).toBe(true);
  });

  test("the rating never touches coins (psychologist-AC20)", async () => {
    const t = await makeApp();
    await call(t, "POST", "/api/today/checkin", { energy: 3 });
    await call(t, "PATCH", "/api/quests/2026-10-26-1", { status: "done" });
    let etag = await etagOf(t, "2026-10-26");
    await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 1 }, { "if-match": etag });
    const low = (await call(t, "GET", "/api/today")).data.earned_today;
    etag = await etagOf(t, "2026-10-26");
    await call(t, "PUT", "/api/days/2026-10-26/evening", { satisfaction: 10 }, { "if-match": etag });
    expect((await call(t, "GET", "/api/today")).data.earned_today).toBe(low);
    expect(low).toBe(10);
  });
});

describe("read/write split (architect-AC17)", () => {
  test("a 120-char title, a 4th quest and rerolls_used: 3 read as 200", async () => {
    const t = await makeApp();
    const long = "L".repeat(120);
    await writeFile(
      join(t.dataDir, "days/2026-10-26.md"),
      `---
date: 2026-10-26
energy: 3
rerolls_used: 3
quests:
  - {title: "${long}", category: body, difficulty: easy}
  - {title: b, category: mind, difficulty: easy}
  - {title: c, category: care, difficulty: easy}
  - {title: d, category: treat, difficulty: easy}
---
`,
    );
    const r = await call(t, "GET", "/api/days/2026-10-26");
    expect(r.status).toBe(200);
    expect(r.data.quests).toHaveLength(4);
    const today = (await call(t, "GET", "/api/today")).data;
    expect(today.day_error).toBeNull();
    expect(today.rerolls_left).toBe(0);
    // ranges still quarantine
    await writeFile(join(t.dataDir, "days/2026-10-25.md"), "---\nenergy: 7\n---\n");
    expect((await call(t, "GET", "/api/days/2026-10-25")).status).toBe(422);
  });
});
