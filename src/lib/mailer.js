// 打桩实现：本地开发阶段没有真实邮件服务，先打印到控制台。
// 接入 SMTP 或阿里云邮件推送后，替换本文件内部实现即可，调用方接口不用变。
async function sendMail({ to, subject, text }) {
  console.log(`[邮件打桩] 收件人: ${to} | 主题: ${subject}\n${text}`);
}

module.exports = { sendMail };
