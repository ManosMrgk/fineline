"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { MonthlySpending } from "@/lib/data";
import { cn } from "@/lib/utils";

type Props = {
  data: MonthlySpending;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function MonthlySummaryCard({ data }: Props) {
  const total = data.totalSpent;
  const average = data.averageSpending;

  const delta = average > 0 ? ((total - average) / average) * 100 : 0;
  const deltaLabel = `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`;
  const isUp = delta > 0;

  const monthIndex = useMemo(
    () => new Date(`${data.month} 1, ${data.year}`).getMonth(),
    [data.month, data.year]
  );

  const dailyExpenses = useMemo(
    () =>
      [...data.dailySpending].sort(
        (a, b) => Number(a.day) - Number(b.day)
      ),
    [data.dailySpending]
  );

  return (
    <Card className="h-full max-h-[420px] flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {data.month} Spending
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        {/* Top: total + delta */}
        <div>
          <div className="text-3xl font-semibold tracking-tight sm:text-4xl">
            €{total.toFixed(2)}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                isUp
                  ? "bg-red-50 text-red-600"
                  : "bg-emerald-50 text-emerald-600"
              )}
            >
              {deltaLabel}
            </span>
            <span>vs. average</span>
          </div>
        </div>

        {/* Scrollable list of this month's expenses by day */}
        <div className="mt-2 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            This month&apos;s expenses
          </p>
          <ScrollArea className="mt-2 h-[220px] pr-2">
            <ul className="space-y-2">
              {dailyExpenses.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  No expenses recorded for this month.
                </li>
              )}

              {dailyExpenses.map((item) => {
                const dayNum = Number(item.day);
                const date = new Date(data.year, monthIndex, dayNum);

                const weekday = WEEKDAYS[date.getDay()];
                const monthShort = MONTHS[date.getMonth()];
                const dateLabel = `${weekday}, ${date.getDate()} ${monthShort}`;

                return (
                  <li key={item.day}>
                    <details className="group rounded-md border border-border/40 bg-muted/40 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            {dateLabel}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {item.expenses.length}{" "}
                            {item.expenses.length === 1 ? "expense" : "expenses"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium tabular-nums">
                            €{item.spent.toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
                            ▸
                          </span>
                        </div>
                      </summary>

                      {/* Daily expenses list */}
                      <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                        {item.expenses.map((exp, idx) => (
                          <div
                            key={`${item.day}-${idx}`}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="truncate text-muted-foreground">
                              {exp.merchant}
                            </span>
                            <span className="tabular-nums font-medium">
                              €{exp.value.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
