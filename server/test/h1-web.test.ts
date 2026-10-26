/** Hardening sprint H1: client pure bits (timeouts, SW navigation race, info lines, sheet mode) + source guards. */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Economy } from "../src/api-types";
import { COPY } from "../../web/src/lib/copy";
import { ApiError, failureCopy, GET_TIMEOUT_MS, MUTATION_TIMEOUT_MS, NetworkError, send, TimeoutError, timeoutFor } from "../../web/src/lib/http";
import { bonusMoment, infoLineFor, sealedToast, sheetMode, todayCounts, type BonusMemory } from "../../web/src/lib/ledgerRules";
import { bossFirst } from "../../web/src/lib/questView";
import { getInfoDismissed, INFO_KEY, setInfoDismissed } from "../../web/src/lib/infoDismissed";
// @ts-expect-error plain JS module shared with the service worker
import { NAV_TIMEOUT_MS, raceTimeout } from "../../web/src/sw/route.js";

const ROOT = resolve(import.meta.dir, "..", "..");
const WEB = join(ROOT, "web", "src");
const src = (p: string) => readFile(join(WEB, p), "utf8");
const noComments = (code: string) => code.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

/** A fetch that never answers on its own; it rejects only when its signal aborts (a sleeping PC over Tailscale). */
const stalledFetch = ((_: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;

// ---------------------------------------------------------------- H1-5 (#273)

describe("H1-5 request timeouts (#273)", () => {
  test("budgets: GET 10 s, mutations 20 s (PROVISIONAL)", () => {
    expect([GET_TIMEOUT_MS, MUTATION_TIMEOUT_MS]).toEqual([10_000, 20_000]);
    expect(timeoutFor("GET")).toBe(10_000);
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(timeoutFor(m)).toBe(20_000);
  });

  test("a stalled GET → TimeoutError (a NetworkError) within the budget, outcome 'unchanged', offline flagged", async () => {
    const reach: boolean[] = [];
    const t0 = performance.now();
    const err = await send("GET", "/api/today", undefined, {}, { fetch: stalledFetch, timeoutMs: 50, onReach: (ok) => reach.push(ok) }).catch((e) => e);
    const took = performance.now() - t0;
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.outcome).toBe("unchanged");
    expect(took).toBeLessThan(1000);
    expect(reach).toEqual([false]);
    expect(failureCopy(err)).toBe(COPY.saveRetry);
  });

  test("a stalled mutation → TimeoutError with outcome 'unknown' → 'may not have saved' copy (never 'Nothing was lost')", async () => {
    const err = await send("PATCH", "/api/quests/x", { status: "done" }, {}, { fetch: stalledFetch, timeoutMs: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.outcome).toBe("unknown");
    expect(failureCopy(err)).toBe(COPY.maybeSaved);
    expect(COPY.maybeSaved).not.toContain("Nothing was lost");
  });

  test("a body that stalls mid-answer is inside the same budget", async () => {
    const slowBody = ((_: string, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => new Promise<string>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
      } as unknown as Response)) as unknown as typeof fetch;
    expect(await send("GET", "/api/x", undefined, {}, { fetch: slowBody, timeoutMs: 30 }).catch((e) => e)).toBeInstanceOf(TimeoutError);
  });

  test("a refused connection → plain NetworkError (not a timeout): 'Nothing was lost' is true there", async () => {
    const refused = (() => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;
    const err = await send("POST", "/api/x", {}, {}, { fetch: refused }).catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(TimeoutError);
    expect(failureCopy(err)).toBe(COPY.saveRetry);
  });

  test("a normal answer: signal passed, ETag unquoted, reach=true; 4xx → ApiError; HTML → NetworkError", async () => {
    let signal: AbortSignal | undefined;
    const ok = ((_: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return Promise.resolve(new Response(JSON.stringify({ a: 1 }), { status: 200, headers: { ETag: 'W/"abc"' } }));
    }) as unknown as typeof fetch;
    const reach: boolean[] = [];
    const r = await send<{ a: number }>("GET", "/api/x", undefined, {}, { fetch: ok, onReach: (b) => reach.push(b) });
    expect(r).toEqual({ status: 200, data: { a: 1 }, etag: "abc" });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false); // the timer was cleared
    expect(reach).toEqual([true]);

    const bad = (() => Promise.resolve(new Response(JSON.stringify({ error: { code: "nope", message: "m" } }), { status: 409 }))) as unknown as typeof fetch;
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      expect(await send("POST", "/api/x", {}, {}, { fetch: bad }).catch((e) => e)).toMatchObject({ status: 409, code: "nope" });
      expect(await send("POST", "/api/x", {}, {}, { fetch: bad }).catch((e) => e)).toBeInstanceOf(ApiError);
    } finally {
      console.warn = origWarn;
    }
    const html = (() => Promise.resolve(new Response("<html>", { status: 502 }))) as unknown as typeof fetch;
    expect(await send("GET", "/api/x", undefined, {}, { fetch: html }).catch((e) => e)).toBeInstanceOf(NetworkError);
  });

  test("api.ts routes every request through http.send (no bare fetch left)", async () => {
    const api = noComments(await src("lib/api.ts"));
    expect(api).toContain("send<T>(method, path, body, headers");
    expect(api).not.toMatch(/\bfetch\(/);
  });
});

describe("H1-5 SW navigation: network first, cached shell after NAV_TIMEOUT_MS (#273)", () => {
  /** Manual fake timers. */
  function fakeTimers() {
    const q: { fn: () => void; at: number; id: number }[] = [];
    let now = 0;
    let next = 1;
    return {
      setTimeout: (fn: () => void, ms: number) => {
        const id = next++;
        q.push({ fn, at: now + ms, id });
        return id;
      },
      clearTimeout: (id: unknown) => {
        const i = q.findIndex((x) => x.id === id);
        if (i >= 0) q.splice(i, 1);
      },
      advance(ms: number) {
        now += ms;
        for (const t of q.filter((x) => x.at <= now)) {
          q.splice(q.indexOf(t), 1);
          t.fn();
        }
      },
      pending: () => q.length,
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
    return { promise, resolve, reject };
  }

  test("NAV_TIMEOUT_MS is 3 s", () => expect(NAV_TIMEOUT_MS).toBe(3000));

  test("the network answers in time → its answer; the timer is cleared; the cache is never read", async () => {
    const t = fakeTimers();
    const net = deferred<string>();
    let cacheReads = 0;
    const p = raceTimeout(net.promise, 3000, async () => (cacheReads++, "shell"), t);
    t.advance(2999);
    net.resolve("network");
    expect(await p).toBe("network");
    expect(cacheReads).toBe(0);
    expect(t.pending()).toBe(0);
  });

  test("the network is slower than 3 s → the cached shell", async () => {
    const t = fakeTimers();
    const net = deferred<string>();
    const p = raceTimeout(net.promise, 3000, async () => "shell", t);
    t.advance(3000);
    expect(await p).toBe("shell");
    net.resolve("late network"); // ignored
  });

  test("the network rejects → the cached shell straight away", async () => {
    const t = fakeTimers();
    const net = deferred<string>();
    const p = raceTimeout(net.promise, 3000, async () => "shell", t);
    net.reject(new TypeError("offline"));
    expect(await p).toBe("shell");
  });

  test("timeout with an EMPTY cache keeps waiting for the network (a first visit still loads)", async () => {
    const t = fakeTimers();
    const net = deferred<string>();
    const p = raceTimeout(net.promise, 3000, async () => undefined, t);
    t.advance(3000);
    await tick();
    net.resolve("network");
    expect(await p).toBe("network");
  });

  test("empty cache and the network fails → rejects (the worker then answers Response.error())", async () => {
    const t = fakeTimers();
    const net = deferred<string>();
    const p = raceTimeout(net.promise, 3000, async () => null, t);
    net.reject(new TypeError("offline"));
    expect(await p.catch((e: unknown) => e)).toBeInstanceOf(TypeError);
  });

  test("worker.js uses raceTimeout + NAV_TIMEOUT_MS for page navigations", async () => {
    const w = noComments(await src("sw/worker.js"));
    expect(w).toContain("raceTimeout(fetch(req), NAV_TIMEOUT_MS, shell)");
  });
});

// ---------------------------------------------------------------- H1-2 (#237, #228)

describe("H1-2 Today's info line (#237, #228)", () => {
  const D = "2026-10-25";
  const econ = (events: Economy["events_recent"]) => ({ events_recent: events, days_logged_month: 9 });
  const day = (over: Partial<{ quests: { status: string }[]; satisfaction: number | null; highlight: string; notes: string; gratitude: string }> = {}) => ({
    quests: [{ status: "open" }, { status: "open" }],
    satisfaction: null,
    highlight: "",
    notes: "",
    gratitude: "",
    ...over,
  });
  const herb = econ([{ date: "2026-10-24", type: "token_used" }]);
  const base = { date: D, welcomeBack: false, day: day(), econ: herb, dismissed: null };

  test("token_used yesterday → herb line with the weekday", () => {
    expect(infoLineFor(base)).toEqual({ kind: "herb", key: `${D}:herb`, text: COPY.tokenUsed("Saturday") });
  });
  test.each([
    ["one quest done", day({ quests: [{ status: "done" }] })],
    ["one quest partial", day({ quests: [{ status: "partial" }] })],
    ["a rating only", day({ satisfaction: 4 })],
    ["notes only", day({ notes: "a line" })],
    ["gratitude only", day({ gratitude: "tea" })],
  ])("hidden once today counts: %s", (_, d) => {
    expect(todayCounts(d)).toBe(true);
    expect(infoLineFor({ ...base, day: d })).toBeNull();
  });
  test("whitespace text and let-go don't count; no day → line shows", () => {
    expect(todayCounts(day({ notes: "  \n", quests: [{ status: "let_go" }] }))).toBe(false);
    expect(infoLineFor({ ...base, day: null })?.kind).toBe("herb");
  });
  test("dismissed today → hidden; a key from yesterday or another kind → shown", () => {
    expect(infoLineFor({ ...base, dismissed: `${D}:herb` })).toBeNull();
    expect(infoLineFor({ ...base, dismissed: "2026-10-24:herb" })?.kind).toBe("herb");
    expect(infoLineFor({ ...base, dismissed: `${D}:rest` })?.kind).toBe("herb");
  });
  test("welcome back wins; rest line; nothing → null; no economy → null", () => {
    expect(infoLineFor({ ...base, welcomeBack: true })?.text).toBe(COPY.welcomeBack);
    expect(infoLineFor({ ...base, econ: econ([{ date: "2026-10-24", type: "rest" }]) })?.text).toBe(COPY.streakRests(9));
    expect(infoLineFor({ ...base, econ: econ([]) })).toBeNull();
    expect(infoLineFor({ ...base, econ: null })).toBeNull();
  });
  test("an event dated two days ago is never announced", () => {
    expect(infoLineFor({ ...base, econ: econ([{ date: "2026-10-23", type: "rest" }]) })).toBeNull();
  });
  test("the dismissal key: one overwrite-only value; memory fallback when storage is missing (bun has none)", () => {
    expect(INFO_KEY).toBe("qj.infoDismissed");
    setInfoDismissed(`${D}:herb`);
    expect(getInfoDismissed()).toBe(`${D}:herb`);
    setInfoDismissed(`${D}:rest`);
    expect(getInfoDismissed()).toBe(`${D}:rest`);
  });
  test("Today renders the line from infoLineFor and Dismiss persists it (no memory-only lineSeen)", async () => {
    const today = noComments(await src("routes/Today.svelte"));
    expect(today).toContain("infoLineFor(");
    expect(today).toContain("setInfoDismissed(key)");
    expect(today).not.toContain("lineSeen");
  });
});

// ---------------------------------------------------------------- H1-8 (#227)

describe("H1-8 the Evening bonus moment (#227)", () => {
  const E = (bonus_today: number) => ({ bonus_today }) as Economy;
  test("one merged toast when the save lands the bonus; the plain toast otherwise", () => {
    expect(sealedToast(true, 25)).toBe("Sealed in the ledger. Another week in the ledger. +25 taels");
    expect(sealedToast(false, 25)).toBe(COPY.sealed);
    expect(sealedToast(true, 0)).toBe(COPY.sealed);
  });
  test("Evening's load seeds the memory; the save that lands the bonus → true once; Today's next load → false", () => {
    const mem: BonusMemory = { seeded: false, seen: new Set() };
    const D = "2026-10-25";
    expect(bonusMoment(mem, null, E(0), D)).toBe(false); // Evening load (/api/today), seeds
    expect(bonusMoment(mem, E(0), E(25), D)).toBe(true); // the rating-only save
    expect(bonusMoment(mem, E(25), E(25), D)).toBe(false); // Today loads afterwards: no replay
    expect(bonusMoment(mem, E(0), E(25), D)).toBe(false); // even after an undo + redo, once per date
  });
  test("Evening wires it: seeds from /api/today, passes today on save, shows sealedToast + the streak sticker", async () => {
    const ev = noComments(await src("routes/Evening.svelte"));
    expect(ev).toContain("setEconomy(t.data.economy, t.data.date)");
    expect(ev).toContain("setEconomy(res.data.economy, today)");
    expect(ev).toContain("showToast(sealedToast(bonus");
    expect(ev).toMatch(/<Sticker event="streak"/);
    expect(ev).not.toContain("showToast(COPY.sealed)");
  });
});

// ---------------------------------------------------------------- H1-10 (#225)

describe("H1-10 the buy sheet never offers a Buy that can only refuse (#225)", () => {
  const T = "2026-10-25";
  test.each([
    [100, 50, null, "buy"],
    [50, 50, null, "buy"],
    [49, 50, null, "save"],
    [-5, 50, null, "save"],
    [null, 50, null, "save"],
    [500, 50, "2026-10-27", "save"],
    [500, 50, "2026-10-25", "buy"],
  ] as const)("balance %p, price %p, available_on %p → %p", (bal, price, on, want) => {
    expect(sheetMode(bal, price, on, T)).toBe(want);
  });
  test("Market: the seal button only in 'buy' mode; 'save' mode's primary is Save toward / Saving toward ✓; mode fixed at open", async () => {
    const m = noComments(await src("routes/Market.svelte"));
    const buyBranch = m.indexOf("{#if mode === 'buy'}");
    const saveBranch = m.indexOf("{:else}", buyBranch);
    expect(buyBranch).toBeGreaterThan(0);
    expect(m.indexOf("qj-btn--seal", buyBranch)).toBeLessThan(saveBranch);
    expect(m.slice(saveBranch, m.indexOf("{/if}", saveBranch))).not.toContain("qj-btn--seal");
    expect(m.slice(saveBranch)).toContain("item.wished ? COPY.savingToward : COPY.saveToward");
    expect(m).toContain("mode = sheetMode(balance, i.price, i.available_on, today)");
    expect(COPY.savingToward).toBe("Saving toward this ✓");
  });
  test("Market buys through buyWithRetry (same request_id on retry)", async () => {
    expect(noComments(await src("routes/Market.svelte"))).toContain("buyWithRetry(api.buy, item.id, requestId)");
  });
});

// ---------------------------------------------------------------- H1-12 (#151)

describe("H1-12 the boss card goes first on Monday only (#151)", () => {
  test.each([
    ["Monday", true],
    ["Tuesday", false],
    ["Sunday", false],
  ] as const)("%s → %p", (d, want) => expect(bossFirst(d)).toBe(want));
});

// ---------------------------------------------------------------- H1-6 (#299)

describe("H1-6 one offline card per route (#299)", () => {
  test("OfflineCard: quiet ScrollCard + INFO banner + Try again; never error/danger styling", async () => {
    const c = noComments(await src("lib/components/OfflineCard.svelte"));
    expect(c).toContain('<ScrollCard variant="quiet"');
    expect(c).toContain("qj-banner--info");
    expect(c).not.toMatch(/qj-banner--error|--danger|role="alert"/);
    expect(c).toContain("COPY.offlineCard");
    expect(c).toContain("COPY.tryAgain");
  });
  test.each(["routes/Today.svelte", "routes/Evening.svelte", "routes/Market.svelte", "routes/Archive.svelte", "routes/Profile.svelte"])(
    "%s renders <OfflineCard> on a network failure",
    async (f) => {
      const code = noComments(await src(f));
      expect(code).toContain("import OfflineCard from");
      expect(code).toMatch(/<OfflineCard\b/);
    },
  );
  test("the garden's red 'Couldn't read the garden.' is not used for network failures", async () => {
    const a = noComments(await src("routes/Archive.svelte"));
    expect(a).toContain("{#if failed && !stats && unreachable}");
    expect(a).toContain("{#if failed && stats && !unreachable}");
  });
  test("the copy is literally true ('can't reach your laptop', not 'you're offline')", () => {
    expect(COPY.offlineCard).toBe("Can't reach your laptop right now. Your pages are safe there; they open again once it's reachable.");
    expect(COPY.offlineCard).not.toMatch(/you're offline/i);
  });
});

// ---------------------------------------------------------------- H1-3 (#266)

describe("H1-3 the month-ago card opens the read-only sheet (#266)", () => {
  test("href /archive?date=…, label 'Open that page', no /evening link from the card", async () => {
    const a = noComments(await src("routes/Archive.svelte"));
    const card = a.slice(a.indexOf("stats?.this_day_last_month"), a.indexOf("{#if sheetDate}"));
    expect(card).toContain('href="/archive?date={m.date}"');
    expect(card).not.toContain("/evening/");
    expect(card).toContain("openDay(m.date)");
    expect(COPY.gardenReadPage).toBe("Open that page");
  });
});

// ---------------------------------------------------------------- H1-7 (#316)

describe("H1-7 the Notes 412 panel is in view and the text is safe (#316)", () => {
  test("the stale panel renders ABOVE the textarea, takes focus, and stacks at ≤ 400 px with Copy primary", async () => {
    const n = await src("lib/components/NotesEditor.svelte");
    const markup = n.slice(n.indexOf("</script>"));
    expect(markup.indexOf("{#if stale}")).toBeGreaterThan(0);
    expect(markup.indexOf("{#if stale}")).toBeLessThan(markup.indexOf("<textarea"));
    expect(n).toContain("staleHeading?.focus(");
    expect(n).toContain("stalePanel?.scrollIntoView(");
    expect(n).toContain("scroll-margin-top");
    expect(n).toMatch(/@media \(max-width: 400px\)/);
    expect(markup).toMatch(/qj-btn--primary qj-btn--sm" onclick=\{\(\) => void copy\(\)\}/);
  });
  test("while stale, the sticky Save is the deliberate overwrite ('Save mine anyway')", async () => {
    const n = await src("lib/components/NotesEditor.svelte");
    expect(n).toContain("onclick={() => void save(stale)}");
    expect(n).toContain("stale ? COPY.notesOverwrite : COPY.notesSave");
    expect(COPY.notesOverwrite).toBe("Save mine anyway");
  });
  test("a dirty draft asks before unload", async () => {
    const n = noComments(await src("lib/components/NotesEditor.svelte"));
    expect(n).toContain("addEventListener('beforeunload'");
    expect(n).toMatch(/if \(!dirty\) return;/);
  });
});

// ---------------------------------------------------------------- H1-4 (#249)

describe("H1-4 garden caption (#249)", () => {
  test("no 'good days' anywhere in COPY", () => {
    expect(JSON.stringify(COPY)).not.toMatch(/good days/i);
  });
});

// ---------------------------------------------------------------- H1-13/14 (#287, #279, #283)

describe("H1-13/14 README: first install, backup, service safety", () => {
  test("the three sections exist with their key commands", async () => {
    const r = await readFile(join(ROOT, "README.md"), "utf8");
    expect(r).toContain("## First install (checklist)");
    expect(r).toContain("## Back up your journal");
    expect(r).toContain("Don't enable the unit while agent sprints are running in this checkout");
    expect(r).toContain('"available":true');
    expect(r).toContain('"source":"ai"');
    expect(r).toContain("git -C ~/quest-data push backup HEAD");
    expect(r).toMatch(/\.env\.local/);
    expect(r).not.toMatch(/push --force|push -f\b/);
  });
});
