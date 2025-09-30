import { describe, it, expect } from "vitest";
import { diffYMD, toFullYears } from "./seniority";

describe("diffYMD", () => {
  it("should calculate the difference in years, months, and days correctly for same year", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2023-01-15");
    expect(diffYMD(start, end)).toEqual({ years: 0, months: 0, days: 14 });
  });

  it("should calculate the difference in years, months, and days correctly for different months in same year", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2023-02-01");
    expect(diffYMD(start, end)).toEqual({ years: 0, months: 1, days: 0 });
  });

  it("should calculate the difference in years, months, and days correctly for different years", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2024-01-01");
    expect(diffYMD(start, end)).toEqual({ years: 1, months: 0, days: 0 });
  });

  it("should handle leap years correctly", () => {
    const start = new Date("2024-02-28");
    const end = new Date("2024-03-01");
    expect(diffYMD(start, end)).toEqual({ years: 0, months: 0, days: 2 }); // 29th and 1st
  });

  it("should return 0 for same start and end dates", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2023-01-01");
    expect(diffYMD(start, end)).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("should throw an error if end date is before start date", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2022-12-31");
    expect(() => diffYMD(start, end)).toThrow(
      "End date cannot be before start date.",
    );
  });

  it("should calculate correctly with partial months", () => {
    const start = new Date("2023-01-15");
    const end = new Date("2023-03-14");
    expect(diffYMD(start, end)).toEqual({ years: 0, months: 1, days: 27 });
  });

  it("should calculate correctly across year and month boundaries", () => {
    const start = new Date("2022-11-20");
    const end = new Date("2023-01-10");
    expect(diffYMD(start, end)).toEqual({ years: 0, months: 1, days: 21 });
  });
});

describe("toFullYears", () => {
  it("should return the correct full years from seniority object", () => {
    expect(toFullYears({ years: 5, months: 6, days: 10 })).toBe(5);
    expect(toFullYears({ years: 10, months: 0, days: 0 })).toBe(10);
    expect(toFullYears({ years: 0, months: 11, days: 30 })).toBe(0);
  });
});
