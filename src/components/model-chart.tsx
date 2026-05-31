import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis, LabelList } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ModelEntry, MetricKey } from "@/types";
import { formatAxisValue, formatMetricValue, truncateText } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ModelChartProps {
  items: ModelEntry[];
  metric: MetricKey;
  loading: boolean;
}

const BAR_GRADIENT_START = "var(--chart-2)";
const BAR_GRADIENT_END = "var(--chart-1)";

export function ModelChart({ items, metric, loading }: ModelChartProps) {
  const { t } = useLocale();
  const chartData = useMemo(() => {
    const topItems = [...items]
      .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
      .filter((item) => Number(item[metric] || 0) > 0)
      .slice(0, 8)
      .reverse();

    return topItems.map((item, index) => ({
      name: truncateText(item.name, 18),
      fullName: item.name,
      value: Number(item[metric] || 0),
      fill: `var(--chart-${((index % 5) + 1)})`,
    }));
  }, [items, metric]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {
      value: { label: metric, color: BAR_GRADIENT_END },
    };
    chartData.forEach((item) => {
      cfg[item.fullName] = { label: item.fullName };
    });
    return cfg;
  }, [chartData, metric]);

  if (loading) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader className="pb-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!chartData.length) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader>
          <CardDescription className="pt-36 text-center">{t("chart.noModelData")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in stagger-5">
      <CardHeader className="pb-2">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-chart-2">
          Leaderboard
        </p>
        <CardTitle className="text-base font-semibold">{t("chart.modelTitle")}</CardTitle>
        <CardDescription className="text-xs">{t("chart.modelDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <BarChart
            accessibilityLayer
            layout="vertical"
            data={chartData}
            margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
          >
            <defs>
              <linearGradient id="barGradient" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor={BAR_GRADIENT_END} stopOpacity={0.9} />
                <stop offset="100%" stopColor={BAR_GRADIENT_START} stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => formatAxisValue(v)}
            />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--foreground)", fontSize: 11 }}
              width={110}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatMetricValue(metric, value as number)}
                  hideLabel
                />
              }
            />
            <Bar
              dataKey="value"
              fill="url(#barGradient)"
              radius={[0, 4, 4, 0]}
              barSize={12}
              background={{ fill: "var(--muted)", opacity: 0.3 }}
              animationDuration={500}
            >
              <LabelList
                dataKey="value"
                position="right"
                formatter={((v: unknown) => formatAxisValue(Number(v))) as any}
                style={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "inherit" }}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
