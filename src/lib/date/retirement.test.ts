import { describe, it, expect } from "vitest";
import { resolveRetirementDate, RetirementRule } from "./retirement";

describe("resolveRetirementDate", () => {
  // Test case for BIRTHDAY rule
  it("should resolve retirement date correctly for BIRTHDAY rule", () => {
    const birthDate = new Date("1970-05-15");
    const retirementAge = 60;
    const expectedRetirementDate = new Date(2030, 4, 15);
    expectedRetirementDate.setHours(0, 0, 0, 0);
    expect(
      resolveRetirementDate(RetirementRule.BIRTHDAY, birthDate, retirementAge),
    ).toEqual(expectedRetirementDate);
  });

  // Test case for BIRTH_MONTH_END rule
  it("should resolve retirement date correctly for BIRTH_MONTH_END rule", () => {
    const birthDate = new Date("1970-05-15");
    const retirementAge = 60;
    const expectedRetirementDate = new Date(2030, 4, 31);
    expectedRetirementDate.setHours(0, 0, 0, 0);
    expect(
      resolveRetirementDate(
        RetirementRule.BIRTH_MONTH_END,
        birthDate,
        retirementAge,
      ),
    ).toEqual(expectedRetirementDate);
  });

  // Test case for FY_SPECIFIC_MONTH_END rule (e.g., fiscal year ends in March)
  it("should resolve retirement date correctly for FY_SPECIFIC_MONTH_END rule (March FY end)", () => {
    const birthDate = new Date("1970-05-15");
    const retirementAge = 60;
    const fiscalYearEndMonth = 3; // March
    const expectedRetirementDate = new Date(2031, 2, 31);
    expectedRetirementDate.setHours(0, 0, 0, 0);
    expect(
      resolveRetirementDate(
        RetirementRule.FY_SPECIFIC_MONTH_END,
        birthDate,
        retirementAge,
        { fiscalYearEndMonth },
      ),
    ).toEqual(expectedRetirementDate);
  });

  it("should resolve retirement date correctly for FY_SPECIFIC_MONTH_END rule (September FY end)", () => {
    const birthDate = new Date("1970-05-15");
    const retirementAge = 60;
    const fiscalYearEndMonth = 9; // September
    const expectedRetirementDate = new Date(2030, 8, 30);
    expectedRetirementDate.setHours(0, 0, 0, 0);
    expect(
      resolveRetirementDate(
        RetirementRule.FY_SPECIFIC_MONTH_END,
        birthDate,
        retirementAge,
        { fiscalYearEndMonth },
      ),
    ).toEqual(expectedRetirementDate);
  });

  // Test case for CUSTOM_DATE rule
  it("should resolve retirement date correctly for CUSTOM_DATE rule", () => {
    const birthDate = new Date("1970-05-15");
    const customRetirementDate = new Date(2035, 11, 31);
    customRetirementDate.setHours(0, 0, 0, 0);
    expect(
      resolveRetirementDate(RetirementRule.CUSTOM_DATE, birthDate, 0, {
        customDate: customRetirementDate,
      }),
    ).toEqual(customRetirementDate);
  });

  // Error handling for missing customDate with CUSTOM_DATE rule
  it("should throw error if customDate is missing for CUSTOM_DATE rule", () => {
    const birthDate = new Date("1970-05-15");
    expect(() =>
      resolveRetirementDate(RetirementRule.CUSTOM_DATE, birthDate, 0),
    ).toThrow("customDate must be provided for CUSTOM_DATE rule.");
  });

  // Error handling for missing fiscalYearEndMonth with FY_SPECIFIC_MONTH_END rule
  it("should throw error if fiscalYearEndMonth is missing for FY_SPECIFIC_MONTH_END rule", () => {
    const birthDate = new Date("1970-05-15");
    const retirementAge = 60;
    expect(() =>
      resolveRetirementDate(
        RetirementRule.FY_SPECIFIC_MONTH_END,
        birthDate,
        retirementAge,
      ),
    ).toThrow(
      "fiscalYearEndMonth must be provided for FY_SPECIFIC_MONTH_END rule.",
    );
  });

  // Test case for retirement date already passed
  it("should indicate if retirement date has already passed", () => {
    const birthDate = new Date("1950-01-01");
    const retirementAge = 60;
    const resolvedDate = resolveRetirementDate(
      RetirementRule.BIRTHDAY,
      birthDate,
      retirementAge,
    );
    expect(resolvedDate < new Date()).toBe(true);
  });
});
