export type RetirementRule =
  | "BIRTHDAY"
  | "BIRTH_MONTH_END"
  | "FY_SPECIFIC_MONTH_END"
  | "CUSTOM_DATE";

export type Seniority = {
  years: number;
  months: number;
  days: number;
};
