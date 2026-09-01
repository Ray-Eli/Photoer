const config = require('../config');
const { checkAndIncr } = require('../lib/rateLimit');

// 按 IP 的固定窗口限流中间件。kind 对应 config.rateLimit 里的一项（含 windowMin / max）。
// 验证顺序里最便宜的一环（design-principles.md 1.2），放在人机验证、查库之前。
// 原本只在 auth.route.js 里用，profile.route.js 的用户名可用性检查接口也要用，抽到这里共用。
function rateLimit(kind) {
  const { windowMin, max } = config.rateLimit[kind];
  return async (req, res, next) => {
    try {
      const key = `ratelimit:${kind}:${req.ip}`;
      const ok = await checkAndIncr(key, windowMin * 60, max);
      if (!ok) {
        return res.status(429).json({ error: '操作过于频繁，请稍后重试' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { rateLimit };
