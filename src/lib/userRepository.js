const pool = require('./db');

// 纯数据访问：只负责读写 users 表本身，不含任何业务规则判断（可用性、冷却期、频率限制等留在 service 层）

async function findUserById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findUserByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0] || null;
}

async function updatePasswordHash(userId, passwordHash) {
  await pool.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, userId]);
}

module.exports = {
  findUserById,
  findUserByUsername,
  updatePasswordHash,
};
