# 命名与目录规范

本文档规定 Photoer 项目的文件命名与目录组织方式。后端和前端是两个独立的技术栈（Node/Express、React/Next.js），**分开制定各自的规则，不强行统一成一套风格**——各自遵循所在生态的社区惯例，这样才能跟对应生态的文档、教程、其他人的代码保持同一种语感。

本文档只覆盖**文件命名和目录结构**，不涉及代码风格（缩进、引号、分号等，那类问题交给 ESLint）。

---

## 一、现状梳理方法说明

以下规则不是凭空定的，是先扫描了 `src/`（后端）和 `web/src/`（前端）现有的全部文件，总结出已经在遵循、只是没写下来的模式，再把它们正式确认成规则。这样规则和现状之间的落差最小，只有个别地方现状本身就不一致，会单独标注。

后端路由/服务层已经出现了不止一个领域（`auth`/`session`/`profile`），2.5 节的拆分规则就是从这次实际拆分中得出的，不是预先设想的。以后再加新领域（比如 `photo.route.js`）如果发现规则不合适，应该回来修订本文档，而不是强行套用。

---

## 二、后端命名规范（`src/`，Node.js / Express 生态）

### 2.1 目录与文件角色对照

| 目录 | 存放什么 | 文件命名格式 | 现状举例 |
|---|---|---|---|
| `src/routes/` | Express 路由定义（只做请求解析、调用 service、返回响应） | `{领域}.route.js` | `auth.route.js` |
| `src/services/` | 业务逻辑（数据库/Redis 读写、规则判断） | `{领域}.service.js` | `auth.service.js` |
| `src/middlewares/` | Express 中间件 | `{关注点}.middleware.js` | `session.middleware.js`、`rateLimit.middleware.js` |
| `src/lib/` | 对外部基础设施的薄封装（数据库连接、Redis 客户端）、跨领域的基础能力（Session、限流、发邮件、验证码、Cookie 读写），或某张表的纯数据访问层（Repository） | 裸名词，不带角色后缀；Repository 用 `{表对应的领域}Repository.js` | `db.js`、`redis.js`、`session.js`、`cookie.js`、`mailer.js`、`captcha.js`、`rateLimit.js`、`userRepository.js` |
| `src/utils/` | 不依赖外部基础设施的纯函数（ID 生成、格式校验、状态判断） | 裸名词，不带角色后缀 | `id.js`、`validator.js`、`accountStatus.js` |
| `src/config/` | 配置加载、业务规则常量、面向用户的文案模板（邮件、短信这类"会变的策略性内容"，design-principles.md 二） | 裸名词；`index.js` 作为聚合入口；文案模板用 `{渠道}Templates.js` | `env.js`、`index.js`、`emailTemplates.js` |
| `src/scripts/` | 独立运维脚本（命令行或定时任务启动，不经过 HTTP 路由） | 裸名词，不带角色后缀 | `migrate.js` |
| `src/` 根目录 | 应用入口 | `index.js`（Node/Express 惯例，对应 `package.json` 的 `main` 字段） | `index.js` |

### 2.2 `lib/` 与 `utils/` 的区分标准

两者外观很像（都是裸名词、不带后缀），区分标准是**是否有 I/O 或副作用**（接触外部基础设施、或改动 HTTP 请求/响应这类进程外状态）：
- `lib/`：内部会连接数据库、Redis、调用第三方服务（即使目前是打桩），或对 HTTP 响应产生副作用——`db.js`/`redis.js` 是连接，`session.js`/`mailer.js`/`captcha.js`/`rateLimit.js` 是基于 Redis 或第三方 API 的能力封装，`cookie.js` 封装的是"往 `res` 上种/清 Cookie"（不碰基础设施，但会写响应头，不是纯计算）
- `utils/`：纯计算，不发任何网络请求、不读写任何外部状态、不碰 `req`/`res`——`id.js`（生成 ID）、`validator.js`（格式校验）

数据访问层（Repository，比如 `userRepository.js`）也属于 `lib/`，因为它直接接触数据库——跟 `db.js` 是同一类东西，只是 `db.js` 封装的是"连接本身"，Repository 封装的是"某张表的读写"。Repository 里只放没有业务规则判断的纯查询/写入（比如"按 id 查用户"），任何带业务判断的逻辑（比如"这个用户名是否可用"，牵扯冷却期、频率限制这些规则）都不下沉，留在 service 层。

**Repository 函数统一支持可选的事务连接参数**：每个函数最后一个参数是可选的数据库连接对象，传入时用这个连接执行（从而参与调用方已经开启的事务），不传时自行从连接池获取连接执行。事务的开启、提交、回滚由 service 层负责，Repository 只负责在指定的连接上执行 SQL，不管理事务生命周期。

### 2.3 命名大小写

统一小写，多单词用 camelCase（如 `rateLimit.js`），角色后缀用英文句点分隔（如 `auth.route.js`）。后端文件不对应 UI 组件，不使用 PascalCase。

### 2.4 独立运维脚本

独立运维脚本（不经过 HTTP 路由触发，靠命令行或定时任务启动，如 `migrate.js`）统一存放于 `src/scripts/` 目录，与 `routes/`/`services/` 等按 HTTP 请求生命周期组织的角色目录区分开。命名同其他角色一样是裸名词，不带角色后缀（如 `migrate.js`、`purgeDeletedAccounts.js`）。

这类脚本通常是被 cron/计划任务调用的一次性任务，有两条硬性要求：
- **必须支持重复执行**：脚本可能因为服务器重启、计划任务重叠触发等原因被多次运行，必须能安全地重复跑而不产生副作用或重复处理同一条数据。判断"是否已处理过"要用数据本身的状态做依据（比如某条关联记录是否还存在），不要用容易产生歧义的字符串特征匹配
- **必须正常退出**：脚本逻辑跑完后要显式调用 `process.exit()`（成功 0、失败非 0），并在退出前关闭数据库连接池等资源。cron 调用的是一次性进程，脚本自己不退出，进程会一直挂着不结束

### 2.5 何时拆分一个领域

`{领域}.route.js`/`{领域}.service.js` 里的"领域"不是固定不变的——一个文件如果混进了多个不同性质的业务，应该按领域拆开，而不是任其膨胀成一个大文件。

拆分信号（出现任一条就该考虑拆）：
- 文件里出现了明显可以归类到不同名词的函数群（比如"登录认证相关" vs "设备管理相关" vs "资料修改相关"）
- 文件长度已经让人很难一眼看清"这个文件到底负责什么"
- 新加功能时，很难判断"这个函数该不该放进这个文件"

拆分方式：
- 路由层：每个新领域一个 `{领域}.route.js`，各自 `module.exports` 一个 router，在 `src/routes/index.js` 里用 `router.use('/{挂载路径}', xxxRoutes)` 挂载。**多个领域的路由文件可以挂载在同一个路径前缀下**（比如 `auth.route.js`、`session.route.js`、`profile.route.js` 都挂在 `/auth` 下）——URL 是给客户端看的，文件划分是给写代码的人看的，两者的组织方式不需要绑死在一起
- 服务层：同理拆成 `{领域}.service.js`，每个文件只导出自己领域的函数
- 如果拆分后发现某个函数被多个领域共用，不要复制两份：要么下沉到 `src/lib/` 或 `src/utils/`，要么明确它归属哪个领域、其他领域直接 `require` 那个领域的 service 来用。具体怎么选，视这个函数是"纯粹的数据访问"（更适合下沉）还是"带业务含义的领域逻辑"（更适合保留归属、被引用）而定

### 2.6 接口文档

项目接入了 Swagger/OpenAPI（`swagger-jsdoc` 生成规范 + Scalar `@scalar/express-api-reference` 渲染页面，代码优先流派，配置见 `src/lib/swagger.js`）。**新增或修改 `src/routes/` 下的接口时，必须同步补充/更新对应的 `@swagger` JSDoc 注释**，写在 `router.xxx(...)` 定义的正上方，跟着改，不要等攒够一批再回来补——这是为了不出现"接口加了但文档没更新"的情况。文档只在本地开发环境启用（`NODE_ENV=development` 时），访问方式见根目录 `README.md`。

### 2.7 Session Cookie 的读写统一走 `src/lib/cookie.js`

种 / 清 Session Cookie **只能**通过 `lib/cookie.js` 的 `setSessionCookie(res, sessionId, ttlSec)` 和 `clearSessionCookie(res)`，不要在路由或中间件里直接 `res.cookie(config.cookie.name, ...)` / `res.clearCookie(...)`。

原因：浏览器清除 Cookie 靠"同名 + 标识性属性（`httpOnly` / `sameSite` / `secure` / `path`）完全一致"来匹配，只有 `expires` / `maxAge` 例外。设置和清除分散在多个文件里各写一份属性，迟早会漂移，导致"登出了但 Cookie 没清掉"这种隐蔽 bug。收在一个模块里，属性只有一处定义。`secure` 的取值由 `COOKIE_SECURE` 决定（见 `docs/decisions.md` ADR-011）。

---

## 三、前端命名规范（`web/src/`，React / Next.js 生态）

### 3.1 先区分"框架强制"和"我们自己决定"

Next.js App Router 对**特定文件名**和**目录即路由**有硬性规定，这部分没有自选空间；除此之外的文件（组件、工具函数、Context）命名完全由我们自己决定，这部分才是本文档要定规矩的地方。

**框架强制，不可更改**：

| 文件/规则 | 作用 | 能否改名 |
|---|---|---|
| `page.js` | 该路由段的页面组件 | 不能，App Router 靠这个文件名识别页面 |
| `layout.js` | 该路由段的布局组件 | 不能 |
| `favicon.ico` | 自动生成 favicon 的文件名约定（Next.js 文件约定式元数据 API 的一部分） | 不能（换成 `icon.png` 等是另一套约定，不是随意改名） |
| 目录名 = URL 路径 | App Router 靠文件夹路径生成路由 | 目录名本身要遵循 URL 规范（见 3.3），但这是路由需要，不是随便起的 |

**框架强约定，技术上能改但不建议**：

| 文件/规则 | 说明 |
|---|---|
| `globals.css` | 不是 App Router 识别的特殊文件名（改名后在 `layout.js` 里改一下 import 路径依然能工作），但这是 `create-next-app` 脚手架的标准命名，社区项目里认知度极高，没有理由偏离 |

**完全由我们自己决定**（下面 3.2 定规则的部分）：组件、Context、工具函数、以及页面同目录下的非 `page.js` 文件（比如表单组件）。

### 3.2 我们自己决定的部分

| 目录 | 存放什么 | 命名格式 | 现状举例 |
|---|---|---|---|
| `web/src/components/` | 跨页面复用的组件 | PascalCase，文件名 = 组件名（默认导出名） | `Header.js` |
| `web/src/context/` | React Context | PascalCase，`{名字}Context.js` | `AuthContext.js` |
| `web/src/lib/` | 不涉及 UI 的工具函数（接口封装、校验逻辑） | camelCase 裸名词，不带角色后缀 | `api.js`、`redirect.js` |
| 路由文件夹内，与 `page.js` 同级的非页面文件（通常是该页面用到的表单/交互组件，只在这一个路由用，不需要放进 `components/`） | 该路由页面专属的子组件 | kebab-case，按**该文件在这个流程里的角色**命名，不重复父级目录已经表达的领域名 | `verify-form.js`、`reset-form.js`、`request-form.js` |

补充说明：
- 全部使用 `.js` 后缀，不用 `.jsx`——这是 `create-next-app` 生成代码的既有习惯（Next.js 的 `.js` 文件本身就支持 JSX 语法），延续现状
- `web/src/lib/` 这个目录名和命名风格恰好和后端 `src/lib/` 很像（裸名词、camelCase），这是巧合，两边是完全独立的代码库，不是刻意对齐

### 3.3 路由文件夹（URL 路径）命名

多单词路由用 kebab-case，与 URL 本身保持一致：`forgot-password/`。这不是我们发明的规则，是 URL 规范本身的要求（URL 里不适合用驼峰或下划线）。

### 3.4 命名一致性核对

路由同级表单文件统一按"该文件在流程里的角色"命名：`forgot-password/request-form.js`、`forgot-password/verify/verify-form.js`、`forgot-password/reset/reset-form.js`、`register/verify/verify-form.js`、`register/request-form.js`（原名 `register-form.js`，已按角色命名对齐，因为它和 `forgot-password/request-form.js` 都是"发起流程的第一步"）。

`login/login-form.js` 是例外：登录不是多步骤流程，只有一个表单文件，不存在跟兄弟文件角色混淆的问题，用领域名命名。

---

## 四、Migrations 命名规范（`migrations/`）

`migrations/` 不属于后端 `src/` 或前端 `web/` 任何一边，是独立的数据库变更记录目录，单独定规则。

### 4.1 命名格式

```
{14位时间戳}_{描述性名称}.{up|down}.sql
```

- **时间戳**：`YYYYMMDDHHMMSS`，14 位定长数字。用定长数字前缀是因为 `src/scripts/migrate.js` 靠文件名做字典序排序来决定执行顺序（`getAllMigrations()` 里的 `.sort()`），定长数字保证字典序等于时间顺序，不会出现 `9_x` 排在 `10_x` 后面这种问题
- **描述性名称**：snake_case，动词开头，说明这次迁移做了什么，如 `create_users`、`create_user_identities`
- **up/down 成对出现**：每次迁移必须同时提供 `.up.sql`（执行）和 `.down.sql`（回滚），`migrate.js` 的 `rollback()` 靠同名 `.down.sql` 文件做回滚，缺一个就无法回滚

### 4.2 现状

目前 5 组迁移全部是"建表"操作，描述性名称都以 `create_` 开头。这是现状唯一出现过的动词，不代表描述名称必须固定用 `create_`——以后如果要改表结构、加字段，应该用对应的动词（如 `add_avatar_path_to_users`、`drop_xxx`），格式本身（时间戳前缀 + 动词开头的描述 + up/down 后缀）不变。

现状完全符合以上格式，不需要改任何文件名。

---

## 五、环境变量文件命名（根目录 `.env.*`）

环境变量文件跟 `migrations/` 一样，不属于 `src/` 或 `web/` 任何一边，放在仓库根目录，单独定规则。设计背景见 `docs/decisions.md` ADR-011。

### 5.1 命名格式

```
.env.{环境名}
```

- **环境名**取自 `NODE_ENV`，且只有四个合法值：`development` / `test` / `staging` / `production`。`src/config/env.js` 按 `NODE_ENV` 拼出 `.env.<NODE_ENV>` 去加载，文件名后缀必须和 `NODE_ENV` 逐字符一致
- **不使用无后缀的 `.env`**：旧方案用裸 `.env` 靠"在哪台机器上"区分环境，已废弃。现在每个环境都有明确后缀，一台机器上可以并存多个环境的配置文件而不冲突
- **数据库、目录也按 `NODE_ENV` 对齐命名**：MySQL 库统一 `photoer_{环境名}`（`photoer_development` / `photoer_test` / `photoer_staging` / `photoer_production`），服务器部署目录统一 `photoer-{环境名}`（`photoer-staging` / `photoer-production`）。名字里的环境词跟 `NODE_ENV` 逐字符一致，不用 `prod` / `test`（指测试服）这类简写或旧叫法。完整的「环境 ↔ 库名 ↔ Redis db」对照见 `README.md`「环境与配置」
  > 历史遗留提示：曾经测试服的库叫 `photoer_test`、正式服叫 `photoer_prod`，`photoer_test` 当时指的是**测试服**不是自动化测试。2026-09-01 已全部改名对齐，这个歧义不复存在——现在 `photoer_test` 就是自动化测试（`NODE_ENV=test`）的库
- **`.env.example` 是唯一进 Git 的**：配置模板，列全所有配置项名称，值留空或占位，不含任何真实密钥。`.gitignore` 用 `!.env.example` 把它从 `.env.*` 的忽略规则里排除
- 所有真实配置文件（`.env.development` 等）一律不进 Git

### 5.2 新增配置项时

四个环境文件之间没有继承/合并机制。**新增一个配置项，要同步改到 `.env.example` 以及所有实际用到的环境文件**（本地的自己改，服务器上的 `.env.staging` / `.env.production` 需要手动上服务器改）。`.env.example` 是这份清单的唯一权威来源，加了项一定要更新它，否则别人 clone 下来照着建配置会缺项。

### 5.3 新增环境时

要加第五个环境（假设叫 `demo`），至少改三处：`src/config/env.js` 里的 `VALID_ENVS` 数组、`package.json` 的相关脚本、`README.md` 的环境对照表，并新建 `.env.demo`。白名单是刻意设的门槛——加环境应当慎重。

---

## 六、测试文件规范（`test/`）

后端测试用 Node 内置的 `node:test` + `supertest`（HTTP 集成测试）。选型理由见 `docs/decisions.md` ADR-012。测试代码统一放仓库根目录的 `test/`，不混进 `src/`。初始化和运行方式见 `README.md`「测试」。

### 6.1 目录结构

| 目录 | 放什么 |
|---|---|
| `test/unit/` | 单元测试：纯函数 / 单模块，不碰数据库、Redis、HTTP |
| `test/integration/` | 集成测试：走 `supertest` 打真实路由，连测试库和测试 Redis |
| `test/helpers/` | 测试专用工具（安全保险、清理、读验证码、造数据、拿 app 等），**不是测试文件** |
| `test/global-setup.js` | 全局 setup：安全检查 + 用 `migrations/` 建测试库表结构，跑一次 |

helper 各司其职：`guard`（安全保险）、`reset`（逐用例清库）、`harness`（一行注册清理 + 收尾钩子）、`app`（取 Express app）、`codes`（从 Redis 读验证码）、`factory`（直接写库造用户 + 建会话，用于"前置条件是一个已存在/已登录用户"的场景）。

### 6.2 命名

- 集成测试文件按「接口分组」命名 `{领域}.test.js`——`register.test.js`、`login-code.test.js`、`change-email.test.js`、`sessions.test.js`、`profile.test.js` 等，一个文件覆盖一组相关接口的全部用例，不和单个源文件一一对应。单元测试按被测模块命名 `{模块}.test.js`
- `npm test` 用显式 glob `test/**/*.test.js` 圈定测试文件，所以 `test/helpers/` 里的 `.js` 不会被当成测试跑——helper 用裸名词命名（`guard.js`、`reset.js`），跟后端 `src/` 的风格一致
- 集成测试内部用 `describe('<HTTP 方法 + 路径>')` 分组，用例名描述「输入条件 -> 期望结果」

### 6.3 几条硬性约定

- **不为了好测而改生产代码**：验证码这类中间态，测试直接读 Redis（`test/helpers/codes.js`），不在生产代码里开测试后门
- **测试库表结构只从 `migrations/` 生成**，不在测试里手写 `CREATE TABLE`——否则表结构一变测试库就跟不上
- **每个用例前清空测试库和测试 Redis**（`beforeEach(resetAll)`），用例之间零耦合，不依赖执行顺序
- **安全保险不能绕过**：任何直接连库/Redis 的 helper 第一步先过 `test/helpers/guard.js`

### 6.4 新增功能必须同步补测试

账号系统现有 17 个接口的集成测试已补齐（`test/integration/`，约 100 个用例）。从现在起：

- **新增或修改 `src/routes/` 下的接口，必须同步加 / 改对应的集成测试**——跟 2.6 的 `@swagger` 注释同级要求，跟着改，不要攒批。集成测试至少覆盖：happy path、鉴权失败（该登录的 401）、主要的输入校验失败、以及该接口涉及的安全属性（如"不泄露账号存在性"要断言"存在"与"不存在"两种输入的响应完全一致）
- 新增 `src/utils/` / `src/lib/` 里的纯逻辑，补对应的单元测试
- 提交前钩子（`.githooks/pre-commit`）会跑全量测试，测试不过提交不了

---

## 七、现有文件对照表

全部文件当前路径与上述规范的核对结果，包括本来就合规、以及已按规范调整过的文件。

### 后端（`src/`）

| 当前路径 | 新规范下的路径 | 备注 |
|---|---|---|
| `src/index.js` | 不变 | 按 ADR-012 瘦身为纯入口（`require('./app')` + `listen`），应用本体移到 `src/app.js` |
| `src/app.js` | 不变 | 新增，见 ADR-012；Express 应用本体（中间件 + 路由），不 `listen`，供测试用 supertest 直接取用 |
| `src/config/env.js` | 不变 | 路径不变；加载逻辑按 ADR-011 重写为"按 `NODE_ENV` 读 `.env.<环境>`，缺失/非法/文件不存在即报错退出" |
| `src/config/index.js` | 不变 | |
| `src/config/emailTemplates.js` | 不变 | 新增，邮件文案集中管理，从各 service 里的硬编码字符串抽取而来 |
| `src/lib/db.js` | 不变 | |
| `src/lib/redis.js` | 不变 | |
| `src/lib/session.js` | 不变 | |
| `src/lib/cookie.js` | 不变 | 新增，见 2.7；Session Cookie 种/清的统一入口，设置与清除共用一套标识性属性 |
| `src/lib/mailer.js` | 不变 | |
| `src/lib/captcha.js` | 不变 | |
| `src/lib/rateLimit.js` | 不变 | |
| `src/lib/userRepository.js` | 不变 | 见 2.2；users 表纯数据访问函数集合，均支持可选事务连接参数 |
| `src/lib/swagger.js` | 不变 | 新增，见 2.6；仅 `NODE_ENV=development` 时挂载 `/api-docs` |
| `src/middlewares/session.middleware.js` | 不变 | `loadSession` 增加账号状态兜底检查（ADR-013） |
| `src/middlewares/rateLimit.middleware.js` | 不变 | 新增；按 IP 的固定窗口限流中间件，原本内联在 `auth.route.js`，`profile.route.js` 也要用，按 2.5 抽出共用 |
| `src/routes/index.js` | 不变 | |
| `src/routes/auth.route.js` | 不变 | 已按 2.5 拆出 session/profile 两个领域 |
| `src/routes/session.route.js` | 不变 | 新增，见 2.5 |
| `src/routes/profile.route.js` | 不变 | 新增，见 2.5 |
| `src/services/auth.service.js` | 不变 | 已按 2.5 拆出 session/profile 两个领域；`findUserById` 改从 `userRepository.js` 引入 |
| `src/services/session.service.js` | 不变 | 新增，见 2.5 |
| `src/services/profile.service.js` | 不变 | 新增，见 2.5；`findUserById` 改从 `userRepository.js` 引入，不再依赖 auth.service.js |
| `src/utils/id.js` | 不变 | |
| `src/utils/validator.js` | 不变 | |
| `src/utils/accountStatus.js` | 不变 | 新增（ADR-013）；`checkAccountStatus` 纯函数，从 `auth.service.js` 抽出，登录流程与 `loadSession` 中间件共用 |
| `src/scripts/migrate.js` | 不变 | 原路径 `src/migrate.js`，已按 2.4 移动；按 ADR-012 CLI 分发包进 `require.main === module` 并导出函数，供测试全局 setup 复用 |
| `src/scripts/purgeDeletedAccounts.js` | 不变 | 新增，账号注销 30 天清理任务，见 2.4 |

### 前端（`web/src/`）

| 当前路径 | 新规范下的路径 | 备注 |
|---|---|---|
| `web/src/app/layout.js` | 不变 | 框架强制 |
| `web/src/app/page.js` | 不变 | 框架强制 |
| `web/src/app/globals.css` | 不变 | 框架强约定 |
| `web/src/app/favicon.ico` | 不变 | 框架强制 |
| `web/src/app/login/page.js` | 不变 | 框架强制 |
| `web/src/app/login/login-form.js` | 不变 | 单步骤流程，领域名命名可保留 |
| `web/src/app/register/page.js` | 不变 | 框架强制 |
| `web/src/app/register/request-form.js` | 不变 | 原路径 `register-form.js`，已按 3.4 改名 |
| `web/src/app/register/verify/page.js` | 不变 | 框架强制 |
| `web/src/app/register/verify/verify-form.js` | 不变 | |
| `web/src/app/forgot-password/page.js` | 不变 | 框架强制 |
| `web/src/app/forgot-password/request-form.js` | 不变 | |
| `web/src/app/forgot-password/verify/page.js` | 不变 | 框架强制 |
| `web/src/app/forgot-password/verify/verify-form.js` | 不变 | |
| `web/src/app/forgot-password/reset/page.js` | 不变 | 框架强制 |
| `web/src/app/forgot-password/reset/reset-form.js` | 不变 | |
| `web/src/components/Header.js` | 不变 | |
| `web/src/context/AuthContext.js` | 不变 | |
| `web/src/lib/api.js` | 不变 | |
| `web/src/lib/redirect.js` | 不变 | |

**总结**：后端 28 个文件、前端 19 个文件全部符合规范。`migrate.js` 已移动到 `src/scripts/`，`register-form.js` 已改名为 `request-form.js`，`auth.route.js`/`auth.service.js` 已按 2.5 拆出 `session`/`profile` 两个领域，`users` 表的纯数据访问函数（含事务内的写入）已全部下沉到 `src/lib/userRepository.js`，支持可选事务连接参数，`src/scripts/purgeDeletedAccounts.js` 是新增的账号清理任务，所有邮件文案已集中到 `src/config/emailTemplates.js`，`src/lib/cookie.js` 是新增的 Session Cookie 读写统一入口（见 2.7），`src/app.js` 是从 `index.js` 拆出的应用本体（见 ADR-012），接口文档见 2.6，测试规范见第六节。
