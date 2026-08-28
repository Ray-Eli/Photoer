// 邮件文案集中管理（design-principles.md 二、策略与机制分离：文案是策略，会变；
// 发送动作是机制，交给 src/lib/mailer.js）。
//
// 业务代码只调用这里的模板函数拿到 { subject, text }，不在 service 里拼文案。
//
// 统一风格（这次整理时定的标准）：
// - 称呼统一用"您"，原来"您"/"你"混用
// - 每封邮件都带一句跟场景匹配的安全提示，原来只有部分模板有
// - 结尾统一加"此邮件由系统自动发送，请勿回复。"，原来都没有

const SIGNATURE = '此邮件由系统自动发送，请勿回复。';

function withSignature(body) {
  return `${body}\n\n${SIGNATURE}`;
}

// 验证码类邮件：注册/登录/忘记密码/换绑邮箱结构完全一样，只是场景名和有效期不同，
// 抽成一个共用函数，四个具体模板只是传参数进来
function verificationCodeTemplate(sceneLabel, { code, expireMin }) {
  return {
    subject: `Photoer ${sceneLabel}验证码`,
    text: withSignature(
      `您的验证码是 ${code}，${expireMin} 分钟内有效。\n\n如果这不是您本人的操作，请忽略此邮件。`
    ),
  };
}

function registerCode({ code, expireMin }) {
  return verificationCodeTemplate('注册', { code, expireMin });
}

function loginCode({ code, expireMin }) {
  return verificationCodeTemplate('登录', { code, expireMin });
}

function resetPasswordCode({ code, expireMin }) {
  return verificationCodeTemplate('重置密码', { code, expireMin });
}

function changeEmailCode({ code, expireMin }) {
  return verificationCodeTemplate('换绑邮箱', { code, expireMin });
}

// 注册：邮箱已被注册（正常账号）
function registerEmailTaken() {
  return {
    subject: '注册提醒',
    text: withSignature(
      '有人使用这个邮箱尝试注册 Photoer 新账号。如果是您本人，请直接登录；如果不是，请忽略此邮件。'
    ),
  };
}

// 注册：邮箱关联的账号处于注销冷却期——不能说"您的账号已注销"，
// 发起注册的人未必是账号本人，措辞要中性（见这次任务的补充场景）
function registerEmailDeletedCooldown({ daysLeft }) {
  return {
    subject: '注册提醒',
    text: withSignature(
      '有人使用这个邮箱尝试注册 Photoer 新账号。\n\n' +
        `该邮箱关联的账号目前处于注销冷却期，还需 ${daysLeft} 天后才能使用此邮箱重新注册。` +
        '原账号无法恢复，冷却期结束后可以用这个邮箱注册一个全新账号，但原有内容不会找回。\n\n' +
        '如果不是您本人操作，请忽略此邮件。'
    ),
  };
}

// 登录（验证码方式）：邮箱尚未注册
function loginEmailNotFound() {
  return {
    subject: '登录提醒',
    text: withSignature('该邮箱尚未注册 Photoer。如果不是您本人操作，请忽略此邮件。'),
  };
}

// 忘记密码：邮箱尚未注册
function resetPasswordEmailNotFound() {
  return {
    subject: '重置密码提醒',
    text: withSignature('该邮箱尚未在 Photoer 注册。如果不是您本人操作，请忽略此邮件。'),
  };
}

// 换绑邮箱：新邮箱已被占用
function changeEmailTaken() {
  return {
    subject: '换绑邮箱提醒',
    text: withSignature('有人尝试用这个邮箱进行 Photoer 账号换绑。如果不是您本人操作，请忽略此邮件。'),
  };
}

// 换绑邮箱：成功后通知旧邮箱
function changeEmailSecurityNotice({ newEmail }) {
  return {
    subject: 'Photoer 账号安全提醒',
    text: withSignature(
      `您的 Photoer 账号邮箱已被更换为 ${newEmail}。如果这不是您本人的操作，请尽快联系我们或重置密码。`
    ),
  };
}

module.exports = {
  registerCode,
  loginCode,
  resetPasswordCode,
  changeEmailCode,
  registerEmailTaken,
  registerEmailDeletedCooldown,
  loginEmailNotFound,
  resetPasswordEmailNotFound,
  changeEmailTaken,
  changeEmailSecurityNotice,
};
