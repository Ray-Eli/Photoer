const config = require('../config');

// 邮箱格式
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  if (email.length > 255) return false;
  // 基础格式校验：有@、@前后都有内容、有点号
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 用户名格式
function validateUsername(username) {
  const { minLength, maxLength, allowPureNumber } = config.username;

  if (typeof username !== 'string') {
    return { valid: false, reason: '用户名格式不正确' };
  }

  if (username.length < minLength || username.length > maxLength) {
    return { valid: false, reason: `用户名长度需在 ${minLength}-${maxLength} 字符之间` };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, reason: '用户名只能包含字母、数字和下划线' };
  }

  if (!allowPureNumber && /^\d+$/.test(username)) {
    return { valid: false, reason: '用户名不能是纯数字' };
  }

  if (config.reservedUsernames.includes(username.toLowerCase())) {
    return { valid: false, reason: '该用户名不可用' };
  }

  return { valid: true };
}

// 昵称格式
function validateNickname(nickname) {
  const { maxLength } = config.nickname;

  if (typeof nickname !== 'string') {
    return { valid: false, reason: '昵称格式不正确' };
  }

  const trimmed = nickname.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: '昵称不能为空' };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, reason: `昵称最多 ${maxLength} 个字符` };
  }

  return { valid: true };
}

// 密码格式
function validatePassword(password) {
  const { minLength } = config.password;

  if (typeof password !== 'string') {
    return { valid: false, reason: '密码格式不正确' };
  }

  if (password.length < minLength) {
    return { valid: false, reason: `密码至少 ${minLength} 位` };
  }

  return { valid: true };
}

module.exports = {
  isValidEmail,
  validateUsername,
  validateNickname,
  validatePassword,
};