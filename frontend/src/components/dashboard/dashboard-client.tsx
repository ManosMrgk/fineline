"use client";

import { useState } from "react";
import Header from "./header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import MonthlySummaryCard from "./monthly-summary-card";
import CategoryBreakdownChart from "./category-breakdown-chart";
import SpendingOverTimeChart from "./spending-over-time-chart";
import AiAssistant from "./ai-assistant";
import { useSpendingData } from "@/lib/spending-store";
import PersistenceBanner from "@/components/persistence-banner";

export default function DashboardClient() {
  const { availableMonths, availableYears, getMonth } = useSpendingData();

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<string>(
    now.toLocaleString("en-US", { month: "long" })
  );

  const currentData = getMonth(year, month);

  // NO DATA STATE
  if (!currentData) {
    return (
      <div className="flex min-h-screen w-full flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <div className="flex items-center gap-2 md:ml-auto">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="w-[120px] bg-background">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
            <p className="text-sm text-muted-foreground">
              No data available for {month} {year} yet. Use the Transactions
              page to import or add expenses.
            </p>
          </div>
        </main>
        <PersistenceBanner />
      </div>
    );
  }

  // MAIN DASHBOARD
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6 md:gap-8 md:p-8">
        {/* MAIN HEADER */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-2 md:ml-auto">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
            >
              <SelectTrigger className="w-[120px] bg-background">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* TOP ROW: SUMMARY + CATEGORY BREAKDOWN */}
        <div className="grid gap-4 md:grid-cols-2">
          <MonthlySummaryCard data={currentData} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <span>Category Breakdown</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pl-2 pt-4">
              <CategoryBreakdownChart data={currentData.categoryBreakdown} />
            </CardContent>
          </Card>
        </div>

        {/* SPENDING OVER TIME */}
        <div className="grid gap-4">
          <SpendingOverTimeChart
            data={currentData.dailySpending}
            month={currentData.month}
            year={currentData.year}
          />
        </div>
      </main>

      <AiAssistant financialData={currentData} />
    </div>
  );
}
