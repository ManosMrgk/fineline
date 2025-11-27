import type { MonthlySpending } from "@/lib/data";

export type SlimMonthlySpending = {
  month: string;
  year: number;
  totalSpent: number;
  categoryBreakdown: { name: string; value: number }[];
};

export type FinancialContext = {
  current: MonthlySpending;
  history: SlimMonthlySpending[];
};
