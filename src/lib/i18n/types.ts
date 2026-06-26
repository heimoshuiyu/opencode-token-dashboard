export type Locale = "zh" | "en";

export interface Translations {
  app: {
    range: string;
    all: string;
    loading: string;
    refresh: string;
    retry: string;
    database: string;
    rowsScanned: string;
  };
  hero: {
    badge: string;
    title: string;
    dashboard: string;
    description: string;
    statRange: string;
    currentRange: string;
    assistantMessages: string;
    currentRangeMetric: string;
    updatedAt: string;
  };
  summary: {
    today: string;
    latestDay: string;
    total: string;
    days: string;
    dailyAvg: string;
    peak: string;
    noData: string;
    totalTokens: string;
    currentRangeTotal: string;
    userMessages: string;
    perDay: string;
  };
  chart: {
    trend: string;
    trendTitle: string;
    trendDesc: string;
    breakdown: string;
    breakdownTitle: string;
    breakdownDesc: string;
    totalTokens: string;
    leaderboard: string;
    modelTitle: string;
    modelDesc: string;
    distribution: string;
    providerTitle: string;
    providerDesc: string;
    other: string;
    noTrendData: string;
    noCompositionData: string;
    noModelData: string;
    noProviderData: string;
    cacheHitRateTitle: string;
    cacheHitRateDesc: string;
    cacheHitRate: string;
    inputTokens: string;
    cachedTokens: string;
    clickToSolo: string;
    clickToShowAll: string;
    heatmapTitle: string;
    heatmapDesc: string;
    heatmapLess: string;
    heatmapMore: string;
    heatmapTotal: string;
  };
  range: {
    last7: string;
    last30: string;
    last90: string;
    last180: string;
    last365: string;
    all: string;
    custom: string;
  };
  metric: {
    total: string;
    active: string;
    input: string;
    output: string;
    reasoning: string;
    cache_read: string;
    cache_write: string;
    cache_hit_rate: string;
    runtime: string;
    runtime_dedup: string;
    user_message_count: string;
  };
  composition: {
    input: string;
    output: string;
    reasoning: string;
    cache_read: string;
    cache_write: string;
    inputSide: string;
    outputSide: string;
    cacheRatio: string;
    reasoningRatio: string;
  };
  format: {
    loadFailed: string;
    loadError: string;
  };
  rangeOption: {
    "7": string;
    "30": string;
    "90": string;
    "180": string;
    "365": string;
    all: string;
  };
}

export type TranslationKey = FlattenKeys<Translations>;

type FlattenKeys<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : { [K in keyof T & string]: FlattenKeys<T[K], Prefix extends "" ? K : `${Prefix}.${K}`> }[keyof T & string];
