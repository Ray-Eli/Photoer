// 安全保险：测试里有 TRUNCATE / FLUSHDB 这类破坏性操作，一旦配置错误连到开发库或
// 服务器库，后果不可逆。这里做两层检查——环境变量层（连库之前就拦）+ 运行时连接层
// （真的连上之后再确认一次），任一不符就直接抛错，测试整体不启动。
//
// 期望值写死在这里，不从配置读——配置本身可能就是错的，写死才拦得住。

// 先确保 .env.test 已加载（src/config/env.js 按 NODE_ENV 选文件）。guard 被所有测试
// 入口第一个 require，在这里加载 env 就能统一解决"env 还没加载就检查"的时序问题。
require('../../src/config/env');

const EXPECT_NODE_ENV = 'test';
const EXPECT_DB_NAME = 'photoer_test';
const EXPECT_REDIS_DB = 15;

// 第一层：环境变量。任何 require 测试 helper 的地方都会先跑到这里。
function assertEnv() {
  const problems = [];
  if (process.env.NODE_ENV !== EXPECT_NODE_ENV) {
    problems.push(`NODE_ENV 期望 "${EXPECT_NODE_ENV}"，实际 "${process.env.NODE_ENV}"`);
  }
  if (process.env.DB_NAME !== EXPECT_DB_NAME) {
    problems.push(`DB_NAME 期望 "${EXPECT_DB_NAME}"，实际 "${process.env.DB_NAME}"`);
  }
  if (String(process.env.REDIS_DB) !== String(EXPECT_REDIS_DB)) {
    problems.push(`REDIS_DB 期望 "${EXPECT_REDIS_DB}"，实际 "${process.env.REDIS_DB}"`);
  }
  if (problems.length > 0) {
    throw new Error(
      '[测试安全保险] 环境配置不对，拒绝运行测试（避免破坏性操作打到非测试库）：\n  - ' +
      problems.join('\n  - ') +
      '\n请确认用 `npm test` 启动（会设置 NODE_ENV=test 并加载 .env.test）。'
    );
  }
}

// 第二层：真实连接。确认连上的确实是 photoer_test / redis db 15。
async function assertLiveConnections(pool, redis) {
  assertEnv();

  const [rows] = await pool.query('SELECT DATABASE() AS db');
  const liveDb = rows[0] && rows[0].db;
  if (liveDb !== EXPECT_DB_NAME) {
    throw new Error(`[测试安全保险] MySQL 实际连接的库是 "${liveDb}"，期望 "${EXPECT_DB_NAME}"`);
  }

  const liveRedisDb = redis.options && redis.options.db;
  if (Number(liveRedisDb) !== EXPECT_REDIS_DB) {
    throw new Error(`[测试安全保险] Redis 实际连接的 db 是 "${liveRedisDb}"，期望 ${EXPECT_REDIS_DB}`);
  }
}

module.exports = { assertEnv, assertLiveConnections, EXPECT_DB_NAME, EXPECT_REDIS_DB };

// 被 require 的瞬间就跑第一层检查——任何 helper 一加载就先过安全线
assertEnv();
