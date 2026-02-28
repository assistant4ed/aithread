import { describe, it, expect } from "vitest";
import { toUTCDate, todayStartHKT } from "./time";

describe("toUTCDate", () => {
    // Use a fixed reference date: 2026-02-28 in HKT
    const ref = new Date("2026-02-28T10:00:00+08:00"); // 02:00 UTC

    it("converts 12:00 HKT to 04:00 UTC", () => {
        const result = toUTCDate("12:00", ref);
        expect(result.getUTCHours()).toBe(4);
        expect(result.getUTCMinutes()).toBe(0);
        expect(result.getUTCDate()).toBe(28);
    });

    it("converts 00:00 HKT to previous day 16:00 UTC", () => {
        const result = toUTCDate("00:00", ref);
        expect(result.getUTCHours()).toBe(16);
        expect(result.getUTCMinutes()).toBe(0);
        // 00:00 HKT on Feb 28 = 16:00 UTC on Feb 27
        expect(result.getUTCDate()).toBe(27);
    });

    it("converts 18:00 HKT to 10:00 UTC", () => {
        const result = toUTCDate("18:00", ref);
        expect(result.getUTCHours()).toBe(10);
        expect(result.getUTCMinutes()).toBe(0);
    });

    it("converts 22:00 HKT to 14:00 UTC", () => {
        const result = toUTCDate("22:00", ref);
        expect(result.getUTCHours()).toBe(14);
        expect(result.getUTCMinutes()).toBe(0);
    });

    it("handles minutes correctly (e.g. 09:30 HKT → 01:30 UTC)", () => {
        const result = toUTCDate("09:30", ref);
        expect(result.getUTCHours()).toBe(1);
        expect(result.getUTCMinutes()).toBe(30);
    });

    it("preserves correct date across midnight boundary", () => {
        // Reference is late at night HKT: 2026-02-28 23:30 HKT = 15:30 UTC
        const lateRef = new Date("2026-02-28T23:30:00+08:00");
        const result = toUTCDate("08:00", lateRef);
        // 08:00 HKT on Feb 28 = 00:00 UTC on Feb 28
        expect(result.getUTCHours()).toBe(0);
        expect(result.getUTCDate()).toBe(28);
    });
});

describe("todayStartHKT", () => {
    it("returns midnight HKT as UTC", () => {
        const result = todayStartHKT();
        // Midnight HKT = 16:00 UTC previous day
        expect(result.getUTCHours()).toBe(16);
        expect(result.getUTCMinutes()).toBe(0);
        expect(result.getUTCSeconds()).toBe(0);
    });

    it("returns a Date object", () => {
        const result = todayStartHKT();
        expect(result).toBeInstanceOf(Date);
    });
});
