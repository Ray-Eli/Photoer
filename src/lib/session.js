const redis = require('./redis');
const { generateToken, generatePublicId } = require('../utils/id');
const config = require('../config');

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

function sessionKey(sessionId) {
  return `${SESSION_PREFIX}${sessionId}`;
}

function userSessionsKey(userId) {
  return `${USER_SESSIONS_PREFIX}${userId}`;
}

// 闲置超时（秒），依"记住我"而定，用作 Redis TTL
function idleTtlSeconds(remember) {
  const { normal, remember: rememberCfg } = config.session;
  return remember ? rememberCfg.idleDays * 86400 : normal.idleHours * 3600;
}

async function createSession(userId, { remember = false, deviceType = '', browser = '', ip = '' } = {}) {
  const sessionId = generateToken();
  // 给前端展示/操作用的标识，跟真实 sessionId 是两个独立的值，泄露了也不能当登录凭证用
  const ref = generatePublicId();
  const now = new Date().toISOString();
  const ttl = idleTtlSeconds(remember);

  await redis.hset(sessionKey(sessionId), {
    userId: String(userId),
    ref,
    deviceType,
    browser,
    ip,
    createdAt: now,
    lastActiveAt: now,
    remember: remember ? '1' : '0',
  });
  await redis.expire(sessionKey(sessionId), ttl);
  await redis.sadd(userSessionsKey(userId), sessionId);

  return { sessionId, ttl };
}

async function getSession(sessionId) {
  if (!sessionId) return null;
  const data = await redis.hgetall(sessionKey(sessionId));
  if (!data || !data.userId) return null;
  return data;
}

// 刷新闲置超时（每次请求调用），绝对超时由调用方另行判断 createdAt
async function touchSession(sessionId) {
  const data = await getSession(sessionId);
  if (!data) return;
  const ttl = idleTtlSeconds(data.remember === '1');
  await redis.hset(sessionKey(sessionId), 'lastActiveAt', new Date().toISOString());
  await redis.expire(sessionKey(sessionId), ttl);
}

async function destroySession(sessionId) {
  const data = await getSession(sessionId);
  await redis.del(sessionKey(sessionId));
  if (data) {
    await redis.srem(userSessionsKey(data.userId), sessionId);
  }
}

// 该用户当前所有有效 Session（含真实 sessionId，调用方自己决定要不要往外暴露）
// 顺带清理 user_sessions 集合里已经过期、查不到对应 Hash 的引用（惰性清理）
async function getValidSessions(userId) {
  const ids = await redis.smembers(userSessionsKey(userId));
  const results = [];

  for (const sessionId of ids) {
    const data = await getSession(sessionId);
    if (!data) {
      await redis.srem(userSessionsKey(userId), sessionId);
      continue;
    }
    results.push({ sessionId, ...data });
  }

  return results;
}

// 强制下线该用户所有设备（改密码、封禁、注销时用）
async function destroyAllSessions(userId) {
  const ids = await redis.smembers(userSessionsKey(userId));
  if (ids.length > 0) {
    await redis.del(...ids.map(sessionKey));
  }
  await redis.del(userSessionsKey(userId));
}

module.exports = {
  createSession,
  getSession,
  touchSession,
  destroySession,
  destroyAllSessions,
  getValidSessions,
};
