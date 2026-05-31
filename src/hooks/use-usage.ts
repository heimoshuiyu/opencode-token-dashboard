import { useEffect, useState, useCallback } from "react";
import type { UsagePayload } from "@/types";
import { translate, type Locale } from "@/lib/i18n";

function getLocale(): Locale {
  const stored = localStorage.getItem("locale");
  return stored === "en" ? "en" : "zh";
}

/**
 * Compute cache hit rate: (cache_read + cache_write) / (input + cache_read + cache_write) * 100
 * Returns a number like 65.3 meaning 65.3%.
 */
function computeCacheHitRate(entry: { input: number; cache_read: number; cache_write: number }): number {
  const inputTotal = (entry.input || 0) + (entry.cache_read || 0) + (entry.cache_write || 0);
  if (inputTotal === 0) return 0;
  return Math.round(((entry.cache_read || 0) + (entry.cache_write || 0)) / inputTotal * 1000) / 10;
}

function injectCacheHitRate<T extends { input: number; cache_read: number; cache_write: number }>(entry: T): T & { cache_hit_rate: number } {
  return { ...entry, cache_hit_rate: computeCacheHitRate(entry) };
}

function enrichPayload(payload: UsagePayload): UsagePayload {
  const summary = injectCacheHitRate(payload.summary);
  const days = payload.days.map(injectCacheHitRate);
  const models = payload.models.map(injectCacheHitRate);
  const providers = payload.providers.map(injectCacheHitRate);
  return { ...payload, summary, days, models, providers };
}

export function useUsage(range: string) {
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/usage", window.location.origin);
        url.searchParams.set("range", range);
        if (force) url.searchParams.set("_t", String(Date.now()));

        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || translate(getLocale(), "format.loadFailed"));

        setData(enrichPayload(json));
      } catch (err) {
        setError(err instanceof Error ? err.message : translate(getLocale(), "format.loadError"));
      } finally {
        setLoading(false);
      }
    },
    [range],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}
