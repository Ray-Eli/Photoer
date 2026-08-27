const sessionLib = require('../lib/session');

// 会话/设备管理：只把 ref 往外暴露，真实 sessionId 永远不出现在响应里
async function listSessions(userId, currentSessionId) {
  const sessions = await sessionLib.getValidSessions(userId);

  return sessions.map((s) => ({
    ref: s.ref,
    deviceType: s.deviceType,
    browser: s.browser,
    ip: s.ip,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    isCurrent: s.sessionId === currentSessionId,
  }));
}

// 按 ref 下线某台设备；找不到匹配（过期/伪造/别人的）统一提示，不区分原因；不允许下线当前设备本身
async function revokeSession(userId, ref, currentSessionId) {
  const sessions = await sessionLib.getValidSessions(userId);
  const target = sessions.find((s) => s.ref === ref);

  if (!target) {
    const err = new Error('该设备不存在或已下线');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (target.sessionId === currentSessionId) {
    const err = new Error('下线当前设备请使用登出功能');
    err.code = 'CURRENT_DEVICE';
    throw err;
  }

  await sessionLib.destroySession(target.sessionId);
}

module.exports = {
  listSessions,
  revokeSession,
};
