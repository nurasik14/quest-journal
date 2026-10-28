/** Sprint M6 client pure bits: request ids, service-worker routing, garden helpers, notes preview, PWA + copy guards. */
import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { HeatmapDay } from "../src/api-types";
import { COPY } from "../../web/src/lib/copy";
import { addDays, buildRows, canWrite, shownCategories, dateParam, gardenLevel, mondayIndex, plotLabel, rangeWindow } from "../../web/src/lib/garden";
import { noteBlocks, onlyHeadings } from "../../web/src/lib/notesText";
import { shouldRegister } from "../../web/src/lib/pwaRules";
import { newRequestId } from "../../web/src/lib/requestId";
// @ts-expect-error plain JS module shared with the service worker
import { cacheNames, routeFor, staleCaches } from "../../web/src/sw/route.js";

const ROOT = resolve(import.meta.dir, "..", "..");
const WEB = join(ROOT, "web", "src");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // shop.ts purchaseBody

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(ts|js|svelte)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("newRequestId (goal 22, architect-AC14, backlog MUST #245)", () => {
  test("without crypto.randomUUID (insecure origin): 1000 regex-valid v4 ids, no duplicates", () => {
    const insecure = { getRandomValues: <T extends ArrayBufferView>(a: T) => crypto.getRandomValues(a as unknown as Uint8Array) as unknown as T };
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = newRequestId(insecure);
      expect(id).toMatch(UUID);
      expect(id[14]).toBe("4");
      expect("89ab").toContain(id[19]!);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });

  test("with randomUUID removed from the real global too", () => {
    const g = globalThis.crypto as { randomUUID?: unknown };
    const saved = g.randomUUID;
    try {
      Object.defineProperty(g, "randomUUID", { value: undefined, configurable: true, writable: true });
      expect(newRequestId()).toMatch(UUID);
    } finally {
      Object.defineProperty(g, "randomUUID", { value: saved, configurable: true, writable: true });
    }
  });

  test("a throwing randomUUID falls back; a working one is used", () => {
    const c = { randomUUID: () => { throw new Error("insecure"); }, getRandomValues: <T extends ArrayBufferView>(a: T) => crypto.getRandomValues(a as unknown as Uint8Array) as unknown as T };
    expect(newRequestId(c)).toMatch(UUID);
    expect(newRequestId({ randomUUID: () => "11111111-1111-4111-8111-111111111111", getRandomValues: (a) => a })).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("grep: `randomUUID(` appears nowhere in web/src except the helper, and Market calls it inside the try", async () => {
    for (const f of await walk(WEB)) {
      if (f.endsWith("lib/requestId.ts")) continue;
      expect([f, (await readFile(f, "utf8")).includes("randomUUID(")]).toEqual([f, false]);
    }
    const market = await readFile(join(WEB, "routes/Market.svelte"), "utf8");
    const buy = market.slice(market.indexOf("async function buy()"));
    expect(buy.indexOf("try {")).toBeLessThan(buy.indexOf("newRequestId()"));
  });
});

describe("service worker routing (goal 19, architect-AC11, psychologist-AC15, designer-AC20)", () => {
  const O = "https://pc.tail1234.ts.net";
  const r = (path: string, mode = "cors", method = "GET", origin = O) => routeFor({ url: `${origin}${path}`, method, mode }, O);
  test.each([
    ["/api/today", "cors", "network"],
    ["/api/today", "navigate", "network"],
    ["/api/economy", "cors", "network"],
    ["/api", "cors", "network"],
    ["/sw.js", "cors", "network"],
    ["/assets/index-abc.js", "cors", "precache"],
    ["/", "navigate", "shell"],
    ["/archive?date=2026-10-01", "navigate", "shell"],
    ["/decor/img/band-evening.webp", "no-cors", "runtime"],
    ["/decor/herbs/licorice.webp", "no-cors", "runtime"],
    ["/stickers/manifest.json", "cors", "runtime"],
    ["/icons/icon-192.png", "cors", "runtime"],
    ["/IMAGE_SOURCES.md", "cors", "network"],
  ])("%s (%s) → %s", (p, mode, want) => expect(r(p, mode)).toBe(want));

  test("non-GET and cross-origin always go to the network", () => {
    expect(r("/assets/x.js", "cors", "POST")).toBe("network");
    expect(r("/css2?family=x", "cors", "GET", "https://fonts.googleapis.com")).toBe("network");
  });

  test("cache names carry the version; activate drops only our older caches", () => {
    expect(cacheNames("v2")).toEqual({ shell: "qj-shell-v2", runtime: "qj-runtime-v2" });
    expect(staleCaches(["qj-shell-v1", "qj-runtime-v1", "qj-shell-v2", "qj-runtime-v2", "other"], "v2")).toEqual(["qj-shell-v1", "qj-runtime-v1"]);
  });

  test("the composed worker never touches a cache for /api/* and falls back to the shell offline", async () => {
    const route = (await readFile(join(WEB, "sw/route.js"), "utf8")).replace(/^export /gm, "");
    const worker = await readFile(join(WEB, "sw/worker.js"), "utf8");
    const listeners: Record<string, (e: any) => void> = {};
    const cacheCalls: string[] = [];
    const store = new Map<string, Response>([["/index.html", new Response("<shell>")]]);
    const fakeCache = {
      match: async (k: any) => (cacheCalls.push(`match ${typeof k === "string" ? k : k.url}`), store.get(typeof k === "string" ? k : new URL(k.url).pathname)),
      put: async (k: any) => void cacheCalls.push(`put ${k.url}`),
      addAll: async (l: string[]) => void cacheCalls.push(`addAll ${l.join(",")}`),
    };
    const caches = { open: async (n: string) => (cacheCalls.push(`open ${n}`), fakeCache), keys: async () => [], delete: async () => true };
    const self = { addEventListener: (t: string, f: (e: any) => void) => (listeners[t] = f), location: { origin: O }, clients: { claim: async () => {} }, skipWaiting: () => {} };
    let online = true;
    const fetchFn = async () => {
      if (!online) throw new TypeError("offline");
      return new Response("net");
    };
    new Function("self", "caches", "fetch", "Response", `const VERSION="t";const PRECACHE=["/index.html"];\n${route}\n${worker}`)(self, caches, fetchFn, Response);
    const fire = (url: string, mode: string) => {
      let responded: Promise<Response> | null = null;
      listeners.fetch!({ request: { url: `${O}${url}`, method: "GET", mode }, respondWith: (p: Promise<Response>) => (responded = p) });
      return responded as Promise<Response> | null;
    };
    expect(fire("/api/today", "cors")).toBeNull(); // not intercepted at all
    expect(fire("/api/economy", "navigate")).toBeNull();
    expect(cacheCalls).toEqual([]);
    online = false;
    const nav = fire("/garden", "navigate");
    expect(await (await nav!).text()).toBe("<shell>");
  });

  test("registration is production-only, secure-context-only, and silent otherwise", async () => {
    expect(shouldRegister({ prod: true, secure: true, hasSw: true })).toBe(true);
    expect(shouldRegister({ prod: false, secure: true, hasSw: true })).toBe(false);
    expect(shouldRegister({ prod: true, secure: false, hasSw: true })).toBe(false); // plain http://<ip>
    expect(shouldRegister({ prod: true, secure: true, hasSw: false })).toBe(false);
    const pwa = await readFile(join(WEB, "lib/pwa.ts"), "utf8");
    expect(pwa).toContain("import.meta.env.PROD");
    expect(pwa).toContain("isSecureContext");
    expect(pwa).not.toMatch(/location\.reload\(\)\s*;?\s*$/m); // reload only inside the user's Reload tap
  });
});

describe("PWA guards (goal 21, architect-AC13, designer-AC17/18, psychologist-AC14)", () => {
  test("no push, notifications, badges or periodic sync anywhere in web/src", async () => {
    const banned = /pushManager|Notification\.requestPermission|new Notification\(|setAppBadge|periodicSync|PushSubscription/;
    for (const f of await walk(WEB)) expect([f, banned.test(await readFile(f, "utf8"))]).toEqual([f, false]);
  });

  test("manifest: names, standalone, colours, scope, original icons that exist", async () => {
    const m = JSON.parse(await readFile(join(ROOT, "web/public/manifest.webmanifest"), "utf8"));
    expect(m).toMatchObject({ name: "Quest Journal", short_name: "Quests", display: "standalone", start_url: "/", scope: "/", background_color: "#f3ead6", theme_color: "#f3ead6" });
    expect(`${m.name} ${m.short_name}`).not.toMatch(/streak|coin/i);
    const sizes = m.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const i of m.icons) {
      expect(i.src.startsWith("/icons/")).toBe(true);
      const bytes = new Uint8Array(await readFile(join(ROOT, "web/public", i.src)));
      expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
    }
    const sources = await readFile(join(ROOT, "web/public/IMAGE_SOURCES.md"), "utf8");
    expect(sources).toContain("Original artwork (committed): `web/public/icons/`");
    // icons are not gitignored (they must exist on a fresh clone)
    const gi = await readFile(join(ROOT, ".gitignore"), "utf8");
    expect(gi).not.toMatch(/icons/);
  });

  test("index.html: manifest, apple icon, two media theme-colors, settings applied before first paint", async () => {
    const html = await readFile(join(ROOT, "web/index.html"), "utf8");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('content="#f3ead6" media="(prefers-color-scheme: light)"');
    expect(html).toContain('content="#15120e" media="(prefers-color-scheme: dark)"');
    for (const k of ["qj-theme", "qj-motion", "qj-stickers"]) expect(html).toContain(k);
  });
});

describe("plain text only (goal 9, architect-AC8)", () => {
  test("no {@html} anywhere in web/src", async () => {
    for (const f of await walk(WEB)) expect([f, /\{@html\s+[^}\s]/.test(await readFile(f, "utf8"))]).toEqual([f, false]);
  });

  test("the profile preview parser makes text blocks only", () => {
    const b = noteBlocks("# Profile\n\n## Goals\n- learn <b>ML</b>\n- [link](http://x)\n\nA line\nwraps here.\n> quoted\n");
    expect(b).toEqual([
      { kind: "heading", text: "Profile" },
      { kind: "heading", text: "Goals" },
      { kind: "list", items: ["learn <b>ML</b>", "[link](http://x)"] },
      { kind: "para", text: "A line wraps here." },
      { kind: "quote", text: "quoted" },
    ]);
    expect(onlyHeadings(noteBlocks("# Profile\n\n## About me\n"))).toBe(true);
  });
});

describe("garden helpers (goals 13–17)", () => {
  const h = (date: string, state: HeatmapDay["state"], s: number | null = null): HeatmapDay => ({
    date, satisfaction: s, rated: s !== null, counted: state === "rated" || state === "unrated", broken: state === "broken", private: false, state, quests_done: 2, quests_total: 3, spent: 0,
  });

  test("levels: 1–2→1 … 9–10→5; out-of-range hand edits round then clamp", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(gardenLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect([0, -3, 11, 6.4, 6.6].map(gardenLevel)).toEqual([1, 1, 5, 3, 4]);
  });

  test("windows are whole Mon–Sun weeks ending today; rows newest first; no plot after today", () => {
    expect(mondayIndex("2026-10-26")).toBe(0); // Monday
    expect(rangeWindow("2026-10-25", "4w")).toEqual({ from: "2026-09-28", to: "2026-10-25" });
    expect(rangeWindow("2026-10-25", "3m").from).toBe(addDays("2026-10-19", -7 * 12));
    const heat = [h("2026-10-19", "rated", 7), h("2026-10-25", "pending")];
    const rows = buildRows(heat, "2026-10-21", "4w");
    expect(rows).toHaveLength(4);
    expect(rows[0]!.weekStart).toBe("2026-10-19");
    expect(rows[0]!.cells.map((c) => c.date)).toHaveLength(7);
    expect(rows[0]!.cells[0]!.day?.satisfaction).toBe(7);
    expect(rows[0]!.cells[6]!.day).toBeNull(); // after today: no plot
    expect(rows.some((r) => r.label === "Oct")).toBe(true);
    // the week of Mon 26 Oct holds Sun 1 Nov, but November hasn't started: no "Nov" label yet
    const now = buildRows([], "2026-10-26", "4w");
    expect(now[0]!.label).toBeNull();
    expect(buildRows([], "2026-11-01", "4w")[0]!.label).toBe("Nov");
  });

  test("let-go-only categories get no row (no indirect let-go tally)", () => {
    expect(shownCategories([{ done: 0, partial: 0 }, { done: 0, partial: 1 }, { done: 2, partial: 0 }])).toHaveLength(2);
  });

  test("labels never say missed or 0; gap reads 'not written'", () => {
    expect(plotLabel(h("2026-10-25", "rated", 9))).toBe("Sun 25 Oct: satisfaction 9, 2 of 3 quests");
    expect(plotLabel(h("2026-10-24", "unrated"))).toBe("Sat 24 Oct: no rating");
    expect(plotLabel(h("2026-10-23", "gap"))).toBe("Fri 23 Oct: not written");
    expect(plotLabel(h("2026-10-22", "broken"))).toBe("Thu 22 Oct: can't be read");
    expect(plotLabel(h("2026-10-25", "pending"))).toBe("Sun 25 Oct: not rated yet");
    for (const s of ["rated", "unrated", "gap", "broken", "pending"] as const) expect(plotLabel(h("2026-10-20", s, s === "rated" ? 5 : null))).not.toMatch(/missed|\b0\b/i);
  });

  test("write window and deep links", () => {
    expect([canWrite("2026-10-25", "2026-10-25"), canWrite("2026-10-23", "2026-10-25"), canWrite("2026-10-22", "2026-10-25")]).toEqual([true, true, false]);
    expect(dateParam("?date=2026-10-01")).toBe("2026-10-01");
    expect(dateParam("?date=<script>")).toBeNull();
  });
});

describe("garden + notes copy (psychologist-AC2/AC6/AC13)", () => {
  test("verbatim caption and anchors; no ranking or causal words in the garden copy", () => {
    expect(COPY.gardenCaption).toBe("Days, not causes. Higher-rated days and these quests tend to show up together; that doesn't mean one made the other."); // H1 #249
    expect(COPY.gardenAnchors).toEqual(["Worst", "Bad", "Ordinary", "Good", "Best"]);
    const garden = Object.entries(COPY)
      .filter(([k]) => k.startsWith("garden") || k.startsWith("plot"))
      .flatMap(([, v]) => (typeof v === "function" ? [String((v as (...a: unknown[]) => unknown)("X", 3, 5))] : Array.isArray(v) ? [] : [String(v)]));
    for (const s of garden) expect(s.replace(COPY.gardenCaption, "")).not.toMatch(/\b(best|worst|happiest|makes you|because of|should|fail\w*|missed|lost)\b/i);
  });

  test("carry-overs: welcome back + boss paused", () => {
    expect(COPY.welcomeBack).toBe("Welcome back. Your page is here.");
    expect(COPY.bossPaused).toBe("Paused today. It keeps.");
  });

  test("the garden never renders let-go counts; the clock line moved to Notes", async () => {
    const archive = await readFile(join(WEB, "routes/Archive.svelte"), "utf8");
    expect(archive).not.toMatch(/\.let_go/);
    expect(archive).not.toMatch(/sort\(/);
    const today = await readFile(join(WEB, "routes/Today.svelte"), "utf8");
    expect(today).not.toContain("clockLine");
    const profile = await readFile(join(WEB, "routes/Profile.svelte"), "utf8");
    expect(profile).toContain("clockLine");
    // h1 comes before the pending suggestions (closes builder #166)
    expect(profile.indexOf("<h1")).toBeLessThan(profile.indexOf("ProposalList\n") === -1 ? profile.indexOf("<ProposalList") : profile.indexOf("<ProposalList"));
  });
});
