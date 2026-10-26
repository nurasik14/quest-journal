import { describe, expect, test } from "bun:test";
import { addDays, isoWeek, isoWithOffset, isValidDate, isValidWeek, logicalDate, weekdayName } from "../src/clock";

const TZ = "Asia/Tashkent"; // UTC+5, no DST

describe("logicalDate (architect-AC5)", () => {
  test("03:59 local belongs to the previous day, 04:00 starts the new one", () => {
    expect(logicalDate(new Date("2026-10-26T03:59:00+05:00"), TZ, 4)).toBe("2026-10-25");
    expect(logicalDate(new Date("2026-10-26T04:00:00+05:00"), TZ, 4)).toBe("2026-10-26");
    expect(logicalDate(new Date("2026-10-26T01:30:00+05:00"), TZ, 4)).toBe("2026-10-25");
  });

  test("uses the configured zone, not the process zone", () => {
    const instant = new Date("2026-10-25T21:00:00Z"); // 02:00 Tashkent on the 26th, 17:00 New York on the 25th
    expect(logicalDate(instant, TZ, 0)).toBe("2026-10-26");
    expect(logicalDate(instant, "America/New_York", 0)).toBe("2026-10-25");
    expect(logicalDate(instant, "Pacific/Kiritimati", 0)).toBe("2026-10-26");
  });

  test("rollover 0 is plain local date", () => {
    expect(logicalDate(new Date("2026-10-25T00:00:00+05:00"), TZ, 0)).toBe("2026-10-25");
  });
});

describe("isoWeek (architect-AC5)", () => {
  test("year boundary: 2026 has 53 ISO weeks", () => {
    expect(isoWeek("2026-12-31")).toBe("2026-W53");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
    expect(isoWeek("2026-10-25")).toBe("2026-W43");
    expect(isoWeek("2026-10-26")).toBe("2026-W44");
    expect(isoWeek("2025-12-29")).toBe("2026-W01");
  });
  test("isValidWeek knows week 53 only exists in long years", () => {
    expect(isValidWeek("2026-W53")).toBe(true);
    expect(isValidWeek("2027-W53")).toBe(false);
    expect(isValidWeek("2026-W00")).toBe(false);
    expect(isValidWeek("2026-43")).toBe(false);
  });
});

describe("date helpers", () => {
  test("isValidDate rejects impossible dates", () => {
    expect(isValidDate("2026-10-25")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("../etc")).toBe(false);
    expect(isValidDate("2026-10-25x")).toBe(false);
  });
  test("isoWithOffset includes the zone offset", () => {
    expect(isoWithOffset(new Date("2026-10-25T14:02:11Z"), TZ)).toBe("2026-10-25T19:02:11+05:00");
    expect(isoWithOffset(new Date("2026-07-01T12:00:00Z"), "America/New_York")).toBe("2026-07-01T08:00:00-04:00");
    expect(isoWithOffset(new Date("2026-07-01T12:00:00Z"), "Asia/Kolkata")).toBe("2026-07-01T17:30:00+05:30");
  });
  test("addDays and weekdayName", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayName("2026-10-25")).toBe("Sunday");
  });
});
