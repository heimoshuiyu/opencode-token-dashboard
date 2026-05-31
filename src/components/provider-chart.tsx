import { useMemo } from "react";
import { Pie, PieChart, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ProviderEntry, MetricKey } from "@/types";
import { useLocale } from "@/lib/i18n";
import { formatMetricValue, truncateText } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ProviderChartProps {
  items: ProviderEntry[];
  metric: MetricKey;
  loading: boolean;
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-1)",
  "var(--muted)",
];

export function ProviderChart({ items, metric, loading }: ProviderChartProps) {
  const { t } = useLocale();
  const chartData = useMemo(() => {
    const sorted = [...items].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    const topItems = sorted.slice(0, 6);
    const remainingValue = sorted
      .slice(6)
      .reduce((total, item) => total + Number(item[metric] || 0), 0);

    const data = topItems.map((item, index) => ({
      name: item.name,
      shortName: truncateText(item.name, 9),
      value: Number(item[metric] || 0),
      fill: PALETTE[index],
    }));

    if (remainingValue > 0) {
      data.push({
        name: t("chart.other"),
        shortName: t("chart.other"),
        value: remainingValue,
        fill: PALETTE[PALETTE.length - 1],
      });
    }

    return data;
  }, [items, metric, t]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    chartData.forEach((item) => {
      cfg[item.name] = { label: item.name, color: item.fill };
    });
    return cfg;
  }, [chartData]);

  if (loading) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader className="pb-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!chartData.length || chartData.every((d) => d.value === 0)) {
    return (
      <Card className="glass-panel glow-border hover:border-primary/15 transition overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader>
          <CardDescription className="pt-36 text-center">{t("chart.noProviderData")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="glass-panel glow-border hover:border-primary/15 transition overflow-hidden rounded-xl border-0 animate-fade-in stagger-6">
      <CardHeader className="pb-2">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-chart-2">
          Distribution
        </p>
        <CardTitle className="text-base font-semibold">{t("chart.providerTitle")}</CardTitle>
        <CardDescription className="text-xs">{t("chart.providerDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="name"
                  formatter={(value) => formatMetricValue(metric, value as number)}
                />
              }
            />
            <ChartLegend
              content={<ChartLegendContent nameKey="name" />}
              verticalAlign="bottom"
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="40%"
              outerRadius="70%"
              strokeWidth={2}
              stroke="var(--background)"
              animationBegin={200}
              animationDuration={600}
              label={(props: any) => {
                const { name, percent } = props;
                return (
                  <text className="font-mono" fill="var(--foreground)" fontSize={11} textAnchor="middle">
                    {`${truncateText(name || "", 9)} ${((percent || 0) * 100).toFixed(0)}%`}
                  </text>
                );
              }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
