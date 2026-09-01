// 应用入口：加载环境变量、拿到 app、开始监听端口。
// 应用本体（中间件、路由）在 src/app.js。
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`服务器已启动，访问地址: http://localhost:${PORT}`);
});
