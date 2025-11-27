"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Line,
  LineChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ComposedChart,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

type Props = {
  data: { day: string; spent: number }[];
  month: string;
  year: number;
};

type ChartType = "line" | "bar";
type Granularity = "daily" | "weekly";

const chartConfig = {
  actualValue: {
    label: "Spending",
    color: "hsl(var(--chart-1))",
  },
  average: {
    label: "Average",
    color: "hsl(var(--chart-2))",
  },
  regressionValue: {
    label: "Forecast",
    color: "hsl(var(--chart-3))",
  },
  barValue: {
    label: "Spending",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;


export default function SpendingOverTimeChart({ data, month, year }: Props) {
  const [chartType, setChartType] = useState<ChartType>("line");
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const [showForecast, setShowForecast] = useState(true);

  const processedData = useMemo(() => {
    // Map day -> total spent that day
    const dailyTotals: Record<number, number> = {};
    for (const item of data) {
      const d = parseInt(item.day, 10);
      if (Number.isNaN(d)) continue;
      dailyTotals[d] = (dailyTotals[d] ?? 0) + item.spent;
    }

    const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const today = new Date();
    const isCurrentMonth =
      today.getFullYear() === year && today.getMonth() === monthIndex;

    // linear regression y = m*x + b
    const linearRegression = (xs: number[], ys: number[]) => {
      const n = xs.length;
      if (n < 2) return { m: 0, b: 0, ok: false };

      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;

      for (let i = 0; i < n; i++) {
        const x = xs[i];
        const y = ys[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      }

      const denom = n * sumX2 - sumX * sumX;
      if (denom === 0) return { m: 0, b: 0, ok: false };

      const m = (n * sumXY - sumX * sumY) / denom;
      const b = (sumY - m * sumX) / n;
      return { m, b, ok: true };
    };

    if (granularity === "daily") {
      const basePeriods: { label: string; raw: number }[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        basePeriods.push({
          label: String(day),
          raw: dailyTotals[day] ?? 0,
        });
      }

      const nonZero = basePeriods.map((d) => d.raw).filter((v) => v > 0);
      const avg =
        nonZero.length > 0
          ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length
          : 0;

      const nPeriods = basePeriods.length;
      const currentIndex = isCurrentMonth
        ? Math.min(today.getDate(), nPeriods) - 1
        : nPeriods - 1;

      // Regression values only where we want forecast
      const regLineValues: (number | null)[] = new Array(nPeriods).fill(null);

      if (isCurrentMonth && currentIndex >= 1) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i <= currentIndex; i++) {
          xs.push(i + 1);
          ys.push(basePeriods[i].raw);
        }

        const { m, b, ok } = linearRegression(xs, ys);
        if (ok) {
          for (let i = currentIndex; i < nPeriods; i++) {
            const x = i + 1;
            if (i === currentIndex) {
              // forecast line starts at last actual point
              regLineValues[i] = basePeriods[i].raw;
            } else {
              regLineValues[i] = m * x + b;
            }
          }
        }
      }

      return basePeriods.map((p, idx) => {
        const isFuture = isCurrentMonth && idx > currentIndex;
        const actualValue = idx <= currentIndex ? p.raw : null;
        const regressionValue = regLineValues[idx];
        const barValue =
          isFuture && regressionValue != null ? regressionValue : p.raw;
        const isForecast = isFuture && regressionValue != null;

        return {
          period: p.label,
          barValue,
          actualValue,
          regressionValue,
          average: avg,
          isForecast,
        };
      });
    } else {
      const weeklyTotals: Record<number, number> = {};
      for (let day = 1; day <= daysInMonth; day++) {
        const weekIndex = Math.floor((day - 1) / 7) + 1;
        weeklyTotals[weekIndex] =
          (weeklyTotals[weekIndex] ?? 0) + (dailyTotals[day] ?? 0);
      }

      const weeks = Object.keys(weeklyTotals)
        .map((w) => parseInt(w, 10))
        .sort((a, b) => a - b);

      const basePeriods: { label: string; raw: number }[] = weeks.map((w) => ({
        label: `W${w}`,
        raw: weeklyTotals[w] ?? 0,
      }));

      const nonZero = basePeriods.map((w) => w.raw).filter((v) => v > 0);
      const avg =
        nonZero.length > 0
          ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length
          : 0;

      const nPeriods = basePeriods.length;
      const currentWeekIndex = isCurrentMonth
        ? Math.floor((today.getDate() - 1) / 7)
        : nPeriods - 1;

      const regLineValues: (number | null)[] = new Array(nPeriods).fill(null);

      if (isCurrentMonth && currentWeekIndex >= 1) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i <= currentWeekIndex; i++) {
          xs.push(i + 1);
          ys.push(basePeriods[i].raw);
        }

        const { m, b, ok } = linearRegression(xs, ys);
        if (ok) {
          for (let i = currentWeekIndex; i < nPeriods; i++) {
            const x = i + 1;
            if (i === currentWeekIndex) {
              regLineValues[i] = basePeriods[i].raw;
            } else {
              regLineValues[i] = m * x + b;
            }
          }
        }
      }

      return basePeriods.map((p, idx) => {
        const isFuture = isCurrentMonth && idx > currentWeekIndex;
        const actualValue = idx <= currentWeekIndex ? p.raw : null;
        const regressionValue = regLineValues[idx];
        const barValue =
          isFuture && regressionValue != null ? regressionValue : p.raw;
        const isForecast = isFuture && regressionValue != null;

        return {
          period: p.label,
          barValue,
          actualValue,
          regressionValue,
          average: avg,
          isForecast,
        };
      });
    }
  }, [data, month, year, granularity]);

  useEffect(() => {
    setShowForecast(false);
    const id = window.setTimeout(() => setShowForecast(true), 0);
    return () => window.clearTimeout(id);
  }, [granularity, chartType, month, year, data]);

  const title =
    granularity === "daily" ? "Daily Spending" : "Weekly Spending";

  const description =
    granularity === "daily"
      ? "Daily spending, average and forecast."
      : "Weekly spending, average and forecast.";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          {/* Granularity toggle */}
          <div className="flex rounded-full border border-border/60 bg-muted/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setGranularity("daily")}
              className={cn(
                "rounded-full px-3 py-1",
                granularity === "daily"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground"
              )}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setGranularity("weekly")}
              className={cn(
                "rounded-full px-3 py-1",
                granularity === "weekly"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground"
              )}
            >
              Weekly
            </button>
          </div>

          {/* Chart type toggle */}
          <div className="flex rounded-full border border-border/60 bg-muted/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setChartType("line")}
              className={cn(
                "rounded-full px-3 py-1",
                chartType === "line"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground"
              )}
            >
              Line
            </button>
            <button
              type="button"
              onClick={() => setChartType("bar")}
              className={cn(
                "rounded-full px-3 py-1",
                chartType === "bar"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground"
              )}
            >
              Bar
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="h-[250px] w-full max-w-full aspect-auto"
        >
          {chartType === "line" ? (
            <LineChart
              accessibilityLayer
              data={processedData}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `€${value}`}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              {/* Actual spending: blue, only up to last observed period */}
              <Line
                dataKey="actualValue"
                type="monotone"
                stroke="var(--color-actualValue)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              {/* Average: dashed line across all periods */}
              <Line
                dataKey="average"
                type="monotone"
                stroke="var(--color-average)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
              {/* Forecast starting at last actual point */}
              {showForecast && (
                <Line
                  dataKey="regressionValue"
                  type="monotone"
                  stroke="var(--color-regressionValue)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                />
              )}
            </LineChart>
          ) : (
            <ComposedChart
              accessibilityLayer
              data={processedData}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `€${value}`}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent/>}
              />
              
              <Bar
                dataKey="barValue"
                radius={[4, 4, 0, 0]}
              >
                {processedData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      showForecast && entry.isForecast
                        ? "var(--color-regressionValue)"
                        : "var(--color-actualValue)"
                    }
                  />
                ))}
              </Bar>
              {/* Average line */}
              <Line
                dataKey="average"
                type="monotone"
                stroke="var(--color-average)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
