// 打桩实现：本地开发阶段没有阿里云验证码账号，先始终放行。
// 接入阿里云滑块验证码后，替换本文件内部实现为真实校验，调用方接口不用变。
async function verifyCaptcha(_captchaToken) {
  return true;
}

module.exports = { verifyCaptcha };
