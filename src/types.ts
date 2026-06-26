export interface MetricSummary {
  total: number;
  active: number;
  input: number;
  output: number;
  reasoning: number;
  cache_read: number;
  cache_write: number;
  cache_miss: number;
  cache_expected: number;
  cache_hit_rate: number;
  runtime: number;
  runtime_dedup: number;
  user_message_count: number;
}

export interface DayEntry extends MetricSummary {
  date: string;
}

export interface ModelEntry extends MetricSummary {
  name: string;
}

export interface ProviderEntry extends MetricSummary {
  name: string;
}

export interface ProviderModelEntry extends MetricSummary {
  provider: string;
  model: string;
}

export interface ProviderModelDayEntry extends MetricSummary {
  date: string;
}

export interface ProviderModelTrendEntry {
  provider: string;
  model: string;
  days: ProviderModelDayEntry[];
}

export type HeatmapGranularity = "hourly" | "daily";

export interface HeatmapPayload {
  /** Bucket type: "hourly" (≤ 90 days, 2-hour blocks) or "daily" (> 90 days). */
  granularity: HeatmapGranularity;
  /** Time span of one heat point in hours: 2 (hourly) or 24 (daily). */
  intervalHours: number;
  /**
   * Heat-point series. Hourly entries: "YYYY-MM-DDTHH" where HH is a 2-hour
   * block start (00/02/…/22, 12 per day). Daily entries: "YYYY-MM-DD".
   */
  data: DayEntry[];
}

export interface Meta {
  database: string;
  databasePath: string;
  generatedAt: string;
  timezone: string;
  firstDay: string | null;
  lastDay: string | null;
  availableFirstDay: string | null;
  availableLastDay: string | null;
  range: string;
  assistantMessageCount: number;
  scannedRows: number;
}

export interface UsagePayload {
  meta: Meta;
  summary: MetricSummary;
  days: DayEntry[];
  models: ModelEntry[];
  providers: ProviderEntry[];
  providerModels: ProviderModelEntry[];
  providerModelTrends: ProviderModelTrendEntry[];
  /** Dedicated heatmap stream with granularity metadata. */
  heatmap: HeatmapPayload;
}

export type MetricKey = keyof MetricSummary;

// ── Cache-miss drill-down types ───────────────────────────────────────────

export interface CacheMissSessionRow {
  sessionId: string;
  title: string;
  provider: string;
  model: string;
  cacheMiss: number;
  cacheExpected: number;
  missRate: number;
  pairs: number;
  firstTime: number;
  lastTime: number;
  noCache: boolean;
}

export interface CacheMissSessionsPayload {
  range: string;
  totalMiss: number;
  totalExpected: number;
  sessions: CacheMissSessionRow[];
}

export interface CacheMissMessage {
  id: string;
  idx: number;
  ts: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
  reasoning: number;
  prevTotal: number | null;
  miss: number | null;
}

export interface CacheMissSessionDetail {
  sessionId: string;
  title: string;
  provider: string;
  model: string;
  noCache: boolean;
  messages: CacheMissMessage[];
}

export interface MessageContentPart {
  type: "text" | "reasoning" | "tool";
  text?: string;
  name?: string;
  status?: string;
  title?: string;
  input?: string;
  output?: string;
  error?: string;
}

export interface MessageContentPayload {
  messageId: string;
  parts: MessageContentPart[];
}

export interface MetricMeta {
  label: string;
  color: string;
}

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  total: { label: "total", color: "#86a8ff" },
  active: { label: "active", color: "#5ce3c1" },
  input: { label: "input", color: "#7ad7ff" },
  output: { label: "output", color: "#f3b56f" },
  reasoning: { label: "reasoning", color: "#ff8cc6" },
  cache_read: { label: "cache_read", color: "#9e8cff" },
  cache_write: { label: "cache_write", color: "#ff9e6e" },
  cache_miss: { label: "cache_miss", color: "#f87171" },
  cache_expected: { label: "cache_expected", color: "#fbbf24" },
  cache_hit_rate: { label: "cache_hit_rate", color: "#34d399" },
  runtime: { label: "runtime", color: "#ff6b9d" },
  runtime_dedup: { label: "runtime_dedup", color: "#c084fc" },
  user_message_count: { label: "user_message_count", color: "#b7ef6d" },
};

export const INPUT_COMPOSITION_META = [
  { key: "input" as MetricKey, label: "input", color: "#7ad7ff" },
  { key: "cache_read" as MetricKey, label: "cache_read", color: "#9e8cff" },
  { key: "cache_write" as MetricKey, label: "cache_write", color: "#ff9e6e" },
];

export const OUTPUT_COMPOSITION_META = [
  { key: "output" as MetricKey, label: "output", color: "#f3b56f" },
  { key: "reasoning" as MetricKey, label: "reasoning", color: "#ff8cc6" },
];

export const RANGE_OPTIONS = [
  { value: "7" },
  { value: "30" },
  { value: "90" },
  { value: "180" },
  { value: "365" },
  { value: "all" },
] as const;

export const METRIC_OPTIONS: { value: MetricKey }[] = [
  { value: "total" },
  { value: "active" },
  { value: "input" },
  { value: "output" },
  { value: "reasoning" },
  { value: "cache_read" },
  { value: "cache_write" },
  { value: "cache_hit_rate" },
  { value: "cache_miss" },
  { value: "user_message_count" },
  { value: "runtime" },
  { value: "runtime_dedup" },
];
