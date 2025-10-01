import { describe, it, expect } from "vitest";
import {
  calculateRetirementIncomeDeduction,
  calculateRetirementIncome,
} from "./retirementIncome";

describe("calculateRetirementIncomeDeduction", () => {
  it("should calculate deduction correctly for seniority <= 20 years", () => {
    expect(calculateRetirementIncomeDeduction(19)).toBe(40 * 19);
    expect(calculateRetirementIncomeDeduction(10)).toBe(40 * 10);
    expect(calculateRetirementIncomeDeduction(1)).toBe(40 * 1);
  });

  it("should calculate deduction correctly for seniority > 20 years", () => {
    expect(calculateRetirementIncomeDeduction(21)).toBe(
      80 * (21 - 20) + 40 * 20,
    );
    expect(calculateRetirementIncomeDeduction(25)).toBe(
      80 * (25 - 20) + 40 * 20,
    );
  });

  it("should handle zero seniority", () => {
    expect(calculateRetirementIncomeDeduction(0)).toBe(0);
  });

  it("should throw an error for negative seniority", () => {
    expect(() => calculateRetirementIncomeDeduction(-5)).toThrow(
      "Seniority cannot be negative.",
    );
  });
});

describe("calculateRetirementIncome", () => {
  it("should calculate retirement income correctly", () => {
    // Case 1: Income - Deduction > 0
    expect(calculateRetirementIncome(1000, 19)).toBe(
      Math.floor((1000 - 40 * 19) / 2),
    );
    // Case 2: Income - Deduction <= 0
    expect(calculateRetirementIncome(500, 15)).toBe(0);
    // Case 3: Seniority > 20
    expect(calculateRetirementIncome(3000, 25)).toBe(
      Math.floor((3000 - (80 * 5 + 40 * 20)) / 2),
    );
  });

  it("should handle zero income", () => {
    expect(calculateRetirementIncome(0, 10)).toBe(0);
  });

  it("should throw an error for negative income", () => {
    expect(() => calculateRetirementIncome(-100, 10)).toThrow(
      "Retirement income cannot be negative.",
    );
  });
});
