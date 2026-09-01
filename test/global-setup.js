// node:test 的全局 setup：所有测试文件跑之前执行一次。
// 职责：过安全保险 + 用现有 migration 把 photoer_test 的表建好（不手写建表语句）。
// 用 --test-global-setup=./test/global-setup.js 挂载（见 package.json 的 test 脚本）。

const { assertEnv } = require('./helpers/guard');
const { migrate } = require('../src/scripts/migrate');

async function globalSetup() {
  assertEnv(); // NODE_ENV / DB_NAME / REDIS_DB 不对就直接抛，测试整体不启动

  // 复用 src/scripts/migrate.js 的 migrate()：幂等，表已是最新就直接跳过。
  // 表结构永远跟 migrations/ 目录一致，不会出现"测试库跟不上"。
  await migrate();
}

async function globalTeardown() {
  // 测试进程各自在 after() 里关自己的连接，这里无需额外清理。
}

module.exports = { globalSetup, globalTeardown };
