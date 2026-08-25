const config = require('../config');
const sessionLib = require('../lib/session');

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;

  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

const ABSOLUTE_MS = {
  normal: config.session.normal.absoluteDays * 86400 * 1000,
  remember: config.session.remember.absoluteDays * 86400 * 1000,
};

// 挂载在全局，解析 Cookie 中的 sessionId，找到就把 req.user / req.sessionId 填上
// 找不到或已失效也放行（游客可浏览，ADR-002），是否要求登录由 requireAuth 负责
async function loadSession(req, res, next) {
  const cookies = parseCookies(req);
  const sessionId = cookies[config.cookie.name];

  req.sessionId = sessionId || null;
  req.user = null;

  if (!sessionId) return next();

  try {
    const session = await sessionLib.getSession(sessionId);
    if (!session) {
      res.clearCookie(config.cookie.name);
      req.sessionId = null;
      return next();
    }

    const createdAt = new Date(session.createdAt).getTime();
    const limit = session.remember === '1' ? ABSOLUTE_MS.remember : ABSOLUTE_MS.normal;

    if (Date.now() - createdAt > limit) {
      await sessionLib.destroySession(sessionId);
      res.clearCookie(config.cookie.name);
      req.sessionId = null;
      return next();
    }

    await sessionLib.touchSession(sessionId);
    req.user = { id: Number(session.userId) };
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

module.exports = { loadSession, requireAuth };
