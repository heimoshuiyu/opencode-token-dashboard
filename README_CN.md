# OpenCode Token Dashboard

[English](README.md) | 中文

一个本地运行的 Token 用量看板，读取 [OpenCode](https://github.com/anomalyco/opencode) 的 SQLite 数据库，实时展示 Token 消耗趋势。

## 截图

![OpenCode Token Dashboard](https://github.com/heimoshuiyu/opencode-token-dashboard/releases/download/v1.3.0/screenshot-v1.3.0.jpg)

### 缓存未命中下钻

![缓存未命中下钻](https://github.com/heimoshuiyu/opencode-token-dashboard/releases/download/v1.3.0/session-detail-light.png)

## 功能

- **趋势图** — 按天/小时查看 Token 用量变化，支持 7 天（小时粒度）和 30/90/180/365 天/全部（天粒度）
- **汇总卡片** — 总量、活跃量、输入/输出/推理/缓存、请求数、运行时长
- **组成分析** — 饼图展示输入/输出/推理/缓存占比
- **模型排行** — Top 8 水平柱状图
- **Provider 分布** — 各服务商用量占比
- **缓存未命中分析** — 专图展示相邻请求间未命中的 token 数；点击数据点下钻到当天会话明细与逐条缓存生命周期
- **去重运行时长** — 合并重叠时间区间，精确统计实际运行时间
- **i18n** — 中文/英文切换
- **暗色主题** — 跟随系统

### 关于缓存未命中

**为什么用「未命中 Tokens」替代「命中率」**

缓存命中率是一个百分比，会随用户的使用模式（上下文长度、工具调用频率）而波动——
长上下文天然拉低命中率，但这反映的是使用方式，而非 provider 自身的缓存能力。
未命中 Tokens 直接度量「应被缓存却被重复处理的 token 绝对数」，
不受归一化干扰，能更干净地反映 provider 的真实缓存表现。

**现状：不同模型的缓存能力差异巨大**

基于本看板作者的实际使用数据（167,000+ 条消息，覆盖 60+ 个模型）：

- **缓存覆盖率**：主力 glm-5.1 在约 80% 的相邻请求中达到完全命中，
  剩余约 20% 存在真实缺口（会话开头几条缓存尚未建立、工具结果插入导致缓存失效等）。
- **输出侧缓存复用**：上一条消息的输出（模型的回复内容）能否被下一条请求从缓存中读回，
  而不是重新计算一遍——这是**模型级的差异**。

**哪些模型开启了输出侧缓存，哪些没有**

输出侧缓存复用已被主流推理引擎（vLLM、SGLang）原生支持，技术上对任何 provider 都可行。
但实际数据表明，只有部分模型启用了这一能力：

| 开启输出侧缓存 | 未开启 |
|---|---|
| DeepSeek-v4（85% 的对话复用了输出） | glm-5.1（< 1%） |
| GLM-4.7（63%，官方"保留式思考"特性） | glm-5.2（< 1%） |
| minimax-m3（76%） | glm-5（< 1%） |
| gpt-5.4（51%） | gpt-5.5（0.3%） |
| gpt-5.3-codex（42%） | pony-alpha-2（< 1%） |

DeepSeek 官方文档明确写道：在"模型输出末尾"也会建立缓存单元，
使下一轮请求能直接复用上一轮的完整上下文。

**为什么未命中在正常情况下应该等于零**

每次请求都会把上一轮的完整对话（包括模型的回复）作为输入重新发送。
理想情况下，provider 应该把这些已处理过的内容直接从缓存中读回，
不需要重新计算——此时未命中为零。
未命中大于零意味着一部分本应直接复用的内容被重新处理了一遍，
用户需要为这些多余的 token 付费，响应也会更慢。
因此**未命中 token 越少越好**。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Rust + Axum + rusqlite（bundled SQLite） |
| 前端 | React 19 + TypeScript + Vite 8 |
| UI | shadcn/ui + Radix + Tailwind CSS v4 |
| 图表 | Recharts |
| 嵌入 | rust-embed（编译时打包前端资源到二进制） |

## 快速开始

### 前置要求

- [Rust](https://rustup.rs/) (edition 2024)
- [Node.js](https://nodejs.org/) ≥ 20
- [OpenCode](https://github.com/anomalyco/opencode) 已安装并使用过（需要 `~/.local/share/opencode/opencode.db`）

### 开发模式

```bash
# 安装前端依赖
npm install

# 启动 Vite 开发服务器（端口 5173，自动代理 /api 到后端）
npm run dev

# 另一个终端启动 Rust 后端
cargo run
```

开发时前端通过 Vite dev server 提供，API 请求代理到后端。

### 生产构建

```bash
# 1. 构建前端 → 输出到 static/
npm run build

# 2. 构建后端（自动将 static/ 嵌入二进制）
cargo build --release

# 3. 运行（单文件部署，无需 static/ 目录）
./target/release/opencode-token-dashboard
```

打开浏览器访问 `http://127.0.0.1:8765`。

### 交叉编译 Windows

```bash
rustup target add x86_64-pc-windows-gnu
npm run build
cargo build --release --target x86_64-pc-windows-gnu
# 产物: target/x86_64-pc-windows-gnu/release/opencode-token-dashboard.exe
```

Windows 版本启动后会自动打开浏览器。数据目录为 `%USERPROFILE%\.local\share\opencode\`。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `8765` | 监听端口 |
| `STATIC_DIR` | — | 设为任意值启用文件系统静态资源（开发热更新用） |

```bash
HOST=0.0.0.0 PORT=9000 ./target/release/opencode-token-dashboard
```

## 项目结构

```
opencode-token-dashboard/
├── src/
│   ├── main.rs              # Rust 后端（聚合、API、静态资源服务）
│   ├── main.tsx             # React 入口
│   ├── App.tsx              # 主应用组件
│   ├── types.ts             # TypeScript 类型定义
│   ├── components/
│   │   ├── hero-section.tsx    # 顶部信息栏
│   │   ├── summary-cards.tsx   # 汇总卡片
│   │   ├── trend-chart.tsx     # 趋势折线图
│   │   ├── composition-chart.tsx # Token 组成饼图
│   │   ├── model-chart.tsx     # 模型排行柱状图
│   │   ├── provider-chart.tsx  # Provider 分布饼图
│   │   ├── theme-provider.tsx  # 主题切换
│   │   └── ui/                 # shadcn/ui 组件
│   ├── hooks/
│   │   └── use-usage.ts        # 数据获取 hook
│   └── lib/
│       ├── format.ts           # 格式化工具
│       ├── utils.ts            # 通用工具
│       └── i18n/               # 国际化
├── Cargo.toml
├── package.json
└── vite.config.ts
```

## 缓存未命中 Tokens

### 为什么用「未命中 Tokens」而不是「命中率」

旧版本展示的是「缓存命中率」，定义为
`(cache_read + cache_write) / (input + cache_read + cache_write)`。

它有一个根本问题：**这个比率会随用户的使用模式和上下文长度而波动**。例如，用户每轮都注入大量新内容（长上下文）会显著拉低命中率——但这反映的是使用方式，而非 agent harness 或 provider 自身的缓存能力。比率把「上下文规模」和「缓存质量」混在一起，无法干净地反映后两者真正的问题。

因此改为「缓存未命中 Tokens」：统计相邻请求之间**应命中却没命中**的 token 绝对数。它直接度量被重复处理、被浪费的 token，不受上下文长度归一化的干扰，更能真实反映 harness / provider 的缓存表现。

### 计算方法

在同一会话内，取**时间相邻**的两条 assistant 消息 `(prev → cur)`，当同时满足：

- 同一 model、同一 provider（缓存按模型 / 服务商隔离）
- `prev.cache_read > 0`（prev 不是冷启动——冷启动的上下文从未进缓存，cur 读不到不算 miss；覆盖会话首条、压缩后首条、以及完全不缓存的 provider）
- 两者之间没有发生 compaction（压缩会重写上下文）
- 两条消息都有真实 token 用量（排除被中止 / 出错、token 全为 0 的消息）

时：

```
expected = prev.total                              # 上一条的完整上下文，本应被缓存
miss     = max(0, prev.total − cur.cache_read)     # 应命中却没命中的部分
total    = input + output + reasoning + cache_read + cache_write
```

`miss` 与 `expected` 都是可加的 token 计数，按 **天 / 会话 / provider / model** 聚合。

### 基准为何包含输出侧（`prev.total`）

注意上面 `expected = prev.total` 用的是上一条的**完整上下文（输入 + 输出 + 推理）**，不只是输入侧。原因：

- 按 API 规范，显式缓存（`cache_control`）只缓存输入前缀；但**底层 KV 缓存（含 decode / 输出阶段的 KV）在主流推理引擎里都会跨请求复用**——vLLM（Automatic Prefix Caching）、SGLang（RadixAttention，明确「保留 prompt 与 generation results 的 KV」）、DeepSeek（官方文档：在「模型输出末尾」也建缓存单元）均原生支持。
- 因此「输出侧也该被缓存」在引擎层面是**技术上可达的标杆**，并非苛求。DeepSeek、GLM-4.7（「保留式思考」）等会复用输出 KV；glm-5.x、gpt-5.5 等则不复用——**这是 provider / 模型是否启用的差异**。
- 用 `prev.total` 当基准：复用输出的模型 `cache_read ≈ prev.total` → miss 趋近 0（被奖励）；不复用的模型，其输出每轮被重新 prefill = **用户真在付的钱**，诚实计入 miss。

一句话：这个 miss 含「输出侧未被复用」的部分，反映的是**真实重复处理的 token 浪费**，并让缓存做得好的 provider 自然凸显。

### 为什么越接近零越好

理想情况下，`cur` 会从缓存读回 `prev` 的全部上下文（`cache_read ≈ prev.total`），此时 `miss ≈ 0`。`miss > 0` 意味着一部分本应命中的上下文没有走缓存、被重新处理，直接带来更高的 token 消耗与延迟。因此**未命中 token 越少越好**。

> 注：聚合后的总 miss 会随使用量增长，所以「越接近零」主要体现在**单次相邻请求 / 单会话**层面。实际中未命中通常来自：会话开头几条的缓存预热（warmup）、tool 结果插入导致缓存后缀失效、或 provider 不支持缓存 / 不复用输出侧 KV。点击专图上的数据点可下钻查看该天的会话明细与逐条缓存生命周期。

## 统计说明

- 数据来源：OpenCode 数据库中 `message` 表的 `data.tokens` 字段
- 统计范围：assistant 消息（排除 `.opencode` 内部会话）
- 子 agent 的 Token 计入统计，运行时长不计入（避免重复）
- 日期/时间使用本机时区
- 当 `tokens.total` 缺失或 ≤ 0 时，回退到 `input + output + reasoning + cache_read + cache_write` 求和
- 7 天范围使用小时粒度，自动填充缺失时段；其他范围按天填充
- API 响应带缓存，基于数据库文件的 mtime + size 签名，数据不变时直接返回缓存

## License

MIT
