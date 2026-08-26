const bcrypt = require('bcrypt');
const pool = require('../lib/db');
const redis = require('../lib/redis');
const config = require('../config');
const { generatePublicId, generateToken, generateDefaultUsername } = require('../utils/id');
const { sendMail } = require('../lib/mailer');
const { checkAndIncr } = require('../lib/rateLimit');
const sessionLib = require('../lib/session');

const REGISTRATION_PREFIX = 'registration:';
const REGISTRATION_EMAIL_PREFIX = 'registration_email:';
const LOGIN_CODE_PREFIX = 'login_code:';
const RESET_PWD_PREFIX = 'reset_pwd:';

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function findIdentity(type, value) {
  const [rows] = await pool.query(
    'SELECT * FROM user_identities WHERE type = ? AND value = ?',
    [type, value]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

// 发送冷却 + 每小时上限，两个条件都过才允许发送
async function canSendEmail(email, { cooldownSec, maxPerHour }) {
  const cooldownKey = `email_cooldown:${email}`;
  const onCooldown = await redis.exists(cooldownKey);
  if (onCooldown) return false;

  const withinHourLimit = await checkAndIncr(`email_send:${email}`, 3600, maxPerHour);
  if (!withinHourLimit) return false;

  await redis.set(cooldownKey, '1', 'EX', cooldownSec);
  return true;
}

// 生成验证码并存入 Redis，返回 token 和明文验证码（调用方负责发邮件）
async function issueVerificationCode(prefix, ttlSec, data) {
  const token = generateToken();
  const code = genCode();

  await redis.hset(`${prefix}${token}`, { ...data, code, attempts: '0' });
  await redis.expire(`${prefix}${token}`, ttlSec);

  return { token, code };
}

// 校验验证码：处理"已过期"、"尝试次数超限"、"验证码错误"三种失败，成功则返回存储的数据
// 不在这里做成功后的清理（删除 key / 标记已验证），因为不同流程对"验证成功后"的处理不一样，交给调用方
async function consumeVerificationCode(prefix, token, code, maxAttempts) {
  const key = `${prefix}${token}`;
  const data = await redis.hgetall(key);

  if (!data || !data.code) {
    const err = new Error('验证码已过期，请重新获取');
    err.code = 'EXPIRED';
    throw err;
  }

  const attempts = Number(data.attempts || 0);
  if (attempts >= maxAttempts) {
    await redis.del(key);
    const err = new Error('验证码错误次数过多，请重新获取');
    err.code = 'TOO_MANY_ATTEMPTS';
    throw err;
  }

  if (data.code !== code) {
    await redis.hincrby(key, 'attempts', 1);
    const err = new Error('验证码错误');
    err.code = 'INVALID_CODE';
    throw err;
  }

  return data;
}

// 密码/验证码登录通用状态判断（design-principles.md 1.1 例外：验证通过后可以明确告知封禁/注销状态）
function checkAccountStatus(user) {
  if (user.status === 'banned') {
    return { ok: false, reason: 'BANNED', banReason: user.ban_reason };
  }
  if (user.status === 'deleted') {
    return { ok: false, reason: 'DELETED' };
  }
  return { ok: true };
}

async function generateUniqueUsername() {
  for (let i = 0; i < 5; i++) {
    const candidate = generateDefaultUsername();
    const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [candidate]);
    if (rows.length === 0) return candidate;
  }
  throw new Error('生成默认用户名失败，请重试');
}

// 注册第一步：校验通过后发验证码，中间态存 Redis（ADR-006 / database-schema.md 4节）
async function startRegister({ email, nickname, password }) {
  const { expireMin } = config.verification.register;
  const identity = await findIdentity('email', email);

  const canSend = await canSendEmail(email, config.verification.register);
  if (!canSend) {
    const err = new Error('发送过于频繁，请稍后重试');
    err.code = 'RATE_LIMITED';
    throw err;
  }

  const token = generateToken();

  if (identity) {
    // 邮箱已注册：页面表现与正常流程一致，真实情况通过邮件告知（design-principles.md 1.1）
    await sendMail({
      to: email,
      subject: '注册提醒',
      text: '有人使用您的邮箱尝试注册 Photoer，如果是您本人请直接登录。',
    });

    await redis.hset(`${REGISTRATION_PREFIX}${token}`, {
      email,
      nickname: nickname || '',
      passwordHash: '',
      code: '',
      attempts: '0',
      taken: '1',
    });
    await redis.expire(`${REGISTRATION_PREFIX}${token}`, expireMin * 60);

    return { token };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const code = genCode();

  // 同一邮箱重复提交，覆盖旧申请，旧验证码立即失效
  const oldToken = await redis.get(`${REGISTRATION_EMAIL_PREFIX}${email}`);
  if (oldToken) {
    await redis.del(`${REGISTRATION_PREFIX}${oldToken}`);
  }

  await redis.hset(`${REGISTRATION_PREFIX}${token}`, {
    email,
    nickname,
    passwordHash,
    code,
    attempts: '0',
    taken: '0',
  });
  await redis.expire(`${REGISTRATION_PREFIX}${token}`, expireMin * 60);
  await redis.set(`${REGISTRATION_EMAIL_PREFIX}${email}`, token, 'EX', expireMin * 60);

  await sendMail({
    to: email,
    subject: 'Photoer 注册验证码',
    text: `你的验证码是 ${code}，${expireMin} 分钟内有效。`,
  });

  return { token };
}

// 注册第二步：验证码校验通过后建 users + user_identities，创建 Session
async function verifyRegister({ token, code }, meta) {
  const key = `${REGISTRATION_PREFIX}${token}`;
  const data = await redis.hgetall(key);

  if (!data || !data.email) {
    const err = new Error('验证码已过期，请重新注册');
    err.code = 'EXPIRED';
    throw err;
  }

  const { maxAttempts } = config.verification.register;
  const attempts = Number(data.attempts || 0);

  if (attempts >= maxAttempts) {
    await redis.del(key);
    const err = new Error('验证码错误次数过多，请重新获取');
    err.code = 'TOO_MANY_ATTEMPTS';
    throw err;
  }

  if (data.taken === '1' || data.code !== code) {
    await redis.hincrby(key, 'attempts', 1);
    const err = new Error('验证码错误');
    err.code = 'INVALID_CODE';
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const publicId = generatePublicId();
    const username = await generateUniqueUsername();

    const [result] = await conn.query(
      `INSERT INTO users (public_id, username, nickname, password_hash, status, username_customized, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 0, NOW(), NOW())`,
      [publicId, username, data.nickname, data.passwordHash]
    );
    const userId = result.insertId;

    await conn.query(
      `INSERT INTO user_identities (user_id, type, value, verified_at, created_at)
       VALUES (?, 'email', ?, NOW(), NOW())`,
      [userId, data.email]
    );

    await conn.commit();

    await redis.del(key);
    await redis.del(`${REGISTRATION_EMAIL_PREFIX}${data.email}`);

    const { sessionId, ttl } = await sessionLib.createSession(userId, meta);

    return {
      sessionId,
      ttl,
      user: serializeUser({ public_id: publicId, username, nickname: data.nickname }),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 密码登录：account 含 @ 按邮箱查，否则按 username 查（auth-design.md 3.2）
async function login({ account, password, remember }, meta) {
  const isEmail = account.includes('@');
  let user;

  if (isEmail) {
    const identity = await findIdentity('email', account);
    user = identity ? await findUserById(identity.user_id) : null;
  } else {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [account]);
    user = rows[0] || null;
  }

  if (!user) {
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  const statusCheck = checkAccountStatus(user);
  if (!statusCheck.ok) return statusCheck;

  const { sessionId, ttl } = await sessionLib.createSession(user.id, { ...meta, remember: !!remember });

  return { ok: true, sessionId, ttl, user: serializeUser(user) };
}

// 验证码登录第一步：发验证码，账号不存在时页面表现一致，邮件内容不同（design-principles.md 1.1）
async function startLoginCode({ email }) {
  const { expireMin, cooldownSec, maxPerHour } = config.verification.login;

  const canSend = await canSendEmail(email, { cooldownSec, maxPerHour });
  if (!canSend) {
    const err = new Error('发送过于频繁，请稍后重试');
    err.code = 'RATE_LIMITED';
    throw err;
  }

  const identity = await findIdentity('email', email);

  if (!identity) {
    await issueVerificationCode(LOGIN_CODE_PREFIX, expireMin * 60, { email, exists: '0' });
    await sendMail({
      to: email,
      subject: '登录提醒',
      text: '该邮箱尚未注册 Photoer，如果不是你本人操作，请忽略此邮件。',
    });
    // 不存在的邮箱也要返回一个 token，行为跟正常流程保持一致
    return { token: generateToken() };
  }

  const { token, code } = await issueVerificationCode(LOGIN_CODE_PREFIX, expireMin * 60, {
    email,
    exists: '1',
    userId: String(identity.user_id),
  });

  await sendMail({
    to: email,
    subject: 'Photoer 登录验证码',
    text: `你的验证码是 ${code}，${expireMin} 分钟内有效。`,
  });

  return { token };
}

// 验证码登录第二步：校验通过直接登录，跳过密码
async function verifyLoginCode({ token, code }, meta) {
  const { maxAttempts } = config.verification.login;
  const data = await consumeVerificationCode(LOGIN_CODE_PREFIX, token, code, maxAttempts);

  await redis.del(`${LOGIN_CODE_PREFIX}${token}`);

  if (data.exists !== '1') {
    const err = new Error('验证码错误');
    err.code = 'INVALID_CODE';
    throw err;
  }

  const user = await findUserById(Number(data.userId));
  if (!user) {
    const err = new Error('验证码错误');
    err.code = 'INVALID_CODE';
    throw err;
  }

  const statusCheck = checkAccountStatus(user);
  if (!statusCheck.ok) return statusCheck;

  const { sessionId, ttl } = await sessionLib.createSession(user.id, meta);

  return { ok: true, sessionId, ttl, user: serializeUser(user) };
}

// 忘记密码第一步：发验证码，逻辑跟验证码登录一样，账号不存在时页面表现一致
async function startForgotPassword({ email }) {
  const { expireMin, cooldownSec, maxPerHour } = config.verification.resetPassword;

  const canSend = await canSendEmail(email, { cooldownSec, maxPerHour });
  if (!canSend) {
    const err = new Error('发送过于频繁，请稍后重试');
    err.code = 'RATE_LIMITED';
    throw err;
  }

  const identity = await findIdentity('email', email);

  if (!identity) {
    await issueVerificationCode(RESET_PWD_PREFIX, expireMin * 60, { email, exists: '0' });
    await sendMail({
      to: email,
      subject: '重置密码提醒',
      text: '该邮箱尚未在 Photoer 注册，如果不是你本人操作，请忽略此邮件。',
    });
    return { token: generateToken() };
  }

  const { token, code } = await issueVerificationCode(RESET_PWD_PREFIX, expireMin * 60, {
    email,
    exists: '1',
    userId: String(identity.user_id),
  });

  await sendMail({
    to: email,
    subject: 'Photoer 重置密码验证码',
    text: `你的验证码是 ${code}，${expireMin} 分钟内有效。`,
  });

  return { token };
}

// 忘记密码第二步：只校验验证码，不改密码，跟注册/登录验证码不同，这里验证通过后还要走第三步才真正改密码
async function verifyForgotPassword({ token, code }) {
  const { maxAttempts } = config.verification.resetPassword;
  const data = await consumeVerificationCode(RESET_PWD_PREFIX, token, code, maxAttempts);

  if (data.exists !== '1') {
    const err = new Error('验证码错误');
    err.code = 'INVALID_CODE';
    throw err;
  }

  await redis.hset(`${RESET_PWD_PREFIX}${token}`, 'verified', '1');

  return { token };
}

// 忘记密码第三步：设置新密码，要求上一步已经验证过；改密码后踢掉所有设备、自动登录（ADR-003 强制下线场景）
async function resetPassword({ token, newPassword }, meta) {
  const key = `${RESET_PWD_PREFIX}${token}`;
  const data = await redis.hgetall(key);

  if (!data || data.verified !== '1') {
    const err = new Error('请先完成验证码校验');
    err.code = 'NOT_VERIFIED';
    throw err;
  }

  const user = await findUserById(Number(data.userId));
  if (!user) {
    const err = new Error('操作已过期，请重新发起');
    err.code = 'EXPIRED';
    throw err;
  }

  const isSameAsOld = await bcrypt.compare(newPassword, user.password_hash);
  if (isSameAsOld) {
    const err = new Error('新密码不能与旧密码相同');
    err.code = 'SAME_PASSWORD';
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, user.id]);

  await redis.del(key);
  await sessionLib.destroyAllSessions(user.id);

  const { sessionId, ttl } = await sessionLib.createSession(user.id, meta);

  return { sessionId, ttl, user: serializeUser(user) };
}

async function logout(sessionId) {
  if (sessionId) await sessionLib.destroySession(sessionId);
}

// 内部 id 永不对外暴露（ADR-005 / database-schema.md 5.3）
function serializeUser(user) {
  return {
    publicId: user.public_id,
    username: user.username,
    nickname: user.nickname,
  };
}

module.exports = {
  startRegister,
  verifyRegister,
  login,
  startLoginCode,
  verifyLoginCode,
  startForgotPassword,
  verifyForgotPassword,
  resetPassword,
  logout,
  findUserById,
  serializeUser,
};
