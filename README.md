# Photoer

摄影分享平台——分享日常瞬间与拍摄地点推荐。个人开发者项目，产品与技术决策记录在 [`docs/`](docs/)。

## 技术栈

- **后端**（仓库根目录）：Node.js + Express、MySQL、Redis。认证方案是 Session + Redis + HttpOnly Cookie（不是 JWT，见 `docs/decisions.md` ADR-003）
- **前端**（[`web/`](web/)）：Next.js（App Router）+ React + Tailwind CSS，独立的项目，通过 HTTP 调用后端的 JSON API

前后端是两个完全独立的进程，不是同一个全栈项目。本地开发需要**同时手动启动两个**：

```bash
# 终端 A：后端（根目录）
npm start

# 终端 B：前端
cd web
npm run dev
```

前端固定跑在 `http://localhost:3000`，后端跑在 `.env` 里 `PORT` 指定的端口（当前是 3001）。浏览器只需要访问前端的 3000，前端会把 `/api/*` 请求自动代理到后端，不会有跨域问题（配置在 `web/next.config.mjs`）。

## 初始化步骤

1. 复制 `.env` 所需的配置项（`DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`、`PORT`、`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`/`REDIS_DB`），本地需要有可用的 MySQL 和 Redis
2. 安装依赖：根目录 `npm install`，`web/` 目录下再 `npm install`
3. 执行数据库迁移：`npm run migrate`（`npm run migrate:status` 查看迁移状态，`npm run migrate:rollback` 回滚最后一次）
4. 按上面"技术栈"里的两条命令分别启动前后端

## 目录结构

```
Photoer/
├── docs/            # 产品与技术决策文档（ADR、数据库设计、命名规范等）
├── migrations/       # 数据库迁移文件
├── src/              # 后端源码（Express）
└── web/               # 前端源码（Next.js，独立项目）
```

## 当前状态

目前只实现了账号系统（注册、密码/验证码登录、忘记密码），摄影分享相关的核心功能（照片上传、展示、地点推荐等）还未开始。已知问题和技术债记录在 `docs/decisions.md` 末尾。
