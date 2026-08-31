// Cookie 的 secure 标志由独立配置项 COOKIE_SECURE 决定，不再绑定 NODE_ENV。
// 真正的决定因素是"这个环境有没有 HTTPS"，跟环境类型没有必然关系。见 docs/decisions.md ADR-011。
// 缺失或值非法时按 true 处理——往安全一侧失败：忘配置的后果是"HTTP 下登不上，立刻发现"，
// 而不是"线上少了 secure 标志，永远发现不了"。.env 读出来是字符串，只认精确的 'true' / 'false'。
function resolveCookieSecure() {
  const raw = process.env.COOKIE_SECURE;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== undefined) {
    console.warn(`[config] COOKIE_SECURE 的值 "${raw}" 无法识别（只接受 "true" / "false"），按 true 处理`);
  }
  return true;
}

module.exports = {
  username: {
    minLength: 3,
    maxLength: 20,
    allowPureNumber: false,
    cooldownDays: 90,
    maxChangesPerYear: 2,
  },

  nickname: {
    maxLength: 30,
    changeLimit: { days: 14, times: 2 },
  },

  password: {
    minLength: 8,
  },

  session: {
    normal:   { idleHours: 4,  absoluteDays: 7 },
    remember: { idleDays: 30,  absoluteDays: 90 },
  },

  verification: {
    register:      { expireMin: 10, maxAttempts: 5, cooldownSec: 60, maxPerHour: 5 },
    login:         { expireMin: 5,  maxAttempts: 5, cooldownSec: 60, maxPerHour: 5 },
    resetPassword: { expireMin: 5,  maxAttempts: 5, cooldownSec: 60, maxPerHour: 3 },
    changeEmail:   { expireMin: 5,  maxAttempts: 5, cooldownSec: 60, maxPerHour: 3 },
  },

  account: {
    deleteCooldownDays: 30,
  },

  cookie: {
    name: 'sid',
    secure: resolveCookieSecure(),
  },

  rateLimit: {
    login:    { windowMin: 15, max: 30 },
    register: { windowMin: 15, max: 20 },
  },

  reservedUsernames: [
    'admin', 'api', 'login', 'register', 'settings', 'help', 'about',
    'terms', 'privacy', 'static', 'assets', 'public', 'explore', 'search',
    'photoer', 'photoer_official', 'photoer_app', 'photoer_support',
    'official', 'support', 'staff', 'team', 'service', 'moderator',
    'system', 'root', 'security', 'verify',
    'deleted',
  ],
};