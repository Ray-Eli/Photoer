// 每个测试用例开始前清空测试库和测试 Redis，保证用例之间互不影响。
// 复用生产代码的连接池 / redis 客户端（require 的是同一个单例），这样清理动作
// 和被测代码看到的是同一份连接状态。

const { assertLiveConnections } = require('./guard');
const pool = require('../../src/lib/db');
const redis = require('../../src/lib/redis');

// 清空所有业务表，但保留 schema_migrations（迁移状态不能丢）。
// 表名从 information_schema 动态查——以后加了新表自动覆盖，不用回来改这里。
// 项目未启用外键（decisions.md ADR-011），TRUNCATE 顺序无所谓，且会重置 AUTO_INCREMENT，
// 让用例里的自增 id 可预期。
async function resetDatabase() {
  await assertLiveConnections(pool, redis);

  const [tables] = await pool.query(
    `SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations'`
  );

  if (tables.length === 0) return;

  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const { t } of tables) {
      await pool.query(`TRUNCATE TABLE \`${t}\``);
    }
  } finally {
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

// 清空测试 Redis。FLUSHDB 只清当前连接选中的 db，guard 已确认那是 db 15。
async function resetRedis() {
  await assertLiveConnections(pool, redis);
  await redis.flushdb();
}

async function resetAll() {
  await resetDatabase();
  await resetRedis();
}

// 测试进程收尾：关掉连接池和 redis，否则进程挂着不退出
async function closeConnections() {
  await pool.end();
  await redis.quit();
}

module.exports = { resetDatabase, resetRedis, resetAll, closeConnections };
