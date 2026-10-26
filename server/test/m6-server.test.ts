/** Sprint M6 (server): garden stats, kb editing contract, cache policy, bind/claude config, AI cwd, seed:demo, invariants. */
import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultAiCwd, ensurePrivateDir } from "../src/ai";
import { ECONOMY_EXEMPT_ROUTES } from "../src/app";
import { addDays } from "../src/clock";
import { bindWarning, ConfigError, loadConfig, resolveClaudeBin } from "../src/config";
import { computeEconomy, type DayInput } from "../src/economy";
import { checkTarget, main as seedMain, parseSeedArgs, planDemo, seedDemo } from "../src/seed-demo";
import { cacheControlFor } from "../src/static";
import { categoryStats, computeStats, monthAgoCard, monthBack, type StatsDay } from "../src/stats";
import { cleanupTempDirs, makeTempDataDir, makeTestApp, req, SEED_DIR, type TestApp } from "./helpers";

afterAll(cleanupTempDirs);

type Json = Record<string, any>;
const NOW = "2026-10-25T10:00:00+05:00"; // logical 2026-10-25, Asia/Tashkent
const TODAY = "2026-10-25";

async function call(t: TestApp, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { ...headers } };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await req(t.app, path, init);
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as Json, etag: res.headers.get("etag")?.replace(/"/g, "") ?? null, headers: res.headers };
}

const app = (env: Record<string, string> = {}, now = NOW, extra: Parameters<typeof makeTestApp>[0] = {}) =>
  makeTestApp({ now, env: { AI_BOSS_ON_OPEN: "false", ...env }, ...extra });

type Q = { category?: string; status: "open" | "done" | "partial" | "let_go"; difficulty?: "easy" | "medium" | "hard"; title?: string };
const sd = (date: string, quests: Q[], sat: number | null = null, extra: Partial<StatsDay> = {}): StatsDay => ({
  date,
  satisfaction: sat,
  quests: quests.map((q, i) => ({ title: q.title ?? `Q${i}`, category: q.category ?? "body", status: q.status, difficulty: q.difficulty ?? "easy" })),
  ...extra,
});

async function writeDay(t: TestApp, date: string, quests: Q[], sat: number | null = null, extra: { notes?: string; highlight?: string; private?: boolean; energy?: number } = {}) {
  await t.store.updateDay(date, (d) => {
    d.energy = extra.energy ?? 3;
    d.quests = quests.map((q, i) => ({
      slot: i + 1,
      title: q.title ?? `Quest ${date} ${i + 1}`,
      why: "",
      category: (q.category ?? "body") as never,
      difficulty: q.difficulty ?? "easy",
      status: q.status,
      feedback: null,
      source: "pool",
      completed_at: null,
    })) as typeof d.quests;
    if (sat !== null) d.satisfaction = sat;
    if (extra.notes !== undefined) d.notes = extra.notes;
    if (extra.highlight !== undefined) d.highlight = extra.highlight;
    if (extra.private) d.private = true;
  });
}

// ---------------------------------------------------------------- pure stats

describe("monthBack / this day last month (goal 5, architect-AC4, psychologist-AC9)", () => {
  test.each([
    ["2026-03-31", "2026-02-28"],
    ["2028-03-31", "2028-02-29"],
    ["2026-01-31", "2025-12-31"],
    ["2026-01-01", "2025-12-01"],
    ["2026-10-25", "2026-09-25"],
    ["2026-05-31", "2026-04-30"],
  ])("%s → %s", (d, want) => expect(monthBack(d)).toBe(want));

  test("01-01 at 03:59 is still logically 12-31 → the card looks at 11-30", async () => {
    const t = await app({}, "2026-01-01T03:59:00+05:00");
    await writeDay(t, "2025-11-30", [{ status: "done", title: "Old walk" }], 7, { highlight: "Nice" });
    const r = await call(t, "GET", "/api/stats");
    expect(r.status).toBe(200);
    expect(r.data.today).toBe("2025-12-31");
    expect(r.data.this_day_last_month).toEqual({ date: "2025-11-30", satisfaction: 7, highlight: "Nice", quests: [{ title: "Old walk", status: "done" }] });
  });

  test("no notes or gratitude; highlight ≤ 200; empty / care / broken pages → null", () => {
    const long = "x".repeat(300);
    const d = sd("2026-09-25", [{ status: "done", title: "Walk" }], 6, { highlight: long, notes: "ZZNOTES", gratitude: "ZZGRAT" });
    const card = monthAgoCard([d], new Set(), TODAY)!;
    expect([...card.highlight].length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(card)).not.toContain("ZZNOTES");
    expect(JSON.stringify(card)).not.toContain("ZZGRAT");
    expect(monthAgoCard([sd("2026-09-25", [{ status: "open" }], null)], new Set(), TODAY)).toBeNull();
    expect(monthAgoCard([sd("2026-09-25", [{ status: "done" }], 6, { notes: "I want to die" })], new Set(), TODAY)).toBeNull();
    expect(monthAgoCard([], new Set(["2026-09-25"]), TODAY)).toBeNull();
    expect(monthAgoCard([sd("2026-09-24", [{ status: "done" }], 6)], new Set(), TODAY)).toBeNull();
  });
});

describe("category stats are honest (goal 4, architect-AC3, psychologist-AC1/AC5/AC6/AC7)", () => {
  test("3 rated (6,7,8) + 4 unrated → n 7, n_rated 3, and no average below 5 rated days", () => {
    const days = [6, 7, 8, null, null, null, null].map((s, i) => sd(`2026-10-0${i + 1}`, [{ status: "done" }], s));
    const [body] = categoryStats(days);
    expect(body).toMatchObject({ category: "body", n: 7, n_rated: 3, avg_satisfaction: null });
    // the same data with the floor at 3 → mean over RATED days only (never 0 for unrated)
    expect(categoryStats(days, 3)[0]!.avg_satisfaction).toBe(7);
  });

  test("edge: n_rated 4 → null; 5 → average shown with avg_energy", () => {
    const four = [5, 6, 7, 8].map((s, i) => sd(`2026-10-0${i + 1}`, [{ status: "done" }], s, { energy: 2 }));
    expect(categoryStats(four)[0]!.avg_satisfaction).toBeNull();
    const five = [...four, sd("2026-10-05", [{ status: "partial" }], 9, { energy: 4 })];
    expect(categoryStats(five)[0]).toMatchObject({ n: 5, n_rated: 5, avg_satisfaction: 7, avg_energy: 2.4 });
  });

  test("hand-computed table: fixed CATEGORIES order, let_go reported but never counts toward n", () => {
    const days = [
      sd("2026-10-01", [{ category: "social", status: "done" }, { category: "body", status: "let_go" }], 8),
      sd("2026-10-02", [{ category: "body", status: "partial" }, { category: "mind", status: "done" }, { category: "mind", status: "done" }], 4),
      sd("2026-10-03", [{ category: "outside" as string, status: "done" }], null), // legacy names are normalized by the schema on read
      sd("2026-10-04", [{ category: "mind", status: "let_go" }], 5),
    ];
    const t = categoryStats(days);
    expect(t.map((c) => c.category)).toEqual(["body", "mind", "social"]); // fixed order, never sorted by average
    expect(t[0]).toMatchObject({ category: "body", done: 0, partial: 1, let_go: 1, n: 1, n_rated: 1 });
    expect(t[1]).toMatchObject({ category: "mind", done: 2, partial: 0, let_go: 1, n: 1, n_rated: 1 });
    expect(t[2]).toMatchObject({ category: "social", done: 1, n: 1 });
    expect(t.every((c) => "let_go" in c && !("failed" in c))).toBe(true);
  });
});

describe("heatmap states (goal 3, designer-AC4, psychologist-AC1/AC3)", () => {
  const econ = { streak: 0, longest_streak: 0, days_logged: 0, quests_done: 0 };
  test("rated / unrated / pending today / gap / none / broken", () => {
    const days = [
      sd("2026-10-20", [{ status: "done" }], 7),
      sd("2026-10-21", [{ status: "done" }], null), // logged, unrated
      // 10-22: gap
      sd("2026-10-23", [{ status: "open" }], null), // only generated quests: nothing written → gap
      sd("2026-10-25", [{ status: "done" }, { status: "done" }, { status: "done" }], null), // today, 3 done, unrated
    ];
    const s = computeStats({ days, broken: [{ file: "days/2026-10-24.md", code: "invalid_frontmatter", message: "x", date: "2026-10-24" }], today: TODAY, from: "2026-10-18", to: TODAY, economy: econ });
    const st = Object.fromEntries(s.heatmap.map((h) => [h.date, h.state]));
    expect(st).toEqual({
      "2026-10-18": "none",
      "2026-10-19": "none",
      "2026-10-20": "rated",
      "2026-10-21": "unrated",
      "2026-10-22": "gap",
      "2026-10-23": "gap",
      "2026-10-24": "broken",
      "2026-10-25": "pending",
    });
    const today = s.heatmap.at(-1)!;
    expect(today).toMatchObject({ satisfaction: null, rated: false, counted: true, quests_done: 3, quests_total: 3 });
    expect(s.heatmap.find((h) => h.date === "2026-10-24")).toMatchObject({ broken: true, satisfaction: null });
    expect(s.warnings).toEqual([{ file: "days/2026-10-24.md", code: "invalid_frontmatter", message: "x" }]);
  });

  test("after rating today 6 → the number shows", () => {
    const s = computeStats({ days: [sd(TODAY, [{ status: "done" }], 6)], broken: [], today: TODAY, from: TODAY, to: TODAY, economy: econ });
    expect(s.heatmap[0]).toMatchObject({ state: "rated", satisfaction: 6 });
  });
});

// ---------------------------------------------------------------- /api/stats

describe("GET /api/stats (goals 1/2/6/7, architect-AC1/AC2/AC5/AC6)", () => {
  test("validation: bad date, from > to, span > 366 → 400; to beyond today is clamped", async () => {
    const t = await app();
    for (const q of ["from=2026-02-30", "to=nope", "from=2026-10-20&to=2026-10-10", "from=2024-01-01&to=2026-10-25"]) {
      expect((await call(t, "GET", `/api/stats?${q}`)).status).toBe(400);
    }
    const r = await call(t, "GET", "/api/stats?from=2026-10-01&to=2027-01-01");
    expect(r.status).toBe(200);
    expect(r.data.range).toEqual({ from: "2026-10-01", to: TODAY });
    const d = await call(t, "GET", "/api/stats");
    expect(d.data.range).toEqual({ from: addDays(TODAY, -364), to: TODAY });
    expect(d.data.heatmap).toHaveLength(365);
    expect(d.headers.get("cache-control")).toBe("no-store");
  });

  test("one streak truth: stats == /api/economy on a gap + broken + herb timeline", async () => {
    const t = await app();
    // 8 counting days (a herb at day 7), a 1-day gap (bridged), a broken day (neutral), then 2 more.
    for (let i = 0; i < 8; i++) await writeDay(t, addDays("2026-10-01", i), [{ status: "done" }], i % 2 ? 7 : null);
    await writeDay(t, "2026-10-10", [{ status: "partial" }], null);
    await writeFile(join(t.dataDir, "days/2026-10-11.md"), "---\ndate: 2026-10-11\nsatisfaction: 14\n---\n");
    await writeDay(t, "2026-10-12", [], 5);
    await writeDay(t, "2026-10-13", [], null, { notes: "a line" });
    // 10-14..10-24 nothing: the run rests; today counts
    await writeDay(t, TODAY, [{ status: "done" }], null);
    const s = (await call(t, "GET", "/api/stats")).data;
    const e = (await call(t, "GET", "/api/economy")).data;
    for (const k of ["streak", "longest_streak", "days_logged", "quests_done"]) expect([k, s[k]]).toEqual([k, e[k]]);
    expect(s.longest_streak).toBe(11); // 8 + 10-10 + 10-12 + 10-13 (10-09 bridged by a herb, 10-11 neutral)
    expect(s.heatmap.find((h: Json) => h.date === "2026-10-11")).toMatchObject({ state: "broken", broken: true, satisfaction: null });
    expect(s.warnings.map((w: Json) => w.file)).toEqual(["days/2026-10-11.md"]);
    // counted == the ledger's counting rule for every readable day
    const readable = s.heatmap.filter((h: Json) => !h.broken);
    expect(readable.filter((h: Json) => h.counted).length).toBe(e.days_logged);
  });

  test("private days are included in the owner's stats (goal 6, psychologist-AC8)", async () => {
    const t = await app();
    await writeDay(t, "2026-10-24", [{ status: "done" }], 8, { private: true });
    const s = (await call(t, "GET", "/api/stats")).data;
    expect(s.heatmap.find((h: Json) => h.date === "2026-10-24")).toMatchObject({ private: true, satisfaction: 8, state: "rated" });
  });

  test("perf: p95 ≤ 150 ms over 400 days (architect-AC6)", async () => {
    const t = await app();
    await mkdir(join(t.dataDir, "days"), { recursive: true });
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 400; i++) {
      const d = addDays("2025-09-21", i);
      if (d > TODAY) break;
      writes.push(
        writeFile(
          join(t.dataDir, `days/${d}.md`),
          `---\nschema: 1\ndate: ${d}\nenergy: 3\nsatisfaction: 6\nquests:\n  - id: ${d}-1\n    title: Walk\n    category: body\n    difficulty: easy\n    status: done\n  - id: ${d}-2\n    title: Read\n    category: mind\n    difficulty: medium\n    status: partial\n  - id: ${d}-3\n    title: Draw\n    category: creative\n    difficulty: hard\n    status: let_go\n---\n\n## Highlight\n\nA line.\n\n## Notes\n\n${"Some notes. ".repeat(20)}\n`,
        ),
      );
    }
    await Promise.all(writes);
    await call(t, "GET", "/api/stats");
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      const r = await call(t, "GET", "/api/stats");
      times.push(performance.now() - s);
      expect(r.status).toBe(200);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(0.95 * times.length) - 1]!;
    console.log(`[perf] GET /api/stats p50=${times[10]!.toFixed(1)}ms p95=${p95.toFixed(1)}ms (n=20)`);
    expect(p95).toBeLessThan(150);
  }, 30_000);
});

// ---------------------------------------------------------------- kb editing contract

describe("Notes editing contract (goals 8/10/11, architect-AC7/AC9, psychologist-AC11)", () => {
  test("hand edit on disk → PUT with the old etag → 412, file byte-identical; unknown → 404; too large → 400", async () => {
    const t = await app();
    const g = await call(t, "GET", "/api/kb/profile");
    const hand = "# Profile\n\nmy own words, typed in an editor\n";
    await writeFile(join(t.dataDir, "kb/profile.md"), hand);
    const r = await call(t, "PUT", "/api/kb/profile", { content: "overwrite" }, { "if-match": `"${g.etag}"` });
    expect(r.status).toBe(412);
    expect(await readFile(join(t.dataDir, "kb/profile.md"), "utf8")).toBe(hand);
    expect((await call(t, "GET", "/api/kb/secrets")).status).toBe(404);
    const big = await call(t, "PUT", "/api/kb/profile", { content: "x".repeat(20_001) }, { "if-match": `"${g.etag}"` });
    expect(big.status).toBe(400);
    expect(big.data.error.code).toBe("too_large");
  });

  test("kb PUT changes no coins and returns economy equal to GET /api/economy", async () => {
    const t = await app();
    await writeDay(t, "2026-10-24", [{ status: "done" }], 7);
    const before = (await call(t, "GET", "/api/economy")).data;
    const g = await call(t, "GET", "/api/kb/insights");
    const r = await call(t, "PUT", "/api/kb/insights", { content: "# Insights\n- [i-0001] A note.\n" }, { "if-match": `"${g.etag}"` });
    expect(r.status).toBe(200);
    expect(r.data.economy).toEqual(before);
  });

  test("unparsed lines round-trip byte-identically and are counted", async () => {
    const t = await app();
    const g = await call(t, "GET", "/api/kb/insights");
    const content = "# Insights\n- [i-0001] Fine one. (evidence: 2026-10-01)\nodd line one\n  * odd line two\n";
    const r = await call(t, "PUT", "/api/kb/insights", { content }, { "if-match": `"${g.etag}"` });
    expect(r.status).toBe(200);
    expect(r.data.unparsed_lines).toBe(2);
    expect(await readFile(join(t.dataDir, "kb/insights.md"), "utf8")).toBe(content);
  });

  test("a PUT with no ids + a duplicate id can't break today or reflect; a new add never reuses an id", async () => {
    const t = await app();
    await writeFile(
      join(t.dataDir, "kb/proposals/2026-10-20.yaml"),
      "schema: 1\nid: '2026-10-20'\nstatus: decided\nops:\n  - op_id: p-2026-10-20-1\n    op: add\n    text: gone\n    evidence: []\n    decision: accepted\n    assigned_id: i-0008\n",
    );
    await writeFile(
      join(t.dataDir, "kb/proposals/2026-10-24.yaml"),
      "schema: 1\nid: '2026-10-24'\nstatus: pending\nops:\n  - { op_id: p-2026-10-24-1, op: add, text: Seems to like short walks, evidence: [2026-10-22, 2026-10-23, 2026-10-24], decision: null }\n",
    );
    const g = await call(t, "GET", "/api/kb/insights");
    const put = await call(t, "PUT", "/api/kb/insights", { content: "# Insights\n- a plain bullet\n- [i-0003] one\n- [i-0003] two\n" }, { "if-match": `"${g.etag}"` });
    expect(put.status).toBe(200);
    expect((await call(t, "GET", "/api/today")).status).toBe(200);
    const p = await call(t, "GET", "/api/insights/proposals/2026-10-24");
    expect(p.status).toBe(200);
    const d = await call(t, "POST", "/api/insights/proposals/2026-10-24/decide", { decisions: [{ op_id: "p-2026-10-24-1", accept: true }] }, { "if-match": `"${p.etag}"` });
    expect(d.status).toBe(200);
    const ids = d.data.insights.items.map((i: Json) => i.id);
    const added = ids.find((id: string) => id !== "i-0003")!;
    expect(Number(added.slice(2))).toBeGreaterThan(8);
  });
});

// ---------------------------------------------------------------- economy invariant + purchase race

describe("every economy-input mutation returns economy (goal 29, architect-AC22)", () => {
  test("route table covers every mutating /api route; each response economy == GET /api/economy", async () => {
    const t = await app();
    await writeDay(t, "2026-10-20", [{ status: "done" }], 7);
    for (let i = 21; i <= 24; i++) await writeDay(t, `2026-10-${i}`, [{ status: "done", difficulty: "hard" }], 6);
    await writeFile(
      join(t.dataDir, "kb/proposals/2026-10-24.yaml"),
      "schema: 1\nid: '2026-10-24'\nstatus: pending\nops:\n  - { op_id: p-2026-10-24-1, op: add, text: Likes walks, evidence: [2026-10-22, 2026-10-23, 2026-10-24], decision: null }\n",
    );
    await writeDay(t, TODAY, []); // checked in (energy 3), no quests yet → generate is allowed
    const steps: [string, () => Promise<{ status: number; data: Json }>][] = [
      ["POST /api/today/generate", () => call(t, "POST", "/api/today/generate", {})],
      ["POST /api/today/checkin", () => call(t, "POST", "/api/today/checkin", { energy: 4 })],
      ["PATCH /api/quests/:id", async () => {
        const today = (await call(t, "GET", "/api/today")).data;
        return call(t, "PATCH", `/api/quests/${today.day.quests[0].id}`, { status: "done" });
      }],
      ["POST /api/quests/:id/reroll", async () => {
        const today = (await call(t, "GET", "/api/today")).data;
        return call(t, "POST", `/api/quests/${today.day.quests[1].id}/reroll`, {});
      }],
      ["PUT /api/days/:date/evening", async () => {
        const cur = await call(t, "GET", `/api/days/${TODAY}`);
        return call(t, "PUT", `/api/days/${TODAY}/evening`, { satisfaction: 7 }, { "if-match": `"${cur.etag}"` });
      }],
      ["PUT /api/days/:date/evening (backfill)", () => call(t, "PUT", "/api/days/2026-10-18/evening", { satisfaction: 5 }, { "if-match": "*" })],
      ["PUT /api/kb/:name", async () => {
        const g = await call(t, "GET", "/api/kb/profile");
        return call(t, "PUT", "/api/kb/profile", { content: "# Profile\nhi\n" }, { "if-match": `"${g.etag}"` });
      }],
      ["POST /api/insights/proposals/:id/decide", async () => {
        const p = await call(t, "GET", "/api/insights/proposals/2026-10-24");
        return call(t, "POST", "/api/insights/proposals/2026-10-24/decide", { decisions: [{ op_id: "p-2026-10-24-1", accept: true }] }, { "if-match": `"${p.etag}"` });
      }],
      ["POST /api/purchases", () => call(t, "POST", "/api/purchases", { item_id: "treat", request_id: crypto.randomUUID() })],
      ["POST /api/purchases/:id/void", async () => {
        const list = (await call(t, "GET", "/api/purchases")).data.purchases;
        return call(t, "POST", `/api/purchases/${list[0].id}/void`, {});
      }],
      ["PUT /api/wishlist/:item_id", () => call(t, "PUT", "/api/wishlist/treat", {})],
      ["DELETE /api/wishlist/:item_id", () => call(t, "DELETE", "/api/wishlist/treat", {})],
    ];
    const covered = new Set(steps.map(([k]) => k.replace(/ \(.*\)$/, "")));
    const mutating = new Set(
      (t.app.routes as { method: string; path: string }[])
        .filter((r) => ["POST", "PUT", "PATCH", "DELETE"].includes(r.method) && r.path.startsWith("/api/") && r.path !== "/api/*")
        .map((r) => `${r.method} ${r.path}`),
    );
    for (const r of mutating) expect([r, covered.has(r) || ECONOMY_EXEMPT_ROUTES.includes(r)]).toEqual([r, true]);
    for (const [name, run] of steps) {
      const r = await run();
      expect([name, r.status < 300]).toEqual([name, true]);
      expect([name, r.data.economy !== undefined]).toEqual([name, true]);
      await (t.app as any).jobs.idle?.();
      const e = (await call(t, "GET", "/api/economy")).data;
      expect([name, r.data.economy]).toEqual([name, e]);
    }
  }, 20_000);
});

describe("purchase race (goal 30, architect-AC23 / NIT-5)", () => {
  test("an undo that lands while the buy waits inside the lock → 409 insufficient_funds", async () => {
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const inside = new Promise<void>((r) => (entered = r));
    const gate = new Promise<void>((r) => (release = r));
    const t = await app({}, NOW, {});
    // rebuild the app with the hook (same data dir)
    const { createApp } = await import("../src/app");
    const hooked = createApp({ config: t.config, clock: t.clock, store: t.store, git: t.git, ai: null, shopHooks: { insideLock: async () => { entered(); await gate; } } });
    const h: TestApp = { ...t, app: hooked };
    // Earn exactly the treat price today, then race a buy against an undo.
    const rewards = await readFile(join(t.dataDir, "rewards.yaml"), "utf8");
    const price = Number(/id: treat[\s\S]*?price: (\d+)/.exec(rewards)![1]);
    await writeDay(h, TODAY, [{ status: "open", difficulty: "hard" }, { status: "open", difficulty: "hard" }]);
    const tr = await call(h, "GET", "/api/today");
    if (tr.status !== 200) throw new Error(JSON.stringify(tr.data));
    const today = tr.data;
    for (const q of today.day.quests) await call(h, "PATCH", `/api/quests/${q.id}`, { status: "done" });
    expect((await call(h, "GET", "/api/economy")).data.balance).toBeGreaterThanOrEqual(price);
    const buying = call(h, "POST", "/api/purchases", { item_id: "treat", request_id: crypto.randomUUID() });
    await inside;
    for (const q of today.day.quests) await call(h, "PATCH", `/api/quests/${q.id}`, { status: "open" });
    release();
    const r = await buying;
    expect(r.status).toBe(409);
    expect(r.data.error.code).toBe("insufficient_funds");
    expect((await call(h, "GET", "/api/economy")).data.balance).toBe(0);
  });
});

// ---------------------------------------------------------------- static cache policy

describe("cache headers (goal 18, architect-AC10)", () => {
  test.each([
    ["/", "no-cache"],
    ["/index.html", "no-cache"],
    ["/sw.js", "no-cache"],
    ["/manifest.webmanifest", "no-cache"],
    ["/assets/index-abc123.js", "public, max-age=31536000, immutable"],
    ["/icons/icon-192.png", "public, max-age=3600"],
    ["/decor/herb-sprig.svg", "public, max-age=3600"],
  ])("%s → %s", (p, want) => expect(cacheControlFor(p)).toBe(want));

  test("served files carry them (and /api stays no-store)", async () => {
    const dist = await mkdtemp(join(tmpdir(), "qj-dist-"));
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(join(dist, "index.html"), "<!doctype html>");
    await writeFile(join(dist, "sw.js"), "self.x=1");
    await writeFile(join(dist, "manifest.webmanifest"), "{}");
    await writeFile(join(dist, "assets/a-1.js"), "1");
    await writeFile(join(dist, "robots.txt"), "x");
    const t = await app({ SERVE_WEB: "true", WEB_DIST: dist });
    const h = async (p: string) => (await req(t.app, p)).headers;
    expect((await h("/")).get("cache-control")).toBe("no-cache");
    expect((await h("/garden")).get("cache-control")).toBe("no-cache");
    const sw = await h("/sw.js");
    expect(sw.get("cache-control")).toBe("no-cache");
    expect(sw.get("content-type")).toContain("javascript");
    expect(sw.get("service-worker-allowed")).toBe("/");
    const m = await h("/manifest.webmanifest");
    expect(m.get("cache-control")).toBe("no-cache");
    expect(m.get("content-type")).toBe("application/manifest+json");
    expect((await h("/assets/a-1.js")).get("cache-control")).toContain("immutable");
    expect((await h("/robots.txt")).get("cache-control")).toBe("public, max-age=3600");
    expect((await h("/api/economy")).get("cache-control")).toBe("no-store");
  });
});

// ---------------------------------------------------------------- bind / claude / cwd

describe("bind policy + ALLOWED_HOSTS (goal 23, architect-AC15)", () => {
  const base = async () => ({ NODE_ENV: "test", DATA_DIR: await makeTempDataDir(), TZ: "UTC", SEED_DIR });
  test("defaults stay loopback; 0.0.0.0 warns; wildcards are refused", async () => {
    const c = loadConfig(await base());
    expect([c.host, c.port]).toEqual(["127.0.0.1", 4317]);
    expect(bindWarning("127.0.0.1")).toBeNull();
    expect(bindWarning("0.0.0.0")).toContain("whole network");
    expect(bindWarning("::")).toContain("whole network");
    expect(bindWarning("192.168.1.5")).not.toBeNull();
    for (const bad of ["*.ts.net", "*", "pc.*.ts.net"]) {
      expect(async () => loadConfig({ ...(await base()), ALLOWED_HOSTS: bad })).toThrow(ConfigError);
    }
    expect(loadConfig({ ...(await base()), HOST: "0.0.0.0" }).allowedHosts).not.toContain("0.0.0.0");
  });

  test("a ts.net host is 421 until listed, then 200, and its Origin is accepted", async () => {
    const host = "pc.tail1234.ts.net";
    const a = await app();
    expect((await req(a.app, "/api/health", { headers: { host } })).status).toBe(421);
    const b = await app({ ALLOWED_HOSTS: `localhost,127.0.0.1,${host}` });
    expect((await req(b.app, "/api/health", { headers: { host } })).status).toBe(200);
    const r = await req(b.app, "/api/today/checkin", {
      method: "POST",
      headers: { host, origin: `https://${host}`, "content-type": "application/json" },
      body: JSON.stringify({ energy: 3 }),
    });
    expect(r.status).toBeLessThan(300);
  });
});

describe("claude resolution (goal 24, architect-AC17)", () => {
  test("PATH=/usr/bin + a fake HOME/.local/bin/claude resolves; nothing → null and health says claude_missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "qj-home-"));
    await mkdir(join(home, ".local/bin"), { recursive: true });
    const fake = join(home, ".local/bin/claude");
    await writeFile(fake, "#!/bin/sh\necho hi\n");
    await chmod(fake, 0o755);
    expect(resolveClaudeBin("claude", { PATH: "/usr/bin", HOME: home })).toBe(fake);
    expect(resolveClaudeBin(fake, { PATH: "", HOME: home })).toBe(fake);
    expect(resolveClaudeBin("~/.local/bin/claude", { PATH: "", HOME: home })).toBe(fake);
    const empty = await mkdtemp(join(tmpdir(), "qj-home-"));
    expect(resolveClaudeBin("claude-definitely-missing", { PATH: "/nonexistent", HOME: empty })).toBeNull();
    const t = await app({ CLAUDE_BIN: "claude-definitely-missing", PATH: "/nonexistent", HOME: empty });
    const h = (await call(t, "GET", "/api/health")).data;
    expect(h.claude.bin).toBeNull();
    expect(h.claude.reason).toBe("claude_missing");
  });
});

describe("AI cwd is private (goal 26, architect-AC19)", () => {
  test("the default cwd is not /tmp/quest-journal-ai and is mode 0700", async () => {
    const d = defaultAiCwd();
    expect(d).not.toBe(join(tmpdir(), "quest-journal-ai"));
    ensurePrivateDir(d);
    expect((await stat(d)).mode & 0o777).toBe(0o700);
    const other = join(await mkdtemp(join(tmpdir(), "qj-cwd-")), "x");
    ensurePrivateDir(other);
    expect((await stat(other)).mode & 0o777).toBe(0o700);
  });
});

// ---------------------------------------------------------------- seed:demo

describe("seed:demo (goal 27, architect-AC20, designer-AC21, psychologist-AC16)", () => {
  test("refuses: no arg, ~/quest-data, inside the repo, a non-empty dir (exit 2, nothing written)", async () => {
    expect(typeof parseSeedArgs([])).toBe("string");
    expect(await seedMain([])).toBe(2);
    expect(checkTarget(join(process.env.HOME ?? "/root", "quest-data"))).toContain("real journal");
    expect(checkTarget(join(import.meta.dir, "..", "..", "scratch-demo"))).toContain("inside the app repo");
    const full = await makeTempDataDir();
    await writeFile(join(full, "keep.txt"), "x");
    expect(await seedMain([full])).toBe(2);
    expect(await readdir(full)).toEqual(["keep.txt"]);
  });

  test("deterministic: the same --seed + --today → byte-identical files", async () => {
    const a = await makeTempDataDir();
    const b = await makeTempDataDir();
    await seedDemo({ dir: a, today: "2026-10-26", seed: 7, broken: false });
    await seedDemo({ dir: b, today: "2026-10-26", seed: 7, broken: false });
    const files = (await readdir(join(a, "days"))).sort();
    expect(files).toHaveLength(30);
    expect((await readdir(join(b, "days"))).sort()).toEqual(files);
    for (const f of files) expect(await readFile(join(a, "days", f), "utf8")).toBe(await readFile(join(b, "days", f), "utf8"));
    expect(await Bun.file(join(a, "weeks")).exists()).toBe(false);
  });

  test("the data exercises every garden state, has no care language, and /api/stats has 0 warnings", async () => {
    const plan = planDemo("2026-10-25", 7, monthBack("2026-10-26"));
    expect(plan).toHaveLength(30);
    const rated = plan.filter((d) => d.satisfaction !== null).map((d) => d.satisfaction!);
    const level = (s: number) => Math.ceil(s / 2);
    expect(new Set(rated.map(level))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(rated.filter((s) => s <= 2)).toHaveLength(1);
    expect(rated.filter((s) => s === 10)).toHaveLength(1);
    expect(plan.filter((d) => d.satisfaction === null)).toHaveLength(3);
    expect(plan.filter((d) => d.private)).toHaveLength(1);
    expect(plan.filter((d) => d.backfilled)).toHaveLength(1);
    expect(plan.filter((d) => d.quests.length === 0 && d.satisfaction !== null)).toHaveLength(1);
    expect(plan.some((d) => d.quests.length > 0 && d.quests.every((q) => q.status !== "done") && d.quests.some((q) => q.status === "partial"))).toBe(true);
    expect(plan.some((d) => d.quests.some((q) => q.status === "let_go" && q.reason))).toBe(true);
    expect(plan.some((d) => [...d.highlight].length >= 300)).toBe(true);
    expect(plan.some((d) => d.quests.some((q) => q.title.length >= 60))).toBe(true);
    const month = plan.find((d) => d.date === "2026-09-26")!;
    expect(month.highlight).not.toBe("");
    const text = JSON.stringify(plan);
    expect(/kill|suicid|self[- ]?harm|want to die|end it all/i.test(text)).toBe(false);

    const dir = await makeTempDataDir();
    await seedDemo({ dir, today: TODAY === "2026-10-25" ? "2026-10-26" : TODAY, seed: 7, broken: false });
    const t = await makeTestApp({ now: "2026-10-26T10:00:00+05:00", init: true, env: { AI_BOSS_ON_OPEN: "false" } });
    // copy the seeded days into the test app's dir (the helper owns its own temp dir)
    for (const f of await readdir(join(dir, "days"))) await writeFile(join(t.dataDir, "days", f), await readFile(join(dir, "days", f)));
    const s = (await call(t, "GET", "/api/stats")).data;
    const e = (await call(t, "GET", "/api/economy")).data;
    expect(s.warnings).toEqual([]);
    expect(s.streak).toBe(e.streak);
    expect(s.streak).toBeGreaterThanOrEqual(4);
    expect(s.this_day_last_month?.date).toBe("2026-09-26");
    const cats = s.by_category as Json[];
    expect(cats.some((c) => c.avg_satisfaction === null)).toBe(true);
    expect(cats.some((c) => c.avg_satisfaction !== null)).toBe(true);
    const states = new Set(s.heatmap.map((h: Json) => h.state));
    for (const st of ["rated", "unrated", "gap", "pending", "none"]) expect([st, states.has(st)]).toEqual([st, true]);
  });

  test("--broken adds one quarantined page (neutral in the garden)", async () => {
    const dir = await makeTempDataDir();
    const out = await seedDemo({ dir, today: "2026-10-26", seed: 7, broken: true });
    expect(out.dates).toHaveLength(31);
  });
});

// ---------------------------------------------------------------- economy pure sanity for the shared predicate

test("computeEconomy and computeStats agree on the counting predicate for a mixed fixture", () => {
  const days: DayInput[] = [
    { date: "2026-10-20", quests: [{ difficulty: "easy", status: "done" }], satisfaction: null },
    { date: "2026-10-21", quests: [], satisfaction: null, notes: "  " },
    { date: "2026-10-22", quests: [], satisfaction: null, gratitude: "tea" },
  ];
  const e = computeEconomy({ days, weeks: [], spend: { purchases: [], adjustments: [] }, broken: [], today: "2026-10-22" });
  const s = computeStats({ days: days as StatsDay[], broken: [], today: "2026-10-22", from: "2026-10-20", to: "2026-10-22", economy: e });
  expect(s.heatmap.map((h) => h.counted)).toEqual([true, false, true]);
  expect(s.heatmap.filter((h) => h.counted).length).toBe(e.days_logged);
});
