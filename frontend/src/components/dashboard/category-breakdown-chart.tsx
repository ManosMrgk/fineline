"use client";

import { Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { useMemo } from "react";

type ChartDataItem = { name: string; value: number; fill?: string };

type Props = {
  data: { name: string; value: number }[];
};

const baseChartConfig = {
  value: { label: "Spending" },
  Groceries: { label: "Groceries", color: "hsl(var(--chart-1))" },
  "Dining Out": { label: "Dining", color: "hsl(var(--chart-2))" },
  Utilities: { label: "Utilities", color: "hsl(var(--chart-3))" },
  Transport: { label: "Transport", color: "hsl(var(--chart-4))" },
  Shopping: { label: "Shopping", color: "hsl(var(--chart-5))" },
  Other: { label: "Other", color: "hsl(var(--muted))" },
} satisfies ChartConfig;

export default function CategoryBreakdownChart({ data }: Props) {
  const { chartData, chartConfig } = useMemo(() => {
    const chartColors = [
      baseChartConfig.Groceries.color,
      baseChartConfig["Dining Out"].color,
      baseChartConfig.Utilities.color,
      baseChartConfig.Transport.color,
      baseChartConfig.Shopping.color,
    ];
    const otherColor = baseChartConfig.Other.color;

    const sortedData = [...data].sort((a, b) => b.value - a.value);
    const top3 = sortedData.slice(0, 3);
    const otherValue = sortedData
      .slice(3)
      .reduce((acc, curr) => acc + curr.value, 0);

    const processedData: ChartDataItem[] = [];
    const dynamicConfig: ChartConfig = { ...baseChartConfig };

    top3.forEach((item, index) => {
      const color = chartColors[index % chartColors.length];

      (dynamicConfig as any)[item.name] = {
        label: item.name,
        color,
      };

      processedData.push({
        ...item,
        fill: color,
      });
    });

    if (otherValue > 0) {
      processedData.push({
        name: "Other",
        value: otherValue,
        fill: otherColor,
      });
    }

    return { chartData: processedData, chartConfig: dynamicConfig };
  }, [data]);

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto flex h-[260px] w-full items-center justify-center"
    >
      <PieChart margin={{ left: 80 }}>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel nameKey="name" />}
        />
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="90%"
          strokeWidth={1}
        />
        <ChartLegend
          layout="vertical"
          align="left"
          verticalAlign="middle"
          content={
            <ChartLegendContent
              nameKey="name"
              className="flex flex-col items-start gap-1 pr-4 text-left"
            />
          }
        />
      </PieChart>
    </ChartContainer>
  );
}
