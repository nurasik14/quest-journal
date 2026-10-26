/** Sprint M5 client pure bits: copy truth table (psychologist §F), banned words, labels, bonus-once rule. */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BossJson, Economy, QuestJson } from "../src/api-types";
import { COPY, whenLabel } from "../../web/src/lib/copy";
import { bonusMoment, fmtTaels } from "../../web/src/lib/ledgerRules";
import { coinsShown } from "../../web/src/lib/questView";

const WEB = resolve(import.meta.dir, "..", "..", "web", "src");

describe("psychologist §F copy truth table (verbatim)", () => {
  test.each([
    [COPY.questDone(20), "Done. Earned 20 silver taels."],
    [COPY.questPartial(10), "+10 taels. A smaller dose still counts."],
    [COPY.bossSealed(100), "Sealed for the week. +100 taels."],
    [COPY.streakBonus(25), "Another week in the ledger. +25 taels"],
    [COPY.tokenUsed("Thursday"), "A preserved herb kept your streak on Thursday."],
    [COPY.streakRests(12), "The streak rests. 12 days logged this month."],
    [COPY.sheetHave(120, 150), "You have 120 of 150 taels."],
    [COPY.sheetCooldown("Thursday"), "Available again on Thursday."],
    [COPY.bought, "Prescribed. Take as directed."],
    [COPY.voided(150), "Put back on the shelf. 150 taels returned."],
    [COPY.unknownResult, "Couldn't reach the market. Tap again; you won't be charged twice."],
    [COPY.welcomeBack, "Welcome back. Your page is here."],
    [COPY.returnedAnnounce(150, "265"), "Returned 150 silver taels. Balance 265."],
    [COPY.wishProgress("245", 350), "245 / 350 taels"],
    [COPY.wishReady, "Ready when you are."],
  ])("%s", (got, want) => expect(got).toBe(want));
});

describe("banned words (designer-AC18, psychologist §F) in every COPY string and the Market/Today templates", () => {
  const BANNED =
    /\b(insufficient|afford\w*|debt|owe[sd]?|broke|penalt\w*|expires?|hurry|last chance|at risk|don'?t break|keep your streak|you lost|streak (?:broken|lost|reset)|are you sure|only \d+ left|good days|failed|missed|invalid|error|should|must|wrong)\b/i;
  function strings(): string[] {
    const out: string[] = [];
    for (const v of Object.values(COPY)) {
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) out.push(...v);
      else if (typeof v === "function") {
        const f = v as (...a: unknown[]) => unknown;
        for (const args of [[3, 7], ["X", 1], [["X"]]]) {
          try {
            out.push(String(f(...args)));
          } catch {
            /* other arity */
          }
        }
      } else if (v && typeof v === "object") out.push(...Object.values(v as Record<string, string>));
    }
    return out;
  }
  test("COPY", () => {
    // M6: the "no penalty" allowlist is gone (bossPaused reworded, psychologist-AC13). H1 (#249): the garden
    // caption says "Higher-rated days", so its "good days" exception is gone too: one exception left.
    for (const s of strings()) expect(s.replace("Nothing was lost", "")).not.toMatch(BANNED);
  });
  test("visible text in Market.svelte / Today.svelte templates is all from COPY (no inline banned words)", async () => {
    for (const f of ["routes/Market.svelte", "routes/Today.svelte"]) {
      const src = await readFile(resolve(WEB, f), "utf8");
      const markup = src.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "");
      expect(markup).not.toMatch(BANNED);
      expect(markup).not.toContain("{@html");
    }
  });
  test("no new hard-coded colours in Market.svelte except the wishlist gold (#c9a24a, designer-AC16)", async () => {
    const src = await readFile(resolve(WEB, "routes/Market.svelte"), "utf8");
    const hex = [...src.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
    expect(new Set(hex)).toEqual(new Set(["#c9a24a", "#fff"]));
  });
});

describe("labels and display", () => {
  test("whenLabel: weekday within 6 days, else 'd MMM'", () => {
    expect(whenLabel("2026-10-29", "2026-10-25")).toBe("Thursday");
    expect(whenLabel("2026-10-31", "2026-10-25")).toBe("Saturday");
    expect(whenLabel("2026-11-04", "2026-10-25")).toBe("4 Nov");
  });
  test("negative balances use U+2212, no other marking (designer-AC5)", () => {
    expect(fmtTaels(-20)).toBe("−20");
    expect(fmtTaels(1234)).toBe("1,234");
  });
  test("streak/herb copy never says 0 and has no empty-slot phrasing", () => {
    expect(COPY.herbs(1)).toBe("1 preserved herb");
    expect(COPY.herbs(2)).toBe("2 preserved herbs");
    expect(COPY.countUp(1, 1)).toBe("1 quest done · 1 day logged");
  });
});

describe("chip shows what a card earned (designer-AC6, psychologist-AC20)", () => {
  const q = (status: QuestJson["status"], earned: number, coins = 35): QuestJson =>
    ({ id: "x", title: "t", why: "", category: "body", difficulty: "hard", coins, status, feedback: null, source: "pool", completed_at: null, earned }) as QuestJson;
  test("hard partial → 20; open → its snapshot; boss with 1 of 4 ticked → 15; boss done → 100", () => {
    expect(coinsShown(q("partial", 20))).toBe(20);
    expect(coinsShown(q("open", 0))).toBe(35);
    expect(coinsShown(q("done", 35))).toBe(35);
    const boss = (status: BossJson["status"], earned: number) =>
      ({ id: "2026-W43-boss", title: "b", why: "", category: "creative", difficulty: "boss", coins: 100, status, feedback: null, source: "pool", completed_at: null, earned }) as BossJson;
    expect(coinsShown(boss("open", 15))).toBe(15);
    expect(coinsShown(boss("open", 0))).toBe(100);
    expect(coinsShown(boss("done", 100))).toBe(100);
  });
});

describe("bonus toast once (designer-AC8, psychologist-AC21)", () => {
  const e = (bonus: number) => ({ bonus_today: bonus }) as Economy;
  test("first load with a bonus already earned only seeds memory; a later landing toasts once", () => {
    const mem = { seeded: false, seen: new Set<string>() };
    expect(bonusMoment(mem, null, e(25), "2026-10-25")).toBe(false); // reload after earning → no toast
    expect(bonusMoment(mem, e(25), e(25), "2026-10-25")).toBe(false);
    const mem2 = { seeded: false, seen: new Set<string>() };
    expect(bonusMoment(mem2, null, e(0), "2026-10-25")).toBe(false);
    expect(bonusMoment(mem2, e(0), e(25), "2026-10-25")).toBe(true);
    expect(bonusMoment(mem2, e(25), e(25), "2026-10-25")).toBe(false);
    expect(bonusMoment(mem2, e(0), e(25), "2026-10-25")).toBe(false); // undo + redo the same day: still once
  });
});

describe("M5 fix round 1 (test report 2026-10-26-M5)", () => {
  const market = () => readFile(resolve(WEB, "routes/Market.svelte"), "utf8");
  test("LOW-3: 'Balance after' only when the purchase can happen, never negative", async () => {
    const { balanceAfterText } = await import("../../web/src/lib/ledgerRules");
    expect(balanceAfterText(455, 150)).toBe("Balance after: 305");
    expect(balanceAfterText(150, 150)).toBe("Balance after: 0");
    expect(balanceAfterText(55, 900)).toBeNull();
    expect(balanceAfterText(-20, 50)).toBeNull();
    expect(balanceAfterText(null, 50)).toBeNull();
    expect(balanceAfterText(2000, 500)).toBe("Balance after: 1,500");
  });
  test("MED-1: the Market has one live voice per coin event (badge silent, no extra live region)", async () => {
    const src = await market();
    expect(src).toContain('<BalanceBadge size="lg" announce={null} />');
    expect(src).not.toContain('aria-live="polite"');
    expect(src).not.toMatch(/spentAnnounce|returnedAnnounce/);
    expect(src).not.toMatch(/<Sticker[^>]*caption/);
  });
  test("LOW-1: the buy button never uses `disabled` (focus stays in the dialog) and the note is a status linked to it", async () => {
    const src = await market();
    const buyBtn = src.match(/<button[^>]*qj-btn--seal[^>]*>/s)?.[0] ?? "";
    expect(buyBtn).toContain("aria-disabled={buying}");
    expect(buyBtn).not.toMatch(/\sdisabled=/);
    expect(buyBtn).toContain("aria-describedby");
    expect(src).toMatch(/role="status">\{#if sheetNote\}<p class="note" id="sheet-note">/);
  });
  test("LOW-2: the sticker is not absolutely positioned over neighbouring rows", async () => {
    const src = await market();
    const css = src.match(/\.sticker \{[^}]*\}/)?.[0] ?? "";
    expect(css).not.toContain("position: absolute");
  });
  test("NIT-1: thousands separators in 'needs N more'", () => {
    expect(COPY.needsMore(fmtTaels(1045))).toBe("needs 1,045 more taels");
  });
});
