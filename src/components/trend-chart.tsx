import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  ReferenceDot,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DayEntry, MetricKey } from "@/types";
import { METRIC_META } from "@/types";
import { formatDateLabel, formatMetricValue, formatAxisValue, formatAxisDuration } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface TrendChartProps {
  days: DayEntry[];
  metric: MetricKey;
  loading: boolean;
  range?: string;
}

function getSecondaryKey(metric: MetricKey): MetricKey {
  if (metric === "runtime" || metric === "runtime_dedup") return "user_message_count";
  if (metric === "user_message_count") return "total";
  return "user_message_count";
}

const GRID_STROKE = "var(--border)";

export function TrendChart({ days, metric, loading, range }: TrendChartProps) {
  const { locale, t } = useLocale();
  const isHourly = range === "7";
  const secondaryKey = getSecondaryKey(metric);
  const primary = METRIC_META[metric];
  const secondary = METRIC_META[secondaryKey];

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      [metric]: { label: t(`metric.${metric}`), color: primary.color },
      [secondaryKey]: { label: t(`metric.${secondaryKey}`), color: secondary.color },
    }),
    [metric, secondaryKey, primary.color, secondary.color, t],
  );

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        date: d.date,
        dateLabel: formatDateLabel(d.date, "short", locale),
        [metric]: d[metric] || 0,
        [secondaryKey]: d[secondaryKey] || 0,
      })),
    [days, metric, secondaryKey, locale],
  );

  const peakIndex = useMemo(() => {
    if (!chartData.length) return -1;
    let maxVal = -Infinity;
    let maxIdx = 0;
    chartData.forEach((d, i) => {
      const v = d[metric] as number;
      if (v > maxVal) { maxVal = v; maxIdx = i; }
    });
    return maxIdx;
  }, [chartData, metric]);

  const isDuration = metric === "runtime" || metric === "runtime_dedup";
  const isPercent = metric === "cache_hit_rate";
  const formatYTick = (v: number) => {
    if (isDuration) return formatAxisDuration(v);
    if (isPercent) return `${v}%`;
    return formatAxisValue(v);
  };

  if (loading) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader className="pb-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[360px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!days.length) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader>
          <CardDescription className="pt-40 text-center text-sm">{t("chart.noTrendData")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in stagger-3 transition-colors hover:border-primary/15">
      <CardHeader className="pb-2">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-chart-2">
          Trend
        </p>
        <CardTitle className="text-base font-semibold">{t("chart.trendTitle")}</CardTitle>
        <CardDescription className="text-xs">
          {t("chart.trendDesc", { metric: t(`metric.${metric}`) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[340px] w-full">
          <ComposedChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 8, right: 52, left: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillPrimary" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval={(() => {
                if (isHourly) {
                  // ~168 hourly points → show label every ~8 hours
                  const n = chartData.length;
                  if (n <= 24) return 1;
                  if (n <= 48) return 3;
                  if (n <= 96) return 5;
                  return Math.ceil(n / 24) - 1;
                }
                const n = chartData.length;
                if (n <= 14) return 0;
                if (n <= 30) return 1;
                if (n <= 60) return 2;
                if (n <= 90) return 3;
                return Math.ceil(n / 30) - 1;
              })()}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={formatYTick}
              width={52}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => formatAxisValue(v)}
              width={44}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.date
                      ? formatDateLabel(payload[0].payload.date, "long", locale)
                      : _
                  }
                  formatter={(value, name) => {
                    const key = name as MetricKey;
                    return formatMetricValue(key, value as number);
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey={metric}
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#fillPrimary)"
              dot={chartData.length <= 30 && !isHourly ? { r: 2, fill: "var(--chart-1)", stroke: "var(--background)", strokeWidth: 1.5 } : false}
              activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--background)", strokeWidth: 2 }}
            />
            {peakIndex >= 0 && (
              <ReferenceDot
                yAxisId="left"
                x={chartData[peakIndex]?.dateLabel}
                y={chartData[peakIndex]?.[metric] as number}
                r={6}
                fill="var(--chart-1)"
                stroke="var(--background)"
                strokeWidth={2}
                fillOpacity={0.8}
              />
            )}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={secondaryKey}
              stroke="var(--chart-2)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3, fill: "var(--chart-2)" }}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
