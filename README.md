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

前端固定跑在 `http://localhost:3000`，后端跑在 `.env.development` 里 `PORT` 指定的端口（当前是 3001）。浏览器只需要访问前端的 3000，前端会把 `/api/*` 请求自动代理到后端，不会有跨域问题（配置在 `web/next.config.mjs`）。

**接口文档**：后端用 `npm start` 启动后（会自动设置 `NODE_ENV=development`），访问 `http://localhost:3001/api-docs` 能看到完整的 Swagger 接口文档，包含每个接口的参数、响应结构、错误码说明，页面上可以直接 "Try it out" 试调。这个文档只在本地开发环境启用，测试服/正式服访问这个路径会得到 404（不会注册这个路由，不是权限拦截）。

## 环境与配置

后端区分四个环境，每个环境一个独立的配置文件 `.env.<环境>`。`src/config/env.js` 按 `NODE_ENV` 的值加载对应文件——**`NODE_ENV` 未设置、值非法、或对应文件不存在，程序会直接报错退出，不会带着空配置继续跑**（设计理由见 `docs/decisions.md` ADR-011）。

| 环境 | 配置文件 | `NODE_ENV` | 所在机器 | 启动方式 | 接口文档 |
|---|---|---|---|---|---|
| 本地开发 | `.env.development` | `development` | 开发者本机 | `npm start` | 开启（`/api-docs`） |
| 自动化测试 | `.env.test` | `test` | 开发者本机 | `npm test`（测试框架待建） | 关闭 |
| 测试服 | `.env.staging` | `staging` | 服务器 `/www/wwwroot/photoer-staging/` | pm2 / 宝塔进程配置（应急时 `npm run start:staging`） | 关闭 |
| 正式服 | `.env.production` | `production` | 服务器 `/www/wwwroot/photoer-production/` | pm2 / 宝塔进程配置（应急时 `npm run start:prod`） | 关闭 |

> `start:staging` / `start:prod` 仅供应急手动启动。服务器上的常规启动走 pm2 / 宝塔的进程配置（由它负责设置 `NODE_ENV` 并常驻保活），不要用 npm 脚本起线上服务。

### 环境 ↔ 数据库 ↔ Redis 对照

每个环境用**独立的 MySQL 库和独立的 Redis db 编号**，互不干扰。库名统一按 `photoer_{环境名}` 命名，与 `NODE_ENV` 一一对应。以下是权威对照，`.env.<环境>` 里的 `DB_NAME` / `REDIS_DB` 必须按这张表填：

| 环境 | `NODE_ENV` | 配置文件 | MySQL 库名 | Redis db |
|---|---|---|---|---|
| 本地开发 | `development` | `.env.development` | `photoer_development` | `0` |
| 自动化测试 | `test` | `.env.test` | `photoer_test` | `15` |
| 测试服 | `staging` | `.env.staging` | `photoer_staging` | `1` |
| 正式服 | `production` | `.env.production` | `photoer_production` | `0` |

> 所有库的字符集 / 排序规则统一为 `utf8mb4` / `utf8mb4_0900_ai_ci`——排序规则决定用户名比较不区分大小写，是设计里明确依赖的行为（见 `docs/database-schema.md`），建库时必须显式指定，不能依赖服务器默认值。
>
> 本地开发和正式服的 Redis db 编号都是 `0`，不冲突是因为它们在不同机器上的不同 Redis 实例。自动化测试用 `15`（默认 16 个 db 里的最后一个），刻意选一个远离其他环境的编号——自动化测试会频繁清库，放远一点，手滑连错时不至于冲掉有用数据。

配置文件都不进 Git（`.gitignore` 忽略 `.env.*`）。仓库里只有一份模板 `.env.example`，列全所有配置项。

**首次初始化本地配置**：

```bash
cp .env.example .env.development
# 编辑 .env.development，至少填入：
#   NODE_ENV=development
#   COOKIE_SECURE=false          # 本地是 HTTP，必须 false，否则登录 Cookie 种不上
#   DB_* / REDIS_* / PORT        # 按本机的 MySQL、Redis 实际情况填
```

`COOKIE_SECURE` 控制 Session Cookie 的 `Secure` 标志，独立于 `NODE_ENV`（真正的决定因素是环境有没有 HTTPS）。缺失或值非法时按 `true` 处理——往安全一侧失败。

## 初始化步骤

1. 准备本地配置：`cp .env.example .env.development`，按上面「环境与配置」的说明填入真实值（`NODE_ENV`/`COOKIE_SECURE`/`DB_*`/`PORT`/`REDIS_*`），本地需要有可用的 MySQL 和 Redis
2. 安装依赖：根目录 `npm install`，`web/` 目录下再 `npm install`
3. 执行数据库迁移：`npm run migrate`（`npm run migrate:status` 查看迁移状态，`npm run migrate:rollback` 回滚最后一次）。这三条都绑定 `development` 环境；其他环境用 `npm run migrate:test` / `migrate:staging` / `migrate:prod`，`status` / `rollback` 对非 development 环境用原始形式 `cross-env NODE_ENV=<环境> node src/scripts/migrate.js status`
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
