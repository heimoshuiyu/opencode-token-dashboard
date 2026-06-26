use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use axum::extract::{Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Json};
use axum::routing::get;
use chrono::{Local, Timelike};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

// ── Configuration ──────────────────────────────────────────────────────────

fn opencode_data_dir() -> PathBuf {
    dirs_data_dir().join("opencode")
}

fn dirs_data_dir() -> PathBuf {
    // Prefer XDG_DATA_HOME if set
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg);
    }
    // OpenCode uses ~/.local/share on all platforms (Linux, macOS, Windows)
    let home = if cfg!(windows) {
        std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".into())
    } else {
        std::env::var("HOME").unwrap_or_else(|_| "/root".into())
    };
    PathBuf::from(home).join(".local/share")
}

fn static_dir() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_default()
        .join("static")
}

// ── Embedded static files ─────────────────────────────────────────────────

#[derive(Embed)]
#[folder = "static/"]
struct StaticAssets;

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Metrics {
    total: i64,
    active: i64,
    input: i64,
    output: i64,
    reasoning: i64,
    cache_read: i64,
    cache_write: i64,
    cache_miss: i64,
    cache_expected: i64,
    runtime: i64,
    runtime_dedup: i64,
    user_message_count: i64,
}

impl Metrics {
    fn add(&mut self, other: &Metrics) {
        self.total += other.total;
        self.active += other.active;
        self.input += other.input;
        self.output += other.output;
        self.reasoning += other.reasoning;
        self.cache_read += other.cache_read;
        self.cache_write += other.cache_write;
        self.cache_miss += other.cache_miss;
        self.cache_expected += other.cache_expected;
        self.runtime += other.runtime;
        self.runtime_dedup += other.runtime_dedup;
        self.user_message_count += other.user_message_count;
    }
}

#[derive(Debug, Clone, Serialize)]
struct DayEntry {
    date: String,
    #[serde(flatten)]
    metrics: Metrics,
}

#[derive(Debug, Clone, Serialize)]
struct NamedEntry {
    name: String,
    #[serde(flatten)]
    metrics: Metrics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderModelEntry {
    provider: String,
    model: String,
    #[serde(flatten)]
    metrics: Metrics,
}

#[derive(Debug, Clone, Serialize)]
struct ProviderModelDayEntry {
    date: String,
    #[serde(flatten)]
    metrics: Metrics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderModelTrendEntry {
    provider: String,
    model: String,
    days: Vec<ProviderModelDayEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Meta {
    database: String,
    database_path: String,
    generated_at: String,
    timezone: String,
    first_day: Option<String>,
    last_day: Option<String>,
    available_first_day: Option<String>,
    available_last_day: Option<String>,
    range: String,
    assistant_message_count: i64,
    scanned_rows: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum HeatmapGranularity {
    Hourly,
    Daily,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HeatmapPayload {
    /// Bucket type: "hourly" (≤ 90 days) or "daily" (> 90 days).
    granularity: HeatmapGranularity,
    /// Time span of one heat point in hours: 3 (hourly) or 24 (daily).
    interval_hours: u32,
    /// Heat-point series. Hourly entries use "YYYY-MM-DDTHH" where HH is the
    /// 2-hour block start (00/02/…/22, 12 per day); daily entries use "YYYY-MM-DD".
    data: Vec<DayEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsagePayload {
    meta: Meta,
    summary: Metrics,
    days: Vec<DayEntry>,
    models: Vec<NamedEntry>,
    providers: Vec<NamedEntry>,
    provider_models: Vec<ProviderModelEntry>,
    provider_model_trends: Vec<ProviderModelTrendEntry>,
    /// Dedicated heatmap stream. Granularity follows range:
    /// ≤ 90 days → hourly 2-hour blocks; > 90 days → daily.
    /// Independent of `days` granularity so other charts are unaffected.
    heatmap: HeatmapPayload,
}

#[derive(Debug, Clone, Serialize)]
struct HealthResponse {
    ok: bool,
}

#[derive(Debug, Deserialize)]
struct UsageQuery {
    range: Option<String>,
}

/// Query params for cache-miss drill-down. `date` (YYYY-MM-DD) filters to a
/// single day; when present it overrides the range window. `provider`/`model`
/// optionally narrow further (point-click only passes `date`).
#[derive(Debug, Deserialize)]
struct CacheMissQuery {
    range: Option<String>,
    date: Option<String>,
    provider: Option<String>,
    model: Option<String>,
}

// ── Cache ──────────────────────────────────────────────────────────────────

struct CacheEntry {
    signature: String,
    payload: UsagePayload,
}

struct AppState {
    cache: RwLock<HashMap<String, CacheEntry>>,
}

// ── JSON parsing helpers ───────────────────────────────────────────────────

#[derive(Deserialize)]
struct MessageData {
    role: Option<String>,
    #[serde(rename = "modelID")]
    model_id: Option<String>,
    #[serde(rename = "providerID")]
    provider_id: Option<String>,
    tokens: Option<TokenData>,
    time: Option<TimeData>,
}

#[derive(Deserialize)]
struct TokenData {
    total: Option<i64>,
    input: Option<i64>,
    output: Option<i64>,
    reasoning: Option<i64>,
    cache: Option<CacheData>,
}

#[derive(Deserialize)]
struct CacheData {
    read: Option<i64>,
    write: Option<i64>,
}

#[derive(Deserialize)]
struct TimeData {
    created: Option<i64>,
    completed: Option<i64>,
}

fn extract_metrics(tokens: Option<&TokenData>, time: Option<&TimeData>, skip_runtime: bool) -> Metrics {
    let tokens = match tokens {
        Some(t) => t,
        None => return Metrics::default(),
    };

    let input = tokens.input.unwrap_or(0);
    let output = tokens.output.unwrap_or(0);
    let reasoning = tokens.reasoning.unwrap_or(0);
    let cache_read = tokens.cache.as_ref().and_then(|c| c.read).unwrap_or(0);
    let cache_write = tokens.cache.as_ref().and_then(|c| c.write).unwrap_or(0);
    let active = input + output + reasoning;
    let computed_total = active + cache_read + cache_write;

    let mut total = tokens.total.unwrap_or(0);
    if total <= 0 && computed_total > 0 {
        total = computed_total;
    }

    let runtime = if skip_runtime {
        0
    } else if let Some(time) = time {
        let created = time.created.unwrap_or(0);
        let completed = time.completed.unwrap_or(0);
        if created > 0 && completed > created {
            completed - created
        } else {
            0
        }
    } else {
        0
    };

    Metrics {
        total,
        active,
        input,
        output,
        reasoning,
        cache_read,
        cache_write,
        cache_miss: 0,
        cache_expected: 0,
        runtime,
        runtime_dedup: 0,
        user_message_count: 0,
    }
}

/// One assistant message, carrying everything needed for aggregation plus the
/// session id + timestamp required to pair consecutive messages.
struct AssistantEntry {
    id: String,
    session_id: String,
    ts_ms: i64,
    bucket: String,
    heatmap_bucket: String,
    model: String,
    provider: String,
    metrics: Metrics,
    interval: Option<(i64, i64)>,
}

/// Pair consecutive assistant messages within each session (ordered by time)
/// and compute cache miss / expected counters, attributed to the successor.
///
/// For a pair (prev → cur) in the same session:
///   expected = prev.total   (the full context that should carry over)
///   miss     = max(0, prev.total - cur.cache_read)
/// Both are additive token counters; aggregation sums them naturally.
///
/// A pair is BROKEN (cur not counted) when the previous context is not a valid
/// cache baseline for cur:
///   - different session (always)
///   - different model or provider (different cache namespace)
///   - a compaction occurred strictly between prev and cur (context rewritten)
/// Zero-token messages (aborted/errored before any response) are excluded from
/// pairing entirely — neither as cur nor as prev. As a cur they'd yield
/// miss = prev.total (a false positive); as a prev they'd zero out the next
/// pair's baseline. The remaining real messages pair across the gap.
/// `compactions` maps session_id → sorted compaction timestamps (epoch ms).
fn pair_cache_miss(entries: &mut [AssistantEntry], compactions: &HashMap<String, Vec<i64>>) {
    // Stable sort restores per-session time order (the SQL already returns
    // time-ordered rows, but grouping by session requires this).
    entries.sort_by(|a, b| a.session_id.cmp(&b.session_id).then(a.ts_ms.cmp(&b.ts_ms)));
    // Indices of messages with real token usage (total > 0).
    let nonzero: Vec<usize> = (0..entries.len())
        .filter(|&i| entries[i].metrics.total > 0)
        .collect();
    for k in 1..nonzero.len() {
        let (pi, ci) = (nonzero[k - 1], nonzero[k]);
        let prev = &entries[pi];
        let cur = &entries[ci];
        // Break across session / model / provider boundaries.
        if cur.session_id != prev.session_id
            || cur.model != prev.model
            || cur.provider != prev.provider
        {
            continue;
        }
        // Break if a compaction happened strictly between prev and cur.
        if compactions
            .get(&cur.session_id)
            .is_some_and(|times| times.iter().any(|&c| c > prev.ts_ms && c < cur.ts_ms))
        {
            continue;
        }
        let prev_total = prev.metrics.total;
        let cur_read = cur.metrics.cache_read;
        entries[ci].metrics.cache_expected = prev_total;
        entries[ci].metrics.cache_miss = (prev_total - cur_read).max(0);
    }
}

/// Merge overlapping intervals, return total duration in ms.
fn merge_intervals(intervals: &mut Vec<(i64, i64)>) -> i64 {
    if intervals.is_empty() {
        return 0;
    }
    intervals.sort();
    let mut merged = vec![intervals[0]];
    for &(start, end) in &intervals[1..] {
        let last = merged.last_mut().unwrap();
        if start <= last.1 {
            last.1 = last.1.max(end);
        } else {
            merged.push((start, end));
        }
    }
    merged.iter().map(|(s, e)| e - s).sum()
}

fn format_day(ts_ms: i64) -> String {
    use chrono::TimeZone;
    let secs = ts_ms / 1000;
    let dt = chrono::DateTime::from_timestamp(secs, 0).unwrap_or_default();
    Local.from_utc_datetime(&dt.naive_utc()).format("%Y-%m-%d").to_string()
}

/// Format timestamp as "YYYY-MM-DDTHH" (hour granularity) in local timezone.
fn format_hour(ts_ms: i64) -> String {
    use chrono::TimeZone;
    let secs = ts_ms / 1000;
    let dt = chrono::DateTime::from_timestamp(secs, 0).unwrap_or_default();
    Local.from_utc_datetime(&dt.naive_utc()).format("%Y-%m-%dT%H").to_string()
}

/// Format timestamp as a 2-hour block start key, e.g. 13:xx → "YYYY-MM-DDT12"
/// (12 blocks per day: 00, 02, 04, …, 22). Used by the hourly heatmap stream.
fn format_2h_block(ts_ms: i64) -> String {
    use chrono::TimeZone;
    let secs = ts_ms / 1000;
    let dt = chrono::DateTime::from_timestamp(secs, 0).unwrap_or_default();
    let local = Local.from_utc_datetime(&dt.naive_utc());
    let block_start = ((local.hour() as i32) / 2) * 2;
    format!("{}T{:02}", local.format("%Y-%m-%d"), block_start)
}

/// Whether the given range value should use hourly granularity.
fn is_hourly_range(range_value: Option<&str>) -> bool {
    match range_value {
        Some("7") => true,
        _ => false,
    }
}

/// Whether the heatmap (2-hourly) data stream should be computed.
/// Granularity of the dedicated heatmap stream, decided purely by range:
/// ≤ 90 days (7/30/90) → hourly buckets; > 90 days (180/365/all) → daily buckets.
/// The heatmap is always computed; this only selects its bucket size.
fn heatmap_is_hourly(range_value: Option<&str>) -> bool {
    matches!(range_value, Some("7") | Some("30") | Some("90"))
}

// ── Database discovery ─────────────────────────────────────────────────────

fn discover_database() -> Result<PathBuf, String> {
    let data_dir = opencode_data_dir();
    if !data_dir.exists() {
        return Err(format!("没有找到 OpenCode 数据库目录: {}", data_dir.display()));
    }

    let mut preferred: Vec<PathBuf> = Vec::new();
    let mut others: Vec<PathBuf> = Vec::new();

    for entry in std::fs::read_dir(&data_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |ext| ext == "db") {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with("opencode") {
                if name == "opencode.db" {
                    preferred.push(path);
                } else {
                    others.push(path);
                }
            }
        }
    }

    if !preferred.is_empty() {
        preferred.sort();
        return Ok(preferred.into_iter().next().unwrap());
    }
    others.sort();
    others
        .into_iter()
        .next()
        .ok_or_else(|| format!("没有找到 OpenCode 数据库目录: {}", data_dir.display()))
}

// ── Fill missing time buckets ────────────────────────────────────────────

/// Fill missing days between first_day and last_day with zero metrics.
fn fill_missing_days(
    mut totals: HashMap<String, Metrics>,
    first_day: Option<&str>,
    last_day: Option<&str>,
) -> Vec<DayEntry> {
    let (Some(first), Some(last)) = (first_day, last_day) else {
        let mut days: Vec<DayEntry> = totals
            .into_iter()
            .map(|(date, metrics)| DayEntry { date, metrics })
            .collect();
        days.sort_by(|a, b| a.date.cmp(&b.date));
        return days;
    };

    let start = chrono::NaiveDate::parse_from_str(first, "%Y-%m-%d");
    let end = chrono::NaiveDate::parse_from_str(last, "%Y-%m-%d");
    let (Ok(start), Ok(end)) = (start, end) else {
        let mut days: Vec<DayEntry> = totals
            .into_iter()
            .map(|(date, metrics)| DayEntry { date, metrics })
            .collect();
        days.sort_by(|a, b| a.date.cmp(&b.date));
        return days;
    };

    let mut result = Vec::new();
    let mut current = start;
    while current <= end {
        let key = current.to_string();
        let metrics = totals.remove(&key).unwrap_or_default();
        result.push(DayEntry { date: key, metrics });
        current += chrono::Duration::days(1);
    }
    result
}

/// Fill missing hours between first_day and last_day with zero metrics.
/// Expects bucket keys like "2026-05-30T14". Caps at the current hour for today.
fn fill_missing_hours(
    mut totals: HashMap<String, Metrics>,
    first_day: Option<&str>,
    last_day: Option<&str>,
) -> Vec<DayEntry> {
    let (Some(first), Some(last)) = (first_day, last_day) else {
        let mut days: Vec<DayEntry> = totals
            .into_iter()
            .map(|(date, metrics)| DayEntry { date, metrics })
            .collect();
        days.sort_by(|a, b| a.date.cmp(&b.date));
        return days;
    };

    let start = chrono::NaiveDate::parse_from_str(first, "%Y-%m-%d");
    let end = chrono::NaiveDate::parse_from_str(last, "%Y-%m-%d");
    let (Ok(start), Ok(end)) = (start, end) else {
        let mut days: Vec<DayEntry> = totals
            .into_iter()
            .map(|(date, metrics)| DayEntry { date, metrics })
            .collect();
        days.sort_by(|a, b| a.date.cmp(&b.date));
        return days;
    };

    // Cap at current hour so we don't emit future zero-buckets
    let now = Local::now();
    let today = now.date_naive();
    let current_hour = now.hour() as u32;

    let mut result = Vec::new();
    let mut current_date = start;
    while current_date <= end {
        let is_today = current_date == today;
        let max_hour = if is_today { current_hour + 1 } else { 24 };
        for hour in 0..max_hour {
            let key = format!("{}T{:02}", current_date, hour);
            let metrics = totals.remove(&key).unwrap_or_default();
            result.push(DayEntry { date: key, metrics });
        }
        current_date += chrono::Duration::days(1);
    }
    result
}

/// Fill missing 2-hour blocks between first_day and last_day with zero metrics.
/// Expects bucket keys like "2026-05-30T12" where the hour is a 2-hour block
/// start (00/02/…/22, 12 per day). Caps at the current block for today.
fn fill_missing_2h_blocks(
    mut totals: HashMap<String, Metrics>,
    first_day: Option<&str>,
    last_day: Option<&str>,
) -> Vec<DayEntry> {
    let (Some(first), Some(last)) = (first_day, last_day) else {
        let mut days: Vec<DayEntry> = totals
            .into_iter()
            .map(|(date, metrics)| DayEntry { date, metrics })
            .collect();
        days.sort_by(|a, b| a.date.cmp(&b.date));
        return days;
    };

    let start = chrono::NaiveDate::parse_from_str(first, "%Y-%m-%d");
    let end = chrono::NaiveDate::parse_from_str(last, "%Y-%m-%d");
    let (Ok(start), Ok(end)) = (start, end) else {
        let mut days: Vec<DayEntry> = totals
            .into_iter()
            .map(|(date, metrics)| DayEntry { date, metrics })
            .collect();
        days.sort_by(|a, b| a.date.cmp(&b.date));
        return days;
    };

    // Cap at the current 2-hour block so we don't emit future zero-buckets today.
    let now = Local::now();
    let today = now.date_naive();
    let current_block = (now.hour() as u32) / 2; // 0..11

    let mut result = Vec::new();
    let mut current_date = start;
    while current_date <= end {
        let is_today = current_date == today;
        let max_block = if is_today { current_block + 1 } else { 12 };
        for b in 0..max_block {
            let key = format!("{}T{:02}", current_date, b * 2);
            let metrics = totals.remove(&key).unwrap_or_default();
            result.push(DayEntry { date: key, metrics });
        }
        current_date += chrono::Duration::days(1);
    }
    result
}

// ── Core aggregation logic ─────────────────────────────────────────────────

/// Load all assistant messages as AssistantEntry (ordered by time_created),
/// applying the same directory filters as the usage path. `hourly` /
/// `heatmap_hourly` only affect the precomputed bucket strings (unused by the
/// cache-miss endpoints, which pass false). Returns (entries, first_day,
/// last_day, scanned_rows).
fn load_assistant_entries(
    conn: &rusqlite::Connection,
    hourly: bool,
    heatmap_hourly: bool,
) -> Result<(Vec<AssistantEntry>, Option<String>, Option<String>, i64), String> {
    let child_session_ids: Vec<String> = conn
        .prepare("SELECT id FROM session WHERE parent_id IS NOT NULL")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get(0))
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
        })
        .unwrap_or_default();

    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.session_id, m.data FROM message m \
             JOIN session s ON m.session_id = s.id \
             WHERE m.data LIKE '%\"role\":\"assistant\"%' \
             AND s.directory NOT LIKE '%.opencode%' \
             AND s.directory NOT LIKE '/home/hmsy/.config/pet%' \
             ORDER BY m.time_created ASC",
        )
        .map_err(|e| format!("查询 assistant 消息失败: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let session_id: String = row.get(1)?;
            let data: String = row.get(2)?;
            Ok((id, session_id, data))
        })
        .map_err(|e| format!("执行查询失败: {e}"))?;

    let mut entries: Vec<AssistantEntry> = Vec::new();
    let mut first_day: Option<String> = None;
    let mut last_day: Option<String> = None;
    let mut scanned_rows: i64 = 0;

    for row in rows {
        let (id, session_id, raw_data) = match row {
            Ok(r) => r,
            Err(_) => continue,
        };
        scanned_rows += 1;
        let payload: MessageData = match serde_json::from_str(&raw_data) {
            Ok(p) => p,
            Err(_) => continue,
        };
        if payload.role.as_deref() != Some("assistant") {
            continue;
        }
        let time_info = payload.time.as_ref();
        let timestamp_ms = time_info
            .and_then(|t| t.completed.or(t.created))
            .unwrap_or(0);
        if timestamp_ms == 0 {
            continue;
        }
        let is_child = child_session_ids.contains(&session_id);
        let metrics = extract_metrics(payload.tokens.as_ref(), time_info, is_child);
        let bucket = if hourly { format_hour(timestamp_ms) } else { format_day(timestamp_ms) };
        let heatmap_bucket = if heatmap_hourly { format_2h_block(timestamp_ms) } else { format_day(timestamp_ms) };
        let model = payload.model_id.as_deref().unwrap_or("unknown").to_string();
        let provider = payload
            .provider_id
            .as_deref()
            .unwrap_or("unknown")
            .to_string();
        let interval = if metrics.runtime > 0 {
            if let Some(t) = time_info {
                let created = t.created.unwrap_or(0);
                let completed = t.completed.unwrap_or(0);
                if created > 0 && completed > 0 {
                    Some((created, completed))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };
        first_day = Some(first_day.unwrap_or_else(|| format_day(timestamp_ms)));
        last_day = Some(format_day(timestamp_ms));
        entries.push(AssistantEntry {
            id,
            session_id,
            ts_ms: timestamp_ms,
            bucket,
            heatmap_bucket,
            model,
            provider,
            metrics,
            interval,
        });
    }
    Ok((entries, first_day, last_day, scanned_rows))
}

/// Load per-session compaction timestamps (epoch ms), sorted ascending.
fn load_compaction_times(conn: &rusqlite::Connection) -> Result<HashMap<String, Vec<i64>>, String> {
    let mut map: HashMap<String, Vec<i64>> = HashMap::new();
    let mut stmt = conn
        .prepare(
            "SELECT sm.session_id, sm.time_created FROM session_message sm \
             JOIN session s ON sm.session_id = s.id \
             WHERE sm.type = 'compaction' \
             AND s.directory NOT LIKE '%.opencode%' \
             AND s.directory NOT LIKE '/home/hmsy/.config/pet%'",
        )
        .map_err(|e| format!("查询 compaction 消息失败: {e}"))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| format!("执行查询失败: {e}"))?;
    for row in rows {
        if let Ok((sid, ts)) = row {
            map.entry(sid).or_default().push(ts);
        }
    }
    for v in map.values_mut() {
        v.sort_unstable();
    }
    Ok(map)
}

fn aggregate_usage(db_path: &Path, range_value: Option<&str>) -> Result<UsagePayload, String> {
    let conn = rusqlite_connection(db_path)?;
    let hourly = is_hourly_range(range_value);
    let heatmap_hourly = heatmap_is_hourly(range_value);

    let mut day_totals: HashMap<String, Metrics> = HashMap::new();
    let mut model_totals: HashMap<String, Metrics> = HashMap::new();
    let mut provider_totals: HashMap<String, Metrics> = HashMap::new();
    let mut provider_model_totals: HashMap<(String, String), Metrics> = HashMap::new();
    let mut provider_model_day_totals: HashMap<(String, String), HashMap<String, Metrics>> = HashMap::new();
    let mut user_message_days: HashMap<String, i64> = HashMap::new();
    // Dedicated heatmap stream. Granularity follows `heatmap_hourly`
    // (hourly for range ≤ 90, daily for range > 90). Always computed.
    let mut heatmap_totals: HashMap<String, Metrics> = HashMap::new();
    let mut heatmap_user_messages: HashMap<String, i64> = HashMap::new();

    // Collected assistant messages; pairing for cache-miss happens after loading.
    let (mut assistant_entries, first_day, last_day, scanned_rows) =
        load_assistant_entries(&conn, hourly, heatmap_hourly)?;

    let compaction_times = load_compaction_times(&conn)?;

    // Pair consecutive messages within each session to compute cache miss counters.
    pair_cache_miss(&mut assistant_entries, &compaction_times);

    // Child session IDs — used to exclude child sessions from user message count.
    let child_session_ids: Vec<String> = conn
        .prepare("SELECT id FROM session WHERE parent_id IS NOT NULL")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get(0))
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
        })
        .unwrap_or_default();

    // Get user message IDs that have at least one non-synthetic text/file part.
    // Messages whose ALL text/file parts are synthetic (or have no text/file parts at all)
    // are considered program-generated and should be excluded from user message count.
    let valid_user_message_ids: HashSet<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT p.message_id FROM part p \
                 JOIN message m ON p.message_id = m.id \
                 JOIN session s ON m.session_id = s.id \
                 WHERE m.data LIKE '%\"role\":\"user\"%' \
                 AND s.directory NOT LIKE '%.opencode%' \
                 AND s.directory NOT LIKE '/home/hmsy/.config/pet%' \
                 AND json_extract(p.data, '$.type') IN ('text', 'file') \
                 AND (json_extract(p.data, '$.synthetic') IS NULL OR json_extract(p.data, '$.synthetic') != 1)",
            )
            .map_err(|e| format!("查询有效用户消息失败: {e}"))?;

        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("执行查询失败: {e}"))?;

        rows.filter_map(|r| r.ok()).collect()
    };

    // Query user messages (excluding ignored sessions)
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.session_id, m.data FROM message m \
             JOIN session s ON m.session_id = s.id \
             WHERE m.data LIKE '%\"role\":\"user\"%' \
             AND s.directory NOT LIKE '%.opencode%' \
             AND s.directory NOT LIKE '/home/hmsy/.config/pet%'",
        )
        .map_err(|e| format!("查询 user 消息失败: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let session_id: String = row.get(1)?;
            let data: String = row.get(2)?;
            Ok((id, session_id, data))
        })
        .map_err(|e| format!("执行查询失败: {e}"))?;

    for row in rows {
        let (id, session_id, raw_data) = match row {
            Ok(r) => r,
            Err(_) => continue,
        };

        if !valid_user_message_ids.contains(&id) {
            continue;
        }

        if child_session_ids.contains(&session_id) {
            continue;
        }

        let payload: MessageData = match serde_json::from_str(&raw_data) {
            Ok(p) => p,
            Err(_) => continue,
        };

        if payload.role.as_deref() != Some("user") {
            continue;
        }

        let timestamp_ms = payload
            .time
            .as_ref()
            .and_then(|t| t.completed.or(t.created))
            .unwrap_or(0);

        if timestamp_ms == 0 {
            continue;
        }

        let day = if hourly { format_hour(timestamp_ms) } else { format_day(timestamp_ms) };
        *user_message_days.entry(day).or_insert(0) += 1;

        let hm_bucket = if heatmap_hourly { format_2h_block(timestamp_ms) } else { format_day(timestamp_ms) };
        *heatmap_user_messages.entry(hm_bucket).or_insert(0) += 1;
    }

    // Resolve day window
    let (selected_first_day, selected_last_day) = resolve_day_window(
        first_day.as_deref(),
        last_day.as_deref(),
        range_value,
    );

    // Aggregate within selected window
    let mut bucket_intervals: HashMap<String, Vec<(i64, i64)>> = HashMap::new();
    let mut model_intervals: HashMap<String, Vec<(i64, i64)>> = HashMap::new();
    let mut provider_intervals: HashMap<String, Vec<(i64, i64)>> = HashMap::new();
    // Intervals for the dedicated heatmap stream (to compute runtime_dedup).
    let mut heatmap_intervals: HashMap<String, Vec<(i64, i64)>> = HashMap::new();
    let mut all_intervals: Vec<(i64, i64)> = Vec::new();
    let mut assistant_rows: i64 = 0;

    for entry in &assistant_entries {
        let AssistantEntry { bucket, model, provider, metrics, interval, heatmap_bucket, .. } = entry;
        // For hourly: bucket is "2026-05-30T14", we need the day part for window check
        let bucket_day = if hourly {
            bucket.split_once('T').map(|(d, _)| d).unwrap_or(bucket.as_str())
        } else {
            bucket.as_str()
        };
        if let Some(ref sfd) = selected_first_day {
            if bucket_day < sfd.as_str() {
                continue;
            }
        }
        if let Some(ref sld) = selected_last_day {
            if bucket_day > sld.as_str() {
                continue;
            }
        }

        // Dedicated heatmap stream (hourly for range ≤ 90, daily for range > 90).
        heatmap_totals
            .entry(heatmap_bucket.clone())
            .or_default()
            .add(metrics);

        day_totals
            .entry(bucket.clone())
            .or_default()
            .add(metrics);
        model_totals
            .entry(model.clone())
            .or_default()
            .add(metrics);
        provider_totals
            .entry(provider.clone())
            .or_default()
            .add(metrics);
        provider_model_totals
            .entry((provider.clone(), model.clone()))
            .or_default()
            .add(metrics);
        provider_model_day_totals
            .entry((provider.clone(), model.clone()))
            .or_default()
            .entry(bucket.clone())
            .or_default()
            .add(metrics);

        if let Some(iv) = interval {
            bucket_intervals.entry(bucket.clone()).or_default().push(*iv);
            heatmap_intervals.entry(heatmap_bucket.clone()).or_default().push(*iv);
            model_intervals.entry(model.clone()).or_default().push(*iv);
            provider_intervals
                .entry(provider.clone())
                .or_default()
                .push(*iv);
            all_intervals.push(*iv);
        }

        assistant_rows += 1;
    }

    // Inject user message counts
    for (bucket, count) in &user_message_days {
        let bucket_day = if hourly {
            bucket.split_once('T').map(|(d, _)| d).unwrap_or(bucket.as_str())
        } else {
            bucket.as_str()
        };
        if let Some(ref sfd) = selected_first_day {
            if bucket_day < sfd.as_str() {
                continue;
            }
        }
        if let Some(ref sld) = selected_last_day {
            if bucket_day > sld.as_str() {
                continue;
            }
        }
        day_totals
            .entry(bucket.clone())
            .or_default()
            .user_message_count = *count;
    }

    // Inject user message counts into the dedicated heatmap stream.
    // Keys are either "YYYY-MM-DDTHH" (hourly) or "YYYY-MM-DD" (daily);
    // the day part is the prefix before 'T' (or the whole key when no 'T').
    for (hm_bucket, count) in &heatmap_user_messages {
        let hm_day = hm_bucket
            .split_once('T')
            .map(|(d, _)| d)
            .unwrap_or(hm_bucket.as_str());
        if let Some(ref sfd) = selected_first_day {
            if hm_day < sfd.as_str() {
                continue;
            }
        }
        if let Some(ref sld) = selected_last_day {
            if hm_day > sld.as_str() {
                continue;
            }
        }
        heatmap_totals
            .entry(hm_bucket.clone())
            .or_default()
            .user_message_count = *count;
    }

    // Compute dedup runtime
    for (bucket, intervals) in &mut bucket_intervals {
        let dedup = merge_intervals(intervals);
        day_totals.entry(bucket.clone()).or_default().runtime_dedup = dedup;
    }
    for (model, intervals) in &mut model_intervals {
        let dedup = merge_intervals(intervals);
        model_totals.entry(model.clone()).or_default().runtime_dedup = dedup;
    }
    for (provider, intervals) in &mut provider_intervals {
        let dedup = merge_intervals(intervals);
        provider_totals
            .entry(provider.clone())
            .or_default()
            .runtime_dedup = dedup;
    }
    for (hb, intervals) in &mut heatmap_intervals {
        let dedup = merge_intervals(intervals);
        heatmap_totals.entry(hb.clone()).or_default().runtime_dedup = dedup;
    }

    let all_dedup = merge_intervals(&mut all_intervals);

    // Build output — fill missing buckets with zero metrics
    let days: Vec<DayEntry> = if hourly {
        fill_missing_hours(day_totals, selected_first_day.as_deref(), selected_last_day.as_deref())
    } else {
        fill_missing_days(day_totals, selected_first_day.as_deref(), selected_last_day.as_deref())
    };

    // Dedicated heatmap stream: 2-hour blocks for range ≤ 90, daily for range > 90.
    // Always computed (over the full selected window), no truncation.
    let heatmap_data: Vec<DayEntry> = if heatmap_hourly {
        fill_missing_2h_blocks(heatmap_totals, selected_first_day.as_deref(), selected_last_day.as_deref())
    } else {
        fill_missing_days(heatmap_totals, selected_first_day.as_deref(), selected_last_day.as_deref())
    };
    let heatmap = HeatmapPayload {
        granularity: if heatmap_hourly { HeatmapGranularity::Hourly } else { HeatmapGranularity::Daily },
        interval_hours: if heatmap_hourly { 2 } else { 24 },
        data: heatmap_data,
    };

    let mut models: Vec<NamedEntry> = model_totals
        .into_iter()
        .map(|(name, metrics)| NamedEntry { name, metrics })
        .collect();
    models.sort_by(|a, b| b.metrics.total.cmp(&a.metrics.total).then(a.name.cmp(&b.name)));

    let mut providers: Vec<NamedEntry> = provider_totals
        .into_iter()
        .map(|(name, metrics)| NamedEntry { name, metrics })
        .collect();
    providers.sort_by(|a, b| b.metrics.total.cmp(&a.metrics.total).then(a.name.cmp(&b.name)));

    let mut provider_models: Vec<ProviderModelEntry> = provider_model_totals
        .into_iter()
        .map(|((provider, model), metrics)| ProviderModelEntry { provider, model, metrics })
        .collect();
    provider_models.sort_by(|a, b| {
        // Sort by provider, then by total desc, then by model name
        match a.provider.cmp(&b.provider) {
            std::cmp::Ordering::Equal => b.metrics.total.cmp(&a.metrics.total).then(a.model.cmp(&b.model)),
            other => other,
        }
    });

    // Build provider_model_trends — daily time series per provider+model
    let provider_model_trends: Vec<ProviderModelTrendEntry> = {
        let mut trends: Vec<ProviderModelTrendEntry> = provider_model_day_totals
            .into_iter()
            .map(|((provider, model), day_map)| {
                let mut day_entries: Vec<ProviderModelDayEntry> = day_map
                    .into_iter()
                    .map(|(date, metrics)| ProviderModelDayEntry { date, metrics })
                    .collect();
                day_entries.sort_by(|a, b| a.date.cmp(&b.date));
                ProviderModelTrendEntry { provider, model, days: day_entries }
            })
            .collect();
        // Sort by total desc, then provider, then model
        trends.sort_by(|a, b| {
            let total_a: i64 = a.days.iter().map(|d| d.metrics.total).sum();
            let total_b: i64 = b.days.iter().map(|d| d.metrics.total).sum();
            match total_b.cmp(&total_a) {
                std::cmp::Ordering::Equal => match a.provider.cmp(&b.provider) {
                    std::cmp::Ordering::Equal => a.model.cmp(&b.model),
                    other => other,
                },
                other => other,
            }
        });
        trends
    };

    let mut summary = Metrics::default();
    for day in &days {
        summary.add(&day.metrics);
    }
    summary.runtime_dedup = all_dedup;

    Ok(UsagePayload {
        meta: Meta {
            database: db_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            database_path: db_path.display().to_string(),
            generated_at: Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false),
            timezone: Local::now().format("%Z").to_string(),
            first_day: selected_first_day,
            last_day: selected_last_day,
            available_first_day: first_day,
            available_last_day: last_day,
            range: range_value.unwrap_or("all").to_string(),
            assistant_message_count: assistant_rows,
            scanned_rows,
        },
        summary,
        days,
        models,
        providers,
        provider_models,
        provider_model_trends,
        heatmap,
    })
}

fn resolve_day_window(
    first_day: Option<&str>,
    last_day: Option<&str>,
    range_value: Option<&str>,
) -> (Option<String>, Option<String>) {
    let (first, last) = match (first_day, last_day) {
        (Some(f), Some(l)) => (f, l),
        _ => return (first_day.map(String::from), last_day.map(String::from)),
    };

    match range_value {
        None | Some("all") => (Some(first.to_string()), Some(last.to_string())),
        Some(rv) => {
            let size = rv.parse::<u32>().unwrap_or(0).max(1) as i64;
            let first_date = chrono::NaiveDate::parse_from_str(first, "%Y-%m-%d").ok();
            let last_date = chrono::NaiveDate::parse_from_str(last, "%Y-%m-%d").ok();
            match (first_date, last_date) {
                (Some(fd), Some(ld)) => {
                    let selected_start = fd.max(ld - chrono::Duration::days(size - 1));
                    (Some(selected_start.to_string()), Some(last.to_string()))
                }
                _ => (Some(first.to_string()), Some(last.to_string())),
            }
        }
    }
}

/// Open a read-only SQLite connection using rusqlite directly.
fn rusqlite_connection(db_path: &Path) -> Result<rusqlite::Connection, String> {
    let uri = format!("file:{}?mode=ro", db_path.display());
    rusqlite::Connection::open_with_flags(&uri, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI)
        .map_err(|e| format!("打开数据库失败: {e}"))
}

// ── Cache-miss drill-down ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheMissSessionRow {
    session_id: String,
    title: String,
    provider: String,
    model: String,
    cache_miss: i64,
    cache_expected: i64,
    miss_rate: f64,
    pairs: i64,
    first_time: i64,
    last_time: i64,
    /// True when every pair in this session read nothing from cache
    /// (i.e. the provider/model does not support prompt caching).
    no_cache: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheMissSessionsPayload {
    range: String,
    total_miss: i64,
    total_expected: i64,
    sessions: Vec<CacheMissSessionRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheMissMessage {
    id: String,
    idx: usize,
    ts: i64,
    total: i64,
    cache_read: i64,
    cache_write: i64,
    input: i64,
    output: i64,
    reasoning: i64,
    /// Previous message's total (the context that should have been cached).
    /// None for the first real message or a broken pair.
    prev_total: Option<i64>,
    /// max(0, prev_total - cache_read). None when prev_total is None.
    miss: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheMissSessionDetail {
    session_id: String,
    title: String,
    provider: String,
    model: String,
    no_cache: bool,
    messages: Vec<CacheMissMessage>,
}

/// Per-session cache-miss aggregation for the selected range.
fn aggregate_cache_miss_sessions(
    db_path: &Path,
    range_value: Option<&str>,
    date_filter: Option<&str>,
    provider_filter: Option<&str>,
    model_filter: Option<&str>,
) -> Result<CacheMissSessionsPayload, String> {
    let conn = rusqlite_connection(db_path)?;
    let (mut entries, first_day, last_day, _scanned) = load_assistant_entries(&conn, false, false)?;
    let compaction_times = load_compaction_times(&conn)?;
    pair_cache_miss(&mut entries, &compaction_times);

    // The range window is only used when no exact date filter is given.
    let (sel_first, sel_last) = if date_filter.is_some() {
        (None, None)
    } else {
        resolve_day_window(first_day.as_deref(), last_day.as_deref(), range_value)
    };

    // session titles
    let mut titles: HashMap<String, String> = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, title FROM session")
            .map_err(|e| format!("查询 session 失败: {e}"))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| format!("执行查询失败: {e}"))?;
        for r in rows {
            if let Ok((id, t)) = r {
                titles.insert(id, t);
            }
        }
    }

    struct SessAgg {
        miss: i64,
        expected: i64,
        cache_read: i64,
        pairs: i64,
        first: i64,
        last: i64,
        provider: String,
        model: String,
    }
    let mut agg: HashMap<String, SessAgg> = HashMap::new();

    // Only "cur" entries (cache_expected > 0 = was paired as a successor) carry
    // miss/expected. Attribute them to their session, filtered by date / range /
    // provider / model as requested.
    for e in &entries {
        if e.metrics.cache_expected == 0 {
            continue;
        }
        let day = format_day(e.ts_ms);
        if let Some(d) = date_filter {
            if day.as_str() != d {
                continue;
            }
        } else {
            if let Some(ref f) = sel_first {
                if day.as_str() < f.as_str() {
                    continue;
                }
            }
            if let Some(ref l) = sel_last {
                if day.as_str() > l.as_str() {
                    continue;
                }
            }
        }
        if let Some(p) = provider_filter {
            if e.provider != p {
                continue;
            }
        }
        if let Some(m) = model_filter {
            if e.model != m {
                continue;
            }
        }
        let s = agg.entry(e.session_id.clone()).or_insert_with(|| SessAgg {
            miss: 0,
            expected: 0,
            cache_read: 0,
            pairs: 0,
            first: e.ts_ms,
            last: e.ts_ms,
            provider: e.provider.clone(),
            model: e.model.clone(),
        });
        s.miss += e.metrics.cache_miss;
        s.expected += e.metrics.cache_expected;
        s.cache_read += e.metrics.cache_read;
        s.pairs += 1;
        if e.ts_ms < s.first {
            s.first = e.ts_ms;
        }
        if e.ts_ms > s.last {
            s.last = e.ts_ms;
        }
    }

    let mut rows: Vec<CacheMissSessionRow> = Vec::new();
    let mut total_miss = 0i64;
    let mut total_expected = 0i64;
    for (sid, s) in agg.into_iter() {
        total_miss += s.miss;
        total_expected += s.expected;
        let miss_rate = if s.expected > 0 {
            ((s.miss as f64 / s.expected as f64) * 1000.0).round() / 10.0
        } else {
            0.0
        };
        let no_cache = s.pairs > 0 && s.cache_read == 0;
        rows.push(CacheMissSessionRow {
            session_id: sid.clone(),
            title: titles.get(&sid).cloned().unwrap_or_default(),
            provider: s.provider,
            model: s.model,
            cache_miss: s.miss,
            cache_expected: s.expected,
            miss_rate,
            pairs: s.pairs,
            first_time: s.first,
            last_time: s.last,
            no_cache,
        });
    }
    rows.sort_by(|a, b| b.cache_miss.cmp(&a.cache_miss));

    Ok(CacheMissSessionsPayload {
        range: range_value.unwrap_or("all").to_string(),
        total_miss,
        total_expected,
        sessions: rows,
    })
}

/// Per-message cache-miss lifecycle for a single session.
fn aggregate_cache_miss_session_detail(
    db_path: &Path,
    session_id: &str,
) -> Result<CacheMissSessionDetail, String> {
    let conn = rusqlite_connection(db_path)?;
    let (title, dir): (String, String) = conn
        .query_row(
            "SELECT title, directory FROM session WHERE id = ?",
            rusqlite::params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("会话不存在: {e}"))?;
    if dir.contains(".opencode") || dir.starts_with("/home/hmsy/.config/pet") {
        return Err("会话不在统计范围内".into());
    }

    // Load only this session's assistant messages (focused query — cheap).
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.data FROM message m \
             JOIN session s ON m.session_id = s.id \
             WHERE m.session_id = ? AND m.data LIKE '%\"role\":\"assistant\"%' \
             AND s.directory NOT LIKE '%.opencode%' \
             AND s.directory NOT LIKE '/home/hmsy/.config/pet%' \
             ORDER BY m.time_created ASC",
        )
        .map_err(|e| format!("查询失败: {e}"))?;
    let mut entries: Vec<AssistantEntry> = Vec::new();
    let rows = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("执行查询失败: {e}"))?;
    for row in rows {
        let (id, raw) = match row {
            Ok(r) => r,
            Err(_) => continue,
        };
        let payload: MessageData = match serde_json::from_str(&raw) {
            Ok(p) => p,
            Err(_) => continue,
        };
        if payload.role.as_deref() != Some("assistant") {
            continue;
        }
        let time_info = payload.time.as_ref();
        let ts = time_info.and_then(|t| t.completed.or(t.created)).unwrap_or(0);
        if ts == 0 {
            continue;
        }
        let metrics = extract_metrics(payload.tokens.as_ref(), time_info, false);
        let model = payload.model_id.as_deref().unwrap_or("unknown").to_string();
        let provider = payload.provider_id.as_deref().unwrap_or("unknown").to_string();
        entries.push(AssistantEntry {
            id,
            session_id: session_id.to_string(),
            ts_ms: ts,
            bucket: String::new(),
            heatmap_bucket: String::new(),
            model,
            provider,
            metrics,
            interval: None,
        });
    }
    let compaction_times = load_compaction_times(&conn)?;
    pair_cache_miss(&mut entries, &compaction_times);

    // Emit non-zero messages in time order (pair_cache_miss already sorted).
    let mut messages: Vec<CacheMissMessage> = Vec::new();
    let mut max_cache_read: i64 = 0;
    let mut first_provider = String::new();
    let mut first_model = String::new();
    let mut nz = 0usize;
    for e in &entries {
        if e.metrics.total == 0 {
            continue; // excluded: aborted/errored before any response
        }
        if first_provider.is_empty() {
            first_provider = e.provider.clone();
            first_model = e.model.clone();
        }
        if e.metrics.cache_read > max_cache_read {
            max_cache_read = e.metrics.cache_read;
        }
        let paired = e.metrics.cache_expected > 0;
        messages.push(CacheMissMessage {
            id: e.id.clone(),
            idx: nz,
            ts: e.ts_ms,
            total: e.metrics.total,
            cache_read: e.metrics.cache_read,
            cache_write: e.metrics.cache_write,
            input: e.metrics.input,
            output: e.metrics.output,
            reasoning: e.metrics.reasoning,
            prev_total: if paired { Some(e.metrics.cache_expected) } else { None },
            miss: if paired { Some(e.metrics.cache_miss) } else { None },
        });
        nz += 1;
    }
    let no_cache = !messages.is_empty() && max_cache_read == 0;

    Ok(CacheMissSessionDetail {
        session_id: session_id.to_string(),
        title,
        provider: first_provider,
        model: first_model,
        no_cache,
        messages,
    })
}

// ── Single message content (parts) ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageContentPart {
    /// "text" | "reasoning" | "tool"
    #[serde(rename = "type")]
    part_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    /// Tool args, stringified JSON.
    #[serde(skip_serializing_if = "Option::is_none")]
    input: Option<String>,
    /// Tool output text.
    #[serde(skip_serializing_if = "Option::is_none")]
    output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageContentPayload {
    message_id: String,
    parts: Vec<MessageContentPart>,
}

/// Fetch the rendered content (parts) of a single assistant message.
fn get_message_content(db_path: &Path, message_id: &str) -> Result<MessageContentPayload, String> {
    let conn = rusqlite_connection(db_path)?;
    // Verify it's an assistant message in a non-excluded session.
    let dir: String = conn
        .query_row(
            "SELECT s.directory FROM message m JOIN session s ON m.session_id = s.id \
             WHERE m.id = ? AND m.data LIKE '%\"role\":\"assistant\"%'",
            rusqlite::params![message_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("消息不存在或非 assistant: {e}"))?;
    if dir.contains(".opencode") || dir.starts_with("/home/hmsy/.config/pet") {
        return Err("消息不在统计范围内".into());
    }

    let mut stmt = conn
        .prepare("SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC, id ASC")
        .map_err(|e| format!("查询 part 失败: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![message_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("执行查询失败: {e}"))?;

    let mut parts: Vec<MessageContentPart> = Vec::new();
    for raw in rows {
        let raw = match raw {
            Ok(r) => r,
            Err(_) => continue,
        };
        let v: serde_json::Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let part_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();
        match part_type.as_str() {
            "text" | "reasoning" => {
                let text = v.get("text").and_then(|t| t.as_str()).map(|s| s.to_string());
                parts.push(MessageContentPart { part_type, text, name: None, status: None, title: None, input: None, output: None, error: None });
            }
            "tool" => {
                let name = v.get("tool").and_then(|t| t.as_str()).map(|s| s.to_string());
                let state = v.get("state");
                let status = state.and_then(|s| s.get("status")).and_then(|s| s.as_str()).map(|s| s.to_string());
                let title = state.and_then(|s| s.get("title")).and_then(|s| s.as_str()).map(|s| s.to_string());
                let input = state.and_then(|s| s.get("input")).map(|i| i.to_string());
                let output = state
                    .and_then(|s| s.get("output"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        state
                            .and_then(|s| s.get("metadata"))
                            .and_then(|m| m.get("output"))
                            .and_then(|o| o.as_str())
                            .map(|s| s.to_string())
                    });
                let error = state
                    .and_then(|s| s.get("error"))
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string());
                parts.push(MessageContentPart { part_type, text: None, name, status, title, input, output, error });
            }
            _ => {} // skip step-start / step-finish / other markers
        }
    }

    Ok(MessageContentPayload {
        message_id: message_id.to_string(),
        parts,
    })
}

// ── Cache helpers ──────────────────────────────────────────────────────────

async fn get_usage_payload(
    state: &AppState,
    db_path: &Path,
    range_value: Option<&str>,
) -> Result<UsagePayload, String> {
    let stat = std::fs::metadata(db_path).map_err(|e| format!("读取数据库元数据失败: {e}"))?;
    let mtime = stat
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let size = stat.len();

    // Include current date in cache signature so the cache auto-invalidates at midnight.
    // This ensures date-dependent logic (e.g. fill_missing_hours, generated_at)
    // always reflects the actual request time, not the server startup time.
    // Date is only added to signature (not key) so the old entry is replaced in-place
    // rather than accumulating stale entries across days.
    let today = Local::now().format("%Y-%m-%d").to_string();
    let cache_key = format!("{}::{}", db_path.display(), range_value.unwrap_or("all"));
    let signature = format!("{}:{}:{mtime}:{size}:{today}", db_path.display(), range_value.unwrap_or("all"));

    {
        let cache = state.cache.read().await;
        if let Some(cached) = cache.get(&cache_key) {
            if cached.signature == signature {
                return Ok(cached.payload.clone());
            }
        }
    }

    let payload = aggregate_usage(db_path, range_value)?;

    {
        let mut cache = state.cache.write().await;
        cache.insert(
            cache_key,
            CacheEntry {
                signature,
                payload: payload.clone(),
            },
        );
    }

    Ok(payload)
}

// ── Handlers ───────────────────────────────────────────────────────────────

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

async fn api_usage(
    State(state): State<Arc<AppState>>,
    Query(params): Query<UsageQuery>,
) -> impl IntoResponse {
    let range_value = params.range.as_deref();

    let db_path = match discover_database() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response();
        }
    };

    match get_usage_payload(&state, &db_path, range_value).await {
        Ok(payload) => Json(payload).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn api_cache_miss_sessions(
    Query(params): Query<CacheMissQuery>,
) -> impl IntoResponse {
    let range_value = params.range.as_deref();
    let db_path = match discover_database() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response();
        }
    };
    match aggregate_cache_miss_sessions(
        &db_path,
        range_value,
        params.date.as_deref(),
        params.provider.as_deref(),
        params.model.as_deref(),
    ) {
        Ok(payload) => Json(payload).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn api_cache_miss_session_detail(
    axum::extract::Path(session_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let db_path = match discover_database() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response();
        }
    };
    match aggregate_cache_miss_session_detail(&db_path, &session_id) {
        Ok(payload) => Json(payload).into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn api_cache_miss_message(
    axum::extract::Path(message_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let db_path = match discover_database() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response();
        }
    };
    match get_message_content(&db_path, &message_id) {
        Ok(payload) => Json(payload).into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

// ── Fallback SPA handler ───────────────────────────────────────────────────

/// Check if running in dev mode (STATIC_DIR env var or static/ exists on disk).
/// In dev mode, prefer filesystem for hot-reload; in production, use embedded assets.
fn use_filesystem() -> bool {
    std::env::var("STATIC_DIR").is_ok()
}

async fn spa_fallback(req: axum::extract::Request) -> impl IntoResponse {
    let path = req.uri().path().trim_start_matches('/');
    let file = if path.is_empty() { "index.html" } else { path };

    // Security: prevent path traversal
    if file.contains("..") {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }

    // Try filesystem first in dev mode
    if use_filesystem() {
        let static_root = static_dir();
        let file_path = static_root.join(file);
        if file_path.starts_with(&static_root) {
            if let Ok(bytes) = tokio::fs::read(&file_path).await {
                let mime = mime_guess::from_path(&file_path).first_or_octet_stream();
                return (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, mime.as_ref().to_string())],
                    bytes,
                )
                    .into_response();
            }
            // SPA fallback: serve index.html from filesystem
            let index_path = static_root.join("index.html");
            if let Ok(bytes) = tokio::fs::read(&index_path).await {
                return (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, "text/html; charset=utf-8".to_string())],
                    bytes,
                )
                    .into_response();
            }
        }
    }

    // Use embedded assets
    if let Some(content) = StaticAssets::get(file) {
        let mime = content.metadata.mimetype();
        return (
            StatusCode::OK,
            [(header::CONTENT_TYPE, mime.to_string())],
            content.data.to_vec(),
        )
            .into_response();
    }

    // SPA fallback: serve embedded index.html for any unmatched route
    if let Some(content) = StaticAssets::get("index.html") {
        return (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8".to_string())],
            content.data.to_vec(),
        )
            .into_response();
    }

    (
        StatusCode::NOT_FOUND,
        "Dashboard not built. Run `npm run build` first.",
    )
        .into_response()
}

// ── Main ───────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8765);

    let state = Arc::new(AppState {
        cache: RwLock::new(HashMap::new()),
    });

    let app = axum::Router::new()
        .route("/health", get(health))
        .route("/api/usage", get(api_usage))
        .route("/api/cache-miss/sessions", get(api_cache_miss_sessions))
        .route("/api/cache-miss/session/{id}", get(api_cache_miss_session_detail))
        .route("/api/cache-miss/message/{id}", get(api_cache_miss_message))
        .fallback(spa_fallback)
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("{host}:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    let url = format!("http://{addr}");
    tracing::info!("🥕 OpenCode token dashboard running at {url}");

    // Auto-open browser on Windows
    #[cfg(windows)]
    {
        let url = url.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", &url])
                .spawn();
        });
    }

    axum::serve(listener, app).await.unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    // ── extract_metrics ──────────────────────────────────────────────────

    #[test]
    fn test_extract_metrics_full() {
        let tokens = TokenData {
            total: Some(1000),
            input: Some(500),
            output: Some(300),
            reasoning: Some(50),
            cache: Some(CacheData {
                read: Some(100),
                write: Some(50),
            }),
        };
        let time = TimeData {
            created: Some(1000),
            completed: Some(5000),
        };
        let m = extract_metrics(Some(&tokens), Some(&time), false);
        assert_eq!(m.total, 1000);
        assert_eq!(m.active, 850); // 500 + 300 + 50
        assert_eq!(m.input, 500);
        assert_eq!(m.output, 300);
        assert_eq!(m.reasoning, 50);
        assert_eq!(m.cache_read, 100);
        assert_eq!(m.cache_write, 50);
        assert_eq!(m.runtime, 4000); // 5000 - 1000
    }

    #[test]
    fn test_extract_metrics_no_tokens() {
        let m = extract_metrics(None, None, false);
        assert_eq!(m.total, 0);
        assert_eq!(m.active, 0);
        assert_eq!(m.input, 0);
    }

    #[test]
    fn test_extract_metrics_skip_runtime() {
        let tokens = TokenData {
            total: Some(100),
            input: Some(50),
            output: Some(50),
            reasoning: None,
            cache: None,
        };
        let time = TimeData {
            created: Some(1000),
            completed: Some(5000),
        };
        let m = extract_metrics(Some(&tokens), Some(&time), true);
        assert_eq!(m.runtime, 0); // skipped
    }

    #[test]
    fn test_extract_metrics_fallback_total() {
        // total is missing/0, should be computed from components
        let tokens = TokenData {
            total: Some(0),
            input: Some(100),
            output: Some(200),
            reasoning: Some(50),
            cache: Some(CacheData {
                read: Some(50),
                write: Some(25),
            }),
        };
        let m = extract_metrics(Some(&tokens), None, false);
        assert_eq!(m.total, 425); // 100 + 200 + 50 + 50 + 25
        assert_eq!(m.active, 350);
    }

    #[test]
    fn test_extract_metrics_negative_total_fallback() {
        let tokens = TokenData {
            total: Some(-1),
            input: Some(10),
            output: Some(20),
            reasoning: None,
            cache: None,
        };
        let m = extract_metrics(Some(&tokens), None, false);
        assert_eq!(m.total, 30); // fallback to computed
    }

    #[test]
    fn test_extract_metrics_no_time() {
        let tokens = TokenData {
            total: Some(100),
            input: Some(50),
            output: Some(50),
            reasoning: None,
            cache: None,
        };
        let m = extract_metrics(Some(&tokens), None, false);
        assert_eq!(m.runtime, 0);
    }

    #[test]
    fn test_extract_metrics_zero_created() {
        let tokens = TokenData {
            total: Some(100),
            input: Some(100),
            output: None,
            reasoning: None,
            cache: None,
        };
        let time = TimeData {
            created: Some(0),
            completed: Some(5000),
        };
        let m = extract_metrics(Some(&tokens), Some(&time), false);
        assert_eq!(m.runtime, 0); // created is 0, no valid interval
    }

    #[test]
    fn test_extract_metrics_completed_before_created() {
        let tokens = TokenData {
            total: Some(100),
            input: Some(100),
            output: None,
            reasoning: None,
            cache: None,
        };
        let time = TimeData {
            created: Some(5000),
            completed: Some(1000),
        };
        let m = extract_metrics(Some(&tokens), Some(&time), false);
        assert_eq!(m.runtime, 0);
    }

    // ── merge_intervals ──────────────────────────────────────────────────

    #[test]
    fn test_merge_empty() {
        let mut intervals: Vec<(i64, i64)> = vec![];
        assert_eq!(merge_intervals(&mut intervals), 0);
    }

    #[test]
    fn test_merge_single() {
        let mut intervals = vec![(100, 200)];
        assert_eq!(merge_intervals(&mut intervals), 100);
    }

    #[test]
    fn test_merge_disjoint() {
        let mut intervals = vec![(100, 200), (300, 400), (500, 600)];
        assert_eq!(merge_intervals(&mut intervals), 300); // 100 + 100 + 100
    }

    #[test]
    fn test_merge_overlapping() {
        let mut intervals = vec![(100, 250), (200, 300), (290, 400)];
        assert_eq!(merge_intervals(&mut intervals), 300); // merged: (100, 400)
    }

    #[test]
    fn test_merge_adjacent() {
        let mut intervals = vec![(100, 200), (200, 300)];
        assert_eq!(merge_intervals(&mut intervals), 200); // adjacent overlaps at boundary
    }

    #[test]
    fn test_merge_contained() {
        let mut intervals = vec![(100, 500), (200, 300)];
        assert_eq!(merge_intervals(&mut intervals), 400); // (200,300) fully contained
    }

    #[test]
    fn test_merge_unsorted_input() {
        let mut intervals = vec![(500, 600), (100, 200), (300, 400)];
        assert_eq!(merge_intervals(&mut intervals), 300);
    }

    #[test]
    fn test_merge_duplicate_intervals() {
        let mut intervals = vec![(100, 200), (100, 200), (100, 200)];
        assert_eq!(merge_intervals(&mut intervals), 100); // all identical
    }

    // ── Metrics::add ─────────────────────────────────────────────────────

    #[test]
    fn test_metrics_add() {
        let mut a = Metrics {
            total: 100,
            active: 50,
            input: 30,
            output: 20,
            reasoning: 0,
            cache_read: 50,
            cache_write: 0,
            runtime: 1000,
            runtime_dedup: 800,
            user_message_count: 5,
        };
        let b = Metrics {
            total: 200,
            active: 100,
            input: 60,
            output: 40,
            reasoning: 0,
            cache_read: 100,
            cache_write: 0,
            runtime: 2000,
            runtime_dedup: 1500,
            user_message_count: 10,
        };
        a.add(&b);
        assert_eq!(a.total, 300);
        assert_eq!(a.active, 150);
        assert_eq!(a.input, 90);
        assert_eq!(a.output, 60);
        assert_eq!(a.cache_read, 150);
        assert_eq!(a.runtime, 3000);
        assert_eq!(a.runtime_dedup, 2300);
        assert_eq!(a.user_message_count, 15);
    }

    #[test]
    fn test_metrics_default() {
        let m = Metrics::default();
        assert_eq!(m.total, 0);
        assert_eq!(m.active, 0);
        assert_eq!(m.input, 0);
        assert_eq!(m.output, 0);
        assert_eq!(m.reasoning, 0);
        assert_eq!(m.cache_read, 0);
        assert_eq!(m.cache_write, 0);
        assert_eq!(m.runtime, 0);
        assert_eq!(m.runtime_dedup, 0);
        assert_eq!(m.user_message_count, 0);
    }

    // ── resolve_day_window ───────────────────────────────────────────────

    #[test]
    fn test_resolve_day_window_all() {
        let (first, last) = resolve_day_window(
            Some("2026-01-01"),
            Some("2026-05-30"),
            Some("all"),
        );
        assert_eq!(first.as_deref(), Some("2026-01-01"));
        assert_eq!(last.as_deref(), Some("2026-05-30"));
    }

    #[test]
    fn test_resolve_day_window_none_range() {
        let (first, last) = resolve_day_window(
            Some("2026-01-01"),
            Some("2026-05-30"),
            None,
        );
        assert_eq!(first.as_deref(), Some("2026-01-01"));
        assert_eq!(last.as_deref(), Some("2026-05-30"));
    }

    #[test]
    fn test_resolve_day_window_7_days() {
        let (first, last) = resolve_day_window(
            Some("2026-05-20"),
            Some("2026-05-30"),
            Some("7"),
        );
        assert_eq!(first.as_deref(), Some("2026-05-24")); // 30 - 6 = 24
        assert_eq!(last.as_deref(), Some("2026-05-30"));
    }

    #[test]
    fn test_resolve_day_window_range_larger_than_span() {
        // range=365 but data only spans 10 days → first_day unchanged
        let (first, last) = resolve_day_window(
            Some("2026-05-20"),
            Some("2026-05-30"),
            Some("365"),
        );
        // selected_start = max(2026-05-20, 2026-05-30 - 364 days) = 2026-05-20
        assert_eq!(first.as_deref(), Some("2026-05-20"));
        assert_eq!(last.as_deref(), Some("2026-05-30"));
    }

    #[test]
    fn test_resolve_day_window_missing_days() {
        let (first, last) = resolve_day_window(None, Some("2026-05-30"), Some("7"));
        assert_eq!(first, None);
        assert_eq!(last.as_deref(), Some("2026-05-30"));
    }

    #[test]
    fn test_resolve_day_window_both_none() {
        let (first, last) = resolve_day_window(None, None, Some("7"));
        assert_eq!(first, None);
        assert_eq!(last, None);
    }

    #[test]
    fn test_resolve_day_window_invalid_range() {
        let (first, last) = resolve_day_window(
            Some("2026-05-20"),
            Some("2026-05-30"),
            Some("abc"),
        );
        // "abc".parse::<u32>() fails → treated as 0 → max(1, 0) = 1
        // selected_start = max(2026-05-20, 2026-05-30 - 0 days) = 2026-05-30
        assert_eq!(first.as_deref(), Some("2026-05-30"));
        assert_eq!(last.as_deref(), Some("2026-05-30"));
    }

    // ── format_day ───────────────────────────────────────────────────────

    #[test]
    fn test_format_day() {
        // Use a timestamp we know is today: 1780123647 is 2026-05-30 in +08:00
        let ts_ms = 1_780_123_647_000i64;
        let day = format_day(ts_ms);
        assert!(day.starts_with("2026-05-3"), "got: {day}");
    }

    // ── JSON deserialization ─────────────────────────────────────────────

    #[test]
    fn test_message_data_deserialize() {
        let raw = r#"{
            "role": "assistant",
            "modelID": "glm-5",
            "providerID": "zhipuai-coding-plan",
            "tokens": {
                "total": 9756,
                "input": 9229,
                "output": 79,
                "reasoning": 0,
                "cache": { "read": 448, "write": 0 }
            },
            "time": { "created": 1771425275634, "completed": 1771425283771 }
        }"#;
        let msg: MessageData = serde_json::from_str(raw).unwrap();
        assert_eq!(msg.role.as_deref(), Some("assistant"));
        assert_eq!(msg.model_id.as_deref(), Some("glm-5"));
        assert_eq!(msg.provider_id.as_deref(), Some("zhipuai-coding-plan"));

        let tokens = msg.tokens.as_ref().unwrap();
        assert_eq!(tokens.total, Some(9756));
        assert_eq!(tokens.input, Some(9229));
        assert_eq!(tokens.cache.as_ref().unwrap().read, Some(448));
    }

    #[test]
    fn test_message_data_minimal() {
        let raw = r#"{"role": "user"}"#;
        let msg: MessageData = serde_json::from_str(raw).unwrap();
        assert_eq!(msg.role.as_deref(), Some("user"));
        assert!(msg.tokens.is_none());
        assert!(msg.time.is_none());
        assert!(msg.model_id.is_none());
    }

    // ── JSON serialization (snake_case for metrics, camelCase for meta) ──

    #[test]
    fn test_metrics_serialization_snake_case() {
        let m = Metrics {
            total: 100,
            active: 50,
            input: 30,
            output: 20,
            reasoning: 0,
            cache_read: 50,
            cache_write: 0,
            runtime: 1000,
            runtime_dedup: 800,
            user_message_count: 5,
        };
        let json = serde_json::to_value(&m).unwrap();
        assert_eq!(json["total"], 100);
        assert_eq!(json["cache_read"], 50);
        assert_eq!(json["runtime_dedup"], 800);
        assert_eq!(json["user_message_count"], 5);
        // Must NOT be camelCase
        assert!(json.get("cacheRead").is_none());
        assert!(json.get("runtimeDedup").is_none());
    }

    #[test]
    fn test_meta_serialization_camel_case() {
        let m = Meta {
            database: "opencode.db".into(),
            database_path: "/path/to/opencode.db".into(),
            generated_at: "2026-05-30T14:00:00+08:00".into(),
            timezone: "+08:00".into(),
            first_day: Some("2026-05-01".into()),
            last_day: Some("2026-05-30".into()),
            available_first_day: Some("2026-01-01".into()),
            available_last_day: Some("2026-05-30".into()),
            range: "30".into(),
            assistant_message_count: 100,
            scanned_rows: 200,
        };
        let json = serde_json::to_value(&m).unwrap();
        assert_eq!(json["databasePath"], "/path/to/opencode.db");
        assert_eq!(json["generatedAt"], "2026-05-30T14:00:00+08:00");
        assert_eq!(json["firstDay"], "2026-05-01");
        assert_eq!(json["availableLastDay"], "2026-05-30");
        assert_eq!(json["assistantMessageCount"], 100);
        assert_eq!(json["scannedRows"], 200);
        // Must NOT be snake_case
        assert!(json.get("database_path").is_none());
        assert!(json.get("first_day").is_none());
    }

    #[test]
    fn test_day_entry_serialization() {
        let entry = DayEntry {
            date: "2026-05-30".into(),
            metrics: Metrics {
                total: 100,
                active: 50,
                input: 30,
                output: 20,
                reasoning: 0,
                cache_read: 50,
                cache_write: 0,
                runtime: 1000,
                runtime_dedup: 800,
                user_message_count: 5,
            },
        };
        let json = serde_json::to_value(&entry).unwrap();
        assert_eq!(json["date"], "2026-05-30");
        assert_eq!(json["total"], 100);
        assert_eq!(json["cache_read"], 50);
        assert_eq!(json["user_message_count"], 5);
    }

    // ── aggregate_usage with real DB ─────────────────────────────────────

    #[test]
    fn test_aggregate_usage_all() {
        let db_path = discover_database().expect("need opencode.db for integration test");
        let payload = aggregate_usage(&db_path, None).expect("aggregate should succeed");

        // Basic structural assertions
        assert!(payload.summary.total > 0, "total tokens should be > 0");
        assert!(payload.summary.input > 0, "input tokens should be > 0");
        assert!(!payload.days.is_empty(), "should have some days");
        assert!(!payload.models.is_empty(), "should have some models");
        assert!(!payload.providers.is_empty(), "should have some providers");

        // Meta checks
        assert_eq!(payload.meta.range, "all");
        assert!(payload.meta.first_day.is_some());
        assert!(payload.meta.last_day.is_some());
        assert!(payload.meta.scanned_rows > 0);

        // Days should be sorted
        for window in payload.days.windows(2) {
            assert!(window[0].date <= window[1].date, "days should be sorted");
        }

        // Models should be sorted by total desc
        for window in payload.models.windows(2) {
            assert!(
                window[0].metrics.total >= window[1].metrics.total,
                "models sorted by total desc"
            );
        }
    }

    #[test]
    fn test_aggregate_usage_range_7() {
        let db_path = discover_database().expect("need opencode.db");
        let payload = aggregate_usage(&db_path, Some("7")).expect("aggregate should succeed");

        assert_eq!(payload.meta.range, "7");
        // range=7 now uses hourly granularity: up to 7*24 = 168 hourly buckets
        assert!(
            payload.days.len() <= 168,
            "range=7 should have ≤ 168 hourly buckets, got {}",
            payload.days.len()
        );
        // Each entry's date should be in hourly format "YYYY-MM-DDTHH"
        for day in &payload.days {
            assert!(
                day.date.contains('T'),
                "range=7 entries should use hourly format, got: {}",
                day.date
            );
        }
        // Heatmap stream: hourly granularity, 2-hour blocks (≤ 7*12 = 84 points).
        assert_eq!(payload.heatmap.granularity, HeatmapGranularity::Hourly);
        assert_eq!(payload.heatmap.interval_hours, 2);
        assert!(!payload.heatmap.data.is_empty(), "range=7 should produce heatmap data");
        assert!(
            payload.heatmap.data.len() <= 84,
            "range=7 heatmap should have ≤ 84 two-hour points, got {}",
            payload.heatmap.data.len()
        );
        for entry in &payload.heatmap.data {
            let hour = entry.date.split_once('T').and_then(|(_, h)| h.parse::<u32>().ok());
            assert_eq!(hour.map(|h| h % 2), Some(0u32), "heatmap block must start on a 2h boundary: {}", entry.date);
        }
    }

    #[test]
    fn test_aggregate_usage_range_30_daily_and_heatmap() {
        let db_path = discover_database().expect("need opencode.db");
        let payload = aggregate_usage(&db_path, Some("30")).expect("aggregate should succeed");

        assert_eq!(payload.meta.range, "30");
        // range=30 must stay DAILY (≤ 31 calendar-day buckets), unaffected by the heatmap stream.
        assert!(
            payload.days.len() <= 31,
            "range=30 days should be daily (≤ 31 buckets), got {}",
            payload.days.len()
        );
        for day in &payload.days {
            assert!(
                !day.date.contains('T'),
                "range=30 days must be daily format, got: {}",
                day.date
            );
        }
        // Heatmap: hourly granularity, 2-hour blocks (≤ 30*12 = 360 points).
        assert_eq!(payload.heatmap.granularity, HeatmapGranularity::Hourly);
        assert_eq!(payload.heatmap.interval_hours, 2);
        assert!(!payload.heatmap.data.is_empty(), "range=30 should produce heatmap data");
        assert!(
            payload.heatmap.data.len() <= 360,
            "range=30 heatmap should have ≤ 360 two-hour points, got {}",
            payload.heatmap.data.len()
        );
        for entry in &payload.heatmap.data {
            assert!(entry.date.contains('T'), "range=30 heatmap should be 2-hour blocks");
        }
        // runtime_dedup must be computed for the heatmap stream (interval merge),
        // otherwise the "runtime (deduped)" metric renders blank.
        let dedup_sum: i64 = payload.heatmap.data.iter().map(|d| d.metrics.runtime_dedup).sum();
        assert!(
            dedup_sum > 0,
            "range=30 heatmap runtime_dedup should be > 0 (got {dedup_sum})"
        );
    }

    #[test]
    fn test_aggregate_usage_range_90_heatmap_hourly() {
        let db_path = discover_database().expect("need opencode.db");
        let payload = aggregate_usage(&db_path, Some("90")).expect("aggregate should succeed");
        assert_eq!(payload.meta.range, "90");
        // range=90: `days` stays daily (≤ 91 buckets).
        assert!(
            payload.days.len() <= 91,
            "range=90 days should be daily (≤ 91 buckets), got {}",
            payload.days.len()
        );
        // range=90 (≤ 90): heatmap is hourly, 2-hour blocks (≤ 90*12 = 1080 points).
        assert_eq!(payload.heatmap.granularity, HeatmapGranularity::Hourly);
        assert_eq!(payload.heatmap.interval_hours, 2);
        assert!(!payload.heatmap.data.is_empty(), "range=90 should produce heatmap data");
        assert!(
            payload.heatmap.data.len() <= 1080,
            "range=90 heatmap should have ≤ 1080 two-hour points, got {}",
            payload.heatmap.data.len()
        );
        for entry in &payload.heatmap.data {
            assert!(entry.date.contains('T'), "range=90 heatmap should be 2-hour blocks");
        }
    }

    #[test]
    fn test_aggregate_usage_range_180_heatmap_daily() {
        let db_path = discover_database().expect("need opencode.db");
        let payload = aggregate_usage(&db_path, Some("180")).expect("aggregate should succeed");
        assert_eq!(payload.meta.range, "180");
        // range=180 (> 90): heatmap stream switches to DAILY granularity.
        assert_eq!(payload.heatmap.granularity, HeatmapGranularity::Daily);
        assert_eq!(payload.heatmap.interval_hours, 24);
        assert!(!payload.heatmap.data.is_empty(), "range=180 should produce heatmap data");
        assert!(
            payload.heatmap.data.len() <= 181,
            "range=180 heatmap should be daily (≤ 181 buckets), got {}",
            payload.heatmap.data.len()
        );
        for entry in &payload.heatmap.data {
            assert!(!entry.date.contains('T'), "range=180 heatmap should be daily");
        }
    }

    #[test]
    fn test_aggregate_usage_consistency() {
        // Summary should equal sum of all days
        let db_path = discover_database().expect("need opencode.db");
        let payload = aggregate_usage(&db_path, Some("30")).expect("aggregate should succeed");

        let mut total_from_days: i64 = 0;
        let mut input_from_days: i64 = 0;
        let mut user_msg_from_days: i64 = 0;
        for day in &payload.days {
            total_from_days += day.metrics.total;
            input_from_days += day.metrics.input;
            user_msg_from_days += day.metrics.user_message_count;
        }

        assert_eq!(payload.summary.total, total_from_days,
            "summary total should equal sum of day totals");
        assert_eq!(payload.summary.input, input_from_days,
            "summary input should equal sum of day inputs");
        assert_eq!(payload.summary.user_message_count, user_msg_from_days,
            "summary user_message_count should equal sum of day counts");
    }

    // ── HTTP handler tests (using axum test utilities) ───────────────────

    fn test_app() -> axum::Router {
        let state = Arc::new(AppState {
            cache: RwLock::new(HashMap::new()),
        });
        axum::Router::new()
            .route("/health", get(health))
            .route("/api/usage", get(api_usage))
            .with_state(state)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = test_app();
        let response = app
            .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["ok"], true);
    }

    #[tokio::test]
    async fn test_api_usage_endpoint() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/usage?range=7")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(json["summary"]["total"].as_i64().unwrap() > 0);
        assert_eq!(json["meta"]["range"], "7");
    }

    #[tokio::test]
    async fn test_api_usage_default_range() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/usage")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["meta"]["range"], "all");
    }
}
