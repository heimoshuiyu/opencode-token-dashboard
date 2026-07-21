# OpenCode Token Dashboard

English | [中文文档](README_CN.md)

A locally-run Token usage dashboard that reads [OpenCode's](https://github.com/anomalyco/opencode) SQLite database to visualize Token consumption trends in real time.

## Screenshots

![OpenCode Token Dashboard](https://github.com/heimoshuiyu/opencode-token-dashboard/releases/download/v1.3.0/screenshot-v1.3.0.jpg)

### Cache Miss Drill-down

![Cache Miss Drill-down](https://github.com/heimoshuiyu/opencode-token-dashboard/releases/download/v1.3.0/session-detail-light.png)

## Features

- **Trend Chart** — View Token usage by day/hour, supporting 7 days (hourly granularity) and 30/90/180/365 days/all (daily granularity)
- **Summary Cards** — Total, active, input/output/reasoning/cache, request count, runtime
- **Composition Analysis** — Pie charts showing input/output/reasoning/cache proportions
- **Model Leaderboard** — Top 8 horizontal bar chart
- **Provider Distribution** — Usage share across providers
- **Cache Miss Analysis** — Dedicated chart showing missed cache tokens between consecutive requests; click a data point to drill down into that day's sessions and per-message cache lifecycle
- **Deduplicated Runtime** — Merges overlapping time intervals for accurate actual runtime
- **i18n** — Chinese/English toggle
- **Dark Theme** — Follows system preference

### About Cache Miss

**Why "Missed Tokens" instead of "Hit Rate"**

Cache hit rate is a percentage that fluctuates with usage patterns (context length, tool call frequency) — long contexts naturally lower the hit rate, but that reflects usage style, not the provider's caching capability. Missed Tokens directly measures "the absolute number of tokens that should have been cached but were reprocessed", immune to normalization artifacts, giving a cleaner picture of real caching performance.

**Current State: Massive Variation Across Models**

Based on the dashboard author's real usage data (167,000+ messages, covering 60+ models):

- **Cache coverage**: The primary model glm-5.1 achieves full cache hits in ~80% of consecutive request pairs, with the remaining ~20% showing real gaps (cache not yet established in the first few messages of a session, tool result insertions invalidating cache suffixes, etc.).
- **Output-side cache reuse**: Whether the previous message's output (the model's reply) can be read back from cache by the next request, instead of being recomputed — this is a **model-level difference**.

**Which Models Have Output-Side Caching Enabled, and Which Don't**

Output-side cache reuse is natively supported by mainstream inference engines (vLLM, SGLang), making it technically feasible for any provider. However, real-world data shows only some models have enabled this capability:

| Output-Side Caching Enabled | Not Enabled |
|---|---|
| DeepSeek-v4 (85% of conversations reuse output) | glm-5.1 (< 1%) |
| GLM-4.7 (63%, official "retained thinking" feature) | glm-5.2 (< 1%) |
| minimax-m3 (76%) | glm-5 (< 1%) |
| gpt-5.4 (51%) | gpt-5.5 (0.3%) |
| gpt-5.3-codex (42%) | pony-alpha-2 (< 1%) |

DeepSeek's official documentation explicitly states that a cache prefix unit is created at "the end of model output", allowing the next request to directly reuse the previous round's full context.

**Why Miss Should Be Zero Under Normal Conditions**

Every request re-sends the previous round's complete conversation (including the model's reply) as input. Ideally, the provider should read all previously-processed content directly from cache without recomputing — at which point miss is zero. A miss greater than zero means some content that should have been reused was recomputed, and the user pays for those wasted tokens with both higher cost and slower responses. Therefore, **the fewer missed tokens, the better**.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Rust + Axum + rusqlite (bundled SQLite) |
| Frontend | React 19 + TypeScript + Vite 8 |
| UI | shadcn/ui + Radix + Tailwind CSS v4 |
| Charts | Recharts |
| Embedding | rust-embed (bundles frontend assets into the binary at compile time) |

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (edition 2024)
- [Node.js](https://nodejs.org/) ≥ 20
- [OpenCode](https://github.com/anomalyco/opencode) installed and used at least once (V1 and V2 databases are supported)

### Development Mode

```bash
# Install frontend dependencies
npm install

# Start Vite dev server (port 5173, auto-proxies /api to backend)
npm run dev

# In another terminal, start the Rust backend
cargo run
```

During development, the frontend is served by the Vite dev server, and API requests are proxied to the backend.

### Production Build

```bash
# 1. Build frontend → outputs to static/
npm run build

# 2. Build backend (automatically embeds static/ into the binary)
cargo build --release

# 3. Run (single-file deployment, no static/ directory needed)
./target/release/opencode-token-dashboard
```

Open your browser to `http://127.0.0.1:8765`.

### Cross-Compiling for Windows

```bash
rustup target add x86_64-pc-windows-gnu
npm run build
cargo build --release --target x86_64-pc-windows-gnu
# Output: target/x86_64-pc-windows-gnu/release/opencode-token-dashboard.exe
```

The Windows build automatically opens a browser on launch. The data directory is `%USERPROFILE%\.local\share\opencode\`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HOST` | `127.0.0.1` | Listen address |
| `PORT` | `8765` | Listen port |
| `STATIC_DIR` | — | Set to any value to enable filesystem-based static assets (for dev hot-reload) |
| `OPENCODE_DB_PATH` | auto-detected | Explicit OpenCode SQLite database path |

```bash
HOST=0.0.0.0 PORT=9000 ./target/release/opencode-token-dashboard
```

OpenCode V2 development channels may use names such as `opencode-local.db`. The dashboard automatically discovers **all** `opencode*.db` files in the data directory and merges their history — different channels' session IDs are non-overlapping, so totals are summed without double-counting. The most recently active database is listed first. Set `OPENCODE_DB_PATH` when you want to restrict the dashboard to a single channel:

```bash
OPENCODE_DB_PATH="$HOME/.local/share/opencode/opencode-local.db" ./target/release/opencode-token-dashboard
```

## Project Structure

```
opencode-token-dashboard/
├── src/
│   ├── main.rs              # Rust backend (aggregation, API, static asset serving)
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Main app component
│   ├── types.ts             # TypeScript type definitions
│   ├── components/
│   │   ├── hero-section.tsx    # Top info bar
│   │   ├── summary-cards.tsx   # Summary cards
│   │   ├── trend-chart.tsx     # Trend line chart
│   │   ├── composition-chart.tsx # Token composition pie charts
│   │   ├── model-chart.tsx     # Model leaderboard bar chart
│   │   ├── provider-chart.tsx  # Provider distribution pie chart
│   │   ├── theme-provider.tsx  # Theme switcher
│   │   └── ui/                 # shadcn/ui components
│   ├── hooks/
│   │   └── use-usage.ts        # Data fetching hook
│   └── lib/
│       ├── format.ts           # Formatting utilities
│       ├── utils.ts            # General utilities
│       └── i18n/               # Internationalization
├── Cargo.toml
├── package.json
└── vite.config.ts
```

## Cache Miss Tokens

### Why "Missed Tokens" Instead of "Hit Rate"

The previous version displayed "cache hit rate", defined as
`(cache_read + cache_write) / (input + cache_read + cache_write)`.

This has a fundamental problem: **the ratio fluctuates with the user's usage patterns and context length**. For example, injecting large amounts of new content each turn (long context) significantly lowers the hit rate — but that reflects usage style, not the caching capability of the agent harness or provider. The ratio conflates "context scale" with "cache quality", making it impossible to cleanly isolate the latter.

We therefore switched to "Cache Miss Tokens": counting the absolute number of tokens that **should have been cached but weren't** between consecutive requests. This directly measures reprocessed, wasted tokens without context-length normalization interference, providing a truer reflection of caching performance.

### Calculation

Within a single session, take **two temporally adjacent** assistant messages `(prev → cur)`. When all of the following conditions are met:

- Same model and same provider (caching is isolated per model/provider)
- `prev.cache_read > 0` (prev is not a cold start — a cold start's context was never cached, so cur not reading it isn't a miss; covers session first messages, post-compaction first messages, and non-caching providers)
- No compaction occurred between the two (compaction rewrites the context)
- Both messages have real token usage (excludes aborted/errored messages with all-zero tokens)

Then:

```
expected = prev.total                              # Previous message's full context, should have been cached
miss     = max(0, prev.total − cur.cache_read)     # The portion that should have hit but didn't
total    = input + output + reasoning + cache_read + cache_write
```

Both `miss` and `expected` are additive token counts, aggregated by **day / session / provider / model**.

### Why the Baseline Includes Output-Side (`prev.total`)

Note that `expected = prev.total` uses the previous message's **complete context (input + output + reasoning)**, not just the input side. The reasons:

- Per the API spec, explicit caching (`cache_control`) only caches the input prefix; but **the underlying KV cache (including decode/output-phase KV) is reused across requests by mainstream inference engines** — vLLM (Automatic Prefix Caching), SGLang (RadixAttention, which explicitly "retains the KV cache for both prompts and generation results"), and DeepSeek (official docs: creates a cache prefix unit at "the end of model output") all support this natively.
- Therefore, "the output side should also be cached" is a **technically achievable standard** at the engine level, not an unreasonable demand. DeepSeek, GLM-4.7 ("retained thinking"), and others reuse output KV; glm-5.x, gpt-5.5, and others do not — **this is a difference in whether the provider/model has enabled it**.
- Using `prev.total` as the baseline: models that reuse output have `cache_read ≈ prev.total` → miss approaches zero (rewarded); models that don't reuse have their output recomputed each turn = **real money the user is paying**, honestly counted as miss.

In short: this miss includes the "output-side not reused" portion, reflecting **real reprocessing waste**, and naturally highlights providers with better caching.

### Why Closer to Zero Is Better

Ideally, `cur` reads back all of `prev`'s context from cache (`cache_read ≈ prev.total`), making `miss ≈ 0`. `miss > 0` means some context that should have been cached was not, and was instead reprocessed, directly resulting in higher token consumption and latency. Therefore, **the fewer missed tokens, the better**.

> Note: The aggregated total miss grows with usage volume, so "closer to zero" primarily applies at the **single-pair / single-session** level. In practice, misses typically come from: cache not yet established in the first few messages of a session, tool result insertions invalidating cache suffixes, or providers not supporting caching / not reusing output-side KV. Click a data point on the chart to drill down into that day's session details and per-message cache lifecycle.

## Statistics Notes

- Data source: `message.data.tokens` on OpenCode V1, or `session_message.data.tokens` on OpenCode V2
- Scope: Assistant messages (excludes `.opencode` internal sessions)
- Sub-agent tokens are counted; runtime is not (to avoid duplication)
- Dates/times use the local timezone
- When `tokens.total` is missing or ≤ 0, falls back to summing `input + output + reasoning + cache_read + cache_write`
- 7-day range uses hourly granularity with automatic gap-filling; other ranges use daily granularity
- API responses are cached based on database and WAL mtime + size signatures; unchanged data returns cached results

## License

MIT
