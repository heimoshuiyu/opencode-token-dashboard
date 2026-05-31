import { useState } from "react";
import { useUsage } from "@/hooks/use-usage";
import { RANGE_OPTIONS, METRIC_OPTIONS } from "@/types";
import type { MetricKey } from "@/types";
import { HeroSection } from "@/components/hero-section";
import { SummaryCards } from "@/components/summary-cards";
import { TrendChart } from "@/components/trend-chart";
import { CompositionChart } from "@/components/composition-chart";
import { ModelChart } from "@/components/model-chart";
import { ProviderChart } from "@/components/provider-chart";
import { CacheHitRateChart } from "@/components/cache-hit-rate-chart";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCwIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useLocale } from "@/lib/i18n";

export function App() {
  const [range, setRange] = useState("30");
  const [metric, setMetric] = useState<MetricKey>("total");
  const { data, loading, error, refresh } = useUsage(range);
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (error && !data) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="max-w-md text-center animate-scale-in">
          <CardContent className="flex flex-col items-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <span className="text-xl">⚠</span>
            </div>
            <p className="text-base font-semibold text-destructive">{error}</p>
            <Button onClick={refresh} className="mt-4">
              {t("app.retry")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-radial-glow relative min-h-svh">
      {/* Background grid */}
      <div className="bg-grid pointer-events-none fixed inset-0" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-[1600px] px-3 py-4 md:px-5">
        {/* Hero */}
        {data && <HeroSection payload={data} metric={metric} />}

        {/* Controls */}
        <div className="mt-3 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between animate-fade-in stagger-2">
          {/* Time range toggle group */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("app.range")}
            </span>
            <ToggleGroup
              type="single"
              value={range}
              onValueChange={(v) => v && setRange(v)}
              variant="outline"
              size="sm"
              className="gap-0.5"
            >
              {RANGE_OPTIONS.map((opt) => (
                <ToggleGroupItem
                  key={opt.value}
                  value={opt.value}
                  className="text-[12px] data-[state=on]:bg-primary/15 data-[state=on]:border-primary/30 data-[state=on]:text-primary data-[state=on]:font-medium data-[state=on]:shadow-sm transition-all duration-150"
                >
                  {t(`rangeOption.${opt.value}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Metric selector + Refresh + Theme — wraps on mobile */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
              <SelectTrigger className="h-8 w-[170px] rounded-lg text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(`metric.${opt.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={refresh}
              disabled={loading}
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-3"
            >
              <RefreshCwIcon
                data-icon="inline-start"
                className={loading ? "animate-spin" : ""}
              />
              <span className="text-xs">{loading ? t("app.loading") : t("app.refresh")}</span>
            </Button>

            <Button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-2"
            >
              {isDark ? <SunIcon className="size-3.5" /> : <MoonIcon className="size-3.5" />}
            </Button>

            <Button
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-2"
            >
              <span className="text-xs font-mono">{locale === "zh" ? "EN" : "中"}</span>
            </Button>
          </div>
        </div>

        {/* Subtle separator between controls and content */}
        <div className="mt-4 mb-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Summary cards */}
        <div className="mt-3">
          {loading && !data ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-panel rounded-xl p-4 space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : data ? (
            <SummaryCards days={data.days} summary={data.summary} metric={metric} />
          ) : null}
        </div>

        {/* Charts grid */}
        <div className="mt-3 grid gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-8">
            {loading && <div className="absolute inset-0 z-10 rounded-xl bg-background/50 backdrop-blur-[2px]" />}
            <TrendChart days={data?.days || []} metric={metric} loading={loading} range={range} />
          </div>
          <div className="relative lg:col-span-4">
            {loading && <div className="absolute inset-0 z-10 rounded-xl bg-background/50 backdrop-blur-[2px]" />}
            <CompositionChart summary={data?.summary || ({} as any)} loading={loading} />
          </div>
          <div className="relative lg:col-span-7">
            {loading && <div className="absolute inset-0 z-10 rounded-xl bg-background/50 backdrop-blur-[2px]" />}
            <ModelChart items={data?.models || []} metric={metric} loading={loading} />
          </div>
          <div className="relative lg:col-span-5">
            {loading && <div className="absolute inset-0 z-10 rounded-xl bg-background/50 backdrop-blur-[2px]" />}
            <ProviderChart items={data?.providers || []} metric={metric} loading={loading} />
          </div>
          <div className="relative lg:col-span-12">
            {loading && <div className="absolute inset-0 z-10 rounded-xl bg-background/50 backdrop-blur-[2px]" />}
            <CacheHitRateChart trends={data?.providerModelTrends || []} loading={loading} />
          </div>
        </div>

        {/* Footer */}
        {data && (
          <>
            <Separator className="mt-4" />
            <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-muted-foreground animate-fade-in stagger-4">
              <span>
                {t("app.database")}: <span className="font-mono">{data.meta.database}</span>
              </span>
              <span className="text-border">·</span>
              <span>{data.meta.scannedRows.toLocaleString()} {t("app.rowsScanned")}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
