# OpenCode Token Dashboard

一个本地运行的 Token 用量看板，读取 [OpenCode](https://github.com/anomalyco/opencode) 的 SQLite 数据库，实时展示 Token 消耗趋势。

## 截图

![OpenCode Token Dashboard](https://github.com/heimoshuiyu/opencode-token-dashboard/releases/download/v1.2.0/screenshot.jpg)

## 功能

- **趋势图** — 按天/小时查看 Token 用量变化，支持 7 天（小时粒度）和 30/90/180/365 天/全部（天粒度）
- **汇总卡片** — 总量、活跃量、输入/输出/推理/缓存、请求数、运行时长
- **组成分析** — 饼图展示输入/输出/推理/缓存占比
- **模型排行** — Top 8 水平柱状图
- **Provider 分布** — 各服务商用量占比
- **去重运行时长** — 合并重叠时间区间，精确统计实际运行时间
- **i18n** — 中文/英文切换
- **暗色主题** — 跟随系统

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

## API

### `GET /api/usage?range={range}`

返回 Token 用量统计。

**参数：**

| range | 说明 | 粒度 |
|---|---|---|
| `7` | 最近 7 天 | 小时 |
| `30` / `90` / `180` / `365` | 对应天数 | 天 |
| `all` / 缺省 | 全部数据 | 天 |

**响应示例：**

```json
{
  "meta": {
    "database": "opencode.db",
    "range": "7",
    "firstDay": "2026-05-24",
    "lastDay": "2026-05-30"
  },
  "summary": {
    "total": 1234567,
    "active": 800000,
    "input": 600000,
    "output": 150000,
    "reasoning": 50000,
    "cache_read": 400000,
    "cache_write": 34567,
    "runtime": 3600000,
    "runtime_dedup": 2400000,
    "user_message_count": 500
  },
  "days": [...],
  "models": [...],
  "providers": [...]
}
```

### `GET /health`

健康检查，返回 `{"ok": true}`。

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
