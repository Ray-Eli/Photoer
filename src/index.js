require('./config/env');

const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('Hello, 服务器已经跑起来了！');
});

app.use('/api', routes);

app.listen(PORT, () => {
  console.log(`服务器已启动，访问地址: http://localhost:${PORT}`);
});