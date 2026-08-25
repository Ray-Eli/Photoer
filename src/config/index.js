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