export type Seniority = { years: number; months: number; days: number };

export function diffYMD(start: Date, end: Date): Seniority {
  if (end < start) {
    throw new Error("End date cannot be before start date.");
  }

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days };
}

export function toFullYears(seniority: Seniority): number {
  return seniority.years;
}
