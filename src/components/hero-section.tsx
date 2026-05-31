import type { UsagePayload, MetricKey } from "@/types";
import {
  formatDateLabel,
  formatDateTime,
  formatMetricValue,
  getRangeLabel,
} from "@/lib/format";
import { CalendarRangeIcon, HashIcon, ActivityIcon } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";

interface HeroSectionProps {
  payload: UsagePayload;
  metric: MetricKey;
}

export function HeroSection({ payload, metric }: HeroSectionProps) {
  const { locale, t } = useLocale();
  const { meta } = payload;
  const metricLabel = t(`metric.${metric}`);

  const days = payload.days;
  const startDate = days[0]?.date || meta.firstDay || "—";
  const endDate = days.at(-1)?.date || meta.lastDay || "—";
  const totalValue = payload.summary[metric] || 0;

  return (
    <div className="glass-panel glow-border relative overflow-hidden rounded-2xl p-3 md:p-4 animate-fade-in">
      <div className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full bg-primary/6 blur-[80px] animate-glow-pulse dark:block hidden" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 size-44 rounded-full bg-chart-2/4 blur-[80px] dark:block hidden" />

      <div className="relative grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
        <div className="animate-slide-up">
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-chart-2/20 bg-chart-2/5 px-2.5 py-0.5">
            <ActivityIcon className="size-3 text-chart-2" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-chart-2">
              OpenCode Usage Monitor
            </span>
          </div>
          <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
            Tokens{" "}
            <span className="accent-gradient-text">{t("hero.dashboard")}</span>
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            {t("hero.description")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 animate-slide-up stagger-2">
          <MetaCard
            icon={<CalendarRangeIcon className="size-3 text-chart-2" />}
            label={t("hero.statRange")}
          >
            {formatDateLabel(startDate, "long", locale)} — {formatDateLabel(endDate, "long", locale)}
          </MetaCard>
          <MetaCard
            icon={<ActivityIcon className="size-3 text-primary" />}
            label={t("hero.currentRange")}
          >
            {getRangeLabel(meta.range, t)}
          </MetaCard>
          <MetaCard
            icon={<HashIcon className="size-3 text-chart-3" />}
            label={t("hero.assistantMessages")}
          >
            {new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN").format(meta.assistantMessageCount)}
          </MetaCard>
          <MetaCard
            icon={<ActivityIcon className="size-3 text-chart-4" />}
            label={t("hero.currentRangeMetric", { metric: metricLabel })}
          >
            {formatMetricValue(metric, totalValue)}
          </MetaCard>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground animate-fade-in stagger-3">
        <span className="relative inline-block size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/40" />
          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
        </span>
        <span>
          {t("hero.updatedAt")} {formatDateTime(meta.generatedAt, locale)} · {meta.timezone || "local"}
        </span>
      </div>
    </div>
  );
}

function MetaCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="border-border bg-secondary/20 p-0 py-0 transition-colors hover:border-primary/30 hover:shadow-sm">
      <CardHeader className="p-2 pb-0">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <strong className="block truncate text-[13px] font-semibold leading-snug font-mono">
          {children}
        </strong>
      </CardContent>
    </Card>
  );
}
