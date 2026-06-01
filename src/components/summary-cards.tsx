import type { DayEntry, MetricKey, MetricSummary } from "@/types";
import { formatMetricValue, getLocalDateString } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowUpIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  ClockIcon,
  MessageSquareIcon,
  TrendingUpIcon,
  ZapIcon,
} from "lucide-react";

interface SummaryCardsProps {
  days: DayEntry[];
  summary: MetricSummary;
  metric: MetricKey;
  range: string;
}

/** Whether the data uses hourly buckets (e.g. "2026-05-30T14"). */
function isHourlyData(days: DayEntry[]): boolean {
  return days.length > 0 && days[0].date.includes("T");
}

/** Count unique calendar days in the dataset. */
function uniqueDayCount(days: DayEntry[]): number {
  const seen = new Set<string>();
  for (const d of days) {
    seen.add(d.date.slice(0, 10));
  }
  return seen.size;
}

/** Recompute cache_hit_rate from raw counter fields (it's a rate, not additive). */
function recomputeCacheHitRate(entry: { input: number; cache_read: number; cache_write: number; cache_hit_rate: number }): void {
  const inputTotal = (entry.input || 0) + (entry.cache_read || 0) + (entry.cache_write || 0);
  entry.cache_hit_rate = inputTotal === 0 ? 0 : Math.round(((entry.cache_read || 0) + (entry.cache_write || 0)) / inputTotal * 1000) / 10;
}

/**
 * Aggregate hourly buckets into daily buckets by summing additive numeric fields.
 * cache_hit_rate is recomputed after aggregation since it is a rate, not a counter.
 * If data is already daily, returns a shallow copy as-is.
 */
function aggregateToDays(days: DayEntry[]): DayEntry[] {
  if (!isHourlyData(days)) return days.slice();

  const dayMap = new Map<string, DayEntry>();
  for (const d of days) {
    const dayKey = d.date.slice(0, 10);
    const existing = dayMap.get(dayKey);
    if (existing) {
      // Sum additive numeric metric fields (skip cache_hit_rate — it's a rate)
      for (const key of Object.keys(d) as (keyof DayEntry)[]) {
        if (key === "date" || key === "cache_hit_rate") continue;
        const val = d[key];
        if (typeof val === "number") {
          (existing as unknown as Record<string, unknown>)[key] = ((existing[key] as number) || 0) + val;
        }
      }
    } else {
      dayMap.set(dayKey, { ...d, date: dayKey });
    }
  }

  // Recompute cache_hit_rate from the summed counters
  for (const entry of dayMap.values()) {
    recomputeCacheHitRate(entry);
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Find the last entry with non-zero value for the given metric (works on day-level data). */
function findLastNonZeroDay(dayEntries: DayEntry[], metric: MetricKey): DayEntry | undefined {
  for (let i = dayEntries.length - 1; i >= 0; i--) {
    if ((dayEntries[i][metric] || 0) > 0) return dayEntries[i];
  }
  return dayEntries.at(-1);
}

export function SummaryCards({ days, summary, metric, range }: SummaryCardsProps) {
  const { locale, t } = useLocale();
  const metricLabel = t(`metric.${metric}`);
  const dayCount = uniqueDayCount(days);

  // Display the user-selected range as the "total" card subtitle
  const rangeDayCount = range === "all" ? dayCount : parseInt(range, 10) || dayCount;

  // Aggregate hourly data into day-level for today/peak/average calculations
  const dayEntries = aggregateToDays(days);

  const latestDay = findLastNonZeroDay(dayEntries, metric);
  const todayStr = getLocalDateString();
  const latestDayStr = latestDay ? latestDay.date : "";
  const isToday = latestDayStr === todayStr;
  const latestLabel = isToday ? t("summary.today") : t("summary.latestDay");
  const latestValue = latestDay?.[metric] || 0;
  const average = dayCount ? Math.round((summary[metric] || 0) / dayCount) : 0;
  const peakDay = findPeakDay(dayEntries, metric);

  const utilityCard =
    metric === "user_message_count"
      ? {
          label: t("summary.totalTokens"),
          value: formatMetricValue("total", summary.total, locale),
          subtitle: t("summary.currentRangeTotal"),
          icon: <ZapIcon className="size-3.5" />,
          accent: "text-chart-3",
        }
      : {
          label: t("summary.userMessages"),
          value: formatMetricValue("user_message_count", summary.user_message_count, locale),
          subtitle: t("summary.perDay", { value: dayCount ? formatMetricValue("user_message_count", Math.round(summary.user_message_count / dayCount), locale) : "0" }),
          icon: <MessageSquareIcon className="size-3.5" />,
          accent: "text-chart-4",
        };

  const cards = [
    {
      label: latestLabel,
      value: formatMetricValue(metric, latestValue, locale),
      subtitle: latestDay?.date && !isNaN(new Date(`${latestDay.date}T00:00:00`).getTime())
        ? `${metricLabel} · ${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(`${latestDay.date}T00:00:00`))}`
        : metricLabel,
      icon: isToday ? <ClockIcon className="size-3.5" /> : <CalendarDaysIcon className="size-3.5" />,
      accent: "text-chart-1",
    },
    {
      label: t("summary.total"),
      value: formatMetricValue(metric, summary[metric] || 0, locale),
      subtitle: t("summary.days", { count: rangeDayCount }),
      icon: <BarChart3Icon className="size-3.5" />,
      accent: "text-chart-2",
    },
    {
      label: t("summary.dailyAvg"),
      value: formatMetricValue(metric, average, locale),
      subtitle: metricLabel,
      icon: <TrendingUpIcon className="size-3.5" />,
      accent: "text-chart-3",
    },
    {
      label: t("summary.peak"),
      value: peakDay ? formatMetricValue(metric, peakDay[metric] || 0, locale) : "0",
      subtitle: peakDay && !isNaN(new Date(`${peakDay.date}T00:00:00`).getTime())
        ? `${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(`${peakDay.date}T00:00:00`))}`
        : t("summary.noData"),
      icon: <ArrowUpIcon className="size-3.5" />,
      accent: "text-chart-4",
    },
    { ...utilityCard },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card, i) => (
        <Card
          key={card.label}
          size="sm"
          className={`animate-slide-up group relative border-border p-3 transition-colors hover:border-primary/20`}
          style={{ animationDelay: `${(i + 1) * 60}ms` }}
        >
          <div
            className={`${card.accent} absolute inset-x-3 top-0 h-[2px] origin-left scale-x-80 rounded-b-full opacity-50 transition-[opacity,transform] duration-200 group-hover:scale-x-100 group-hover:opacity-80`}
          />
          <CardContent className="p-0">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">{card.label}</span>
              <span className={`${card.accent} flex size-7 items-center justify-center rounded-full bg-secondary/50 opacity-50 transition-opacity group-hover:opacity-80`}>
                {card.icon}
              </span>
            </div>
            <strong className="mt-1 block font-mono text-lg font-bold leading-tight transition-colors group-hover:text-foreground md:text-xl">
              {card.value}
            </strong>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">{card.subtitle}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function findPeakDay(days: DayEntry[], metric: MetricKey): DayEntry | null {
  return days.reduce<DayEntry | null>(
    (peak, current) =>
      !peak || (current[metric] || 0) > (peak[metric] || 0) ? current : peak,
    null,
  );
}
