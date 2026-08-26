const express = require('express');
const { UAParser } = require('ua-parser-js');
const authService = require('../services/auth.service');
const validator = require('../utils/validator');
const config = require('../config');
const { checkAndIncr } = require('../lib/rateLimit');
const { verifyCaptcha } = require('../lib/captcha');
const { requireAuth } = require('../middlewares/session.middleware');

const router = express.Router();

// 验证顺序：便宜的检查在前（design-principles.md 1.2）—— IP 限流 -> 人机验证 -> 字段校验 -> 查库
function rateLimitMiddleware(kind) {
  const { windowMin, max } = config.rateLimit[kind];
  return async (req, res, next) => {
    const key = `ratelimit:${kind}:${req.ip}`;
    const ok = await checkAndIncr(key, windowMin * 60, max);
    if (!ok) {
      return res.status(429).json({ error: '操作过于频繁，请稍后重试' });
    }
    next();
  };
}

async function captchaMiddleware(req, res, next) {
  const ok = await verifyCaptcha(req.body.captchaToken);
  if (!ok) {
    return res.status(400).json({ error: '人机验证未通过' });
  }
  next();
}

// 用 ua-parser-js 解析 User-Agent，不手写正则猜设备类型
function requestMeta(req) {
  const ua = req.headers['user-agent'] || '';
  const { device, browser } = new UAParser(ua).getResult();

  return {
    ip: req.ip,
    deviceType: device.type || 'desktop', // ua-parser-js 对桌面端不返回 type 字段，默认按 desktop 处理
    browser: [browser.name, browser.version].filter(Boolean).join(' '),
  };
}

function cookieOptions(ttlSec) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ttlSec * 1000,
    path: '/',
  };
}

// 密码登录、验证码登录成功/失败后的响应逻辑是一样的（都会走到 checkAccountStatus），抽出来复用
function respondAuthResult(res, result, invalidMessage) {
  if (!result.ok) {
    if (result.reason === 'BANNED') {
      return res.status(403).json({ error: '账号异常', reason: result.banReason || '' });
    }
    if (result.reason === 'DELETED') {
      return res.status(403).json({ error: '账号已注销' });
    }
    return res.status(401).json({ error: invalidMessage });
  }

  res.cookie(config.cookie.name, result.sessionId, cookieOptions(result.ttl));
  res.json({ message: '登录成功', user: result.user });
}

router.post('/register', rateLimitMiddleware('register'), captchaMiddleware, async (req, res) => {
  try {
    const { email, nickname, password } = req.body;

    if (!validator.isValidEmail(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
    const nicknameCheck = validator.validateNickname(nickname);
    if (!nicknameCheck.valid) {
      return res.status(400).json({ error: nicknameCheck.reason });
    }
    const passwordCheck = validator.validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.reason });
    }

    const result = await authService.startRegister({ email, nickname, password });
    res.json({ message: '验证码已发送', token: result.token });
  } catch (err) {
    if (err.code === 'RATE_LIMITED') {
      return res.status(429).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

router.post('/register/verify', async (req, res) => {
  try {
    const { token, code } = req.body;
    if (!token || !code) {
      return res.status(400).json({ error: 'token 和验证码不能为空' });
    }

    const result = await authService.verifyRegister({ token, code }, requestMeta(req));

    res.cookie(config.cookie.name, result.sessionId, cookieOptions(result.ttl));
    res.status(201).json({ message: '注册成功', user: result.user });
  } catch (err) {
    if (['EXPIRED', 'TOO_MANY_ATTEMPTS', 'INVALID_CODE'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

router.post('/login', rateLimitMiddleware('login'), captchaMiddleware, async (req, res) => {
  try {
    const { account, password, remember } = req.body;
    if (!account || !password) {
      return res.status(400).json({ error: '账号和密码不能为空' });
    }

    const result = await authService.login({ account, password, remember }, requestMeta(req));
    respondAuthResult(res, result, '账号或密码错误');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

router.post('/login/code', rateLimitMiddleware('login'), captchaMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!validator.isValidEmail(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const result = await authService.startLoginCode({ email });
    res.json({ message: '验证码已发送', token: result.token });
  } catch (err) {
    if (err.code === 'RATE_LIMITED') {
      return res.status(429).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

router.post('/login/code/verify', async (req, res) => {
  try {
    const { token, code } = req.body;
    if (!token || !code) {
      return res.status(400).json({ error: 'token 和验证码不能为空' });
    }

    const result = await authService.verifyLoginCode({ token, code }, requestMeta(req));
    respondAuthResult(res, result, '验证码错误');
  } catch (err) {
    if (['EXPIRED', 'TOO_MANY_ATTEMPTS', 'INVALID_CODE'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

router.post('/forgot-password', rateLimitMiddleware('login'), captchaMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!validator.isValidEmail(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const result = await authService.startForgotPassword({ email });
    res.json({ message: '验证码已发送', token: result.token });
  } catch (err) {
    if (err.code === 'RATE_LIMITED') {
      return res.status(429).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

router.post('/forgot-password/verify', async (req, res) => {
  try {
    const { token, code } = req.body;
    if (!token || !code) {
      return res.status(400).json({ error: 'token 和验证码不能为空' });
    }

    const result = await authService.verifyForgotPassword({ token, code });
    res.json({ token: result.token });
  } catch (err) {
    if (['EXPIRED', 'TOO_MANY_ATTEMPTS', 'INVALID_CODE'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

router.post('/forgot-password/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token 和新密码不能为空' });
    }

    const passwordCheck = validator.validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.reason });
    }

    const result = await authService.resetPassword({ token, newPassword }, requestMeta(req));

    res.cookie(config.cookie.name, result.sessionId, cookieOptions(result.ttl));
    res.json({ message: '密码重置成功', user: result.user });
  } catch (err) {
    if (['NOT_VERIFIED', 'EXPIRED', 'SAME_PASSWORD'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '重置失败，请稍后重试' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  await authService.logout(req.sessionId);
  res.clearCookie(config.cookie.name);
  res.json({ message: '已退出登录' });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await authService.findUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ error: '请先登录' });
  }
  res.json({ user: authService.serializeUser(user) });
});

router.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await authService.listSessions(req.user.id, req.sessionId);
  res.json({ sessions });
});

router.delete('/sessions/:ref', requireAuth, async (req, res) => {
  try {
    await authService.revokeSession(req.user.id, req.params.ref, req.sessionId);
    res.json({ message: '已下线该设备' });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    if (err.code === 'CURRENT_DEVICE') {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
});

module.exports = router;
