/** H1 fix round: regression tests for docs/test-reports/2026-10-26-H1.md (MED-1, LOW-1, LOW-2, NIT-1..3). */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RawResult } from "../src/ai";
import { createJobs } from "../src/jobs";
import { DIFFICULTIES } from "../src/domain";
import { estimateMinutes, fitsTooLong, mentionedMinutes, selectReroll } from "../src/fallback";
import { parseYamlText } from "../src/markdown";
import { validateReroll } from "../src/quest-rules";
import { poolQuestSchema, questPoolFileSchema, type PoolQuest } from "../src/schemas";
import { send } from "../../web/src/lib/http";
import { getInfoDismissed, INFO_KEY, setInfoDismissed } from "../../web/src/lib/infoDismissed";
import { cleanupTempDirs, envelope, makeTestApp, req, scriptedRunner, SEED_DIR, VALID_BOSS, VALID_DAY, type TestApp } from "./helpers";

afterAll(cleanupTempDirs);

type Json = Record<string, any>;
const WEB = resolve(import.meta.dir, "..", "..", "web", "src");
const src = (p: string) => readFile(join(WEB, p), "utf8");
const seedPool = questPoolFileSchema.parse(parseYamlText(await readFile(join(SEED_DIR, "quests.yaml"), "utf8")));
const pq = (title: string, extra: Partial<PoolQuest> = {}): PoolQuest =>
  poolQuestSchema.parse({ title, category: "mind", difficulty: "easy", ...extra });

// ---------------------------------------------------------------- MED-1

describe("MED-1 Notes 412 panel: heading on top, actions full-width under it", () => {
  test("the .stale panel itself is a column (the .qj-banner row flexbox put the actions in an 80 px column)", async () => {
    const n = await src("lib/components/NotesEditor.svelte");
    const style = n.slice(n.indexOf("<style>"));
    // The base `.stale {` rule (outside any @media) overrides the banner's row direction.
    const base = /\n  \.stale \{([^}]*)\}/.exec(style)?.[1] ?? "";
    expect(base).toContain("flex-direction: column");
    expect(base).toContain("align-items: stretch");
    // ≤ 400 px: the buttons stack and fill the width.
    const narrow = style.slice(style.indexOf("@media (max-width: 400px)"));
    expect(narrow).toMatch(/\.stale \.row \{[^}]*flex-direction: column/);
    expect(narrow).toMatch(/\.stale \.row :global\(\.qj-btn\) \{[^}]*width: 100%/);
  });
});

// ---------------------------------------------------------------- LOW-1

describe("LOW-1 a 'too long' swap is genuinely shorter", () => {
  test.each([
    ["Do 4 Pomodoros (25/5) on the course you're avoiding most", 120],
    ["One pomodoro on the essay", 30],
    ["Watch a 2h film", 120],
    ["Code for 1.5h", 90],
    ["Spend an afternoon exploring a district you've never been to", 180],
    ["One evening fully off", 180],
    ["Half a day in the library", 240],
    ["A day trip to the mountains", 480],
    ["Spend all day outside", 480],
    ["Call a family member and talk for 10+ minutes", 10],
    ["Take 5 photos on one theme", null],
    ["Move 20+ minutes before 10:00 (morning 1)", 20],
    ["Stretch for 5 minutes, then read for an hour", 60],
  ] as const)("mentionedMinutes(%p) → %p", (text, want) => {
    expect(mentionedMinutes(text)).toBe(want);
  });

  test("the seed pool now carries honest `minutes` (only the rest day is unknown)", () => {
    const missing = seedPool.daily.filter((q) => q.minutes === undefined).map((q) => q.id);
    expect(missing).toEqual(["care-rest-day"]);
    expect(seedPool.daily.find((q) => q.id === "mind-pomodoro-4")?.minutes).toBe(120);
    expect(seedPool.daily.find((q) => q.id === "adv-new-district")?.minutes).toBe(180);
    expect(seedPool.daily.find((q) => q.id === "mind-deep-work-2h")?.minutes).toBe(120);
  });

  test("the text counts even when `minutes` is set: a hand-entered 15 never makes 'Study for an hour' short", () => {
    expect(estimateMinutes({ title: "Study for an hour", minutes: 15 })).toBe(60);
    expect(estimateMinutes({ title: "Sketch", why: "Takes 30 minutes.", minutes: 10 })).toBe(30);
    expect(estimateMinutes({ title: "Sketch", minutes: 10 })).toBe(10);
    expect(estimateMinutes({ title: "Sketch" })).toBeNull();
  });

  test("tester's repro (pure): 'Sketch one object on your desk' 30 min → never the Pomodoros, on any date", () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-11-${String(d).padStart(2, "0")}`;
      const pick = selectReroll({
        pool: seedPool.daily,
        date,
        energy: 3,
        difficulty: "medium",
        rejected: { title: "Sketch one object on your desk", category: "creative", minutes: 30 },
        reason: "too_long",
        others: [
          { title: "Stretch for ten minutes by the window", category: "body" },
          { title: "Message a classmate about a study session", category: "social" },
        ],
        history: [],
      });
      if (pick) expect(estimateMinutes(pick) ?? 0).toBeLessThan(30);
    }
  });

  test("exhaustive over the seed pool: every 'too long' pick is strictly shorter than the quest it replaces", () => {
    let picks = 0;
    for (const rej of seedPool.daily) {
      const rejMin = estimateMinutes(rej);
      for (const d of DIFFICULTIES) {
        for (let k = 0; k < 6; k++) {
          const pick = selectReroll({
            pool: seedPool.daily,
            date: `2026-12-0${k + 1}`,
            energy: 3,
            difficulty: d,
            rejected: { title: rej.title, category: rej.category, minutes: rejMin ?? undefined },
            reason: "too_long",
            others: [],
            history: [],
          });
          if (!pick) continue;
          picks++;
          const est = estimateMinutes(pick);
          if (rejMin !== null && est !== null) expect(est).toBeLessThan(rejMin);
          if (rejMin === null) expect(est === null || est < 10).toBe(true);
        }
      }
    }
    expect(picks).toBeGreaterThan(0); // the filter doesn't just refuse everything
  });

  test("AI path: a reply that claims 20 minutes for 'Do 4 Pomodoros' is a too_long violation", () => {
    const q = { title: "Do 4 Pomodoros on the essay", why: "Bitter medicine.", category: "mind", difficulty: "medium", minutes: 20, cost: "free", done_when: "Four done" } as const;
    const ctx = {
      energy: 3,
      difficulty: "medium" as const,
      rejected: { title: "Sketch one object on your desk", category: "creative", minutes: 30 },
      reason: "too_long" as const,
      others: [],
      recentTitles: [],
    };
    expect(validateReroll({ quests: [q as any] }, ctx).violations).toContain("too_long");
    expect(validateReroll({ quests: [{ ...q, title: "Write three lines on the essay" } as any] }, ctx).violations).not.toContain("too_long");
  });

  // Live repro through the API: AI day, then the AI fails so the pool path runs.
  const exit3: RawResult = { type: "exit", exitCode: 3, stdout: "", stderr: "boom", durationMs: 1 };
  async function call(t: TestApp, method: string, path: string, body?: unknown) {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await req(t.app, path, init);
    return { status: res.status, data: (await res.json()) as Json };
  }

  test("API: too_long on a 30-min AI quest via the pool → a shorter quest or an honest 'nothing fits' (swap not used)", async () => {
    let i = 0;
    const runner = scriptedRunner([
      async (r) => (r.kind === "generate_boss" ? envelope(VALID_BOSS) : i++ === 0 ? envelope(VALID_DAY) : exit3),
    ]);
    const t = await makeTestApp({ now: "2026-10-26T10:00:00+05:00", ai: runner });
    const jobs = (t.app as any).jobs as ReturnType<typeof createJobs>;
    await call(t, "POST", "/api/today/checkin", { energy: 3 });
    await jobs.idle();
    const r = await call(t, "POST", "/api/quests/2026-10-26-2/reroll", { reason: "too_long" });
    await jobs.idle();
    const after = (await call(t, "GET", "/api/today")).data;
    const swapped = after.day.quests.find((q: Json) => q.slot === 2);
    if (r.status === 202 && swapped.id !== "2026-10-26-2") {
      expect(swapped.title).not.toMatch(/pomodoro/i);
      expect(estimateMinutes(swapped) ?? 0).toBeLessThan(30);
    } else {
      // Nothing in the pool is shorter at this difficulty: the swap fails and is not consumed.
      expect(swapped.id).toBe("2026-10-26-2");
      expect(after.day.rerolls_used).toBe(0);
    }
  });

  test("the rejected quest's length also comes from its text when `minutes` is missing", async () => {
    const g = await readFile(resolve(import.meta.dir, "..", "src", "generation.ts"), "utf8");
    expect(g).toContain("const rejectedMinutes = estimateMinutes(target);");
    // Pure consequence: 'Study for an hour' rejected (no field) → a 45-min candidate is shorter, a 2-hour one isn't.
    const rejMin = estimateMinutes({ title: "Study for an hour" }) ?? undefined;
    expect(fitsTooLong(pq("Kaggle", { minutes: 45 }), rejMin)).toBe(true);
    expect(fitsTooLong(pq("Deep work", { minutes: 120 }), rejMin)).toBe(false);
  });
});

// ---------------------------------------------------------------- LOW-2

describe("LOW-2 fitsTooLong compares minutes only when both are known", () => {
  test("rejected length unknown → a candidate known to take ≥ 10 minutes is excluded (field or text)", () => {
    expect(fitsTooLong({ title: "Study for an hour", why: "", minutes: 60 }, undefined)).toBe(false);
    expect(fitsTooLong({ title: "Deep clean the flat", why: "", minutes: 90 }, undefined)).toBe(false);
    expect(fitsTooLong({ title: "Study for an hour", why: "" }, undefined)).toBe(false);
    expect(fitsTooLong({ title: "Drink a glass of water", why: "", minutes: 2 }, undefined)).toBe(true);
    expect(fitsTooLong({ title: "Write one line", why: "" }, undefined)).toBe(true);
  });
  test("both known → strictly shorter", () => {
    expect(fitsTooLong({ title: "Sketch", why: "", minutes: 30 }, 30)).toBe(false);
    expect(fitsTooLong({ title: "Sketch", why: "", minutes: 29 }, 30)).toBe(true);
    expect(fitsTooLong({ title: "Do 4 Pomodoros", why: "", minutes: 20 }, 30)).toBe(false);
  });
});

// ---------------------------------------------------------------- NITs

describe("NIT-1 the cooldown/unaffordable sheet shows no 'Balance after'", () => {
  test("the balance-after line is rendered only in buy mode", async () => {
    const m = await src("routes/Market.svelte");
    expect(m).toContain("{#if after && mode === 'buy'}");
    expect(m).not.toMatch(/\{#if after\}/);
  });
});

describe("NIT-2 a timed-out mutation doesn't raise the 'Nothing was lost' banner", () => {
  const stalled = ((_: string, init: RequestInit) =>
    new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
  const refused = (() => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;

  test("mutation timeout → onReach not called; GET timeout and a refused mutation still flag offline", async () => {
    const m: boolean[] = [];
    await send("PATCH", "/api/quests/x", { status: "done" }, {}, { fetch: stalled, timeoutMs: 20, onReach: (b) => m.push(b) }).catch(() => {});
    expect(m).toEqual([]);
    const g: boolean[] = [];
    await send("GET", "/api/today", undefined, {}, { fetch: stalled, timeoutMs: 20, onReach: (b) => g.push(b) }).catch(() => {});
    expect(g).toEqual([false]);
    const p: boolean[] = [];
    await send("POST", "/api/x", {}, {}, { fetch: refused, onReach: (b) => p.push(b) }).catch(() => {});
    expect(p).toEqual([false]);
  });
});

describe("NIT-3 infoDismissed: this page's write wins over stale storage", () => {
  const g = globalThis as { localStorage?: unknown };
  afterEach(() => {
    delete g.localStorage;
  });
  test("setItem throws (quota) while yesterday's value is stored → today's value is returned", () => {
    const store = new Map<string, string>([[INFO_KEY, "2026-10-25:herb"]]);
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    setInfoDismissed("2026-10-26:herb");
    expect(getInfoDismissed()).toBe("2026-10-26:herb");
  });
});

describe("NIT-4 standalone text links get a ≥ 44 px tap height", () => {
  test("the theme has .qj-textlink (min-height --tap-min) and Today/Evening use it", async () => {
    const tokens = await src("lib/theme/tokens.css");
    expect(tokens).toMatch(/\.qj-textlink \{[^}]*min-height: var\(--tap-min\)/);
    expect(await src("routes/Today.svelte")).toContain('<a class="qj-textlink" href="/onboarding">');
    const ev = await src("routes/Evening.svelte");
    expect(ev).toContain("{COPY.yesterdayLink}");
    expect(ev.match(/<a class="qj-textlink"/g)?.length).toBe(2);
  });
});
