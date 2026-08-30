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

**接口文档**：后端用 `npm start` 启动后（会自动设置 `NODE_ENV=development`），访问 `http://localhost:3001/api-docs` 能看到完整的 Swagger 接口文档，包含每个接口的参数、响应结构、错误码说明，页面上可以直接 "Try it out" 试调。这个文档只在本地开发环境启用，测试服/正式服访问这个路径会得到 404（不会注册这个路由，不是权限拦截）。

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

## 运维依赖（不在代码仓库里，容易被遗忘的配置）

**账号注销 30 天清理任务**：`src/scripts/purgeDeletedAccounts.js` 需要在服务器的**宝塔面板 → 计划任务**里配置为每日执行一次（`node src/scripts/purgeDeletedAccounts.js`）。这个配置只存在于服务器上，仓库里没有任何地方能自动生效。**服务器重装或迁移到新机器时，必须记得手动重新配置这个计划任务**，否则注销超过 30 天的账号会一直堆积，用户名和邮箱永远不会被释放。

## 当前状态

账号系统（`docs/auth-design.md`）已经全部实现完：注册、密码/验证码登录、忘记密码、换绑邮箱、会话/设备管理、用户名/昵称修改、账号注销。摄影分享相关的核心功能（照片上传、展示、地点推荐等）还未开始。已知问题和技术债记录在 `docs/decisions.md` 末尾。
