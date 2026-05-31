# OpenCode Token Dashboard

一个本地网页看板，展示 OpenCode 每天的 Token 用量。

## 技术栈

- **后端**：Rust + Axum + rusqlite（`src/main.rs`）
- **前端**：React + TypeScript + Vite + shadcn/ui + ECharts
- **图表**：ECharts 5（趋势、组成、排行、分布）

## 功能

- 按天查看 token 趋势（主轴/副轴双线对比）
- Token 组成饼图（输入/输出/推理/缓存）
- 模型排行榜（Top 8 水平柱状图）
- Provider 分布饼图
- 切换指标：总量 / 活跃 / 输入 / 输出 / 推理 / 缓存 / 请求数 / 运行时长
- 时间范围筛选（7/30/90/180/365 天 / 全部）

## 开发

```bash
# 安装前端依赖
npm install

# 启动 Vite 开发服务器（自动代理 /api 到 Rust 后端）
npm run dev

# 在另一个终端启动 Rust 后端
cargo run

# 或者直接构建并启动
npm run build && cargo run
```

## 生产部署

```bash
npm run build       # 前端输出到 static/
cargo build --release  # 编译优化版后端
./target/release/opencode-token-dashboard
```

默认地址：`http://127.0.0.1:8765`

## 环境变量

```bash
HOST=0.0.0.0 PORT=9000 cargo run
```

## 说明

- 统计来源是 OpenCode 数据库里的 `message.data.tokens`
- 默认按 assistant 消息聚合
- 日期使用本机时区
- 当 `tokens.total` 缺失时，回退到各字段求和
- 响应带缓存，基于数据库文件 mtime + size 签名
