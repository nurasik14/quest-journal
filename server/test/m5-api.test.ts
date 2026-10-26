/** Sprint M5: economy, purchases, void, wishlist and streaks through the API (temp DATA_DIRs, no claude). */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDirs, makeTestApp, req, type TestApp } from "./helpers";

afterAll(cleanupTempDirs);

type Json = Record<string, any>;
const NOW = "2026-10-25T10:00:00+05:00"; // logical 2026-10-25 (Sunday), Asia/Tashkent
const TODAY = "2026-10-25";
const UUID = () => crypto.randomUUID();

async function call(t: TestApp, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { ...headers } };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await req(t.app, path, init);
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as Json, etag: res.headers.get("etag")?.replace(/"/g, "") ?? null };
}

type Q = { difficulty: "easy" | "medium" | "hard"; status: "open" | "done" | "partial" | "let_go"; coins?: number };
const CATS = ["body", "mind", "social", "creative"] as const;

async function questDay(t: TestApp, date: string, quests: Q[], extra: { satisfaction?: number; notes?: string } = {}) {
  await t.store.updateDay(date, (d) => {
    d.energy = 3;
    d.quests = quests.map((q, i) => ({
      slot: i + 1,
      title: `Quest ${date} ${i + 1}`,
      why: "",
      category: CATS[i % CATS.length]!,
      difficulty: q.difficulty,
      status: q.status,
      feedback: null,
      source: "pool",
      completed_at: null,
      ...(q.coins !== undefined ? { coins: q.coins } : {}),
    })) as typeof d.quests;
    if (extra.satisfaction !== undefined) d.satisfaction = extra.satisfaction;
    if (extra.notes !== undefined) d.notes = extra.notes;
  });
}

/** Balance 135, streak 4 (10-21..10-24), today open with 3 easy quests. */
async function seed135(t: TestApp) {
  await questDay(t, "2026-10-21", [{ difficulty: "easy", status: "done" }]);
  await questDay(t, "2026-10-22", [{ difficulty: "hard", status: "done" }]);
  await questDay(t, "2026-10-23", [{ difficulty: "hard", status: "done" }, { difficulty: "medium", status: "done" }]);
  await questDay(t, "2026-10-24", [
    { difficulty: "medium", status: "done" },
    { difficulty: "easy", status: "done" },
    { difficulty: "easy", status: "partial" },
  ]);
  await questDay(t, TODAY, [
    { difficulty: "easy", status: "open" },
    { difficulty: "medium", status: "open" },
    { difficulty: "hard", status: "open" },
  ]);
}

async function app(env: Record<string, string> = {}, now = NOW) {
  return makeTestApp({ now, env: { AI_BOSS_ON_OPEN: "false", ...env } });
}

const balance = async (t: TestApp) => (await call(t, "GET", "/api/economy")).data.balance as number | null;
const buy = (t: TestApp, item_id: string, request_id = UUID()) => call(t, "POST", "/api/purchases", { item_id, request_id });

async function gitLog(dir: string, args: string[] = ["--format=%s"]): Promise<string> {
  const p = Bun.spawn(["git", "-C", dir, "log", ...args], { stdout: "pipe", env: { PATH: process.env.PATH ?? "", HOME: dir } });
  return (await new Response(p.stdout).text()).trim();
}

describe("one balance everywhere (architect-AC1/AC13, psychologist-AC1)", () => {
  test("/api/today, /api/economy, /api/shop and a PATCH all report the same balance", async () => {
    const t = await app();
    await seed135(t);
    const today = await call(t, "GET", "/api/today");
    expect(today.status).toBe(200);
    expect(today.data.economy.balance).toBe(135);
    expect(today.data.economy.streak).toBe(4);
    expect((await call(t, "GET", "/api/economy")).data.balance).toBe(135);
    expect((await call(t, "GET", "/api/shop")).data.economy.balance).toBe(135);
    const p = await call(t, "PATCH", `/api/quests/${TODAY}-1`, { status: "done" });
    expect(p.data.changed).toBe(true);
    expect(p.data.economy.balance).toBe(145);
    expect(p.data.economy.streak).toBe(5);
    expect((await call(t, "GET", "/api/economy")).data.balance).toBe(145);
  });

  test("legacy top-level coins:/streak: keys are ignored; hand-edited quest coins 9999 → 100 + warning", async () => {
    const t = await app();
    await mkdir(join(t.dataDir, "days"), { recursive: true });
    await writeFile(
      join(t.dataDir, "days/2026-10-24.md"),
      "---\ndate: 2026-10-24\ncoins: 500\nstreak: 99\nquests:\n  - title: Hand quest\n    category: body\n    difficulty: easy\n    status: done\n    coins: 9999\n---\n",
    );
    const e = (await call(t, "GET", "/api/economy")).data;
    expect(e.earned_total).toBe(100);
    expect(e.streak).toBe(1);
    expect(e.warnings.map((w: Json) => w.code)).toContain("coins_clamped");
  });

  test("a private day earns normally; a broken day is skipped with a warning", async () => {
    const t = await app();
    await questDay(t, "2026-10-23", [{ difficulty: "easy", status: "done" }, { difficulty: "medium", status: "done" }]);
    await t.store.updateDay("2026-10-23", (d) => {
      d.private = true;
    });
    await writeFile(join(t.dataDir, "days/2026-10-24.md"), "---\ndate: 2026-10-24\nquests: [\n---\n");
    const e = (await call(t, "GET", "/api/economy")).data;
    expect(e.balance).toBe(30);
    expect(e.warnings.some((w: Json) => w.file === "days/2026-10-24.md")).toBe(true);
  });
});

describe("idempotent awards (architect-AC4, psychologist-AC3)", () => {
  test("done ×3, done→open→done, done→partial→done change the balance by the net difference only", async () => {
    const t = await app();
    await seed135(t);
    const id = `${TODAY}-3`; // hard
    const a = await call(t, "PATCH", `/api/quests/${id}`, { status: "done" });
    const b = await call(t, "PATCH", `/api/quests/${id}`, { status: "done" });
    const c = await call(t, "PATCH", `/api/quests/${id}`, { status: "done" });
    expect([a.data.changed, b.data.changed, c.data.changed]).toEqual([true, false, false]);
    expect(c.data.economy.balance).toBe(170);
    expect((await call(t, "PATCH", `/api/quests/${id}`, { status: "open" })).data.economy.balance).toBe(135);
    expect((await call(t, "PATCH", `/api/quests/${id}`, { status: "done" })).data.economy.balance).toBe(170);
    const part = await call(t, "PATCH", `/api/quests/${id}`, { status: "partial" });
    expect(part.data.quest.earned).toBe(20);
    expect(part.data.economy.balance).toBe(155);
    expect((await call(t, "PATCH", `/api/quests/${id}`, { status: "done" })).data.economy.balance).toBe(170);
  });

  test("10 concurrent PATCH done → +tariff exactly once, exactly one changed:true", async () => {
    const t = await app();
    await seed135(t);
    const rs = await Promise.all(Array.from({ length: 10 }, () => call(t, "PATCH", `/api/quests/${TODAY}-2`, { status: "done" })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(rs.filter((r) => r.data.changed).length).toBe(1);
    expect(await balance(t)).toBe(155);
  });

  test("boss: each checkpoint tick earns 15, sealing earns 100 total (bossCoinsFor)", async () => {
    const t = await app();
    await call(t, "GET", "/api/today"); // creates the week file with a pool boss
    const today = (await call(t, "GET", "/api/today")).data;
    const boss = today.week.boss;
    expect(boss.earned).toBe(0);
    const n = boss.checkpoints?.length ?? 0;
    if (n > 0) {
      const r = await call(t, "PATCH", `/api/quests/${boss.id}`, { checkpoints: [{ index: 0, done: true }] });
      expect(r.data.quest.earned).toBe(15);
      expect(r.data.economy.balance).toBe(15);
    }
    const d = await call(t, "PATCH", `/api/quests/${boss.id}`, { status: "done" });
    expect(d.data.quest.earned).toBe(100);
    expect(d.data.economy.balance).toBe(100);
  });

  test("negative balance after undo is the true number, and purchases are refused (architect-AC12)", async () => {
    const t = await app();
    await seed135(t);
    await call(t, "PATCH", `/api/quests/${TODAY}-3`, { status: "done" }); // 170
    expect((await buy(t, "cafe-meal")).status).toBe(201); // 20 left
    const r = await call(t, "PATCH", `/api/quests/${TODAY}-3`, { status: "open" });
    expect(r.data.economy.balance).toBe(-15);
    const no = await buy(t, "skip-one-chore");
    expect(no.status).toBe(409);
    expect(no.data.error.code).toBe("insufficient_funds");
  });
});

describe("streaks through the API (architect-AC5, psychologist-AC7–10)", () => {
  test("the 7th day's first done earns the bonus once; a reload doesn't add it again", async () => {
    const t = await app();
    for (const d of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]) {
      await questDay(t, d, [{ difficulty: "easy", status: "done" }]);
    }
    await questDay(t, TODAY, [{ difficulty: "easy", status: "open" }, { difficulty: "easy", status: "open" }]);
    const before = (await call(t, "GET", "/api/today")).data.economy;
    expect(before).toMatchObject({ streak: 6, bonus_today: 0, freeze_tokens: 0, balance: 60 });
    const r = await call(t, "PATCH", `/api/quests/${TODAY}-1`, { status: "done" });
    expect(r.data.economy).toMatchObject({ streak: 7, bonus_today: 25, freeze_tokens: 1, balance: 95 });
    const r2 = await call(t, "PATCH", `/api/quests/${TODAY}-2`, { status: "done" });
    expect(r2.data.economy).toMatchObject({ streak: 7, bonus_today: 25, balance: 105 });
    expect((await call(t, "GET", "/api/today")).data.economy.balance).toBe(105);
  });

  test("03:59 vs 04:00 boundary: at 03:59 the bonus belongs to the old day", async () => {
    const t = await app({}, "2026-10-26T03:59:00+05:00");
    for (const d of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]) {
      await questDay(t, d, [{ difficulty: "easy", status: "done" }]);
    }
    expect((await call(t, "GET", "/api/economy")).data).toMatchObject({ streak: 7, bonus_today: 25 });
    t.clock.set("2026-10-26T04:00:00+05:00");
    expect((await call(t, "GET", "/api/economy")).data).toMatchObject({ streak: 7, bonus_today: 0, streak_bonus_total: 25 });
  });

  test("DST (Europe/Berlin fall-back week): calendar days count, not hours", async () => {
    const t = await app({ TZ: "Europe/Berlin" }, "2026-10-27T10:00:00+01:00");
    for (const d of ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]) {
      await questDay(t, d, [{ difficulty: "easy", status: "done" }]);
    }
    expect((await call(t, "GET", "/api/economy")).data).toMatchObject({ streak: 7, bonus_today: 25, freeze_tokens: 1 });
  });

  test("welcome back after ≥2 days without a page (psychologist-AC23)", async () => {
    const t = await app();
    await questDay(t, "2026-10-21", [{ difficulty: "easy", status: "done" }]);
    expect((await call(t, "GET", "/api/today")).data.welcome_back).toBe(true);
    await questDay(t, "2026-10-23", [{ difficulty: "easy", status: "open" }]);
    expect((await call(t, "GET", "/api/today")).data.welcome_back).toBe(false);
    const fresh = await app();
    expect((await call(fresh, "GET", "/api/today")).data.welcome_back).toBe(false);
  });
});

describe("purchases (architect-AC7–AC10, psychologist-AC14/16/19)", () => {
  test("buy → 201, replay → 200 same purchase, no rewrite; conflict, unknown, insufficient, cooldown", async () => {
    const t = await app();
    await seed135(t);
    const rid = UUID();
    const a = await buy(t, "treat", rid);
    expect(a.status).toBe(201);
    expect(a.data.changed).toBe(true);
    expect(a.data.purchase).toMatchObject({ item_id: "treat", price: 50, date: TODAY, voided_at: null, voidable: true });
    expect(a.data.purchase.id).toMatch(/^p-2026-10-25-[0-9a-f]{4}$/);
    expect(a.data.economy.balance).toBe(85);
    const bytes = await readFile(join(t.dataDir, "purchases.yaml"), "utf8");
    const again = await buy(t, "treat", rid);
    expect(again.status).toBe(200);
    expect(again.data.changed).toBe(false);
    expect(again.data.purchase.id).toBe(a.data.purchase.id);
    expect(again.data.economy.balance).toBe(85);
    expect(await readFile(join(t.dataDir, "purchases.yaml"), "utf8")).toBe(bytes);
    const conflict = await buy(t, "lie-in", rid);
    expect([conflict.status, conflict.data.error.code]).toEqual([409, "request_conflict"]);
    const unknown = await buy(t, "pony");
    expect([unknown.status, unknown.data.error.code]).toEqual([409, "unknown_item"]);
    const poor = await buy(t, "cafe-meal");
    expect([poor.status, poor.data.error.code]).toEqual([409, "insufficient_funds"]);
    expect(poor.data.error.details).toEqual({ balance: 85, price: 150 });
    const cool = await buy(t, "treat");
    expect([cool.status, cool.data.error.code]).toEqual([409, "cooldown"]);
    expect(cool.data.error.details).toEqual({ available_on: "2026-10-27" });
    expect(await balance(t)).toBe(85);
  });

  test("bad bodies → 400 (non-UUID request_id, unknown keys, missing fields)", async () => {
    const t = await app();
    expect((await call(t, "POST", "/api/purchases", { item_id: "treat", request_id: "abc" })).status).toBe(400);
    expect((await call(t, "POST", "/api/purchases", { item_id: "treat", request_id: UUID(), price: 0 })).status).toBe(400);
    expect((await call(t, "POST", "/api/purchases", { item_id: "treat" })).status).toBe(400);
  });

  test("two concurrent purchases the balance covers only once → one 201, one 409", async () => {
    const t = await app();
    await questDay(t, "2026-10-23", [{ difficulty: "hard", status: "done" }, { difficulty: "hard", status: "done" }]);
    await questDay(t, "2026-10-24", [{ difficulty: "medium", status: "done" }, { difficulty: "easy", status: "done" }]);
    expect(await balance(t)).toBe(100);
    const [a, b] = await Promise.all([buy(t, "specialty-drink"), buy(t, "gaming-evening")]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.data.error.code).toBe("insufficient_funds");
    expect(await balance(t)).toBe(40);
  });

  test("a purchase at 01:30 belongs to the previous logical date (cooldown in logical days)", async () => {
    const t = await app({}, "2026-10-26T01:30:00+05:00");
    await seed135(t);
    const a = await buy(t, "treat");
    expect(a.data.purchase.date).toBe("2026-10-25");
    t.clock.set("2026-10-27T10:00:00+05:00");
    expect((await buy(t, "treat")).status).toBe(201); // 10-25 + 2 = 10-27
  });

  test("void: 404 unknown, 200 changed, 200 no-op, refunds and lifts the cooldown; 24 h window", async () => {
    const t = await app();
    await seed135(t);
    const a = await buy(t, "treat");
    expect((await call(t, "POST", "/api/purchases/p-nope/void", {})).status).toBe(404);
    const v = await call(t, "POST", `/api/purchases/${a.data.purchase.id}/void`, {});
    expect(v.status).toBe(200);
    expect(v.data.changed).toBe(true);
    expect(v.data.purchase.voided_at).toBeTruthy();
    expect(v.data.purchase.voidable).toBe(false);
    expect(v.data.economy.balance).toBe(135);
    const v2 = await call(t, "POST", `/api/purchases/${a.data.purchase.id}/void`, {});
    expect([v2.status, v2.data.changed]).toEqual([200, false]);
    const b = await buy(t, "treat"); // cooldown lifted by the void
    expect(b.status).toBe(201);
    t.clock.set("2026-10-26T10:00:01+05:00");
    const late = await call(t, "POST", `/api/purchases/${b.data.purchase.id}/void`, {});
    expect([late.status, late.data.error.code]).toEqual([409, "void_window_closed"]);
    const list = (await call(t, "GET", "/api/purchases")).data.purchases;
    expect(list).toHaveLength(2); // nothing deleted
    expect(list[0].id).toBe(b.data.purchase.id); // newest first
    expect(list[0].voidable).toBe(false);
    expect(list[1].voided_at).toBeTruthy();
  });

  test("GET /api/purchases limit: 1..200, default 50, else 400", async () => {
    const t = await app();
    for (const l of ["0", "201", "abc", "1.5", "-1"]) expect((await call(t, "GET", `/api/purchases?limit=${l}`)).status).toBe(400);
    expect((await call(t, "GET", "/api/purchases?limit=200")).status).toBe(200);
    expect((await call(t, "GET", "/api/purchases")).data).toEqual({ purchases: [] });
  });

  test("purchases.yaml stays hand-readable: block style, hand comments and unknown keys preserved", async () => {
    const t = await app();
    await seed135(t);
    await writeFile(join(t.dataDir, "purchases.yaml"), "# my spending notes\nschema: 1\nmy_key: kept\npurchases: []\n");
    await buy(t, "treat");
    await buy(t, "lie-in");
    const text = await readFile(join(t.dataDir, "purchases.yaml"), "utf8");
    expect(text).toContain("# my spending notes");
    expect(text).toContain("my_key: kept");
    expect(text).toMatch(/\n {2}- id: p-2026-10-25-[0-9a-f]{4}\n/);
    expect(text).not.toMatch(/- \{/);
    expect(text).toContain('title: "A treat: dessert, bubble tea or a favorite snack"');
  });

  test("snapshots: a later rewards.yaml price edit never rewrites history", async () => {
    const t = await app();
    await seed135(t);
    await buy(t, "treat");
    const rewards = await readFile(join(t.dataDir, "rewards.yaml"), "utf8");
    await writeFile(join(t.dataDir, "rewards.yaml"), rewards.replace("price: 50\n", "price: 75\n"));
    expect(await balance(t)).toBe(85);
    expect((await call(t, "GET", "/api/purchases")).data.purchases[0].price).toBe(50);
  });
});

describe("broken files fail safe (architect-AC11)", () => {
  test("unparseable purchases.yaml → balance null, POST 422 with raw + line, bytes untouched", async () => {
    const t = await app();
    await seed135(t);
    const broken = "schema: 1\npurchases:\n  - id: p-1\n    price: [50\n";
    await writeFile(join(t.dataDir, "purchases.yaml"), broken);
    const e = await call(t, "GET", "/api/economy");
    expect(e.data.balance).toBeNull();
    expect(e.data.earned_total).toBe(135);
    expect(e.data.warnings.some((w: Json) => w.file === "purchases.yaml")).toBe(true);
    const shop = await call(t, "GET", "/api/shop");
    expect(shop.status).toBe(200);
    expect(shop.data.purchases_error.code).toBe("unparseable_file");
    expect(shop.data.items.every((i: Json) => i.affordable === false)).toBe(true);
    const p = await buy(t, "treat");
    expect(p.status).toBe(422);
    expect(p.data.error.code).toBe("unparseable_file");
    expect(p.data.error.details.raw).toBe(broken);
    expect(typeof p.data.error.details.line).toBe("number");
    expect((await call(t, "PUT", "/api/wishlist/treat", {})).status).toBe(422);
    expect((await call(t, "GET", "/api/today")).data.economy.balance).toBeNull();
    expect(await readFile(join(t.dataDir, "purchases.yaml"), "utf8")).toBe(broken);
  });

  test("invalid purchases.yaml (bad value) → 422 invalid_file, never treated as empty", async () => {
    const t = await app();
    await seed135(t);
    await writeFile(join(t.dataDir, "purchases.yaml"), "purchases:\n  - id: p-1\n    item_id: treat\n    price: -50\n    at: x\n    date: 2026-10-24\n");
    expect(await balance(t)).toBeNull();
    const p = await buy(t, "treat");
    expect([p.status, p.data.error.code]).toEqual([422, "invalid_file"]);
  });

  test("broken rewards.yaml → GET /api/shop 422 with the raw text", async () => {
    const t = await app();
    await writeFile(join(t.dataDir, "rewards.yaml"), "rewards:\n  - id: treat\n    price: [\n");
    const r = await call(t, "GET", "/api/shop");
    expect(r.status).toBe(422);
    expect(r.data.error.details.raw).toContain("rewards:");
    expect((await call(t, "GET", "/api/economy")).status).toBe(200);
  });

  test("a missing purchases.yaml is empty (and a missing rewards.yaml is an empty shop)", async () => {
    const t = await app();
    await Bun.write(join(t.dataDir, "rewards.yaml"), "");
    const r = await call(t, "GET", "/api/shop");
    expect(r.status).toBe(200);
    expect(r.data.items).toEqual([]);
    expect(r.data.economy.balance).toBe(0);
  });
});

describe("shop + wishlist (architect-AC13, psychologist-AC13/17)", () => {
  test("items carry tier, available_on, affordable, wished; one pin; idempotent PUT/DELETE", async () => {
    const t = await app();
    await seed135(t);
    await buy(t, "treat");
    const s = (await call(t, "GET", "/api/shop")).data;
    expect(s.items).toHaveLength(15);
    const treat = s.items.find((i: Json) => i.id === "treat");
    expect(treat).toMatchObject({ tier: "small", price: 50, available_on: "2026-10-27", affordable: true, wished: false });
    expect(s.items.find((i: Json) => i.id === "manga-volume").affordable).toBe(false);
    expect(s.wishlist).toBeNull();

    const w1 = await call(t, "PUT", "/api/wishlist/manga-volume", {});
    expect([w1.status, w1.data.changed]).toEqual([200, true]);
    expect(w1.data.wishlist).toMatchObject({ item_id: "manga-volume", price: 350, have: 85, need: 265, est_days: null });
    const w2 = await call(t, "PUT", "/api/wishlist/manga-volume", {});
    expect(w2.data.changed).toBe(false);
    const w3 = await call(t, "PUT", "/api/wishlist/cafe-meal", {});
    expect(w3.data.changed).toBe(true);
    expect(w3.data.items.filter((i: Json) => i.wished).map((i: Json) => i.id)).toEqual(["cafe-meal"]);
    expect((await call(t, "PUT", "/api/wishlist/pony", {})).status).toBe(409);
    const d1 = await call(t, "DELETE", "/api/wishlist/cafe-meal", {});
    expect([d1.status, d1.data.changed, d1.data.wishlist]).toEqual([200, true, null]);
    expect((await call(t, "DELETE", "/api/wishlist/cafe-meal", {})).data.changed).toBe(false);
    expect((await call(t, "DELETE", "/api/wishlist/pony", {})).status).toBe(409);
  });

  test("pace hint only with ≥7 logged days", async () => {
    const t = await app();
    for (const d of ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]) {
      await questDay(t, d, [{ difficulty: "hard", status: "done" }]);
    }
    const w = (await call(t, "PUT", "/api/wishlist/manga-volume", {})).data.wishlist;
    // 7×35 + 25 bonus = 270 earned; need 80; 14-day pace = 270/14 ≈ 19.29 → 5 days
    expect(w).toMatchObject({ have: 270, need: 80, est_days: 5 });
  });
});

describe("invariance (architect-AC6, psychologist-AC5): text never moves coins", () => {
  test("from 135: evening saves (0 and 5k chars), profile + insights PUT, check-in → identical economy", async () => {
    const t = await app();
    await seed135(t);
    const base = (await call(t, "GET", "/api/economy")).data;
    expect(base.balance).toBe(135);
    // A rating-only save is a logged (streak) day; only the streak counters may move, never a coin field.
    const strip = (e: Json) => ({
      ...e,
      days_logged: undefined,
      days_logged_month: undefined,
      streak: undefined,
      longest_streak: undefined,
      next_bonus_in_days: undefined,
    });
    for (const notes of ["", "x".repeat(5000)]) {
      const cur = await call(t, "GET", `/api/days/2026-10-24`);
      expect((await call(t, "PUT", "/api/days/2026-10-24/evening", { notes, highlight: "h" }, { "if-match": `"${cur.etag}"` })).status).toBe(200);
      expect((await call(t, "GET", "/api/economy")).data).toEqual(base);
    }
    const prof = await call(t, "GET", "/api/kb/profile");
    expect((await call(t, "PUT", "/api/kb/profile", { content: "# Profile\n\nI like tea.\n" }, { "if-match": `"${prof.etag}"` })).status).toBe(200);
    const ins = await call(t, "GET", "/api/kb/insights");
    expect((await call(t, "PUT", "/api/kb/insights", { content: "# Insights\n\n- [i-0001] tea (evidence: 2026-10-22, 2026-10-23, 2026-10-24)\n" }, { "if-match": `"${ins.etag}"` })).status).toBe(200);
    expect((await call(t, "GET", "/api/economy")).data).toEqual(base);
    // A rating-only save on an empty past day adds a logged (streak) day but never coins.
    await call(t, "PUT", "/api/days/2026-10-20/evening", { satisfaction: 5 }, { "if-match": "*" });
    const after = (await call(t, "GET", "/api/economy")).data;
    expect(strip(after)).toEqual(strip(base));
  });
});

describe("git (architect-AC14)", () => {
  test("purchase/void/wishlist commit labels; replays never commit; a hand edit is committed first", async () => {
    const t = await app({ GIT_ENABLED: "true" });
    await seed135(t);
    t.git.touch({ kind: "day" }); // the fixture's days are written straight through the store
    await t.git.flush();
    const rid = UUID();
    const a = await buy(t, "treat", rid);
    await t.git.flush();
    expect((await gitLog(t.dataDir)).split("\n")[0]).toBe("qj: purchase treat");
    const n = (await gitLog(t.dataDir)).split("\n").length;
    await buy(t, "treat", rid);
    await t.git.flush();
    expect((await gitLog(t.dataDir)).split("\n").length).toBe(n);

    const file = join(t.dataDir, "purchases.yaml");
    await writeFile(file, (await readFile(file, "utf8")) + "# ZZHANDEDIT a note by hand\n");
    await call(t, "POST", `/api/purchases/${a.data.purchase.id}/void`, {});
    await t.git.flush();
    const log = (await gitLog(t.dataDir)).split("\n");
    expect(log[0]).toBe(`qj: void ${a.data.purchase.id}`);
    expect(await gitLog(t.dataDir, ["-p", "--format=%s", "--", "purchases.yaml"])).toContain("ZZHANDEDIT");
    expect(log[1]).toContain("hand_edit");

    await call(t, "PUT", "/api/wishlist/manga-volume", {});
    await t.git.flush();
    expect((await gitLog(t.dataDir)).split("\n")[0]).toBe("qj: wishlist");
  });
});

describe("backfilled (backlog #62)", () => {
  test("a real save on a past page writes backfilled: true once; today's page and no-op saves don't", async () => {
    const t = await app();
    const r = await call(t, "PUT", "/api/days/2026-10-22/evening", { notes: "later" }, { "if-match": "*" });
    expect(r.status).toBe(200);
    expect(await readFile(join(t.dataDir, "days/2026-10-22.md"), "utf8")).toContain("backfilled: true");
    const etag = r.etag!;
    const bytes = await readFile(join(t.dataDir, "days/2026-10-22.md"), "utf8");
    const same = await call(t, "PUT", "/api/days/2026-10-22/evening", { notes: "later" }, { "if-match": `"${etag}"` });
    expect(same.status).toBe(200);
    expect(await readFile(join(t.dataDir, "days/2026-10-22.md"), "utf8")).toBe(bytes);
    await call(t, "PUT", `/api/days/${TODAY}/evening`, { notes: "now" }, { "if-match": "*" });
    expect(await readFile(join(t.dataDir, `days/${TODAY}.md`), "utf8")).not.toContain("backfilled");
  });
});

describe("performance budget (architect-AC15)", () => {
  test("400 days + 58 weeks + 300 purchases: GET /api/today p95 < 150 ms over 20 runs", async () => {
    const t = await app();
    const days = 400;
    const start = new Date("2025-09-21T00:00:00Z");
    await mkdir(join(t.dataDir, "days"), { recursive: true });
    await mkdir(join(t.dataDir, "weeks"), { recursive: true });
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      if (d > TODAY) break;
      writes.push(
        writeFile(
          join(t.dataDir, `days/${d}.md`),
          `---\nschema: 1\ndate: ${d}\nenergy: 3\nsatisfaction: 6\nquests:\n  - id: ${d}-1\n    title: Walk\n    category: body\n    difficulty: easy\n    status: done\n    coins: 10\n  - id: ${d}-2\n    title: Read\n    category: mind\n    difficulty: medium\n    status: partial\n    coins: 20\n  - id: ${d}-3\n    title: Draw\n    category: creative\n    difficulty: hard\n    status: let_go\n    coins: 35\n---\n\n## Highlight\n\nA line.\n\n## Notes\n\n${"Some notes. ".repeat(20)}\n`,
        ),
      );
    }
    for (let w = 1; w <= 58; w++) {
      const y = w <= 52 ? 2025 : 2026;
      const n = w <= 52 ? w : w - 52;
      const id = `${y}-W${String(n).padStart(2, "0")}`;
      writes.push(writeFile(join(t.dataDir, `weeks/${id}.md`), `---\nweek: ${id}\nboss:\n  title: Boss\n  category: creative\n  status: done\n  coins: 100\n---\n`));
    }
    const lines = ["schema: 1", "purchases:"];
    for (let i = 0; i < 300; i++) {
      lines.push(`  - id: p-2025-10-01-${i.toString(16).padStart(4, "0")}`, `    item_id: treat`, `    title: Treat`, `    price: 5`, `    at: "2025-10-01T10:00:00+05:00"`, `    date: 2025-10-01`, `    voided_at: null`);
    }
    writes.push(writeFile(join(t.dataDir, "purchases.yaml"), lines.join("\n") + "\n"));
    await Promise.all(writes);
    await call(t, "GET", "/api/today"); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      const r = await call(t, "GET", "/api/today");
      times.push(performance.now() - s);
      expect(r.data.economy.balance).not.toBeNull();
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(0.95 * times.length) - 1]!;
    console.log(`[perf] GET /api/today p50=${times[10]!.toFixed(1)}ms p95=${p95.toFixed(1)}ms (n=20)`);
    expect(p95).toBeLessThan(150);
  }, 30_000);
});
