export const enum RetirementRule {
  BIRTHDAY = "BIRTHDAY",
  BIRTH_MONTH_END = "BIRTH_MONTH_END",
  FY_SPECIFIC_MONTH_END = "FY_SPECIFIC_MONTH_END",
  CUSTOM_DATE = "CUSTOM_DATE",
}

interface RetirementOptions {
  fiscalYearEndMonth?: number; // 1-12 for Jan-Dec
  customDate?: Date;
}

export function resolveRetirementDate(
  rule: RetirementRule,
  birthDate: Date,
  retirementAge: number,
  options?: RetirementOptions,
): Date {
  let retirementDate: Date;

  switch (rule) {
    case RetirementRule.BIRTHDAY:
      retirementDate = new Date(birthDate);
      retirementDate.setFullYear(birthDate.getFullYear() + retirementAge);
      retirementDate.setHours(0, 0, 0, 0);
      break;

    case RetirementRule.BIRTH_MONTH_END:
      retirementDate = new Date(birthDate);
      retirementDate.setFullYear(birthDate.getFullYear() + retirementAge);
      retirementDate.setMonth(retirementDate.getMonth() + 1);
      retirementDate.setDate(0); // Set to the last day of the previous month
      retirementDate.setHours(0, 0, 0, 0);
      break;

    case RetirementRule.FY_SPECIFIC_MONTH_END:
      if (options?.fiscalYearEndMonth === undefined) {
        throw new Error(
          "fiscalYearEndMonth must be provided for FY_SPECIFIC_MONTH_END rule.",
        );
      }
      const fyEndMonth = options.fiscalYearEndMonth - 1; // Convert to 0-indexed month
      let yearAtRetirementAge = birthDate.getFullYear() + retirementAge;
      let potentialRetirementDate = new Date(
        yearAtRetirementAge,
        fyEndMonth + 1,
        0,
      ); // Last day of FY end month
      potentialRetirementDate.setHours(0, 0, 0, 0);

      // If birth month is after fiscal year end month, retirement happens in the next fiscal year
      if (birthDate.getMonth() > fyEndMonth) {
        potentialRetirementDate.setFullYear(
          potentialRetirementDate.getFullYear() + 1,
        );
      }
      retirementDate = potentialRetirementDate;
      break;

    case RetirementRule.CUSTOM_DATE:
      if (!options?.customDate) {
        throw new Error("customDate must be provided for CUSTOM_DATE rule.");
      }
      retirementDate = new Date(options.customDate);
      break;

    default:
      throw new Error(`Unknown retirement rule: ${rule}`);
  }

  return retirementDate;
}
