// Express 应用本体：建 app、挂中间件、挂路由。不调用 listen()。
// 拆分出来是为了让测试（supertest）能直接拿到 app 对象，不必真的占端口。
// 真正启动监听在 src/index.js。
require('./config/env');
require('./lib/redis');

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { loadSession } = require('./middlewares/session.middleware');
const { mountSwaggerDocs } = require('./lib/swagger');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(loadSession);

app.get('/', (req, res) => {
  res.send('Hello, 服务器已经跑起来了！');
});

app.use('/api', routes);
mountSwaggerDocs(app);

module.exports = app;
