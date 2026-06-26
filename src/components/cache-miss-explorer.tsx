import { useState, useEffect, useMemo } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeftIcon } from "lucide-react";
import type { CacheMissSessionsPayload, CacheMissSessionDetail, CacheMissMessage, MessageContentPayload } from "@/types";
import { useCacheMissSessions, fetchCacheMissSessionDetail, fetchCacheMissMessage } from "@/hooks/use-cache-miss";
import { useLocale } from "@/lib/i18n";
import { formatCompact, formatNumber, formatDateTime, formatAxisValue, formatDurationGap } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  range: string;
  date: string | null;
}

export function CacheMissExplorer({ open, onOpenChange, range, date }: Props) {
  const { t } = useLocale();
  const { data, loading } = useCacheMissSessions({ range, date: date ?? undefined }, open);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<CacheMissMessage | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setSelectedMessage(null);
    }
  }, [open]);

  // Title reflects the current level.
  const title = selectedMessage
    ? `${t("chart.messageContent")} · #${selectedMessage.idx}`
    : selectedId
      ? t("chart.sessionDetail")
      : `${t("chart.cacheMissExplorerTitle")}${date ? ` · ${date}` : ""}`;
  const desc = selectedMessage
    ? t("chart.cacheMissDesc")
    : selectedId
      ? t("chart.lifecycleChart")
      : date
        ? t("chart.clickPointHint")
        : t("chart.cacheMissExplorerDesc");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel max-h-[88vh] gap-0 overflow-hidden rounded-xl border p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-xs">{desc}</DialogDescription>
        </DialogHeader>

        {selectedMessage ? (
          <MessageContentView
            message={selectedMessage}
            onBack={() => setSelectedMessage(null)}
          />
        ) : selectedId ? (
          <SessionDetail
            sessionId={selectedId}
            onBack={() => setSelectedId(null)}
            onSelectMessage={(m) => setSelectedMessage(m)}
          />
        ) : (
          <SessionList
            data={data}
            loading={loading}
            onSelect={(id) => setSelectedId(id)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Level 1: session list ─────────────────────────────────────────────────

function SessionList({
  data,
  loading,
  onSelect,
}: {
  data: CacheMissSessionsPayload | null;
  loading: boolean;
  onSelect: (sessionId: string) => void;
}) {
  const { t, locale } = useLocale();

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-3 px-5 py-6">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-[420px] w-full rounded-lg" />
      </div>
    );
  }

  const rate = data.totalExpected > 0 ? (data.totalMiss / data.totalExpected) * 100 : 0;

  return (
    <div className="flex flex-col">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 border-b px-5 py-3">
        <SummaryStat label={t("chart.columnMissTokens")} value={formatCompact(data.totalMiss, locale)} sub={formatNumber(data.totalMiss, locale)} accent="#f87171" />
        <SummaryStat label={t("chart.columnExpected")} value={formatCompact(data.totalExpected, locale)} sub={formatNumber(data.totalExpected, locale)} accent="#fbbf24" />
        <SummaryStat label={t("chart.columnMissRate")} value={`${rate.toFixed(1)}%`} sub={t("chart.sessionsCount", { count: data.sessions.length })} accent="#f472b6" />
      </div>

      <ScrollArea className="h-[58vh]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="pl-5">{t("chart.columnSession")}</TableHead>
              <TableHead>{t("chart.columnModel")}</TableHead>
              <TableHead className="text-right">{t("chart.columnMissTokens")}</TableHead>
              <TableHead className="text-right">{t("chart.columnMissRate")}</TableHead>
              <TableHead className="text-right">{t("chart.columnPairs")}</TableHead>
              <TableHead className="pr-5 text-right">{t("chart.columnTime")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sessions.map((s) => (
              <TableRow
                key={s.sessionId}
                onClick={() => onSelect(s.sessionId)}
                className="cursor-pointer border-border/30 transition-colors hover:bg-secondary/40"
              >
                <TableCell className="max-w-[220px] pl-5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-foreground" title={s.title}>
                      {s.title || s.sessionId.slice(0, 16)}
                    </span>
                    {s.noCache && (
                      <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[9px] font-normal text-amber-500">
                        {t("chart.noCacheProvider")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {s.provider}/{s.model}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold text-foreground">
                  {formatCompact(s.cacheMiss, locale)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  <span className={s.missRate > 50 ? "font-semibold text-amber-500" : "text-muted-foreground"}>
                    {s.missRate.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                  {s.pairs.toLocaleString()}
                </TableCell>
                <TableCell className="pr-5 text-right text-[10px] text-muted-foreground">
                  {formatDateTime(new Date(s.lastTime).toISOString(), locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

function SummaryStat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-bold leading-none" style={{ color: accent }}>
        {value}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">{sub}</span>
    </div>
  );
}

// ── Level 2: session detail (lifecycle) ───────────────────────────────────

function SessionDetail({ sessionId, onBack, onSelectMessage }: { sessionId: string; onBack: () => void; onSelectMessage: (m: CacheMissMessage) => void }) {
  const { t, locale } = useLocale();
  const [detail, setDetail] = useState<CacheMissSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchCacheMissSessionDetail(sessionId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "load failed"); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const chartData = useMemo(() => {
    if (!detail) return [];
    return detail.messages.map((m) => ({
      idx: m.idx,
      prevTotal: m.prevTotal ?? null,
      cacheRead: m.cacheRead,
      total: m.total,
      miss: m.miss ?? 0,
    }));
  }, [detail]);

  if (error) {
    return (
      <div className="px-5 py-16 text-center text-sm text-destructive">{error}</div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-3 px-5 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-[280px] w-full rounded-lg" />
        <Skeleton className="h-[160px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-5 py-2.5">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 px-2 text-xs">
          <ArrowLeftIcon data-icon="inline-start" />
          {t("chart.backToList")}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground" title={detail.title}>{detail.title}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{detail.provider}/{detail.model} · {detail.messages.length} msgs</p>
        </div>
        {detail.noCache && (
          <Badge variant="secondary" className="text-[10px] text-amber-500">{t("chart.noCacheProvider")}</Badge>
        )}
      </div>

      {/* Lifecycle chart: prev total (dashed muted) vs cache_read (solid red) */}
      <div className="px-5 pt-4">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("chart.lifecycleChart")}
        </p>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="idx"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickMargin={6}
                label={{ value: t("chart.msgIndex"), position: "insideBottom", offset: -2, style: { fill: "var(--muted-foreground)", fontSize: 10 } }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(v: number) => formatAxisValue(v, locale)}
                width={48}
              />
              <Line type="monotone" dataKey="prevTotal" name="prev total" stroke="#9e8cff" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
              <Line type="monotone" dataKey="cacheRead" name="cache_read" stroke="#f87171" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-message table */}
      <ScrollArea className="h-[34vh]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="pl-5">{t("chart.msgIndex")}</TableHead>
              <TableHead>{t("chart.columnGap")}</TableHead>
              <TableHead className="text-right">{t("chart.columnTotal")}</TableHead>
              <TableHead className="text-right">cache_read</TableHead>
              <TableHead className="text-right">input</TableHead>
              <TableHead className="text-right">{t("chart.columnOutput")}</TableHead>
              <TableHead className="text-right">{t("chart.columnReasoning")}</TableHead>
              <TableHead className="text-right">{t("chart.columnExpected")}</TableHead>
              <TableHead className="pr-5 text-right">{t("chart.columnMissTokens")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.messages.map((m, i) => {
              const gap = i === 0 ? null : m.ts - detail.messages[i - 1].ts;
              return (
                <TableRow key={m.idx} onClick={() => onSelectMessage(m)} className="cursor-pointer border-border/30 transition-colors hover:bg-secondary/40">
                  <TableCell className="whitespace-nowrap pl-5 font-mono text-[11px] text-muted-foreground">{m.idx}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                    {gap != null ? formatDurationGap(gap, locale) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                    {formatNumber(m.total, locale)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px]">
                    <span style={{ color: m.cacheRead === 0 ? "var(--destructive)" : "var(--foreground)" }}>
                      {formatNumber(m.cacheRead, locale)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                    {formatNumber(m.input, locale)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                    {formatNumber(m.output, locale)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                    {formatNumber(m.reasoning, locale)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                    {m.prevTotal != null ? formatNumber(m.prevTotal, locale) : "—"}
                  </TableCell>
                  <TableCell className="pr-5 text-right font-mono text-[11px] font-semibold" style={{ color: (m.miss ?? 0) > 0 ? "#f87171" : "var(--muted-foreground)" }}>
                    {m.miss != null ? formatNumber(m.miss, locale) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

// ── Level 3: message content ──────────────────────────────────────────────

const TRUNCATE_CHARS = 500;
const TRUNCATE_LINES = 15;

/** Truncate long text with an expand/collapse toggle. */
function Truncate({ text, mono }: { text: string; mono?: boolean }) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const lines = text.split("\n");
  const tooLong = text.length > TRUNCATE_CHARS || lines.length > TRUNCATE_LINES;
  const display = expanded || !tooLong
    ? text
    : lines.slice(0, TRUNCATE_LINES).join("\n").slice(0, TRUNCATE_CHARS);
  return (
    <div className="flex flex-col gap-1">
      <pre className={`max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary/40 p-2 text-[11px] leading-relaxed ${mono ? "font-mono" : "font-sans"} text-foreground`}>
        {display}
        {!expanded && tooLong ? "…" : ""}
      </pre>
      {tooLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit text-[10px] font-medium text-chart-2 hover:underline"
        >
          {expanded ? t("chart.collapse") : t("chart.expand")}
        </button>
      )}
    </div>
  );
}

function MessageContentView({ message, onBack }: { message: CacheMissMessage; onBack: () => void }) {
  const { t, locale } = useLocale();
  const [content, setContent] = useState<MessageContentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    fetchCacheMissMessage(message.id)
      .then((c) => { if (!cancelled) setContent(c); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "load failed"); });
    return () => { cancelled = true; };
  }, [message.id]);

  return (
    <div className="flex flex-col">
      {/* Back + stats header */}
      <div className="flex items-center gap-2 border-b px-5 py-2.5">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 px-2 text-xs">
          <ArrowLeftIcon data-icon="inline-start" />
          {t("chart.backToSession")}
        </Button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          <span>#{message.idx}</span>
          <span>total {formatNumber(message.total, locale)}</span>
          <span style={{ color: message.cacheRead === 0 ? "var(--destructive)" : undefined }}>cache_read {formatNumber(message.cacheRead, locale)}</span>
          <span>input {formatNumber(message.input, locale)}</span>
          <span>output {formatNumber(message.output, locale)}</span>
          <span>reasoning {formatNumber(message.reasoning, locale)}</span>
          <span style={{ color: (message.miss ?? 0) > 0 ? "#f87171" : undefined }}>
            miss {message.miss != null ? formatNumber(message.miss, locale) : "—"}
          </span>
        </div>
      </div>

      <ScrollArea className="h-[68vh]">
        <div className="flex flex-col gap-4 px-5 py-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !content ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          ) : content.parts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("chart.noContent")}</p>
          ) : (
            content.parts.map((p, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                {p.type === "text" && (
                  <>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">text</p>
                    <Truncate text={p.text || ""} />
                  </>
                )}
                {p.type === "reasoning" && (
                  <>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">reasoning</p>
                    <Truncate text={p.text || ""} />
                  </>
                )}
                {p.type === "tool" && (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-mono font-semibold text-foreground">🔧 {p.name}</span>
                      {p.status && <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">{p.status}</Badge>}
                      {p.title && <span className="truncate text-muted-foreground">{p.title}</span>}
                    </div>
                    {p.error && (
                      <pre className="whitespace-pre-wrap break-words rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">{p.error}</pre>
                    )}
                    {p.input && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">{t("chart.toolInput")}</span>
                        <Truncate text={p.input} mono />
                      </div>
                    )}
                    {p.output && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">{t("chart.toolOutput")}</span>
                        <Truncate text={p.output} mono />
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
