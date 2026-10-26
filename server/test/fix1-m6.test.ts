/** M6 fix round 1: regression tests for docs/test-reports/2026-10-26-M6.md (MED-1, LOW-1, NIT-1…7). */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { aiStartupLine } from "../src/app";
import { canTakeFocus, FOCUSABLE_SELECTOR, focusables, trapTarget, type FocusCandidate } from "../../web/src/lib/focusTrap";
import { cleanupTempDirs, makeTempDataDir, makeTestApp, req } from "./helpers";

afterAll(cleanupTempDirs);

const ROOT = resolve(import.meta.dir, "..", "..");
const src = (p: string) => readFile(join(ROOT, p), "utf8");

/** A fake element: `fieldsetDisabled` mimics a radio inside `<fieldset disabled>` (own `.disabled` false, `:disabled` true). */
interface Fake extends FocusCandidate {
  name: string;
}
function el(name: string, o: { disabled?: boolean; fieldsetDisabled?: boolean; tabIndex?: number; hidden?: boolean; inert?: boolean } = {}): Fake {
  return {
    name,
    tabIndex: o.tabIndex ?? 0,
    matches: (sel: string) => sel === ":disabled" && Boolean(o.disabled || o.fieldsetDisabled),
    getClientRects: () => ({ length: o.hidden ? 0 : 1 }),
    closest: (sel: string) => (sel === "[inert]" && o.inert ? {} : null),
  };
}

/** The day sheet of the report: title (tabindex -1), "Write in the ledger", 10 fieldset-disabled radios, "Close". */
function daySheet() {
  const title = el("title", { tabIndex: -1 });
  const write = el("write");
  const radios = Array.from({ length: 10 }, (_, i) => el(`radio${i + 1}`, { fieldsetDisabled: true }));
  const close = el("close");
  const all = [title, write, ...radios, close];
  const order = (a: unknown, b: Fake) => all.indexOf(a as Fake) < all.indexOf(b);
  return { title, write, radios, close, all, order };
}

describe("MED-1: focus trap ignores nodes that can't take focus", () => {
  test("fieldset-disabled radios, disabled, tabindex -1, hidden and inert nodes are filtered out", () => {
    expect(canTakeFocus(el("ok"))).toBe(true);
    expect(canTakeFocus(el("r", { fieldsetDisabled: true }))).toBe(false);
    expect(canTakeFocus(el("b", { disabled: true }))).toBe(false);
    expect(canTakeFocus(el("t", { tabIndex: -1 }))).toBe(false);
    expect(canTakeFocus(el("h", { hidden: true }))).toBe(false);
    expect(canTakeFocus(el("i", { inert: true }))).toBe(false);
    const s = daySheet();
    expect(focusables(s.all).map((n) => n.name)).toEqual(["write", "close"]);
  });

  test("the report's repro: Tab from Close wraps to Write; Shift+Tab from Write wraps to Close", () => {
    const s = daySheet();
    const nodes = focusables(s.all);
    expect(trapTarget(nodes, s.close, true, false, s.order)).toBe(s.write);
    expect(trapTarget(nodes, s.write, true, true, s.order)).toBe(s.close);
    // In-between moves are left to the browser.
    expect(trapTarget(nodes, s.write, true, false, s.order)).toBeNull();
    expect(trapTarget(nodes, s.close, true, true, s.order)).toBeNull();
  });

  test("from the focused title: Tab goes on normally, Shift+Tab wraps to the last control (never leaves)", () => {
    const s = daySheet();
    const nodes = focusables(s.all);
    expect(trapTarget(nodes, s.title, true, false, s.order)).toBeNull();
    expect(trapTarget(nodes, s.title, true, true, s.order)).toBe(s.close);
  });

  test("focus outside the sheet is pulled back in; an empty sheet swallows Tab", () => {
    const s = daySheet();
    const nodes = focusables(s.all);
    const outside = el("behind");
    expect(trapTarget(nodes, outside, false, false, s.order)).toBe(s.write);
    expect(trapTarget(nodes, outside, false, true, s.order)).toBe(s.close);
    expect(trapTarget([], outside, true, false, s.order)).toBe("stay");
  });

  test("the old selector is gone: BottomSheet and Market both use the shared filter", async () => {
    for (const f of ["web/src/lib/components/BottomSheet.svelte", "web/src/routes/Market.svelte"]) {
      const s = await src(f);
      expect(s).toContain("focusables(");
      expect(s).toContain("FOCUSABLE_SELECTOR");
      expect(s).not.toContain("button:not([disabled])");
    }
    expect(FOCUSABLE_SELECTOR).toContain("input");
  });
});

describe("NIT-1: the read-only HerbRating is one image with one label", () => {
  test("role=img + aria-label when readonly; radios leave the tab order; inner parts hidden", async () => {
    const s = await src("web/src/lib/theme/HerbRating.svelte");
    expect(s).toContain("role={readonly ? 'img' : undefined}");
    expect(s).toContain("aria-label={readonly ? readonlyLabel : undefined}");
    expect(s).toContain("tabindex={readonly ? -1 : undefined}");
    expect(s).toContain('<div class="branch" aria-hidden={readonly ? \'true\' : undefined}');
    expect(s).toMatch(/`\$\{legend\}: not rated`/);
  });
});

describe("LOW-1: the About disclosure is a 44 px tap target", () => {
  test("Profile styles summary with min-height 44px", async () => {
    const s = await src("web/src/routes/Profile.svelte");
    expect(s).toMatch(/summary\s*\{[^}]*min-height:\s*44px/);
  });
});

describe("NIT-2: the AI startup line tells the truth", () => {
  const cfg = { claudeBin: "claude", claudeBinResolved: "/home/u/.local/bin/claude", aiTimeoutMs: 60000 };
  test("found / missing / off", () => {
    expect(aiStartupLine({ model: "sonnet" }, cfg)).toBe("/home/u/.local/bin/claude --model sonnet, timeout 60000 ms");
    const missing = aiStartupLine({ model: "sonnet" }, { ...cfg, claudeBinResolved: null });
    expect(missing).toContain("NOT FOUND");
    expect(missing).not.toContain("--model");
    expect(aiStartupLine(null, cfg)).toBe("off (pool only)");
  });

  test("/api/health: available=false when the binary is missing", async () => {
    const t = await makeTestApp();
    const h = (await (await req(t.app, "/api/health")).json()) as { claude: { enabled: boolean; available: boolean } };
    // test env: no runner → enabled false and available false
    expect(h.claude.available).toBe(false);
    expect(h.claude.enabled).toBe(false);
  });
});

describe("NIT-3: the README demo isn't pinned to a past date", () => {
  test("no hard-coded --today in the demo command", async () => {
    const s = await src("README.md");
    const block = s.slice(s.indexOf("## Try it with demo data"), s.indexOf("## Your data and privacy"));
    expect(block).toContain("bun run seed:demo /tmp/qj-demo --seed 1");
    expect(block).not.toMatch(/seed:demo[^\n]*--today/);
  });
});

describe("NIT-4: garden plots reach 44 px at 390", () => {
  test("label column + gaps leave ≥ 44 px per plot in the 358 px content width the tester measured", async () => {
    const s = await src("web/src/routes/Archive.svelte");
    const m = s.match(/grid-template-columns:\s*([\d.]+)rem repeat\(7, minmax\(0, 1fr\)\);\s*gap:\s*(\d+)px/);
    expect(m).not.toBeNull();
    const label = Number(m![1]) * 16;
    const gap = Number(m![2]);
    // tester: 43.6 px with 2rem + 3px ⇒ content width = 7·43.6 + 32 + 7·3 = 358.2
    const width = 7 * 43.6 + 32 + 7 * 3;
    expect((width - label - 7 * gap) / 7).toBeGreaterThanOrEqual(44);
  });
});

describe("NIT-6: the static shell honours the Host allowlist", () => {
  async function withDist(env: Record<string, string> = {}) {
    const dist = await makeTempDataDir("qj-dist-");
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(join(dist, "index.html"), "<!doctype html><title>QJ</title>");
    return makeTestApp({ env: { SERVE_WEB: "true", WEB_DIST: dist, ...env } });
  }
  test("unlisted Host → 421 plain text on / and client routes; listed → 200", async () => {
    const host = "pc.tail1234.ts.net";
    const a = await withDist();
    for (const p of ["/", "/archive", "/assets/x.js"]) {
      const r = await req(a.app, p, { headers: { host } });
      expect(r.status).toBe(421);
      expect(await r.text()).not.toContain("<title>");
    }
    expect((await req(a.app, "/")).status).toBe(200);
    const b = await withDist({ ALLOWED_HOSTS: `localhost,127.0.0.1,${host}` });
    expect((await req(b.app, "/", { headers: { host } })).status).toBe(200);
  });
});

describe("NIT-7: the user unit doesn't claim network-online.target", () => {
  test("no After=/Wants= on a system target", async () => {
    const s = await src("deploy/quest-journal.service");
    expect(s).not.toMatch(/^After=network-online\.target/m);
    expect(s).not.toMatch(/^Wants=network-online\.target/m);
    expect(s).toContain("WantedBy=default.target");
  });
});
