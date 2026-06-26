import type { Locale } from "@/lib/i18n";
import type { MetricKey } from "@/types";

function localeToIntl(locale?: Locale): string {
  return locale === "en" ? "en-US" : "zh-CN";
}

export function formatNumber(value: number, locale?: Locale): string {
  return new Intl.NumberFormat(localeToIntl(locale)).format(value);
}

export function formatCompact(value: number, locale?: Locale): string {
  return new Intl.NumberFormat(localeToIntl(locale), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatMetricValue(metric: MetricKey, value: number, locale?: Locale): string {
  if (metric === "cache_hit_rate") {
    return `${value.toFixed(1)}%`;
  }
  if (metric === "runtime" || metric === "runtime_dedup") {
    return formatDuration(value);
  }
  return formatNumber(value, locale);
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  const rMinutes = minutes % 60;
  return `${hours}h ${rMinutes}m`;
}

/**
 * Format a gap duration as "+X分钟Y秒" / "+X小时Y分Z秒" (zh) or compact
 * "+Xm Ys" / "+Xh Ym Zs" (en), precise to whole seconds.
 */
export function formatDurationGap(ms: number, locale?: Locale): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const totalH = Math.floor(totalMin / 60);
  const h = totalH % 24;
  const d = Math.floor(totalH / 24);
  const zh = locale !== "en";
  if (zh) {
    if (totalMin === 0) return `+${s}秒`;
    if (totalH === 0) return `+${m}分钟${s}秒`;
    if (d === 0) return `+${h}小时${m}分${s}秒`;
    return `+${d}天${h}小时${m}分${s}秒`;
  }
  if (totalMin === 0) return `+${s}s`;
  if (totalH === 0) return `+${m}m ${s}s`;
  if (d === 0) return `+${h}h ${m}m ${s}s`;
  return `+${d}d ${h}h ${m}m ${s}s`;
}

export function formatAxisValue(value: number, locale?: Locale): string {
  const abs = Math.abs(value);
  if (locale === "en") {
    if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return formatNumber(value, locale);
  }
  if (abs >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (abs >= 1e7) return `${(value / 1e4).toFixed(0)}万`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return formatNumber(value, locale);
}

export function formatAxisDuration(ms: number): string {
  const seconds = ms / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return `${seconds.toFixed(0)}s`;
  if (abs < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatDateLabel(value: string, format: "short" | "long" = "short", locale?: Locale): string {
  if (!value || value === "—") return "—";

  // Hourly format: "2026-05-30T14"
  if (value.length === 13 && value[10] === "T") {
    const d = new Date(`${value.substring(0, 10)}T00:00:00`);
    const hour = value.substring(11);
    if (Number.isNaN(d.getTime())) return value;
    const intl = localeToIntl(locale);
    if (format === "long") {
      return new Intl.DateTimeFormat(intl, { month: "2-digit", day: "2-digit" }).format(d) + ` ${hour}:00`;
    }
    return `${hour}:00`;
  }

  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;

  const intl = localeToIntl(locale);
  if (format === "long") {
    return new Intl.DateTimeFormat(intl, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  return new Intl.DateTimeFormat(intl, { month: "2-digit", day: "2-digit" }).format(d);
}

export function formatDateTime(value: string, locale?: Locale): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "—";
  return new Intl.DateTimeFormat(localeToIntl(locale), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function getRangeLabel(range: string, t: (key: string) => string): string {
  const rangeKeyMap: Record<string, string> = {
    "7": "range.last7",
    "30": "range.last30",
    "90": "range.last90",
    "180": "range.last180",
    "365": "range.last365",
    all: "range.all",
  };
  return t(rangeKeyMap[range] || "range.custom");
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

export function getLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
