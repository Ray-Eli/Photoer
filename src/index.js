require('./config/env');
require('./lib/redis');

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { loadSession } = require('./middlewares/session.middleware');
const { mountSwaggerDocs } = require('./lib/swagger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(loadSession);

app.get('/', (req, res) => {
  res.send('Hello, 服务器已经跑起来了！');
});

app.use('/api', routes);
mountSwaggerDocs(app);

app.listen(PORT, () => {
  console.log(`服务器已启动，访问地址: http://localhost:${PORT}`);
});