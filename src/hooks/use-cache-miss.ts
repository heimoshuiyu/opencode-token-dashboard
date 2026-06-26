import { useEffect, useState, useCallback } from "react";
import type { CacheMissSessionsPayload, CacheMissSessionDetail, MessageContentPayload } from "@/types";
import { translate, type Locale } from "@/lib/i18n";

function getLocale(): Locale {
  const stored = localStorage.getItem("locale");
  return stored === "en" ? "en" : "zh";
}

export function useCacheMissSessions(
  params: { range: string; date?: string },
  open: boolean,
) {
  const { range, date } = params;
  const [data, setData] = useState<CacheMissSessionsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/cache-miss/sessions", window.location.origin);
      url.searchParams.set("range", range);
      if (date) url.searchParams.set("date", date);
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || translate(getLocale(), "format.loadFailed"));
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate(getLocale(), "format.loadError"));
    } finally {
      setLoading(false);
    }
  }, [range, date]);

  useEffect(() => {
    if (open) fetchData();
  }, [fetchData, open]);

  return { data, loading, error, refresh: fetchData };
}

export async function fetchCacheMissSessionDetail(sessionId: string): Promise<CacheMissSessionDetail> {
  const url = new URL(`/api/cache-miss/session/${encodeURIComponent(sessionId)}`, window.location.origin);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "load failed");
  return json;
}

export async function fetchCacheMissMessage(messageId: string): Promise<MessageContentPayload> {
  const url = new URL(`/api/cache-miss/message/${encodeURIComponent(messageId)}`, window.location.origin);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "load failed");
  return json;
}
