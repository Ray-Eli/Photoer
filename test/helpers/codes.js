// 测试里要走完"发验证码 -> 输验证码"的多步流程，需要拿到验证码。
// 做法：直接从 Redis 读中间态里的 code 字段，不为了方便测试去改动生产代码。
// key 结构见 docs/database-schema.md 四、Redis 数据结构。

require('./guard');
const redis = require('../../src/lib/redis');

const readCode = (prefix) => (token) => redis.hget(`${prefix}${token}`, 'code');

module.exports = {
  getRegistrationCode: readCode('registration:'),
  getLoginCode: readCode('login_code:'),
  getResetPasswordCode: readCode('reset_pwd:'),
  getChangeEmailCode: readCode('change_email:'),
};
