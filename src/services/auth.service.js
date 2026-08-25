const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../lib/db');

// 注册
async function register(username, password) {
  const passwordHash = await bcrypt.hash(password, 10);

  const [result] = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username, passwordHash]
  );

  return { userId: result.insertId };
}

// 登录
async function login(username, password) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE username = ?',
    [username]
  );

  if (rows.length === 0) {
    return null;
  }

  const user = rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    return null;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { token };
}

module.exports = { register, login };