const express = require('express');
const cors = require('cors');
const authRoutes = require('./auth');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, 服务器已经跑起来了！');
});

app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`服务器已启动，访问地址：http://localhost:${PORT}`);
});