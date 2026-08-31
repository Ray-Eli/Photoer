const fs = require('fs');
const path = require('path');

// 环境变量加载：按 NODE_ENV 读取对应的 .env.<环境> 文件（.env.development / .env.test /
// .env.staging / .env.production）。见 docs/decisions.md ADR-011。
//
// 刻意不做"静默 fallback"：NODE_ENV 缺失或文件不存在一律报错退出，不带着空配置继续跑。
// 静默 fallback 正是旧方案的问题根源——部署时忘记设 NODE_ENV，会加载错误的配置却不报错。

const VALID_ENVS = ['development', 'test', 'staging', 'production'];
const nodeEnv = process.env.NODE_ENV;

if (!nodeEnv) {
  console.error(
    '[config] NODE_ENV 未设置。必须显式指定运行环境，可选值：' + VALID_ENVS.join(' / ') + '。\n' +
    '本地开发用 npm 脚本启动（脚本已内置 NODE_ENV）；服务器在宝塔/pm2 的进程环境里配置。'
  );
  process.exit(1);
}

if (!VALID_ENVS.includes(nodeEnv)) {
  console.error(
    `[config] NODE_ENV 的值 "${nodeEnv}" 不是受支持的环境，可选值：${VALID_ENVS.join(' / ')}。`
  );
  process.exit(1);
}

const envFile = path.resolve(process.cwd(), `.env.${nodeEnv}`);

if (!fs.existsSync(envFile)) {
  console.error(
    `[config] 找不到配置文件 ${envFile}\n` +
    `请复制 .env.example 为 .env.${nodeEnv} 并填入真实值。`
  );
  process.exit(1);
}

// quiet: true 关掉 dotenv v17 默认往控制台打的那行推广提示（"injected env ... // tip: ..."），
// 启动日志只保留我们自己的输出
const { error } = require('dotenv').config({ path: envFile, quiet: true });
if (error) {
  console.error(`[config] 解析 ${envFile} 失败：${error.message}`);
  process.exit(1);
}
