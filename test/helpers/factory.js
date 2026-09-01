// 造测试数据的工厂。直接写库 + 直接用 sessionLib 建会话——这是测试前置数据准备，
// 不是给生产代码开后门（验证码等仍从 Redis 读，不改生产代码）。
// 需要完整走一遍真实流程的用例，用 flows.js 里的多步 helper。

require('./guard');
const bcrypt = require('bcrypt');
const pool = require('../../src/lib/db');
const sessionLib = require('../../src/lib/session');
const { generatePublicId, generateDefaultUsername } = require('../../src/utils/id');

const DEFAULT_PASSWORD = 'passw0rd-abc';

let emailSeq = 0;
// 每次调用给一个进程内唯一的邮箱，避免用例内多次建号撞唯一索引 / 撞发信冷却
function uniqueEmail(tag = 'u') {
  emailSeq += 1;
  return `${tag}-${process.pid}-${emailSeq}@example.com`;
}

// 直接插一条用户（+ 可选 email 凭证）。status 可传 active / banned / deleted。
async function createUser(opts = {}) {
  const {
    email = uniqueEmail(),
    password = DEFAULT_PASSWORD,
    nickname = '测试用户',
    username = generateDefaultUsername(),
    status = 'active',
    banReason = null,
    usernameCustomized = 0,
  } = opts;

  const publicId = generatePublicId();
  const passwordHash = await bcrypt.hash(password, 10);

  const [r] = await pool.query(
    `INSERT INTO users
       (public_id, username, nickname, password_hash, status, ban_reason, username_customized,
        deleted_at, purge_after, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      publicId, username, nickname, passwordHash, status, banReason, usernameCustomized,
      status === 'deleted' ? new Date() : null,
      status === 'deleted' ? new Date(Date.now() + 30 * 86400000) : null,
    ]
  );
  const userId = r.insertId;

  if (email) {
    await pool.query(
      `INSERT INTO user_identities (user_id, type, value, verified_at, created_at)
       VALUES (?, 'email', ?, NOW(), NOW())`,
      [userId, email]
    );
  }

  return { userId, publicId, username, nickname, email, password, status };
}

// 给某个用户建一个真实 Session，返回可直接塞进 .set('Cookie', ...) 的字符串
async function sessionCookieFor(userId, sessionOpts = {}) {
  const { sessionId } = await sessionLib.createSession(userId, sessionOpts);
  return { cookie: `sid=${sessionId}`, sessionId };
}

// 最常用：建一个 active 用户并给一个已登录的 Cookie
async function loggedInUser(opts = {}) {
  const user = await createUser(opts);
  const { cookie, sessionId } = await sessionCookieFor(user.userId, opts.session || {});
  return { ...user, cookie, sessionId };
}

module.exports = {
  DEFAULT_PASSWORD,
  uniqueEmail,
  createUser,
  sessionCookieFor,
  loggedInUser,
};
