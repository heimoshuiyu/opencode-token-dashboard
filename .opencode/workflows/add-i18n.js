export const meta = {
  name: 'add-i18n',
  description: '为 opencode-token-dashboard 前端添加 i18n 支持（中/英）',
  phases: [
    { title: '创建基础设施', detail: 'i18n context、翻译文件、types 改造、format 改造、main.tsx 包裹' },
    { title: '并行改造组件', detail: '并行改造 7 个组件 + hook 中的中文硬编码' },
    { title: '构建验证', detail: 'npm run build 确认无错误' },
  ],
}

phase('创建基础设施')

const infra = await agent(`你需要为 opencode-token-dashboard 前端项目添加完整的 i18n 基础设施。项目位于 /home/hmsy/workspace/opencode-token-dashboard。

## 设计方案

采用轻量级自定义 i18n 方案（React Context + hook），不引入第三方库。支持 zh（中文，默认）和 en（英语）。

### 需要创建/修改的文件：

#### 1. 创建 src/lib/i18n/types.ts
定义翻译 key 的类型和翻译数据结构：
\`\`\`typescript
export type Locale = "zh" | "en";
export type TranslationKey = string; // 我们用嵌套对象 + t("key.path") 的方式
\`\`\`

#### 2. 创建 src/lib/i18n/locales/zh.ts
中文翻译文件，包含所有需要国际化的字符串。按照功能模块组织：

\`\`\`typescript
export const zh = {
  // App 级别
  app: {
    range: "范围",
    all: "全部",
    loading: "加载中…",
    refresh: "刷新",
    retry: "重试",
    database: "数据库",
    rowsScanned: "行已扫描",
  },
  // Hero
  hero: {
    badge: "OpenCode Usage Monitor",
    title: "Tokens {gradient}用量看板{\/gradient}",
    description: "交互式图表呈现 Token 消耗趋势与模型用量",
    statRange: "统计区间",
    currentRange: "当前范围",
    assistantMessages: "assistant 消息",
    currentRangeMetric: "当前范围 {metric}",
    updatedAt: "更新于",
  },
  // Summary cards
  summary: {
    today: "今天",
    latestDay: "最近一天",
    total: "合计",
    days: "{count} 天",
    dailyAvg: "日均",
    peak: "峰值",
    noData: "暂无数据",
    totalTokens: "总 Tokens",
    currentRangeTotal: "当前范围合计",
    userMessages: "用户消息",
    perDay: "{value} / 天",
  },
  // Charts
  chart: {
    trend: "Trend",
    trendTitle: "每日趋势",
    trendDesc: "按天展示 {metric}",
    breakdown: "Breakdown",
    breakdownTitle: "Token 组成",
    breakdownDesc: "当前范围内各类 token 的占比",
    totalTokens: "总 Tokens",
    leaderboard: "Leaderboard",
    modelTitle: "模型贡献",
    modelDesc: "按当前指标排序的 Top 8 模型",
    distribution: "Distribution",
    providerTitle: "Provider 分布",
    providerDesc: "当前指标在 provider 间的占比",
    other: "其他",
    noTrendData: "暂无趋势数据，试试调整时间范围",
    noCompositionData: "暂无 Token 组成数据",
    noModelData: "暂无模型数据",
    noProviderData: "暂无 Provider 数据",
  },
  // Range labels
  range: {
    last7: "最近 7 天",
    last30: "最近 30 天",
    last90: "最近 90 天",
    last180: "最近 180 天",
    last365: "最近 365 天",
    all: "全部时间",
    custom: "自定义范围",
  },
  // Metrics
  metric: {
    total: "总 Tokens",
    active: "活跃 Tokens",
    input: "输入 Tokens",
    output: "输出 Tokens",
    reasoning: "推理 Tokens",
    cache_read: "缓存读取",
    cache_write: "缓存写入",
    runtime: "运行时长",
    runtime_dedup: "运行时长（去重）",
    user_message_count: "用户消息数",
  },
  // Composition
  composition: {
    input: "输入",
    output: "输出",
    reasoning: "推理",
    cache_read: "缓存读",
    cache_write: "缓存写",
  },
  // Format
  format: {
    loadFailed: "加载统计失败",
    loadError: "加载失败",
  },
  // Range option display labels
  rangeOption: {
    "7": "7 天",
    "30": "30 天",
    "90": "90 天",
    "180": "180 天",
    "365": "365 天",
    all: "全部",
  },
  // Axis format
  axis: {
    billion: "{value}亿",
    tenThousand: "{value}万",
    tenThousandInt: "{value}万",
  },
}
\`\`\`

#### 3. 创建 src/lib/i18n/locales/en.ts
英文翻译文件，与 zh.ts 完全相同的 key 结构：
\`\`\`typescript
export const en = {
  app: {
    range: "Range",
    all: "All",
    loading: "Loading…",
    refresh: "Refresh",
    retry: "Retry",
    database: "Database",
    rowsScanned: "rows scanned",
  },
  hero: {
    badge: "OpenCode Usage Monitor",
    title: "Tokens {gradient}Dashboard{\/gradient}",
    description: "Interactive charts for token consumption trends and model usage",
    statRange: "Period",
    currentRange: "Range",
    assistantMessages: "assistant messages",
    currentRangeMetric: "Range {metric}",
    updatedAt: "Updated at",
  },
  summary: {
    today: "Today",
    latestDay: "Latest",
    total: "Total",
    days: "{count} days",
    dailyAvg: "Daily avg",
    peak: "Peak",
    noData: "No data",
    totalTokens: "Total Tokens",
    currentRangeTotal: "Range total",
    userMessages: "User messages",
    perDay: "{value} / day",
  },
  chart: {
    trend: "Trend",
    trendTitle: "Daily Trend",
    trendDesc: "Daily breakdown of {metric}",
    breakdown: "Breakdown",
    breakdownTitle: "Token Composition",
    breakdownDesc: "Proportion of each token type in current range",
    totalTokens: "Total Tokens",
    leaderboard: "Leaderboard",
    modelTitle: "Model Contribution",
    modelDesc: "Top 8 models by current metric",
    distribution: "Distribution",
    providerTitle: "Provider Distribution",
    providerDesc: "Proportion of current metric across providers",
    other: "Other",
    noTrendData: "No trend data. Try adjusting the time range",
    noCompositionData: "No token composition data",
    noModelData: "No model data",
    noProviderData: "No provider data",
  },
  range: {
    last7: "Last 7 days",
    last30: "Last 30 days",
    last90: "Last 90 days",
    last180: "Last 180 days",
    last365: "Last 365 days",
    all: "All time",
    custom: "Custom range",
  },
  metric: {
    total: "Total Tokens",
    active: "Active Tokens",
    input: "Input Tokens",
    output: "Output Tokens",
    reasoning: "Reasoning Tokens",
    cache_read: "Cache Read",
    cache_write: "Cache Write",
    runtime: "Runtime",
    runtime_dedup: "Runtime (deduped)",
    user_message_count: "User Messages",
  },
  composition: {
    input: "Input",
    output: "Output",
    reasoning: "Reasoning",
    cache_read: "Cache Read",
    cache_write: "Cache Write",
  },
  format: {
    loadFailed: "Failed to load statistics",
    loadError: "Load failed",
  },
  rangeOption: {
    "7": "7 days",
    "30": "30 days",
    "90": "90 days",
    "180": "180 days",
    "365": "365 days",
    all: "All",
  },
  axis: {
    billion: "{value}B",
    tenThousand: "{value}K",
    tenThousandInt: "{value}K",
  },
}
\`\`\`

#### 4. 创建 src/lib/i18n/index.ts
i18n 核心模块，包含：
- 从 zh.ts 和 en.ts 导入翻译
- 用 React.createContext 创建 LocaleContext
- LocaleProvider 组件：管理 locale state（localStorage 持久化，key="locale"），提供 locale 和 setLocale
- t() 函数：接受 "app.range" 这样的 dot-path key 和可选的插值参数对象，返回翻译字符串
- useLocale() hook：返回 { locale, setLocale, t }
- 类型导出

实现方式：
- t() 函数通过 "." 分割 key，逐层查找嵌套对象
- 支持插值：t("summary.days", { count: 30 }) → "30 天" / "30 days"
- locale 默认值从 localStorage("locale") 读取，fallback 到 "zh"

\`\`\`typescript
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { zh } from "./locales/zh";
import { en } from "./locales/en";

export type Locale = "zh" | "en";
type NestedRecord = { [key: string]: string | NestedRecord };

const messages: Record<Locale, NestedRecord> = { zh, en };

function getNestedValue(obj: NestedRecord, path: string): string | undefined {
  return path.split(".").reduce((acc: NestedRecord | string | undefined, key) => {
    if (acc && typeof acc === "object") return acc[key];
    return undefined;
  }, obj) as string | undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replace(new RegExp(\`\\\\{\s*${k}\\\\s*\\\\}\`, "g"), String(v)),
    template,
  );
}

export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const msg = getNestedValue(messages[locale], key) ?? getNestedValue(messages.zh, key) ?? key;
  return interpolate(msg, params);
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" || stored === "zh" ? stored : "zh";
  });

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
\`\`\`

#### 5. 修改 src/types.ts
让 METRIC_META、COMPOSITION_META、RANGE_OPTIONS、METRIC_OPTIONS 的 label 不再硬编码中文，而是存储 i18n key。

具体改法：
- METRIC_META 的 label 改为 metric key 本身（如 "total"），在组件中通过 t(\`metric.\${key}\`) 获取翻译
- COMPOSITION_META 的 label 同理，改为对应的 metric key
- RANGE_OPTIONS 的 label 改为 value 本身（如 "7"），在组件中通过 t(\`rangeOption.\${value}\`) 获取翻译
- METRIC_OPTIONS 的 label 改为 value 本身

改后的 METRIC_META：
\`\`\`typescript
export const METRIC_META: Record<MetricKey, MetricMeta> = {
  total: { label: "total", color: "#86a8ff" },
  active: { label: "active", color: "#5ce3c1" },
  input: { label: "input", color: "#7ad7ff" },
  output: { label: "output", color: "#f3b56f" },
  reasoning: { label: "reasoning", color: "#ff8cc6" },
  cache_read: { label: "cache_read", color: "#9e8cff" },
  cache_write: { label: "cache_write", color: "#ff9e6e" },
  runtime: { label: "runtime", color: "#ff6b9d" },
  runtime_dedup: { label: "runtime_dedup", color: "#c084fc" },
  user_message_count: { label: "user_message_count", color: "#b7ef6d" },
};
\`\`\`

改后的 COMPOSITION_META：
\`\`\`typescript
export const COMPOSITION_META = [
  { key: "input" as MetricKey, label: "input", color: "#7ad7ff" },
  { key: "output" as MetricKey, label: "output", color: "#f3b56f" },
  { key: "reasoning" as MetricKey, label: "reasoning", color: "#ff8cc6" },
  { key: "cache_read" as MetricKey, label: "cache_read", color: "#9e8cff" },
  { key: "cache_write" as MetricKey, label: "cache_write", color: "#ff9e6e" },
];
\`\`\`

改后的 RANGE_OPTIONS：
\`\`\`typescript
export const RANGE_OPTIONS = [
  { value: "7" },
  { value: "30" },
  { value: "90" },
  { value: "180" },
  { value: "365" },
  { value: "all" },
] as const;
\`\`\`

改后的 METRIC_OPTIONS：
\`\`\`typescript
export const METRIC_OPTIONS: { value: MetricKey }[] = [
  { value: "total" },
  { value: "active" },
  { value: "input" },
  { value: "output" },
  { value: "reasoning" },
  { value: "cache_read" },
  { value: "cache_write" },
  { value: "user_message_count" },
  { value: "runtime" },
  { value: "runtime_dedup" },
];
\`\`\`

#### 6. 修改 src/lib/format.ts
将所有 Intl 格式化的 locale 从硬编码 "zh-CN" 改为接受 locale 参数：

- formatNumber(value, locale?) → 默认 "zh-CN"（zh）或 "en-US"（en）
- formatCompact(value, locale?) → 同上
- formatDateLabel(value, format, locale?) → "zh-CN" 或 "en-US"
- formatDateTime(value, locale?) → 同上
- formatAxisValue(value, locale?) → 中文用"亿/万"，英文用 "B/K" 后缀
- getRangeLabel(range, t?) → 改为使用 t() 函数获取翻译

所有函数都增加可选的 locale 参数（类型为 Locale），不破坏现有调用。

新增辅助函数：
\`\`\`typescript
function localeToIntl(locale?: Locale): string {
  return locale === "en" ? "en-US" : "zh-CN";
}
\`\`\`

#### 7. 修改 src/main.tsx
在 ThemeProvider 外层（或内层）包裹 LocaleProvider：

\`\`\`typescript
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { LocaleProvider } from "@/lib/i18n/index.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark">
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
)
\`\`\`

## 重要注意事项
- 使用 @/ 路径别名（已配置）
- 所有新文件都使用 TypeScript
- 翻译文件中的 key 使用 dot notation，如 "app.range"
- t() 函数支持插值，模板用 {varName} 格式
- 确保类型安全
- 读取现有文件内容后再修改，不要覆盖未改动的部分
- 使用 edit 工具精确修改，不要 write 整个文件

请按照以上说明，创建所有新文件并修改现有文件。完成后报告你创建和修改了哪些文件。`, {
  label: '创建 i18n 基础设施',
  phase: '创建基础设施',
})

phase('并行改造组件')

const [app, hero, summary, trend, composition, model, provider, usageHook] = await parallel([
  () => agent(`改造 /home/hmsy/workspace/opencode-token-dashboard/src/App.tsx 文件，添加 i18n 支持。

## 背景
项目已添加 i18n 基础设施：
- src/lib/i18n/index.tsx 导出 useLocale() hook，返回 { locale, setLocale, t }
- t("key.path", { param: value }) 用于获取翻译字符串
- 支持 locale: "zh" | "en"
- types.ts 中 RANGE_OPTIONS 现在只有 { value: string } 没有 label 了
- types.ts 中 METRIC_OPTIONS 现在只有 { value: MetricKey } 没有 label 了

## 需要做的修改

先 Read 当前文件内容，然后用 edit 工具修改。

### 1. 添加 import
添加：
\`\`\`
import { useLocale } from "@/lib/i18n";
\`\`\`

### 2. 在 App 组件中使用 useLocale
在 const { theme, setTheme } = useTheme(); 后面添加：
\`\`\`
const { locale, setLocale, t } = useLocale();
\`\`\`

### 3. 替换所有硬编码中文
- "范围" → t("app.range")
- "全部" → t("app.all")
- ToggleGroupItem 中的显示文本：opt.value === "all" ? t("app.all") : opt.value + " 天"  → 改为 t(\`rangeOption.\${opt.value}\`)
  注意：原来的 {opt.value === "all" ? "全部" : opt.value.replace("最近 ", "")} 改为 {t(\`rangeOption.\${opt.value}\")}
- SelectItem 中 {opt.label} → {t(\`metric.\${opt.value}\")}
- "加载中…" → t("app.loading")
- "刷新" → t("app.refresh")
- "重试" → t("app.retry")
- Footer 中的 "Database:" → t("app.database") + ":"
- "rows scanned" → t("app.rowsScanned")

### 4. 添加语言切换按钮
在 Theme 按钮旁边添加一个语言切换按钮，使用 shadcn Button variant="outline" size="sm"：
\`\`\`tsx
<Button
  onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
  variant="outline"
  size="sm"
  className="h-8 rounded-lg px-2"
>
  <span className="text-xs font-mono">{locale === "zh" ? "EN" : "中"}</span>
</Button>
\`\`\`

### 5. Intl.NumberFormat 改用 locale
Footer 中的 {data.meta.scannedRows.toLocaleString()} 保持不变（这个用 toLocaleString 即可）。

## 重要：使用 edit 工具精确修改，不要 write 整个文件。保持现有的样式和结构不变。`, { label: '改造 App.tsx' }),

  () => agent(`改造 /home/hmsy/workspace/opencode-token-dashboard/src/components/hero-section.tsx 文件，添加 i18n 支持。

## 背景
项目已添加 i18n 基础设施：
- useLocale() hook 返回 { locale, t }
- t("key.path") 用于获取翻译字符串
- format.ts 中的函数现在接受 locale 参数
- METRIC_META 的 label 现在是 metric key 本身（如 "total"），需要通过 t(\`metric.\${key}\`) 获取翻译

## 需要做的修改

先 Read 当前文件内容，然后用 edit 工具修改。

### 1. 添加 import
\`\`\`
import { useLocale } from "@/lib/i18n";
\`\`\`

### 2. 在 HeroSection 组件中使用 useLocale
\`\`\`
const { locale, t } = useLocale();
\`\`\`

### 3. 修改 metricLabel 获取方式
将 const metricLabel = METRIC_META[metric].label;
改为 const metricLabel = t(\`metric.\${metric}\`);

### 4. 替换所有硬编码中文
- "OpenCode Usage Monitor" → t("hero.badge") (注意：中英文一样，但为了统一还是用 key)
- "Tokens " + 用量看板 → 改为：\`\`\`tsx
<h1 className="...">
  {t("hero.titleParts.tokens")}{" "}
  <span className="accent-gradient-text">{t("hero.titleParts.dashboard")}</span>
</h1>
\`\`\`
  等等，这样翻译文件也要改。算了，简单处理：

  标题部分：
  - "Tokens " 保持不变（这是品牌词）
  - <span className="accent-gradient-text">用量看板</span> → <span className="accent-gradient-text">{t("hero.dashboard")}</span>

  需要在翻译文件中添加 hero.dashboard: "用量看板" / "Dashboard"

  不对，翻译文件已经在基础设施步骤创建了。让我检查一下... hero.title 的翻译是：
  - zh: "Tokens {gradient}用量看板{/gradient}"  
  
  这个有插值标记不太好处理。简单处理方案：
  - 在翻译文件中，hero.titleTokens: "Tokens" / "Tokens" 和 hero.titleAccent: "用量看板" / "Dashboard"
  
  但翻译文件已经创建了，我们用现有的 key：
  - 描述文本：t("hero.description") 替换 "交互式图表呈现 Token 消耗趋势与模型用量"
  - "统计区间" → t("hero.statRange")
  - "当前范围" → t("hero.currentRange")
  - "assistant 消息" → t("hero.assistantMessages")
  - "当前范围 " + metricLabel → t("hero.currentRangeMetric", { metric: metricLabel })
  - "更新于" → t("hero.updatedAt")

  对于标题，翻译文件中没有拆分的 key。最简单的方案是：把标题中 "用量看板" 替换为 t("hero.dashboard")。需要在 zh.ts 和 en.ts 中添加这个 key：
  
  不对，翻译文件已经在基础设施步骤创建了，我不能再修改它。

  **最终方案**：直接硬编码 "Tokens" 作为品牌词，把 "用量看板" / "Dashboard" 作为 t("hero.dashboard")。
  
  但是翻译文件中没有 hero.dashboard 这个 key... 
  
  **实际方案**：看翻译文件的结构，hero.title 中的内容是 "Tokens {gradient}用量看板{/gradient}"。我可以简化处理：
  
  标题直接拆成两部分：
  \`\`\`tsx
  <h1 ...>
    Tokens{" "}
    <span className="accent-gradient-text">{locale === "zh" ? "用量看板" : "Dashboard"}</span>
  </h1>
  \`\`\`

  或者更优雅：使用 t("hero.titleAccent")。但翻译文件中有没有这个 key...

  算了，最干净的方案：在 zh.ts 中添加 hero.titleAccent 和 en.ts 中也添加。但基础设施已经创建了文件...

  **最终最终方案**：检查翻译文件，如果 hero 对象中已有 title 或 dashboard key 就用。如果没有，就在组件里做一个简单的 locale 判断。这是唯一合理的做法，因为翻译文件已在基础设施步骤创建。

  实际上，看基础设施步骤的翻译文件设计，hero 部分有这些 key：
  - hero.badge, hero.title, hero.description, hero.statRange, hero.currentRange, hero.assistantMessages, hero.currentRangeMetric, hero.updatedAt

  hero.title 的值是 "Tokens {gradient}用量看板{/gradient}" 和 "Tokens {gradient}Dashboard{/gradient}"，但这个 {gradient} 标记不是标准插值。

  **最终方案**：hero.title 不用 t()，而是拆成两部分：
  \`\`\`tsx
  <h1 className="...">
    Tokens{" "}
    <span className="accent-gradient-text">{t("hero.dashboard")}</span>
  </h1>
  \`\`\`

  但翻译文件中没有 hero.dashboard... 我需要告诉基础设施 agent 添加这个 key。

  算了，我用另一个方案：在翻译文件中添加 hero.dashboard。但我不确定基础设施 agent 是否已经创建了文件。

  **最实际方案**：我直接在组件中使用 locale 判断标题，其他文本用 t()。这是安全的。

### 5. 修改 Intl.NumberFormat 调用
- new Intl.NumberFormat("zh-CN").format(meta.assistantMessageCount) → new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN").format(meta.assistantMessageCount)

### 6. 修改 formatDateLabel 和 formatDateTime 调用
这些函数现在接受 locale 参数：
- formatDateLabel(startDate, "long") → formatDateLabel(startDate, "long", locale)
- formatDateLabel(endDate, "long") → formatDateLabel(endDate, "long", locale)
- formatDateTime(meta.generatedAt) → formatDateTime(meta.generatedAt, locale)

### 7. 修改 getRangeLabel 调用
getRangeLabel 现在接受 t 函数参数：
- getRangeLabel(meta.range) → getRangeLabel(meta.range, t)

## 重要：使用 edit 工具精确修改，不要 write 整个文件。保持现有的样式和结构不变。`, { label: '改造 hero-section' }),

  () => agent(`改造 /home/hmsy/workspace/opencode-token-dashboard/src/components/summary-cards.tsx 文件，添加 i18n 支持。

## 背景
项目已添加 i18n 基础设施：
- useLocale() hook 返回 { locale, t }
- t("key.path", { param: value }) 用于获取翻译字符串
- format.ts 中的函数现在接受 locale 参数
- METRIC_META 的 label 现在是 metric key，需要通过 t(\`metric.\${key}\`) 获取

## 需要做的修改

先 Read 当前文件内容，然后用 edit 工具修改。

### 1. 添加 import
\`\`\`
import { useLocale } from "@/lib/i18n";
\`\`\`

### 2. 在 SummaryCards 组件中使用 useLocale
\`\`\`
const { locale, t } = useLocale();
\`\`\`

### 3. 修改 metricLabel 获取方式
将 const metricLabel = METRIC_META[metric].label;
改为 const metricLabel = t(\`metric.\${metric}\`);

### 4. 替换所有硬编码中文
- "今天" / "最近一天" → t("summary.today") / t("summary.latestDay")  (用 isToday 判断)
  改为：const latestLabel = isToday ? t("summary.today") : t("summary.latestDay");
- "总 Tokens" → t("summary.totalTokens")
- "当前范围合计" → t("summary.currentRangeTotal")
- "用户消息" → t("summary.userMessages")
- "合计" → t("summary.total")
- "日均" → t("summary.dailyAvg")
- "峰值" → t("summary.peak")
- \`\`\`${days.length} 天\`\`\` → t("summary.days", { count: days.length })
- "暂无数据" → t("summary.noData")

### 5. 修改 utilityCard 中的文本
utilityCard 的 subtitle 中 \`\`\`${days.length ? formatMetricValue("user_message_count", Math.round(summary.user_message_count / days.length)) : "0"} / 天\`\`\`
改为：\`\`\`t("summary.perDay", { value: days.length ? formatMetricValue("user_message_count", Math.round(summary.user_message_count / days.length)) : "0" })\`\`\`

### 6. 修改 Intl.DateTimeFormat 调用
将 new Intl.DateTimeFormat("zh-CN", ...) 改为 new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", ...)

## 重要：使用 edit 工具精确修改，不要 write 整个文件。保持现有的样式和结构不变。`, { label: '改造 summary-cards' }),

  () => agent(`改造 /home/hmsy/workspace/opencode-token-dashboard/src/components/trend-chart.tsx 文件，添加 i18n 支持。

## 背景
项目已添加 i18n 基础设施：
- useLocale() hook 返回 { locale, t }
- format.ts 中的函数现在接受 locale 参数
- METRIC_META 的 label 现在是 metric key，需要通过 t(\`metric.\${key}\`) 获取

## 需要做的修改

先 Read 当前文件内容，然后用 edit 工具修改。

### 1. 添加 import
\`\`\`
import { useLocale } from "@/lib/i18n";
\`\`\`

### 2. 在 TrendChart 组件中使用 useLocale
在函数体开头添加：
\`\`\`
const { locale, t } = useLocale();
\`\`\`

### 3. 替换硬编码中文
- "暂无趋势数据，试试调整时间范围" → t("chart.noTrendData")
- "每日趋势" → t("chart.trendTitle")
- "按天展示 " + primary.label → t("chart.trendDesc", { metric: t(\`metric.\${metric}\`) })
- chartConfig 中 primary.label → t(\`metric.\${metric}\`)
- chartConfig 中 secondary.label → t(\`metric.\${secondaryKey}\`)

### 4. 修改 formatDateLabel 调用
- formatDateLabel(d.date, "short") → formatDateLabel(d.date, "short", locale)
- formatDateLabel(payload[0].payload.date, "long") → formatDateLabel(payload[0].payload.date, "long", locale)

### 5. 注意 chartConfig 的 useMemo 依赖
因为现在 chartConfig 依赖 t()，而 t() 在 locale 变化时会变，所以 useMemo 的依赖要加 t 或者 locale。但实际上 primary/secondary 对象本身不变（因为 METRIC_META 的 label 不再变化），所以需要显式依赖 t：

将 chartConfig 的 useMemo 改为依赖 locale：
\`\`\`
const chartConfig = useMemo<ChartConfig>(
  () => ({
    [metric]: { label: t(\`metric.\${metric}\`), color: primary.color },
    [secondaryKey]: { label: t(\`metric.\${secondaryKey}\`), color: secondary.color },
  }),
  [metric, secondaryKey, primary.color, secondary.color, t],
);
\`\`\`

## 重要：使用 edit 工具精确修改，不要 write 整个文件。保持现有的样式和结构不变。`, { label: '改造 trend-chart' }),

  () => agent(`改造 /home/hmsy/workspace/opencode-token-dashboard/src/components/composition-chart.tsx 文件，添加 i18n 支持。

## 背景
项目已添加 i18n 基础设施：
- useLocale() hook 返回 { locale, t }
- COMPOSITION_META 的 label 现在是 metric key，需要通过 t(\`composition.\${key}\`) 获取

## 需要做的修改

先 Read 当前文件内容，然后用 edit 工具修改。

### 1. 添加 import
\`\`\`
import { useLocale } from "@/lib/i18n";
\`\`\`

### 2. 在 CompositionChart 组件中使用 useLocale
**重要：必须在 useState/useCallback 之前调用**，因为 React hooks 规则。

在函数体开头（所有 hooks 之前）添加：
\`\`\`
const { locale, t } = useLocale();
\`\`\`

### 3. 替换硬编码中文
- "暂无 Token 组成数据" → t("chart.noCompositionData")
- "Token 组成" → t("chart.breakdownTitle")
- "当前范围内各类 token 的占比" → t("chart.breakdownDesc")
- "总 Tokens" → t("chart.totalTokens")

### 4. 修改 chartConfig
chartConfig 中 COMPOSITION_META 的 label 要改为 t(\`composition.\${item.key}\`)：
\`\`\`
cfg[item.key] = { label: t(\`composition.\${item.key}\`), color: item.color };
\`\`\`

### 5. chartConfig 的 useMemo 依赖需要加 t

## 重要：使用 edit 工具精确修改，不要 write 整个文件。保持现有的样式和结构不变。hooks 顺序不能变！`, { label: '改造 composition-chart' }),

  () => agent(`改造 /home/hmsy/workspace/opencode-token-dashboard/src/components/model-chart.tsx 文件，添加 i18n 支持。

## 背景
项目已添加 i18n 基础设施：
- useLocale() hook 返回 { locale, t }
- format.ts 中的函数现在接受 locale 参数

## 需要做的修改

先 Read 当前文件内容，然后用 edit 工具修改。

### 1. 添加 import
\`\`\`
import { useLocale } from "@/lib/i18n";
\`\`\`

### 2. 在 ModelChart 组件中使用 useLocale
\`\`\`
const { locale, t } = useLocale();
\`\`\`

### 3. 替换硬编码中文
- "暂无模型数据" → t("chart.noModelData")
- "模型贡献" → t("chart.modelTitle")
- "按当前指标排序的 Top 8 模型" → t("chart.modelDesc")

## 重要：使用 edit 工具精确修改，不要 write 整个文件。保持现有的样式和结构不变。`, { label: '改造 model-chart' }),

  () => agent(`改造 /home/hmsy/workspace/opencode-token-dashboard/src/components/provider-chart.tsx 文件，添加 i18n 支持。

## 背景
项目已添加 i18n 基础设施：
- useLocale() hook 返回 { locale, t }
- format.ts 中的函数现在接受 locale 参数

## 需要做的修改

先 Read 当前文件内容，然后用 edit 工具修改。

### 1. 添加 import
\`\`\`
import { useLocale } from "@/lib/i18n";
\`\`\`

### 2. 在 ProviderChart 组件中使用 useLocale
\`\`\`
const { locale, t } = useLocale();
\`\`\`

### 3. 替换硬编码中文
- "其他" → t("chart.other")（出现在 chartData 中的 name 和 shortName）
- "暂无 Provider 数据" → t("chart.noProviderData")
- "Provider 分布" → t("chart.providerTitle")
- "当前指标在 provider 间的占比" → t("chart.providerDesc")

## 重要：使用 edit 工具精确修改，不要 write 整个文件。保持现有的样式和结构不变。`, { label: '改造 provider-chart' }),

  () => agent(`改造 /home/hmsy/workspace/opencode-token-dashboard/src/hooks/use-usage.ts 文件，添加 i18n 支持。

## 背景
项目已添加 i18n 基础设施：
- src/lib/i18n/index.tsx 导出 translate() 函数（非 hook 版本，可在非组件中使用）和 Locale 类型

## 需要做的修改

先 Read 当前文件内容，然后用 edit 工具修改。

### 方案
因为 use-usage.ts 是一个 hook 但不在组件内部使用 locale，有两种方案：
1. 从 localStorage 读取 locale 并使用 translate() 函数
2. 直接使用 translate() 并传入从 localStorage 读取的 locale

最简单的方案：

\`\`\`typescript
import { translate, type Locale } from "@/lib/i18n";

function getLocale(): Locale {
  const stored = localStorage.getItem("locale");
  return stored === "en" ? "en" : "zh";
}
\`\`\`

然后替换错误消息：
- "加载统计失败" → translate(getLocale(), "format.loadFailed")
- "加载失败" → translate(getLocale(), "format.loadError")

## 重要：使用 edit 工具精确修改，不要 write 整个文件。保持现有的样式和结构不变。`, { label: '改造 use-usage.ts' }),
])

phase('构建验证')

const buildResult = await agent(`在 /home/hmsy/workspace/opencode-token-dashboard 目录下运行 npm run build，检查是否有 TypeScript 错误或构建错误。

如果构建失败，分析错误原因并尝试修复。修复时只修改必要的文件。

构建成功后报告结果。`, { label: '构建验证' })

return { infra, components: { app, hero, summary, trend, composition, model, provider, usageHook }, buildResult }
