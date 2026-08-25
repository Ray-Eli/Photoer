const redis = require('./redis');

// 固定窗口计数：窗口内第一次调用设置过期时间，之后只递增
// 窗口边界处存在轻微误差（不是滑动窗口），限流场景可接受
async function checkAndIncr(key, windowSec, max) {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }
  return count <= max;
}

module.exports = { checkAndIncr };
