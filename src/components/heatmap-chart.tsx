import { useMemo } from "react";
import type { HeatmapPayload, MetricKey } from "@/types";
import { formatMetricValue, formatDateLabel } from "@/lib/format";
import { useLocale, type Locale } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Constants ────────────────────────────────────────────────────────────

/** 12 two-hour blocks per day: 00-02, 02-04, …, 22-24. */
const BLOCK_COUNT = 12;
const HOURS_PER_BLOCK = 2;

/** Intensity → primary-color opacity via color-mix (level 0 = muted bg). */
const LEVEL_PCT = [0, 22, 42, 62, 82, 100];

const HOURLY_RE = /T\d{2}$/;

// ── Types ────────────────────────────────────────────────────────────────

interface HeatmapChartProps {
  heatmap: HeatmapPayload;
  metric: MetricKey;
  loading: boolean;
}

interface Cell {
  /** Metric value for this 2-hour block (unused for cache_hit_rate). */
  v: number;
  inp: number;
  cr: number;
  cw: number;
}

interface DayColumn {
  date: string;
  dateLabel: string;
  blocks: Cell[];
}

interface DayCell {
  date: string;
  value: number;
  inRange: boolean;
}

// ── Shared helpers ───────────────────────────────────────────────────────

function newCell(): Cell {
  return { v: 0, inp: 0, cr: 0, cw: 0 };
}

function computeHitRate(inp: number, cr: number, cw: number): number {
  const total = inp + cr + cw;
  if (total === 0) return 0;
  return Math.round(((cr + cw) / total) * 1000) / 10;
}

function blockDisplayValue(cell: Cell, metric: MetricKey): number {
  if (metric === "cache_hit_rate") {
    return computeHitRate(cell.inp, cell.cr, cell.cw);
  }
  return cell.v;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Slot label, e.g. block 4 → "08:00–10:00". */
function slotLabel(blockIndex: number): string {
  const start = blockIndex * HOURS_PER_BLOCK;
  const end = start + HOURS_PER_BLOCK;
  const endLabel = end >= 24 ? "24:00" : `${pad2(end)}:00`;
  return `${pad2(start)}:00–${endLabel}`;
}

function levelFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  // sqrt compresses the range so a few spikes don't flatten the rest
  const ratio = Math.sqrt(value / max);
  return Math.min(LEVEL_PCT.length - 1, Math.max(1, Math.ceil(ratio * 5)));
}

function cellBg(level: number): string {
  return `color-mix(in oklch, var(--primary) ${LEVEL_PCT[level]}%, transparent)`;
}

function hourlyCellSize(dayCount: number): number {
  if (dayCount <= 7) return 42;
  if (dayCount <= 14) return 30;
  if (dayCount <= 24) return 22;
  return 16;
}

function calendarCellSize(weekCount: number): number {
  if (weekCount <= 20) return 16;
  if (weekCount <= 40) return 13;
  return 11;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function intlLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "zh-CN";
}

const EMPTY_HEATMAP: HeatmapPayload = { granularity: "daily", intervalHours: 24, data: [] };

const CELL_CLASS =
  "rounded-[3px] border border-border/40 outline-none transition-all duration-100 hover:scale-110 hover:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary data-[level=0]:bg-muted/55";

// ── Main Component ───────────────────────────────────────────────────────

export function HeatmapChart({ heatmap, metric, loading }: HeatmapChartProps) {
  const { locale, t } = useLocale();
  const { granularity, data } = heatmap;
  const isHourly = granularity === "hourly";

  // ── Hourly view: place the 12 two-hour points per day into rows ──────
  const hourlyView = useMemo(() => {
    const hourly = data.filter((d) => HOURLY_RE.test(d.date));
    if (!hourly.length) {
      return { columns: [] as DayColumn[], maxValue: 0, total: 0 };
    }

    const byDate = new Map<string, Cell[]>();
    const dateOrder: string[] = [];

    for (const d of hourly) {
      const [date, hourStr] = d.date.split("T");
      const hour = Number.parseInt(hourStr, 10);
      if (Number.isNaN(hour)) continue;
      const blockIndex = Math.min(BLOCK_COUNT - 1, Math.floor(hour / HOURS_PER_BLOCK));

      let blocks = byDate.get(date);
      if (!blocks) {
        blocks = Array.from({ length: BLOCK_COUNT }, newCell);
        byDate.set(date, blocks);
        dateOrder.push(date);
      }
      const cell = blocks[blockIndex];
      const mv = (d as Record<MetricKey, number>)[metric] || 0;
      cell.v += mv;
      cell.inp += d.input || 0;
      cell.cr += d.cache_read || 0;
      cell.cw += d.cache_write || 0;
    }

    const columns: DayColumn[] = dateOrder.sort().map((date) => ({
      date,
      dateLabel: formatDateLabel(date, "short", locale),
      blocks: byDate.get(date)!,
    }));

    let max = 0;
    let sum = 0;
    for (const col of columns) {
      for (const cell of col.blocks) {
        const val = blockDisplayValue(cell, metric);
        if (val > max) max = val;
        sum += val;
      }
    }
    return { columns, maxValue: max, total: sum };
  }, [data, metric, locale]);

  // ── Calendar view (daily): week × weekday, Monday-start ───────────────
  const calendarView = useMemo(() => {
    const daily = data.filter((d) => !HOURLY_RE.test(d.date));
    if (!daily.length) {
      return {
        weeks: [] as DayCell[][],
        monthLabels: [] as string[],
        weekdayLabels: [] as string[],
        maxValue: 0,
        total: 0,
      };
    }

    const valueMap = new Map<string, number>();
    for (const d of daily) {
      valueMap.set(d.date, (d as Record<MetricKey, number>)[metric] || 0);
    }

    const sorted = [...valueMap.keys()].sort();
    const minDate = new Date(`${sorted[0]}T00:00:00`);
    const maxDate = new Date(`${sorted[sorted.length - 1]}T00:00:00`);

    // Align to week boundaries (Monday-start): (getDay()+6)%7 → 0=Mon … 6=Sun
    const start = new Date(minDate);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(maxDate);
    end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));

    const weeks: DayCell[][] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const week: DayCell[] = [];
      for (let i = 0; i < 7; i++) {
        const ds = toISODate(cur);
        const inRange = cur >= minDate && cur <= maxDate;
        week.push({ date: ds, value: valueMap.get(ds) ?? 0, inRange });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }

    let max = 0;
    let sum = 0;
    for (const w of weeks) {
      for (const c of w) {
        if (!c.inRange) continue;
        if (c.value > max) max = c.value;
        sum += c.value;
      }
    }

    const intl = intlLocale(locale);
    const weekdayLabels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return new Intl.DateTimeFormat(intl, { weekday: "short" }).format(d);
    });
    const monthFmt = new Intl.DateTimeFormat(intl, { month: "short" });
    let prevMonth = -1;
    const monthLabels = weeks.map((w) => {
      const mon = new Date(`${w[0].date}T00:00:00`);
      const m = mon.getMonth();
      if (m !== prevMonth) {
        prevMonth = m;
        return monthFmt.format(mon);
      }
      return "";
    });

    return { weeks, monthLabels, weekdayLabels, maxValue: max, total: sum };
  }, [data, metric, locale]);

  const view = isHourly ? hourlyView : calendarView;
  const hasData = isHourly ? hourlyView.columns.length > 0 : calendarView.weeks.length > 0;
  const maxValue = view.maxValue;
  const total = view.total;

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in">
        <CardHeader className="pb-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in stagger-5">
        <CardHeader>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-chart-3">
            Activity
          </p>
          <CardTitle className="text-base font-semibold">
            {t("chart.heatmapTitle")}
          </CardTitle>
          <CardDescription className="pt-20 text-center text-sm">
            {t("chart.noTrendData")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-8" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel glow-border overflow-hidden rounded-xl border-0 animate-fade-in stagger-6 transition-colors hover:border-primary/15">
      <CardHeader className="pb-2">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-chart-3">
          Activity
        </p>
        <CardTitle className="text-base font-semibold">
          {t("chart.heatmapTitle")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("chart.heatmapDesc", { metric: t(`metric.${metric}`) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={120}>
          {isHourly ? (
            <HourlyGrid
              columns={hourlyView.columns}
              maxValue={maxValue}
              metric={metric}
              locale={locale}
            />
          ) : (
            <CalendarGrid
              weeks={calendarView.weeks}
              monthLabels={calendarView.monthLabels}
              weekdayLabels={calendarView.weekdayLabels}
              maxValue={maxValue}
              metric={metric}
              locale={locale}
            />
          )}
        </TooltipProvider>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{t("chart.heatmapLess")}</span>
            {[0, 1, 2, 3, 4, 5].map((lvl) => (
              <span
                key={lvl}
                className="size-3 rounded-[3px] border border-border/60"
                style={{
                  backgroundColor:
                    lvl === 0
                      ? "color-mix(in oklch, var(--muted) 60%, transparent)"
                      : cellBg(lvl),
                }}
              />
            ))}
            <span>{t("chart.heatmapMore")}</span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {t("chart.heatmapTotal")}:{" "}
            <span className="font-semibold text-foreground">
              {formatMetricValue(metric, total, locale)}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export { EMPTY_HEATMAP };

// ── Hourly grid (2-hour blocks: day-columns × 12 rows) ────────────────────

interface HourlyGridProps {
  columns: DayColumn[];
  maxValue: number;
  metric: MetricKey;
  locale: Locale;
}

function HourlyGrid({ columns, maxValue, metric, locale }: HourlyGridProps) {
  const dayCount = columns.length;
  const size = hourlyCellSize(dayCount);
  const gap = 3;
  const labelW = 46;
  const headerH = 16;
  const gridTemplateColumns = `${labelW}px repeat(${dayCount}, ${size}px)`;
  const gridTemplateRows = `${headerH}px repeat(${BLOCK_COUNT}, ${size}px)`;

  const labelStep = dayCount <= 14 ? 1 : Math.ceil(dayCount / 14);
  const showRowLabel = (blockIndex: number) => blockIndex % 2 === 0;

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="mx-auto grid w-fit"
        style={{
          gridTemplateColumns,
          gridTemplateRows,
          columnGap: `${gap}px`,
          rowGap: `${gap}px`,
        }}
      >
        {/* Header row: corner + day labels */}
        <div />
        {columns.map((col, i) => (
          <div
            key={`h-${col.date}`}
            className="flex items-end justify-center overflow-visible pb-0.5 text-[9px] font-medium leading-none text-muted-foreground"
          >
            {i % labelStep === 0 ? col.dateLabel : ""}
          </div>
        ))}

        {/* Body rows: row label + cells */}
        {Array.from({ length: BLOCK_COUNT }, (_, blockIndex) => (
          <HourlyRow
            key={`r-${blockIndex}`}
            blockIndex={blockIndex}
            columns={columns}
            metric={metric}
            maxValue={maxValue}
            size={size}
            showLabel={showRowLabel(blockIndex)}
            locale={locale}
          />
        ))}
      </div>
    </div>
  );
}

interface HourlyRowProps {
  blockIndex: number;
  columns: DayColumn[];
  metric: MetricKey;
  maxValue: number;
  size: number;
  showLabel: boolean;
  locale: Locale;
}

function HourlyRow({
  blockIndex,
  columns,
  metric,
  maxValue,
  size,
  showLabel,
  locale,
}: HourlyRowProps) {
  return (
    <>
      <div
        className="flex items-center justify-end pr-1 text-[9px] font-medium leading-none text-muted-foreground"
        style={{ height: size }}
      >
        {showLabel ? `${pad2(blockIndex * HOURS_PER_BLOCK)}:00` : ""}
      </div>
      {columns.map((col) => {
        const cell = col.blocks[blockIndex];
        const value = blockDisplayValue(cell, metric);
        const level = levelFor(value, maxValue);
        return (
          <Tooltip key={`${col.date}-${blockIndex}`}>
            <TooltipTrigger asChild>
              <div
                tabIndex={0}
                role="img"
                aria-label={`${col.date} ${slotLabel(blockIndex)}: ${formatMetricValue(metric, value, locale)}`}
                className={CELL_CLASS}
                data-level={level}
                style={{
                  width: size,
                  height: size,
                  backgroundColor: level === 0 ? undefined : cellBg(level),
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="flex flex-col items-start gap-0.5">
              <span className="font-medium">
                {formatDateLabel(col.date, "long", locale)}
              </span>
              <span className="font-mono text-[10px] text-background/80">
                {slotLabel(blockIndex)}
              </span>
              <span className="font-mono text-[11px] font-semibold">
                {formatMetricValue(metric, value, locale)}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

// ── Calendar grid (daily: week × weekday, Monday-start) ──────────────────

/** Rows that get a weekday label (Mon, Wed, Fri → indices 0, 2, 4). */
const LABELED_WEEKDAYS = new Set([0, 2, 4]);

interface CalendarGridProps {
  weeks: DayCell[][];
  monthLabels: string[];
  weekdayLabels: string[];
  maxValue: number;
  metric: MetricKey;
  locale: Locale;
}

function CalendarGrid({
  weeks,
  monthLabels,
  weekdayLabels,
  maxValue,
  metric,
  locale,
}: CalendarGridProps) {
  const weekCount = weeks.length;
  const size = calendarCellSize(weekCount);
  const gap = 3;
  const labelW = 34;
  const monthH = 14;
  const gridTemplateColumns = `${labelW}px repeat(${weekCount}, ${size}px)`;
  const gridTemplateRows = `${monthH}px repeat(7, ${size}px)`;

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="mx-auto grid w-fit"
        style={{
          gridTemplateColumns,
          gridTemplateRows,
          columnGap: `${gap}px`,
          rowGap: `${gap}px`,
        }}
      >
        {/* Header row: corner + month labels */}
        <div />
        {monthLabels.map((label, i) => (
          <div
            key={`m-${i}`}
            className="flex items-end justify-start overflow-visible pb-0.5 text-[9px] font-medium leading-none text-muted-foreground"
          >
            {label}
          </div>
        ))}

        {/* Body rows: weekday label + cells (Mon=0 … Sun=6) */}
        {Array.from({ length: 7 }, (_, row) => (
          <CalendarRow
            key={`d-${row}`}
            row={row}
            weeks={weeks}
            metric={metric}
            maxValue={maxValue}
            size={size}
            weekdayLabel={LABELED_WEEKDAYS.has(row) ? weekdayLabels[row] : ""}
            locale={locale}
          />
        ))}
      </div>
    </div>
  );
}

interface CalendarRowProps {
  row: number;
  weeks: DayCell[][];
  metric: MetricKey;
  maxValue: number;
  size: number;
  weekdayLabel: string;
  locale: Locale;
}

function CalendarRow({
  row,
  weeks,
  metric,
  maxValue,
  size,
  weekdayLabel,
  locale,
}: CalendarRowProps) {
  return (
    <>
      <div
        className="flex items-center justify-end pr-1 text-[9px] font-medium leading-none text-muted-foreground"
        style={{ height: size }}
      >
        {weekdayLabel}
      </div>
      {weeks.map((week, wi) => {
        const cell = week[row];
        // Out-of-range days render as transparent placeholders to keep alignment.
        if (!cell.inRange) {
          return <div key={`c-${wi}-${row}`} style={{ width: size, height: size }} />;
        }
        const level = levelFor(cell.value, maxValue);
        return (
          <Tooltip key={`c-${wi}-${row}`}>
            <TooltipTrigger asChild>
              <div
                tabIndex={0}
                role="img"
                aria-label={`${cell.date}: ${formatMetricValue(metric, cell.value, locale)}`}
                className={CELL_CLASS}
                data-level={level}
                style={{
                  width: size,
                  height: size,
                  backgroundColor: level === 0 ? undefined : cellBg(level),
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="flex flex-col items-start gap-0.5">
              <span className="font-medium">
                {formatDateLabel(cell.date, "long", locale)}
              </span>
              <span className="font-mono text-[11px] font-semibold">
                {formatMetricValue(metric, cell.value, locale)}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}
