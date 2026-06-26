import { useMemo, useState, useCallback } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ProviderModelTrendEntry } from "@/types";
import type { Locale } from "@/lib/i18n";
import { formatCompact, formatDateLabel, formatNumber, formatAxisValue } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ────────────────────────────────────────────────────────────────

interface CacheHitRateChartProps {
  trends: ProviderModelTrendEntry[];
  loading: boolean;
}

interface SeriesItem {
  key: string;
  provider: string;
  model: string;
  color: string;
  totalTokens: number;
  dayMap: Map<string, { cache_miss: number }>;
}

interface ChartDataRow {
  date: string;
  dateLabel: string;
  [key: string]: unknown;
}

// ── Palette ──────────────────────────────────────────────────────────────

const LINE_COLORS = [
  "#f87171",
  "#34d399",
  "#22d3ee",
  "#a78bfa",
  "#fb923c",
  "#f472b6",
  "#facc15",
  "#4ade80",
  "#38bdf8",
  "#c084fc",
  "#818cf8",
  "#2dd4bf",
  "#e879f9",
  "#a3e635",
  "#f43f5e",
];

// ── Custom Tooltip ───────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  dataKey?: string;
  value?: number;
  payload?: ChartDataRow;
}

function CacheTooltip(props: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  series: SeriesItem[];
  locale: Locale;
  t: (key: string) => string;
}) {
  const { active, payload, label, series, locale, t } = props;
  if (!active || !payload?.length) return null;

  const dateStr = payload[0]?.payload?.date as string | undefined;
  const dateLabel = dateStr
    ? formatDateLabel(dateStr, "long", locale)
    : label;

  return (
    <div className="rounded-lg border border-border/50 bg-background/95 px-3 py-2.5 shadow-xl backdrop-blur-sm">
      <p className="mb-1.5 text-xs font-semibold text-foreground">
        {dateLabel}
      </p>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry) => {
          const key = entry.dataKey || "";
          const s = series.find((item) => item.key === key);
          if (!s) return null;
          const missed = entry.value || 0;

          return (
            <div key={key} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="max-w-[200px] truncate text-xs font-medium text-foreground">
                  {key}
                </span>
              </div>
              <div className="ml-4 flex flex-col gap-0">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {t("chart.missedTokens")}: {formatCompact(missed, locale)} ({formatNumber(missed, locale)})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export function CacheHitRateChart({ trends, loading }: CacheHitRateChartProps) {
  const { locale, t } = useLocale();
  const typedLocale = locale as Locale;
  const [soloKey, setSoloKey] = useState<string | null>(null);

  // Pick top trends by total tokens (must come before handleLegendClick)
  const { series, allDates, chartConfig } = useMemo(() => {
    const sorted = [...trends]
      .map((tr) => {
        const totalTokens = tr.days.reduce((s, d) => s + (d.total || 0), 0);
        return { ...tr, totalTokens };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 12);

    const dateSet = new Set<string>();
    for (const tr of sorted) {
      for (const d of tr.days) {
        dateSet.add(d.date);
      }
    }
    const dates = [...dateSet].sort();

    const seriesData: SeriesItem[] = sorted.map((tr, index) => {
      const key = `${tr.provider}/${tr.model}`;
      const color = LINE_COLORS[index % LINE_COLORS.length];
      const dayMap = new Map(
        tr.days.map((d) => [
          d.date,
          {
            cache_miss: d.cache_miss || 0,
          },
        ])
      );
      return { key, provider: tr.provider, model: tr.model, color, totalTokens: tr.totalTokens, dayMap };
    });

    const cfg: ChartConfig = {};
    for (const s of seriesData) {
      cfg[s.key] = { label: s.key, color: s.color };
    }

    return { series: seriesData, allDates: dates, chartConfig: cfg };
  }, [trends]);

  const handleLegendClick = useCallback(
    (key: string) => {
      if (soloKey === key) {
        // Clicking the same solo key → exit solo, show all
        setSoloKey(null);
      } else {
        // Enter solo mode: show only this one
        setSoloKey(key);
      }
    },
    [soloKey],
  );

  // Compute effective hidden keys: solo mode hides everything except the solo target
  const effectiveHidden = useMemo(() => {
    if (soloKey) {
      return new Set(series.filter((s) => s.key !== soloKey).map((s) => s.key));
    }
    return new Set<string>();
  }, [soloKey, series]);

  // Build flat chart data
  const chartData = useMemo<ChartDataRow[]>(() => {
    return allDates.map((date) => {
      const row: ChartDataRow = {
        date,
        dateLabel: formatDateLabel(date, "short", typedLocale),
      };
      for (const s of series) {
        const day = s.dayMap.get(date);
        if (day) {
          row[s.key] = day.cache_miss;
        } else {
          row[s.key] = undefined;
        }
      }
      return row;
    });
  }, [allDates, series, locale]);

  if (loading) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader className="pb-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[360px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!series.length) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader>
          <CardDescription className="pt-36 text-center">
            {t("chart.noModelData")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in stagger-5">
      <CardHeader className="pb-2">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-chart-2">
          Performance
        </p>
        <CardTitle className="text-base font-semibold">
          {t("chart.cacheMissTitle")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("chart.cacheMissDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[360px] w-full">
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval={(() => {
                const n = chartData.length;
                if (n <= 14) return 0;
                if (n <= 30) return 1;
                if (n <= 60) return 2;
                if (n <= 90) return 3;
                return Math.ceil(n / 30) - 1;
              })()}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => formatAxisValue(v, locale)}
              domain={[0, "auto"]}
              width={48}
            />
            <ChartTooltip
              content={
                <CacheTooltip
                  series={series}
                  locale={typedLocale}
                  t={t}
                />
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={
                  chartData.length <= 31
                    ? { r: 2, fill: s.color, stroke: "var(--background)", strokeWidth: 1.5 }
                    : false
                }
                activeDot={{
                  r: 4,
                  fill: s.color,
                  stroke: "var(--background)",
                  strokeWidth: 2,
                }}
                hide={effectiveHidden.has(s.key)}
                animationDuration={500}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
        {/* Custom interactive legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pt-3">
          {series.map((s) => {
            const isHidden = effectiveHidden.has(s.key);
            const isSolo = soloKey === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => handleLegendClick(s.key)}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-all duration-150 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title={isSolo ? t("chart.clickToShowAll") : t("chart.clickToSolo")}
              >
                <span
                  className="inline-block size-2.5 shrink-0 rounded-[2px] transition-opacity duration-150"
                  style={{
                    backgroundColor: s.color,
                    opacity: isHidden ? 0.3 : 1,
                  }}
                />
                <span
                  className={`font-mono transition-colors duration-150 ${
                    isHidden
                      ? "text-muted-foreground/50 line-through"
                      : isSolo
                        ? "text-foreground font-semibold"
                        : "text-foreground"
                  }`}
                >
                  {s.key}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
