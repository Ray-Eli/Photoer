// 接口文档（OpenAPI/Swagger），代码优先流派：文档写在各路由文件的 JSDoc 注释里，
// swagger-jsdoc 扫描注释生成 OpenAPI 规范；渲染页面用 Scalar（@scalar/express-api-reference），
// 界面比 swagger-ui-express 默认主题更现代、更紧凑。规范生成这一层完全没变，只换了渲染层。
//
// 只在本地开发环境启用。测试服/正式服完全不注册这个路由，访问 /api-docs 会得到
// Express 默认的 404——不是"无权限"提示。用 403 会告诉对方"这里确实有文档，只是你看不了"，
// 相当于泄露了资源存在性，跟 design-principles.md 1.1 条是同一个原则。
//
// 判断依据用 NODE_ENV，而且故意用"白名单"而不是"黑名单"：只有显式等于 'development' 才启用，
// 不是"只要不等于 production/test 就启用"。原因：如果以后正式服的进程管理工具（比如宝塔）
// 忘记设置 NODE_ENV，黑名单写法会在默认情况下"打开"文档，白名单写法则默认"关闭"，
// 安全相关的判断应该在配置缺失时失败到安全的一侧，而不是失败到暴露的一侧。
//
// 这也意味着：本地开发必须显式设置 NODE_ENV=development 才能看到文档（package.json 的
// start 脚本已经这样配置），正式服部署时不用特意去"关闭"它，只要没有手滑把 NODE_ENV
// 设成 development，就是默认关闭状态。

const DEV_ENV = 'development';

function mountSwaggerDocs(app) {
  if (process.env.NODE_ENV !== DEV_ENV) return;

  // 懒加载：这两个包只在 devDependencies 里，正式服如果用 npm ci --omit=dev 之类的方式
  // 安装依赖，包本身可能压根不存在——提前到函数顶层 require 会导致哪怕外层判断关闭了
  // 文档，一样会在启动时报"找不到模块"。放进这个 if 分支里，不满足条件时完全不会执行到。
  const swaggerJsdoc = require('swagger-jsdoc');
  const { apiReference } = require('@scalar/express-api-reference');
  const config = require('../config');

  // Introduction 页面内容，里面引用的限流数字直接读 config，配置改了这里跟着变，不会写死过期的数字
  const description = [
    '摄影分享平台 Photoer 的后端接口文档。当前只覆盖账号系统（注册、登录、会话管理、个人资料），本地开发专用，测试服/正式服不会暴露这个页面。',
    '',
    '## 认证方式',
    '',
    '使用 **Session + HttpOnly Cookie** 认证，不是 JWT/Token。登录或注册成功后，服务端会通过 `Set-Cookie` 种下名为 `sid` 的 Cookie，浏览器后续请求会自动带上。前端发请求时需要带上 credentials（`fetch` 传 `credentials: "same-origin"` 或 `"include"`），否则 Cookie 不会被发送。',
    '',
    '标了 🔒（cookieAuth）的接口需要登录才能调用（对应后端的 `requireAuth` 中间件），未登录访问返回 `401`。',
    '',
    '## 通用错误响应格式',
    '',
    '除个别接口外，出错时统一返回：',
    '',
    '```json',
    '{ "error": "错误提示文案" }',
    '```',
    '',
    '账号被封禁时会额外带一个 `reason` 字段：',
    '',
    '```json',
    '{ "error": "账号异常", "reason": "封禁原因" }',
    '```',
    '',
    '## 限流',
    '',
    `- 注册接口：同一 IP ${config.rateLimit.register.windowMin} 分钟内最多 ${config.rateLimit.register.max} 次`,
    `- 登录、验证码登录、忘记密码、换绑邮箱：同一 IP ${config.rateLimit.login.windowMin} 分钟内最多 ${config.rateLimit.login.max} 次（共用同一个限流桶）`,
    '- 各类验证码发送还有独立的冷却限制（起送冷却 + 每小时上限，具体次数因场景而异），详见各接口的 429 响应说明',
    '',
    '## 不泄露账号存在性',
    '',
    '**所有涉及邮箱的接口，无论邮箱是否已注册、是否已被占用，响应都完全相同**——不会因为账号状态不同返回不同的结构或提示文案，真实情况只通过邮件告知邮箱的实际所有者。这是刻意的安全设计（design-principles.md 1.1 条），前端不应该、也无法通过响应差异判断某个邮箱是否存在对应账号。',
  ].join('\n');

  const spec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Photoer API',
        version: '1.0.0',
        description,
      },
      tags: [
        {
          name: '认证',
          description:
            '注册、登录（密码/验证码两种方式）、忘记密码——这几个不需要登录。换绑邮箱、注销、登出、`/me`——这几个需要登录。涉及邮箱的接口都遵循"不泄露账号存在性"的统一响应原则，详见页面顶部说明。',
        },
        {
          name: '会话管理',
          description:
            '管理当前账号在其他设备上的登录状态。列表和下线操作用的是 `ref`（对外的设备标识），不是真实的 Session ID——`ref` 泄露了也不能当登录凭证用。不能用来下线当前设备本身，下线当前设备请用登出接口。',
        },
        {
          name: '个人资料',
          description:
            '修改用户名、昵称，均需登录，不需要密码二次验证。用户名有 90 天冷却期和一年 2 次的修改频率限制，昵称有 14 天 2 次的频率限制，具体规则见各接口说明。',
        },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'sid',
            description: '登录成功后由服务端种下的 HttpOnly Session Cookie，浏览器会自动带上',
          },
        },
        schemas: {
          ErrorResponse: {
            type: 'object',
            properties: {
              error: { type: 'string', description: '错误提示文案' },
              reason: { type: 'string', description: '仅账号异常（封禁）时出现，封禁原因' },
            },
          },
          UserPublic: {
            type: 'object',
            description: '对外暴露的用户信息，内部自增 id 永不出现在任何响应里',
            properties: {
              publicId: { type: 'string', description: 'NanoID，对外稳定标识' },
              username: { type: 'string' },
              nickname: { type: 'string' },
            },
          },
        },
      },
    },
    apis: ['./src/routes/*.js'],
  });

  app.use(
    '/api-docs',
    apiReference({
      content: spec,
      pageTitle: 'Photoer API',
      // 关掉用不到的功能入口，配置项名称核对自 Scalar 官方配置文档
      // （https://github.com/scalar/scalar/blob/main/documentation/configuration.md），
      // 不是凭记忆猜的。保留 Client Libraries 代码示例、搜索、暗色模式切换、左侧导航——
      // 这几个没有对应的"隐藏"配置项，默认就是开启，不用做任何设置。
      agent: { disabled: true }, // 关掉 "Ask AI"
      mcp: { disabled: true }, // 关掉 "Generate MCP"
      showDeveloperTools: 'never', // 关掉右上角 Developer Tools / Configure / Share / Deploy 那一组入口
      hideClientButton: true, // 关掉左下角 "Open API Client" 入口，跟 Client Libraries 代码示例是两回事，不影响后者
    })
  );
  console.log('接口文档已启用：http://localhost:' + (process.env.PORT || 3000) + '/api-docs');
}

module.exports = { mountSwaggerDocs };
