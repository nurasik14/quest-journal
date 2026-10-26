/** Hardening sprint H1: server-side regression tests (temp DATA_DIRs only, never ~/quest-data, no claude). */
import { afterAll, describe, expect, test } from "bun:test";
import { addDays } from "../src/clock";
import { gapAhead, streakWalk, type DayInput } from "../src/economy";
import { fitsTooLong, mentionedMinutes, selectReroll } from "../src/fallback";
import { poolQuestSchema, questPoolFileSchema, type PoolQuest } from "../src/schemas";
import { monthAgoCard } from "../src/stats";
import { infoLineFor } from "../../web/src/lib/ledgerRules";
import { NetworkError, send, TimeoutError } from "../../web/src/lib/http";
import { buyWithRetry } from "../../web/src/lib/purchase";
import { cleanupTempDirs, makeTestApp, req, type TestApp } from "./helpers";

afterAll(cleanupTempDirs);

type Json = Record<string, any>;
const done = () => ({ difficulty: "easy" as const, status: "done" as const });

/** `n` consecutive counting days ending at `end` (inclusive). */
function run(end: string, n: number): DayInput[] {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(end, -(n - 1 - i)), quests: [done()], satisfaction: null }));
}

// ---------------------------------------------------------------- H1-1 (#236)

describe("H1-1 streakWalk never burns herbs on a gap it can't bridge (#236)", () => {
  const T = "2026-10-25";
  test("14 days (2 herbs) + gap 3 + 1 day → streak 1, herbs 2, no token_used", () => {
    const w = streakWalk([...run("2026-10-21", 14), ...run(T, 1)], T); // gaps 10-22..10-24
    expect(w).toMatchObject({ streak: 1, freeze_tokens: 2, longest_streak: 14 });
    expect(w.events.filter((e) => e.type === "token_used")).toHaveLength(0);
    expect(w.events.filter((e) => e.type === "rest").map((e) => e.date)).toEqual(["2026-10-22"]);
  });
  test("7 days (1 herb) + gap 2 + today → rest on the first gap day, herbs 1", () => {
    const w = streakWalk([...run("2026-10-22", 7), ...run(T, 1)], T);
    expect(w.events.map((e) => e.type)).toEqual(["bonus", "token_earned", "rest"]);
    expect(w.events.find((e) => e.type === "rest")?.date).toBe("2026-10-23");
    expect(w).toMatchObject({ streak: 1, freeze_tokens: 1 });
  });
  test("7 days + gap 1 → bridged, herbs 0 (unchanged)", () => {
    const w = streakWalk([...run("2026-10-23", 7), ...run(T, 1)], T);
    expect(w).toMatchObject({ streak: 8, freeze_tokens: 0 });
    expect(w.events.filter((e) => e.type === "token_used").map((e) => e.date)).toEqual(["2026-10-24"]);
  });
  test("14 days + gap 2 → bridged, herbs 0 (unchanged)", () => {
    const w = streakWalk([...run("2026-10-22", 14), ...run(T, 1)], T);
    expect(w).toMatchObject({ streak: 15, freeze_tokens: 0 });
  });
  test("7 days + gap 4 + today → streak 1, herbs 1, no token_used", () => {
    const w = streakWalk([...run("2026-10-20", 7), ...run(T, 1)], T);
    expect(w).toMatchObject({ streak: 1, freeze_tokens: 1 });
    expect(w.events.some((e) => e.type === "token_used")).toBe(false);
  });
  test("today = gap day 2 (not counting yet): only gap day 1 is past → bridged; the next day it flips to rest, unannounced", () => {
    const days = run("2026-10-23", 7); // gap day 1 = 10-24, today = 10-25 (gap day 2)
    const at2 = streakWalk(days, "2026-10-25");
    expect(at2).toMatchObject({ streak: 7, freeze_tokens: 0 });
    expect(at2.events.filter((e) => e.type === "token_used").map((e) => e.date)).toEqual(["2026-10-24"]);
    // A day later both gap days are past: 2 > 1 herb → rest on gap day 1, herb kept.
    const at3 = streakWalk(days, "2026-10-26");
    expect(at3).toMatchObject({ streak: 0, freeze_tokens: 1 });
    const rest = at3.events.find((e) => e.type === "rest");
    expect(rest?.date).toBe("2026-10-24");
    // Never announced: Today only reads events dated yesterday (10-25), and the rest is dated 10-24.
    expect(at3.events.filter((e) => e.date >= "2026-10-25")).toEqual([]);
  });
  test("a broken (neutral) day inside a gap is skipped, not counted: gap, broken, gap, broken = 2 real days > 1 herb → rest", () => {
    const days = [...run("2026-10-20", 7), ...run(T, 1)]; // 10-21 gap, 10-22 broken, 10-23 gap, 10-24 broken
    const w = streakWalk(days, T, { neutral: ["2026-10-22", "2026-10-24"] });
    expect(w).toMatchObject({ streak: 1, freeze_tokens: 1 });
    const one = streakWalk([...run("2026-10-22", 7), ...run(T, 1)], T, { neutral: ["2026-10-24"] }); // 1 real gap day
    expect(one).toMatchObject({ streak: 8, freeze_tokens: 0 });
  });
  test("gapAhead: past only, stops at the next counting day, skips neutral", () => {
    const counting = new Set(["2026-10-20", "2026-10-25"]);
    expect(gapAhead("2026-10-21", "2026-10-30", counting, new Set())).toBe(4);
    expect(gapAhead("2026-10-21", "2026-10-30", counting, new Set(["2026-10-22"]))).toBe(3);
    expect(gapAhead("2026-10-26", "2026-10-28", counting, new Set())).toBe(2); // today (10-28) excluded
  });
  test("deterministic: recomputing ×3 is identical", () => {
    const days = [...run("2026-10-10", 14), ...run("2026-10-18", 3), ...run(T, 2)];
    const a = streakWalk(days, T);
    expect(streakWalk(days, T)).toEqual(a);
    expect(streakWalk(days, T)).toEqual(a);
  });
});

// ---------------------------------------------------------------- shared API helpers

const NOW = "2026-10-25T09:00:00+05:00"; // logical 2026-10-25, 09:00 in Asia/Tashkent
const TODAY = "2026-10-25";

async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await req(t.app, path, init);
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as Json };
}

type QS = "open" | "done" | "partial" | "let_go";
async function writeDay(t: TestApp, date: string, statuses: QS[], extra: { satisfaction?: number } = {}) {
  const cats = ["body", "mind", "social"] as const;
  await t.store.updateDay(date, (d) => {
    d.energy = 3;
    d.quests = statuses.map((status, i) => ({
      slot: i + 1,
      title: `Quest ${date} ${i + 1} ${status}`,
      why: "",
      category: cats[i % cats.length]!,
      difficulty: "easy",
      status,
      feedback: null,
      source: "pool",
      completed_at: null,
    })) as typeof d.quests;
    if (extra.satisfaction !== undefined) d.satisfaction = extra.satisfaction;
  });
}

// ---------------------------------------------------------------- H1-2 (#237) through the API

describe("H1-2 the herb line is for the return moment (#237)", () => {
  test("token_used yesterday → line at 09:00; PATCH one quest done → gone, and still gone after reload", async () => {
    const t = await makeTestApp({ now: NOW });
    for (let i = 7; i >= 1; i--) await writeDay(t, addDays(TODAY, -(i + 1)), ["done"]); // 10-17..10-23
    // 10-24 (yesterday) not written → bridged by the herb. Today checked in with open quests.
    await writeDay(t, TODAY, ["open", "open", "open"]);
    const line = (r: Json) => infoLineFor({ date: r.date, welcomeBack: r.welcome_back === true, day: r.day, econ: r.economy, dismissed: null });

    const first = (await call(t, "GET", "/api/today")).data;
    expect(first.economy.events_recent).toContainEqual({ date: "2026-10-24", type: "token_used" });
    expect(line(first)?.kind).toBe("herb");

    const id = first.day.quests[0].id as string;
    expect((await call(t, "PATCH", `/api/quests/${encodeURIComponent(id)}`, { status: "done" })).status).toBe(200);
    const reload = (await call(t, "GET", "/api/today")).data;
    expect(line(reload)).toBeNull();
  });
});

// ---------------------------------------------------------------- H1-3 (#266)

describe("H1-3 'A month ago today' is count-up only (#266)", () => {
  test("API: a month-ago page with done + let_go + open quests → only the done one in the JSON", async () => {
    const t = await makeTestApp({ now: NOW });
    await writeDay(t, "2026-09-25", ["done", "let_go", "open"], { satisfaction: 7 });
    await writeDay(t, "2026-10-24", ["done"]);
    const r = await call(t, "GET", "/api/stats");
    expect(r.status).toBe(200);
    const m = r.data.this_day_last_month;
    expect(m.date).toBe("2026-09-25");
    expect(m.quests).toEqual([{ title: "Quest 2026-09-25 1 done", status: "done" }]);
  });
  test("pure: partial counts; only let-go/open quests + no rating + no highlight → no card", () => {
    const q = (status: QS) => ({ title: `t-${status}`, status, difficulty: "easy" as const });
    const days = [{ date: "2026-09-25", quests: [q("partial"), q("let_go")], satisfaction: null }];
    expect(monthAgoCard(days, new Set(), TODAY)?.quests).toEqual([{ title: "t-partial", status: "partial" }]);
    expect(monthAgoCard([{ date: "2026-09-25", quests: [q("let_go"), q("open")], satisfaction: null }], new Set(), TODAY)).toBeNull();
  });
});

// ---------------------------------------------------------------- H1-9 (#238)

describe("H1-9 a purchase whose answer is lost is charged once (#238, psychologist-AC19)", () => {
  async function seeded() {
    const t = await makeTestApp({ now: NOW });
    await writeDay(t, "2026-10-22", ["done", "done", "done"]);
    await writeDay(t, "2026-10-23", ["done", "done", "done"]);
    await writeDay(t, "2026-10-24", ["done", "done", "done"]);
    return t;
  }
  const activePurchases = async (t: TestApp) => ((await call(t, "GET", "/api/purchases?limit=50")).data.purchases as Json[]).filter((p) => !p.voided_at);

  test("the first POST commits but its answer is lost (network reject) → the retry sends the SAME id → 200 changed:false", async () => {
    const t = await seeded();
    const before = (await call(t, "GET", "/api/economy")).data.balance as number;
    const sent: string[] = [];
    let n = 0;
    const lossyFetch = (async (path: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).request_id);
      const res = await req(t.app, path, init); // the server really handles it (and commits)
      if (++n === 1) throw new TypeError("Failed to fetch"); // …but the phone never hears back
      return res;
    }) as unknown as typeof fetch;
    const buy = (item_id: string, request_id: string) => send<Json>("POST", "/api/purchases", { item_id, request_id }, {}, { fetch: lossyFetch });
    const rid = crypto.randomUUID();
    const res = await buyWithRetry(buy, "treat", rid);
    expect(sent).toEqual([rid, rid]);
    expect(res.status).toBe(200);
    expect(res.data.changed).toBe(false);
    expect(res.data.purchase.item_id).toBe("treat");
    expect(await activePurchases(t)).toHaveLength(1);
    expect(res.data.economy.balance).toBe(before - res.data.purchase.price); // one debit
  });

  test("the same through a timeout (the stalled answer is aborted) → same id, one debit", async () => {
    const t = await seeded();
    const sent: string[] = [];
    let n = 0;
    const stallFirst = (async (path: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).request_id);
      const res = await req(t.app, path, init);
      if (++n === 1) {
        return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }
      return res;
    }) as unknown as typeof fetch;
    const buy = (item_id: string, request_id: string) =>
      send<Json>("POST", "/api/purchases", { item_id, request_id }, {}, { fetch: stallFirst, timeoutMs: 40 });
    const rid = crypto.randomUUID();
    const res = await buyWithRetry(buy, "treat", rid);
    expect(sent).toEqual([rid, rid]);
    expect(res.data.changed).toBe(false);
    expect(await activePurchases(t)).toHaveLength(1);
  });

  test("a definite refusal (409) is never retried", async () => {
    const t = await makeTestApp({ now: NOW }); // balance 0
    let n = 0;
    const counting = (async (path: string, init: RequestInit) => {
      n++;
      return req(t.app, path, init);
    }) as unknown as typeof fetch;
    const buy = (item_id: string, request_id: string) => send<Json>("POST", "/api/purchases", { item_id, request_id }, {}, { fetch: counting });
    await expect(buyWithRetry(buy, "treat", crypto.randomUUID())).rejects.toMatchObject({ status: 409, code: "insufficient_funds" });
    expect(n).toBe(1);
  });

  test("TimeoutError is a NetworkError (every existing handler still catches it)", () => {
    expect(new TimeoutError("POST", 1)).toBeInstanceOf(NetworkError);
  });
});

// ---------------------------------------------------------------- H1-11 (#124)

describe("H1-11 a 'too long' reroll never returns something longer (#124)", () => {
  const pq = (title: string, extra: Partial<PoolQuest> = {}): PoolQuest =>
    poolQuestSchema.parse({ title, category: "mind", difficulty: "easy", ...extra });
  const base = {
    date: TODAY,
    energy: 3,
    difficulty: "easy" as const,
    rejected: { title: "Walk for 30 minutes", category: "body", minutes: 30 },
    reason: "too_long",
    others: [],
    history: [],
  };

  test.each([
    ["Study for an hour", 60],
    ["Read for 2 hours", 120],
    ["Practice 1.5 hrs", 90],
    ["Stretch for 5 minutes", 5],
    ["A 10-minute tidy", 10],
    ["Hours of fun", 60],
    ["Write one line", null],
  ] as const)("mentionedMinutes(%p) → %p", (text, want) => {
    expect(mentionedMinutes(text)).toBe(want);
  });

  test("the only candidate is 'Study for an hour' → null (the swap fails honestly)", () => {
    expect(selectReroll({ ...base, pool: [pq("Study for an hour")] })).toBeNull();
  });
  test("a short one is picked when present; 'why' counts too", () => {
    const pick = selectReroll({ ...base, pool: [pq("Study for an hour"), pq("Sketch a cup", { why: "Takes 30 minutes." }), pq("Stretch for 5 minutes")] });
    expect(pick?.title).toBe("Stretch for 5 minutes");
  });
  test("pool `minutes` is compared with the rejected quest's minutes", () => {
    expect(fitsTooLong(pq("Sketch", { minutes: 40 }), 30)).toBe(false);
    expect(fitsTooLong(pq("Sketch", { minutes: 10 }), 30)).toBe(true);
    expect(fitsTooLong(pq("Sketch"), 30)).toBe(true);
  });
  test("other reasons are unaffected", () => {
    expect(selectReroll({ ...base, reason: "not_feeling_it", pool: [pq("Study for an hour")] })?.title).toBe("Study for an hour");
  });
  test("a hand-edited out-of-range `minutes` never breaks the pool file (parsed as absent)", () => {
    const f = questPoolFileSchema.parse({ daily: [{ title: "Odd", category: "mind", difficulty: "easy", minutes: 9000 }] });
    expect(f.daily[0]?.minutes).toBeUndefined();
    expect(f.daily[0]?.title).toBe("Odd");
  });
});
