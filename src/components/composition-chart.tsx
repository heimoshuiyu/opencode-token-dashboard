import { useMemo, useState, useCallback } from "react";
import { Pie, PieChart, Cell, Sector, type PieSectorDataItem } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MetricSummary } from "@/types";
import { INPUT_COMPOSITION_META, OUTPUT_COMPOSITION_META } from "@/types";
import { formatCompact, formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface CompositionChartProps {
  summary: MetricSummary;
  loading: boolean;
}

// ── Shared ────────────────────────────────────────────────────────────────

interface SliceData {
  name: string;
  value: number;
  fill: string;
}

interface HalfConfig {
  chartConfig: ChartConfig;
  data: SliceData[];
  total: number;
}

function buildHalfConfig(
  meta: typeof INPUT_COMPOSITION_META | typeof OUTPUT_COMPOSITION_META,
  summary: MetricSummary,
  t: (key: string) => string,
): HalfConfig {
  const cfg: ChartConfig = {};
  const data: SliceData[] = [];

  let total = 0;
  for (const item of meta) {
    const val = Number(summary[item.key] || 0);
    total += val;
    if (val > 0) {
      cfg[item.key] = { label: t(`composition.${item.key}`), color: item.color };
      data.push({ name: item.key, value: val, fill: `var(--color-${item.key})` });
    }
  }

  return { chartConfig: cfg, data, total };
}

function formatPct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${((part / whole) * 100).toFixed(1)}`;
}

// ── Half Donut ────────────────────────────────────────────────────────────

interface HalfDonutProps {
  chartConfig: ChartConfig;
  data: SliceData[];
  total: number;
  loading: boolean;
  centerLabel: string;
  centerValue: string;
  subLabel?: string;
  emptyText: string;
  activeIndex: number | null;
  onHover: (_: unknown, index: number) => void;
  onLeave: () => void;
}

function HalfDonut({
  chartConfig,
  data,
  total,
  loading,
  centerLabel,
  centerValue,
  subLabel,
  emptyText,
  activeIndex,
  onHover,
  onLeave,
}: HalfDonutProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-[120px] w-[200px] rounded-lg" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (!data.length || total <= 0) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[140px] w-full">
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-end pb-1">
          <span className="text-[10px] text-muted-foreground">{centerLabel}</span>
          <span className="font-mono text-base font-bold text-foreground">{centerValue}</span>
          {subLabel && (
            <span className="text-[10px] text-muted-foreground">{subLabel}</span>
          )}
        </div>
        <ChartContainer config={chartConfig} className="h-[140px] w-full">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="name"
                  formatter={(value) => formatNumber(value as number)}
                  hideLabel={false}
                />
              }
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              startAngle={180}
              endAngle={0}
              innerRadius="52%"
              outerRadius="82%"
              paddingAngle={2}
              strokeWidth={2}
              stroke="var(--background)"
              animationBegin={150}
              animationDuration={600}
              onMouseEnter={onHover}
              onMouseLeave={onLeave}
              activeShape={(props: PieSectorDataItem) => {
                const { outerRadius: _or, ...rest } = props;
                return <Sector {...rest} outerRadius={(_or as number) * 1.06} />;
              }}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`${entry.name}-${index}`}
                  fill={entry.fill}
                  opacity={activeIndex !== null && activeIndex !== index ? 0.55 : 1}
                  style={{ transition: "opacity 200ms ease" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>
      <ChartLegend
        content={<ChartLegendContent nameKey="name" className="mt-1" />}
      />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export function CompositionChart({ summary, loading }: CompositionChartProps) {
  const { t } = useLocale();

  const [inputActive, setInputActive] = useState<number | null>(null);
  const [outputActive, setOutputActive] = useState<number | null>(null);

  const onInputEnter = useCallback((_: unknown, i: number) => setInputActive(i), []);
  const onInputLeave = useCallback(() => setInputActive(null), []);
  const onOutputEnter = useCallback((_: unknown, i: number) => setOutputActive(i), []);
  const onOutputLeave = useCallback(() => setOutputActive(null), []);

  const inputHalf = useMemo(
    () => buildHalfConfig(INPUT_COMPOSITION_META, summary, t),
    [summary, t],
  );

  const outputHalf = useMemo(
    () => buildHalfConfig(OUTPUT_COMPOSITION_META, summary, t),
    [summary, t],
  );

  const cacheTotal = (summary.cache_read || 0) + (summary.cache_write || 0);
  const inputTotal = (summary.input || 0) + cacheTotal;
  const outputTotal = (summary.output || 0) + (summary.reasoning || 0);

  const cachePct = formatPct(cacheTotal, inputTotal);
  const reasoningPct = formatPct(summary.reasoning || 0, outputTotal);

  if (loading) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader className="pb-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Skeleton className="h-[120px] w-full rounded-lg" />
            <Skeleton className="mx-auto mt-2 h-3 w-16" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-[120px] w-full rounded-lg" />
            <Skeleton className="mx-auto mt-2 h-3 w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel glow-border h-full overflow-hidden rounded-xl border-0 animate-fade-in transition-colors hover:border-primary/15 stagger-4">
      <CardHeader className="pb-1">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-chart-2">
          Breakdown
        </p>
        <CardTitle className="text-base font-semibold">{t("chart.breakdownTitle")}</CardTitle>
        <CardDescription className="text-xs">{t("chart.breakdownDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        {/* Input side */}
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t("composition.inputSide")}
          </p>
          <HalfDonut
            chartConfig={inputHalf.chartConfig}
            data={inputHalf.data}
            total={inputHalf.total}
            loading={false}
            centerLabel={t("composition.cacheRatio")}
            centerValue={`${cachePct}%`}
            subLabel={formatCompact(cacheTotal)}
            emptyText={t("chart.noCompositionData")}
            activeIndex={inputActive}
            onHover={onInputEnter}
            onLeave={onInputLeave}
          />
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-border/50" />

        {/* Output side */}
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t("composition.outputSide")}
          </p>
          <HalfDonut
            chartConfig={outputHalf.chartConfig}
            data={outputHalf.data}
            total={outputHalf.total}
            loading={false}
            centerLabel={t("composition.reasoningRatio")}
            centerValue={`${reasoningPct}%`}
            subLabel={formatCompact(summary.reasoning || 0)}
            emptyText={t("chart.noCompositionData")}
            activeIndex={outputActive}
            onHover={onOutputEnter}
            onLeave={onOutputLeave}
          />
        </div>
      </CardContent>
    </Card>
  );
}
