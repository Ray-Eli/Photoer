const config = require('../config');

// Session Cookie 的读写统一走这里，别在别处直接 res.cookie(config.cookie.name, ...) / res.clearCookie(...)。
//
// 浏览器清除 Cookie 的机制是"用相同属性发一个已过期的同名 Cookie"——设置时带了什么标识性属性
// （httpOnly / sameSite / secure / path），清除时必须一模一样，否则浏览器认为不是同一个 Cookie，清不掉。
// 唯一的例外是 expires / maxAge：那是过期时间，清除动作本身就是把它设到过去，不需要（也不能）对齐。
//
// 把这套属性收在一处，就不会出现"设置和清除对不上"的漂移。secure 取值见 config.cookie（由
// COOKIE_SECURE 决定，缺省 true，见 docs/decisions.md ADR-011）。
const IDENTITY_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookie.secure,
  path: '/',
};

function setSessionCookie(res, sessionId, ttlSec) {
  res.cookie(config.cookie.name, sessionId, {
    ...IDENTITY_OPTIONS,
    maxAge: ttlSec * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(config.cookie.name, IDENTITY_OPTIONS);
}

module.exports = { setSessionCookie, clearSessionCookie };
