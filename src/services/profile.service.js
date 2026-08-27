const pool = require('../lib/db');
const config = require('../config');
// findUserById 是 auth.service.js 和 profile.service.js 共用的函数，拆分时没有复制一份，
// 而是从 auth.service.js 引入——这是临时处理，不是最终方案，已经在拆分汇报里跟用户说明，等待决定
// 要不要挪到 src/lib/ 或 src/utils/ 下面去
const { findUserById } = require('./auth.service');

// 用户名可用性判断，严格对应 database-schema.md 的冷却期判断流程图
// username_history 里同一个用户名可能有多条历史记录（先后被不同人放弃过），
// 永久锁定只要命中任意一条就生效；90天冷却期只看最近一次释放的时间
async function isUsernameAvailable(username, requestingUserId) {
  const [existingUsers] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
  if (existingUsers.length > 0) return false;

  const [historyRows] = await pool.query(
    'SELECT user_id, released_at, locked_forever FROM username_history WHERE username = ?',
    [username]
  );

  if (historyRows.length === 0) return true;
  if (historyRows.some((r) => r.locked_forever)) return false;

  const latest = historyRows.reduce((a, b) => (a.released_at > b.released_at ? a : b));
  const cooldownMs = config.username.cooldownDays * 86400 * 1000;
  const withinCooldown = Date.now() - new Date(latest.released_at).getTime() < cooldownMs;

  if (!withinCooldown) return true;
  return latest.user_id === requestingUserId;
}

// 改用户名：格式/保留词校验在路由层已经做过（复用 validator.js），这里只处理可用性判断、频率限制、事务替换
// 频率限制按滚动 365 天窗口算，首次把默认用户名改成自定义名字也计入次数（ADR-007）
async function changeUsername(userId, newUsername) {
  const available = await isUsernameAvailable(newUsername, userId);
  if (!available) {
    const err = new Error('该用户名当前不可用');
    err.code = 'UNAVAILABLE';
    throw err;
  }

  const [freqRows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM username_history WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY)',
    [userId]
  );
  if (freqRows[0].cnt >= config.username.maxChangesPerYear) {
    const err = new Error('改名次数已达上限，请稍后再试');
    err.code = 'RATE_LIMITED';
    throw err;
  }

  const user = await findUserById(userId);
  if (!user) {
    const err = new Error('用户不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO username_history (user_id, username, released_at, locked_forever, created_at)
       VALUES (?, ?, NOW(), 0, NOW())`,
      [userId, user.username]
    );

    await conn.query(
      'UPDATE users SET username = ?, username_customized = 1, updated_at = NOW() WHERE id = ?',
      [newUsername, userId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { username: newUsername };
}

// 改昵称：格式校验在路由层已经做过；频率限制按滚动 14 天窗口算
async function changeNickname(userId, newNickname) {
  const { changeLimit } = config.nickname;

  const [freqRows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM nickname_history WHERE user_id = ? AND changed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)',
    [userId, changeLimit.days]
  );
  if (freqRows[0].cnt >= changeLimit.times) {
    const err = new Error('改昵称次数已达上限，请稍后再试');
    err.code = 'RATE_LIMITED';
    throw err;
  }

  const user = await findUserById(userId);
  if (!user) {
    const err = new Error('用户不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO nickname_history (user_id, old_nickname, new_nickname, changed_at)
       VALUES (?, ?, ?, NOW())`,
      [userId, user.nickname, newNickname]
    );

    await conn.query('UPDATE users SET nickname = ?, updated_at = NOW() WHERE id = ?', [newNickname, userId]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { nickname: newNickname };
}

module.exports = {
  changeUsername,
  changeNickname,
};
