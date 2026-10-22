import { addDays, endOfMonth, format, startOfMonth, startOfWeek } from "date-fns";

export interface CommercialWeek {
  index: number;
  monday: string;
  friday: string;
  label: string;
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

function getCommercialMonthForWeekStart(weekStart: Date): string {
  const anchorDate = addDays(weekStart, 2);
  return format(anchorDate, "yyyy-MM");
}

export function getMonthName(month: number): string {
  return MONTH_NAMES[month] || "";
}

export function getMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];

  for (let offset = -3; offset <= 2; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    options.push({
      value: format(date, "yyyy-MM"),
      label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
    });
  }

  return options;
}

export function getCommercialWeeks(yearMonth: string): CommercialWeek[] {
  const [year, month] = yearMonth.split("-").map(Number);
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const lastWeekStart = getWeekStart(monthEnd);

  const weeks: CommercialWeek[] = [];
  let currentWeekStart = getWeekStart(monthStart);
  let index = 1;

  while (currentWeekStart <= lastWeekStart) {
    if (getCommercialMonthForWeekStart(currentWeekStart) === yearMonth) {
      const friday = addDays(currentWeekStart, 4);
      weeks.push({
        index,
        monday: format(currentWeekStart, "yyyy-MM-dd"),
        friday: format(friday, "yyyy-MM-dd"),
        label: `Semana ${index} — ${format(currentWeekStart, "dd/MM")} a ${format(friday, "dd/MM")}`,
      });
      index += 1;
    }

    currentWeekStart = addDays(currentWeekStart, 7);
  }

  return weeks;
}

export function getCurrentYearMonth(): string {
  return getCommercialMonthForDate(new Date());
}

export function getCommercialMonthForDate(date: Date): string {
  return getCommercialMonthForWeekStart(getWeekStart(date));
}

export function getCurrentWeekMonday(): string {
  return format(getWeekStart(new Date()), "yyyy-MM-dd");
}
