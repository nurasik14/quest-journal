/** Sprint M3 client-side pure bits + copy rules (G20–G27) and the per-quest `earned` field (G25). */
import { afterAll, describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { COPY } from "../../web/src/lib/copy";
import { toQuestView } from "../../web/src/lib/questView";
import { FALLBACK_NOTE, LOADING, STATUS } from "../../web/src/lib/theme/vocab";
import { cleanupTempDirs, makeTestApp, req } from "./helpers";

afterAll(cleanupTempDirs);
const WEB = resolve(import.meta.dir, "..", "..", "web", "src");

describe("copy (G27, designer-AC20, psychologist F table)", () => {
  test("theme copy decisions applied", () => {
    expect(LOADING.generate).toBe("Maomao is grinding herbs…");
    expect(LOADING.verySlow).toBe("Claude is slow today. If it doesn't answer, the apothecary's own shelf has backups.");
    expect(STATUS.partial.note).toBe("A smaller dose still counts.");
  });
  test("M3 strings verbatim", () => {
    expect(COPY.bossDone).toBe("Sealed for the week.");
    expect(COPY.bossSealOffer(4)).toBe("All four ticked. Seal the week?");
    expect(COPY.staleToast).toBe("Not sealed yet. This page changed elsewhere; your text is still here.");
    expect(COPY.bossProgress(1, 4)).toBe("1 of 4");
    expect(COPY.rerollEmpty).toBe("The cat couldn't find another one. This one stays.");
  });
  test("no banned words in rendered app copy (allowlist: 'Nothing was lost')", () => {
    const strings: string[] = [LOADING.generate, LOADING.reroll, LOADING.boss, LOADING.slow, LOADING.verySlow, FALLBACK_NOTE];
    for (const v of Object.values(COPY)) {
      if (typeof v === "string") strings.push(v);
      else if (typeof v === "function") {
        try {
          strings.push(String((v as (...a: unknown[]) => string)("X", 1, 2)));
        } catch {
          strings.push(String((v as (...a: unknown[]) => string)(["X"])));
        }
      }
    }
    const banned = /\b(failed|fail|missed|lost|streak broken|invalid|error|should|must|hurry|last chance)\b/i;
    for (const s of strings) expect(s.replace("Nothing was lost", "")).not.toMatch(banned);
  });
  test("AI text is never rendered as HTML: no {@html} outside comments in web/src", async () => {
    const hits: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (/\.(svelte|ts)$/.test(e.name)) {
          const text = (await readFile(p, "utf8")).replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
          if (text.includes("{@html")) hits.push(p);
        }
      }
    };
    await walk(WEB);
    expect(hits).toEqual([]);
  });
});

describe("toQuestView coins (psychologist-AC22)", () => {
  const base = { id: "x", title: "t", why: "", category: "body", difficulty: "hard", coins: 35, feedback: null, source: "ai", completed_at: null } as const;
  test("partial shows the partial tier; done/open show the tariff", () => {
    expect(toQuestView({ ...base, status: "partial", earned: 20 } as any).coins).toBe(20);
    expect(toQuestView({ ...base, status: "done", earned: 35 } as any).coins).toBe(35);
    expect(toQuestView({ ...base, status: "open", earned: 0 } as any).coins).toBe(35);
  });
});

describe("per-quest earned in the API (G25)", () => {
  test("hard partial → earned 20; sum equals earned_today", async () => {
    const t = await makeTestApp({ now: "2026-10-26T10:00:00+05:00" });
    const j = async (m: string, p: string, b?: unknown): Promise<any> => {
      const r = await req(t.app, p, { method: m, ...(b ? { headers: { "content-type": "application/json" }, body: JSON.stringify(b) } : {}) });
      return r.json();
    };
    await j("POST", "/api/today/checkin", { energy: 4 });
    const r = await j("PATCH", "/api/quests/2026-10-26-3", { status: "partial" });
    expect(r.quest.earned).toBe(20);
    await j("PATCH", "/api/quests/2026-10-26-1", { status: "done" });
    const today = await j("GET", "/api/today");
    const sum = today.day.quests.reduce((a: number, q: any) => a + q.earned, 0);
    expect(sum).toBe(30);
    expect(today.earned_today).toBe(sum);
  });
});
