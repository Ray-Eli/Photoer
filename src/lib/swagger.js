// 接口文档（OpenAPI/Swagger），代码优先流派：文档写在各路由文件的 JSDoc 注释里，
// swagger-jsdoc 扫描注释生成规范，swagger-ui-express 提供可视化页面。
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
  const swaggerUi = require('swagger-ui-express');

  const spec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Photoer API',
        version: '1.0.0',
        description: '本地开发专用接口文档，测试服/正式服不会暴露这个页面。',
      },
      tags: [
        { name: '认证', description: '注册、登录、忘记密码、换绑邮箱、注销、登出' },
        { name: '会话管理', description: '查看登录设备、下线指定设备' },
        { name: '个人资料', description: '修改用户名、昵称' },
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

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
  console.log('接口文档已启用：http://localhost:' + (process.env.PORT || 3000) + '/api-docs');
}

module.exports = { mountSwaggerDocs };
