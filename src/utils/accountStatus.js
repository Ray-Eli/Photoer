// 账号状态判断（纯函数）。给定一条 user 记录，判断它能不能正常使用。
//
// 用在两类地方：
//  1. 登录 / 验证码校验 / 改密码——验证通过后才告知封禁原因或注销状态
//     （design-principles.md 1.1 例外条款）
//  2. loadSession 中间件——每个已登录请求的最后一道关卡，挡住"库里已封禁但 Session 还没清"的情况
//
// 返回 { ok: true } 或 { ok: false, reason: 'BANNED'|'DELETED', banReason? }
function checkAccountStatus(user) {
  if (!user || user.status === 'deleted') {
    return { ok: false, reason: 'DELETED' };
  }
  if (user.status === 'banned') {
    return { ok: false, reason: 'BANNED', banReason: user.ban_reason };
  }
  return { ok: true };
}

module.exports = { checkAccountStatus };
