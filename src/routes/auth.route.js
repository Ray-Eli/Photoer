const express = require('express');
const { UAParser } = require('ua-parser-js');
const authService = require('../services/auth.service');
const validator = require('../utils/validator');
const { verifyCaptcha } = require('../lib/captcha');
const { setSessionCookie, clearSessionCookie } = require('../lib/cookie');
const { requireAuth } = require('../middlewares/session.middleware');
const { rateLimit } = require('../middlewares/rateLimit.middleware');

const router = express.Router();

// 验证顺序：便宜的检查在前（design-principles.md 1.2）—— IP 限流 -> 人机验证 -> 字段校验 -> 查库
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

  setSessionCookie(res, result.sessionId, result.ttl);
  res.json({ message: '登录成功', user: result.user });
}

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [认证]
 *     summary: 注册第一步：提交邮箱/昵称/密码，发送验证码
 *     description: |
 *       无论提交的邮箱是否已经被注册，成功响应的结构和内容都完全相同（都是"验证码已发送"）——
 *       这是刻意设计，不让响应差异暴露某个邮箱是否已注册（design-principles.md 1.1）。
 *       如果邮箱已被占用，验证码不会真的发给这次操作者，实际发送的邮件内容是告知邮箱的真实所有者。
 *       同一邮箱重复提交会覆盖旧的申请，旧验证码立即失效。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, nickname, password]
 *             properties:
 *               email: { type: string, format: email }
 *               nickname: { type: string, maxLength: 30, description: 不能为空，去除首尾空格后最多30字符 }
 *               password: { type: string, minLength: 8, description: 最少8位，不强制字符类型 }
 *               captchaToken: { type: string, description: 人机验证 token，当前打桩，任意值或不传都会通过 }
 *     responses:
 *       200:
 *         description: 验证码已发送（不代表邮箱一定可用于注册，需要在验证步骤才能确认）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 验证码已发送 }
 *                 token: { type: string, description: 下一步 /register/verify 需要带上这个值 }
 *       400:
 *         description: 邮箱格式不正确 / 昵称不合法（为空或超长） / 密码不合法（少于8位）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429:
 *         description: 该 IP 15 分钟内注册请求超过 20 次；或该邮箱发送验证码过于频繁（60秒内重复请求，或1小时内超过5次）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/register', rateLimit('register'), captchaMiddleware, async (req, res) => {
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

/**
 * @swagger
 * /api/auth/register/verify:
 *   post:
 *     tags: [认证]
 *     summary: 注册第二步：校验验证码，成功后建号并自动登录
 *     description: |
 *       如果第一步提交的邮箱其实已被占用，这一步无论输入什么验证码都会返回"验证码错误"——
 *       前端表现和"验证码确实输错了"完全一致，不会额外提示"这个邮箱已被注册"。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, code]
 *             properties:
 *               token: { type: string, description: 第一步返回的 token }
 *               code: { type: string, description: 6位数字验证码 }
 *     responses:
 *       201:
 *         description: 注册成功，响应会带上 Set-Cookie 种下登录态
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 注册成功 }
 *                 user: { $ref: '#/components/schemas/UserPublic' }
 *       400:
 *         description: |
 *           token/code 为空；或以下三种情况之一（响应结构相同，均为"验证码错误"类提示，不区分具体原因）：
 *           验证码已过期需重新注册（token 无效或已过期）、验证码错误次数已达上限（5次）需重新获取、
 *           验证码本身输错（含"邮箱其实已被占用"的情况）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/register/verify', async (req, res) => {
  try {
    const { token, code } = req.body;
    if (!token || !code) {
      return res.status(400).json({ error: 'token 和验证码不能为空' });
    }

    const result = await authService.verifyRegister({ token, code }, requestMeta(req));

    setSessionCookie(res, result.sessionId, result.ttl);
    res.status(201).json({ message: '注册成功', user: result.user });
  } catch (err) {
    if (['EXPIRED', 'TOO_MANY_ATTEMPTS', 'INVALID_CODE'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [认证]
 *     summary: 密码登录
 *     description: |
 *       account 参数含 @ 时按邮箱查账号，否则按用户名查。账号不存在、密码错误这两种情况
 *       统一返回同一句"账号或密码错误"，不区分具体原因（design-principles.md 1.1）。
 *       只有密码验证通过之后，才会明确告知账号被封禁或已注销（此时已确认操作者持有正确密码，
 *       不算泄露账号存在性，属于 1.1 条的例外情形）。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [account, password]
 *             properties:
 *               account: { type: string, description: 用户名或邮箱 }
 *               password: { type: string }
 *               remember: { type: boolean, description: 记住我，影响 Session 闲置/绝对超时时长 }
 *               captchaToken: { type: string, description: 人机验证 token，当前打桩 }
 *     responses:
 *       200:
 *         description: 登录成功，响应带 Set-Cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 登录成功 }
 *                 user: { $ref: '#/components/schemas/UserPublic' }
 *       400:
 *         description: 账号或密码为空
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 账号不存在或密码错误（两种情况统一提示，不区分）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 密码正确，但账号异常（封禁，响应带 reason 字段说明原因）或账号已注销
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429:
 *         description: 该 IP 15 分钟内登录请求超过 30 次
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/login', rateLimit('login'), captchaMiddleware, async (req, res) => {
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

/**
 * @swagger
 * /api/auth/login/code:
 *   post:
 *     tags: [认证]
 *     summary: 验证码登录第一步：发验证码
 *     description: |
 *       无论邮箱是否已注册，成功响应的结构和内容都完全相同（都是"验证码已发送"）。
 *       邮箱不存在时，验证码不会真的可用，实际发送的邮件内容是提示"该邮箱尚未注册"。
 *       验证码登录会跳过密码，因此登录后的敏感操作（改密码、换绑邮箱、注销）仍需要输入密码验证。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               captchaToken: { type: string, description: 人机验证 token，当前打桩 }
 *     responses:
 *       200:
 *         description: 验证码已发送
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 验证码已发送 }
 *                 token: { type: string }
 *       400:
 *         description: 邮箱格式不正确
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429:
 *         description: 该 IP 15 分钟内登录请求超过 30 次；或该邮箱发送验证码过于频繁
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/login/code', rateLimit('login'), captchaMiddleware, async (req, res) => {
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

/**
 * @swagger
 * /api/auth/login/code/verify:
 *   post:
 *     tags: [认证]
 *     summary: 验证码登录第二步：校验通过直接登录，跳过密码
 *     description: |
 *       邮箱不存在时，无论输入什么验证码都返回"验证码错误"，不会额外提示邮箱未注册。
 *       密码验证通过后如果账号被封禁/已注销的例外条款在这里不适用（这里没有密码这一步），
 *       所以封禁/注销状态是在验证码本身校验通过之后才检查和告知的。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, code]
 *             properties:
 *               token: { type: string }
 *               code: { type: string, description: 6位数字验证码 }
 *     responses:
 *       200:
 *         description: 登录成功，响应带 Set-Cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 登录成功 }
 *                 user: { $ref: '#/components/schemas/UserPublic' }
 *       400:
 *         description: |
 *           token/code 为空；或验证码已过期/尝试次数超限（5次）/验证码错误（含"邮箱其实不存在"的情况，
 *           统一提示"验证码错误"，不区分）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 验证码正确，但账号被封禁（带 reason）或已注销
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
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

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [认证]
 *     summary: 忘记密码第一步：发验证码
 *     description: |
 *       无论邮箱是否已注册，成功响应完全相同（都是"验证码已发送"）。邮箱未注册时，实际发送的
 *       邮件内容是提示"该邮箱尚未注册"。邮箱如果关联一个处于注销冷却期的账号，发送的邮件会
 *       说明这一情况和剩余冷却天数，但页面响应同样不会有任何差异。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               captchaToken: { type: string, description: 人机验证 token，当前打桩 }
 *     responses:
 *       200:
 *         description: 验证码已发送
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 验证码已发送 }
 *                 token: { type: string }
 *       400:
 *         description: 邮箱格式不正确
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429:
 *         description: 该 IP 15 分钟内登录/找回密码类请求超过 30 次；或该邮箱发送验证码过于频繁
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/forgot-password', rateLimit('login'), captchaMiddleware, async (req, res) => {
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

/**
 * @swagger
 * /api/auth/forgot-password/verify:
 *   post:
 *     tags: [认证]
 *     summary: 忘记密码第二步：只校验验证码，不改密码
 *     description: |
 *       跟注册/登录的验证码流程不同，这一步验证通过后只是把该 token 标记为"已验证"，
 *       还需要走第三步（提交新密码）才会真正修改密码。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, code]
 *             properties:
 *               token: { type: string }
 *               code: { type: string, description: 6位数字验证码 }
 *     responses:
 *       200:
 *         description: 验证码校验通过
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string, description: 下一步 /forgot-password/reset 要带上这个值（跟本次传入的相同） }
 *       400:
 *         description: token/code 为空；或验证码已过期/尝试次数超限（5次）/验证码错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
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

/**
 * @swagger
 * /api/auth/forgot-password/reset:
 *   post:
 *     tags: [认证]
 *     summary: 忘记密码第三步：设置新密码，成功后踢掉所有旧设备并自动登录新 Session
 *     description: |
 *       要求 token 已经在第二步验证码校验通过。账号状态检查放在这一步（验证码通过之后），
 *       不放在第一步，是为了不让"发验证码"这一步暴露账号状态——此时已经确认操作者拿得到
 *       这个邮箱，属于 design-principles.md 1.1 条允许告知状态的例外情形。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, minLength: 8, description: 最少8位，不能与原密码相同 }
 *     responses:
 *       200:
 *         description: 密码重置成功，响应带 Set-Cookie（自动登录新 Session，所有旧设备已被踢下线）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 密码重置成功 }
 *                 user: { $ref: '#/components/schemas/UserPublic' }
 *       400:
 *         description: |
 *           token/新密码为空；或以下情况之一：还没完成验证码校验、token 已过期、新密码格式不合法（少于8位）、
 *           新密码与原密码相同
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 账号被封禁（带 reason）或已注销——不会修改密码，也不会创建 Session
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
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

    setSessionCookie(res, result.sessionId, result.ttl);
    res.json({ message: '密码重置成功', user: result.user });
  } catch (err) {
    if (err.code === 'BANNED') {
      return res.status(403).json({ error: '账号异常', reason: err.banReason || '' });
    }
    if (err.code === 'DELETED') {
      return res.status(403).json({ error: '账号已注销' });
    }
    if (['NOT_VERIFIED', 'EXPIRED', 'SAME_PASSWORD'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '重置失败，请稍后重试' });
  }
});

/**
 * @swagger
 * /api/auth/change-email:
 *   post:
 *     tags: [认证]
 *     summary: 换绑邮箱第一步：校验当前密码 + 提交新邮箱，发验证码
 *     description: |
 *       需要先验证当前登录密码（敏感操作二次验证）。新邮箱如果已被其他账号占用，成功响应
 *       跟未被占用时完全相同（都是"验证码已发送"）——真实情况会通过邮件告知那个被占用邮箱的
 *       所有者，操作者本人不会收到任何能用的验证码。
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password, newEmail]
 *             properties:
 *               password: { type: string, description: 当前账号密码 }
 *               newEmail: { type: string, format: email }
 *               captchaToken: { type: string, description: 人机验证 token，当前打桩 }
 *     responses:
 *       200:
 *         description: 验证码已发送
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 验证码已发送 }
 *                 token: { type: string }
 *       400:
 *         description: 密码/新邮箱为空、邮箱格式不正确，或密码错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429:
 *         description: 该 IP 15 分钟内相关请求超过 30 次；或该邮箱发送验证码过于频繁
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/change-email', requireAuth, rateLimit('login'), captchaMiddleware, async (req, res) => {
  try {
    const { password, newEmail } = req.body;

    if (!password || !newEmail) {
      return res.status(400).json({ error: '密码和新邮箱不能为空' });
    }
    if (!validator.isValidEmail(newEmail)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const result = await authService.startChangeEmail(req.user.id, { password, newEmail });
    res.json({ message: '验证码已发送', token: result.token });
  } catch (err) {
    if (err.code === 'INVALID_PASSWORD') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'RATE_LIMITED') {
      return res.status(429).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
});

/**
 * @swagger
 * /api/auth/change-email/verify:
 *   post:
 *     tags: [认证]
 *     summary: 换绑邮箱第二步：校验验证码，成功后立即生效
 *     description: |
 *       成功后旧邮箱记录归档进历史表，新邮箱替换成为当前登录凭证；不会强制下线其他设备
 *       （账号本身没有失控迹象，跟改密码/注销的强制下线场景不同），事务提交后会给旧邮箱
 *       发一封安全通知。如果第一步时新邮箱其实已被占用，这里无论输入什么验证码都返回
 *       "验证码错误"。
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, code]
 *             properties:
 *               token: { type: string }
 *               code: { type: string, description: 6位数字验证码 }
 *     responses:
 *       200:
 *         description: 换绑成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 换绑成功 }
 *                 newEmail: { type: string }
 *       400:
 *         description: |
 *           token/code 为空；或验证码已过期/尝试次数超限（5次）/验证码错误（含"新邮箱其实已被占用"、
 *           "token 不是当前登录用户自己发起的"两种情况，均统一提示"验证码错误"）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/change-email/verify', requireAuth, async (req, res) => {
  try {
    const { token, code } = req.body;
    if (!token || !code) {
      return res.status(400).json({ error: 'token 和验证码不能为空' });
    }

    const result = await authService.verifyChangeEmail(req.user.id, { token, code });
    res.json({ message: '换绑成功', newEmail: result.newEmail });
  } catch (err) {
    if (['EXPIRED', 'TOO_MANY_ATTEMPTS', 'INVALID_CODE'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

/**
 * @swagger
 * /api/auth/delete-account:
 *   post:
 *     tags: [认证]
 *     summary: 注销账号（软删除，不可撤销）
 *     description: |
 *       需要先验证当前登录密码。成功后 users.status 改为 deleted，记录 deleted_at 和
 *       purge_after（30天后），踢掉该账号所有设备的 Session（含发起这次请求的当前设备）。
 *       不会删除任何用户数据（照片、评论等全部保留在原表）。30天后由定时清理任务
 *       （src/scripts/purgeDeletedAccounts.js）真正释放用户名和邮箱。
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, description: 当前账号密码 }
 *     responses:
 *       200:
 *         description: 账号已注销
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 账号已注销 }
 *       400:
 *         description: 密码为空，或密码错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/delete-account', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: '密码不能为空' });
    }

    await authService.deleteAccount(req.user.id, { password });

    clearSessionCookie(res);
    res.json({ message: '账号已注销' });
  } catch (err) {
    if (err.code === 'INVALID_PASSWORD') {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [认证]
 *     summary: 登出当前设备
 *     description: 只删除当前这一个 Session、清除 Cookie，不影响其他设备的登录状态。
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 已退出登录
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已退出登录 }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/logout', requireAuth, async (req, res) => {
  await authService.logout(req.sessionId);
  clearSessionCookie(res);
  res.json({ message: '已退出登录' });
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [认证]
 *     summary: 查询当前登录用户信息
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 已登录，返回用户信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/UserPublic' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/me', requireAuth, async (req, res) => {
  const user = await authService.findUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ error: '请先登录' });
  }
  res.json({ user: authService.serializeUser(user) });
});

module.exports = router;
