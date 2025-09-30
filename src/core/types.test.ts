import { describe, it, expectTypeOf } from "vitest";
import { RetirementRule, Seniority } from "./types";

describe("Type Definitions", () => {
  it("RetirementRule should be a union of specific string literals", () => {
    expectTypeOf<RetirementRule>().toMatchTypeOf<
      "BIRTHDAY" | "BIRTH_MONTH_END" | "FY_SPECIFIC_MONTH_END" | "CUSTOM_DATE"
    >();
    expectTypeOf<"BIRTHDAY">().toMatchTypeOf<RetirementRule>();
    expectTypeOf<"BIRTH_MONTH_END">().toMatchTypeOf<RetirementRule>();
    expectTypeOf<"FY_SPECIFIC_MONTH_END">().toMatchTypeOf<RetirementRule>();
    expectTypeOf<"CUSTOM_DATE">().toMatchTypeOf<RetirementRule>();
    expectTypeOf<"INVALID_RULE">().not.toMatchTypeOf<RetirementRule>();
  });

  it("Seniority should be an object with numeric years, months, and days", () => {
    expectTypeOf<Seniority>().toEqualTypeOf<{
      years: number;
      months: number;
      days: number;
    }>();
    expectTypeOf<{
      years: 10;
      months: 5;
      days: 20;
    }>().toMatchTypeOf<Seniority>();
    expectTypeOf<{
      years: "ten";
      months: 5;
      days: 20;
    }>().not.toMatchTypeOf<Seniority>();
    expectTypeOf<{
      years: number;
      months: number;
    }>().not.toMatchTypeOf<Seniority>();
  });
});
