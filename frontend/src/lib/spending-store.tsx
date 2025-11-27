"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MonthlySpending } from "./data";
import { availableMonths as ALL_MONTHS } from "./data";

export type TransactionInputRow = {
  date: string;
  merchant: string;
  category: string;
  amount: number;
};

type SpendingDataContextValue = {
  spendingData: MonthlySpending[];
  availableMonths: string[];
  availableYears: number[];
  getMonth: (year: number, month: string) => MonthlySpending | null;

  setMonthFromRows: (
    year: number,
    month: string,
    rows: TransactionInputRow[]
  ) => void;

  persistenceEnabled: boolean;
  setPersistenceEnabled: (enabled: boolean) => void;
};

const SpendingDataContext = createContext<SpendingDataContextValue | undefined>(
  undefined
);

export function SpendingDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MonthlySpending[]>([]);

  const [persistenceEnabled, setPersistenceEnabledState] = useState(false);
  const [hasUserChoice, setHasUserChoice] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const mode = localStorage.getItem("fineline_persist_mode");
      if (mode === "accepted") {
        setPersistenceEnabledState(true);
        setHasUserChoice(true);

        const raw = localStorage.getItem("fineline_spending_data");
        if (raw) {
          const parsed = JSON.parse(raw) as MonthlySpending[];
          setData(parsed);
        }
      } else if (mode === "rejected") {
        setPersistenceEnabledState(false);
        setHasUserChoice(true);
      }
    } catch (err) {
      console.error("Failed to load persisted spending data", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasUserChoice) return;

    try {
      if (persistenceEnabled) {
        localStorage.setItem("fineline_persist_mode", "accepted");
        localStorage.setItem("fineline_spending_data", JSON.stringify(data));
      } else {
        localStorage.setItem("fineline_persist_mode", "rejected");
        localStorage.removeItem("fineline_spending_data");
      }
    } catch (err) {
      console.error("Failed to persist spending data", err);
    }
  }, [persistenceEnabled, data, hasUserChoice]);

  const setPersistenceEnabled = useCallback((enabled: boolean) => {
    setPersistenceEnabledState(enabled);
    setHasUserChoice(true);
  }, []);

  const setMonthFromRows = useCallback(
    (_year: number, _month: string, rows: TransactionInputRow[]) => {
      setData(prev => {
        if (rows.length === 0) {
          return prev;
        }

        type AggKey = string;
        type AggValue = {
          year: number;
          monthIndex: number;
          totalSpent: number;
          categoryMap: Map<string, number>;
          dailyMap: Map<
            number,
            {
              spent: number;
              expenses: { merchant: string; category: string; value: number }[];
            }
          >;
        };

        const aggMap = new Map<AggKey, AggValue>();

        for (const row of rows) {
          const d = new Date(row.date);
          if (isNaN(d.getTime())) continue;

          const year = d.getFullYear();
          const monthIndex = d.getMonth();
          const monthName = ALL_MONTHS[monthIndex] ?? "Unknown";
          const day = d.getDate();

          const key: AggKey = `${year}|${monthName}`;
          let bucket = aggMap.get(key);
          if (!bucket) {
            bucket = {
              year,
              monthIndex,
              totalSpent: 0,
              categoryMap: new Map(),
              dailyMap: new Map(),
            };
            aggMap.set(key, bucket);
          }

          const amount = row.amount ?? 0;
          bucket.totalSpent += amount;

          const cat = row.category || "Miscellaneous";
          bucket.categoryMap.set(
            cat,
            (bucket.categoryMap.get(cat) ?? 0) + amount
          );

          const existingDay =
            bucket.dailyMap.get(day) ?? {
              spent: 0,
              expenses: [] as {
                merchant: string;
                category: string;
                value: number;
              }[],
            };

          existingDay.spent += amount;
          existingDay.expenses.push({
            merchant: row.merchant,
            category: cat,
            value: amount,
          });

          bucket.dailyMap.set(day, existingDay);
        }

        const monthlyList: MonthlySpending[] = [];

        for (const [, bucket] of aggMap.entries()) {
          const monthName = ALL_MONTHS[bucket.monthIndex] ?? "Unknown";

          const dailySpending = Array.from(bucket.dailyMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([day, info]) => ({
              day: String(day),
              spent: info.spent,
              expenses: info.expenses,
            }));

          const categoryBreakdown = Array.from(bucket.categoryMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => ({ name, value }));

          monthlyList.push({
            month: monthName,
            year: bucket.year,
            totalSpent: bucket.totalSpent,
            averageSpending: 0,
            categoryBreakdown,
            dailySpending,
          });
        }

        monthlyList.sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          const ai = ALL_MONTHS.indexOf(a.month);
          const bi = ALL_MONTHS.indexOf(b.month);
          return ai - bi;
        });

        const overallAvg =
          monthlyList.length === 0
            ? 0
            : monthlyList.reduce((sum, m) => sum + m.totalSpent, 0) /
              monthlyList.length;

        return monthlyList.map(m => ({
          ...m,
          averageSpending: overallAvg,
        }));
      });
    },
    []
  );

  const availableYears = useMemo(() => {
    if (data.length === 0) {
      return [new Date().getFullYear()];
    }
    const years = Array.from(new Set(data.map(d => d.year)));
    years.sort((a, b) => a - b);
    return years;
  }, [data]);

  const getMonth = useCallback(
    (year: number, month: string) =>
      data.find(d => d.year === year && d.month === month) ?? null,
    [data]
  );

  const value: SpendingDataContextValue = {
    spendingData: data,
    availableMonths: ALL_MONTHS,
    availableYears,
    getMonth,
    setMonthFromRows,
    persistenceEnabled,
    setPersistenceEnabled,
  };

  return (
    <SpendingDataContext.Provider value={value}>
      {children}
    </SpendingDataContext.Provider>
  );
}

export function useSpendingData() {
  const ctx = useContext(SpendingDataContext);
  if (!ctx) {
    throw new Error(
      "useSpendingData must be used within a SpendingDataProvider"
    );
  }
  return ctx;
}
