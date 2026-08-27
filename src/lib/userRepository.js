const pool = require('./db');

// 纯数据访问：只负责读写 users 表本身，不含任何业务规则判断（可用性、冷却期、频率限制等留在 service 层）
//
// 每个函数最后都接受一个可选的 conn 参数：传入时用调用方给的连接执行（参与调用方已经开启的事务），
// 不传时默认用连接池（自己独立获取连接执行）。事务的开启/提交/回滚由 service 层负责，
// 这里只负责"在指定的连接上执行这条 SQL"。

async function findUserById(id, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findUserByUsername(username, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0] || null;
}

async function updatePasswordHash(userId, passwordHash, conn = pool) {
  await conn.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, userId]);
}

async function insertUser({ publicId, username, nickname, passwordHash }, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO users (public_id, username, nickname, password_hash, status, username_customized, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', 0, NOW(), NOW())`,
    [publicId, username, nickname, passwordHash]
  );
  return result.insertId;
}

async function updateUsername(userId, newUsername, conn = pool) {
  await conn.query(
    'UPDATE users SET username = ?, username_customized = 1, updated_at = NOW() WHERE id = ?',
    [newUsername, userId]
  );
}

async function updateNickname(userId, newNickname, conn = pool) {
  await conn.query('UPDATE users SET nickname = ?, updated_at = NOW() WHERE id = ?', [newNickname, userId]);
}

module.exports = {
  findUserById,
  findUserByUsername,
  updatePasswordHash,
  insertUser,
  updateUsername,
  updateNickname,
};
