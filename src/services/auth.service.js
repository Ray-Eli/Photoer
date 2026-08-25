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

  // 密码验证通过后才能明确告知封禁/注销状态（design-principles.md 1.1 例外条款）
  if (user.status === 'banned') {
    return { ok: false, reason: 'BANNED', banReason: user.ban_reason };
  }
  if (user.status === 'deleted') {
    return { ok: false, reason: 'DELETED' };
  }

  const { sessionId, ttl } = await sessionLib.createSession(user.id, { ...meta, remember: !!remember });

  return { ok: true, sessionId, ttl, user: serializeUser(user) };
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
  logout,
  findUserById,
  serializeUser,
};
