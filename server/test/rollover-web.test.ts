/** Day rollover on an open page: the client trigger must agree with the server's logicalDate. */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { logicalDate } from "../src/clock";
import { clientLogicalDate, dayHasRolled, formatUntil, nextRolloverAt, ROLLOVER_CHECK_MS } from "../../web/src/lib/dayRollover";
import { COPY } from "../../web/src/lib/copy";

const WEB = join(resolve(import.meta.dir, "..", ".."), "web", "src");

describe("clientLogicalDate mirrors server logicalDate", () => {
  const zones = ["Asia/Hong_Kong", "Asia/Almaty", "Europe/Berlin", "America/New_York", "UTC"];
  const instants = [
    "2026-10-26T19:59:00Z", // 03:59 HKT
    "2026-10-26T20:00:00Z", // 04:00 HKT
    "2026-10-26T16:30:00Z", // 00:30 HKT (after midnight, before rollover)
    "2026-03-29T01:30:00Z", // Berlin spring-forward night
    "2026-11-01T07:30:00Z", // New York fall-back morning
    "2026-12-31T23:59:59Z",
    "2027-01-01T00:00:00Z",
  ];
  for (const tz of zones)
    for (const iso of instants)
      for (const h of [0, 4, 23])
        test(`${tz} ${iso} rollover ${h}`, () => {
          const now = new Date(iso);
          expect(clientLogicalDate(now, tz, h)).toBe(logicalDate(now, tz, h));
        });
});

describe("dayHasRolled", () => {
  const shown = { date: "2026-10-26", tz: "Asia/Hong_Kong", rollover_hour: 4 };
  test("00:45 HKT is still the 26th's page (rollover is 04:00)", () => {
    expect(dayHasRolled(shown, new Date("2026-10-27T00:45:00+08:00"))).toBe(false);
  });
  test("03:59 → same day, 04:00 → new day", () => {
    expect(dayHasRolled(shown, new Date("2026-10-27T03:59:59+08:00"))).toBe(false);
    expect(dayHasRolled(shown, new Date("2026-10-27T04:00:00+08:00"))).toBe(true);
  });
  test("no data or a bad tz never triggers (and never throws)", () => {
    expect(dayHasRolled(null, new Date())).toBe(false);
    expect(dayHasRolled({ ...shown, tz: "Not/AZone" }, new Date())).toBe(false);
  });
  test("checks once a minute", () => expect(ROLLOVER_CHECK_MS).toBe(60_000));
});

test("Today.svelte wires the rollover watcher and cleans it up", async () => {
  const s = await readFile(join(WEB, "routes/Today.svelte"), "utf8");
  expect(s).toContain("dayHasRolled(data, new Date())");
  expect(s).toMatch(/setInterval\(checkRollover, ROLLOVER_CHECK_MS\)/);
  expect(s).toContain("clearInterval(tick)");
  for (const ev of ["focus", "pageshow"]) {
    expect(s).toContain(`addEventListener('${ev}', checkRollover)`);
    expect(s).toContain(`removeEventListener('${ev}', checkRollover)`);
  }
});

describe("next-page countdown", () => {
  const at = (iso: string, tz = "Asia/Hong_Kong", h = 4) => nextRolloverAt(new Date(iso), tz, h)?.toISOString();
  test("00:45 HKT → 04:00 HKT the same morning", () => {
    expect(at("2026-10-27T00:45:00+08:00")).toBe("2026-10-26T20:00:00.000Z");
  });
  test("10:00 HKT → 04:00 HKT the next morning; exactly 04:00 → the following day", () => {
    expect(at("2026-10-27T10:00:00+08:00")).toBe("2026-10-27T20:00:00.000Z");
    expect(at("2026-10-27T04:00:00+08:00")).toBe("2026-10-27T20:00:00.000Z");
  });
  test("midnight rollover (DAY_ROLLOVER_HOUR=0)", () => {
    expect(at("2026-10-27T23:30:00+08:00", "Asia/Hong_Kong", 0)).toBe("2026-10-27T16:00:00.000Z");
  });
  test("DST: Berlin spring-forward and New York fall-back days land on local 04:00", () => {
    expect(at("2026-03-28T12:00:00+01:00", "Europe/Berlin")).toBe("2026-03-29T02:00:00.000Z"); // 04:00 CEST
    expect(at("2026-10-31T12:00:00-04:00", "America/New_York")).toBe("2026-11-01T09:00:00.000Z"); // 04:00 EST
  });
  test("agrees with the server: one second before is still today, the instant itself is the next day", () => {
    for (const iso of ["2026-10-27T00:45:00+08:00", "2026-03-28T12:00:00+01:00"]) {
      const tz = iso.endsWith("+08:00") ? "Asia/Hong_Kong" : "Europe/Berlin";
      const now = new Date(iso);
      const t = nextRolloverAt(now, tz, 4)!;
      expect(logicalDate(new Date(t.getTime() - 1000), tz, 4)).toBe(logicalDate(now, tz, 4));
      expect(logicalDate(t, tz, 4)).not.toBe(logicalDate(now, tz, 4));
    }
  });
  test("bad tz → null", () => expect(nextRolloverAt(new Date(), "Not/AZone", 4)).toBeNull());
  test("formatUntil counts down to the second (hh:mm:ss, rounded up)", () => {
    expect(formatUntil(30_000)).toBe("00:00:30");
    expect(formatUntil(400)).toBe("00:00:01");
    expect(formatUntil(0)).toBe("00:00:00");
    expect(formatUntil(-5_000)).toBe("00:00:00");
    expect(formatUntil(45 * 60_000 + 59_000)).toBe("00:45:59");
    expect(formatUntil(3 * 3_600_000)).toBe("03:00:00");
    expect(formatUntil(3 * 3_600_000 + 12 * 60_000 + 5_000)).toBe("03:12:05");
    expect(formatUntil(24 * 3_600_000)).toBe("24:00:00");
  });
  test("copy", () => expect(COPY.countdownLine(4, "03:12:05")).toBe("Fresh page at 04:00 · in 03:12:05"));
});
