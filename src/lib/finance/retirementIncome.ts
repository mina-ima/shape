export function calculateRetirementIncomeDeduction(seniority: number): number {
  if (seniority < 0) {
    throw new Error("Seniority cannot be negative.");
  }

  if (seniority <= 20) {
    return 40 * seniority;
  } else {
    return 80 * (seniority - 20) + 40 * 20;
  }
}

export function calculateRetirementIncome(
  income: number,
  seniority: number,
): number {
  if (income < 0) {
    throw new Error("Retirement income cannot be negative.");
  }

  const deduction = calculateRetirementIncomeDeduction(seniority);
  const taxableIncome = income - deduction;

  if (taxableIncome <= 0) {
    return 0;
  } else {
    return Math.floor(taxableIncome / 2);
  }
}
