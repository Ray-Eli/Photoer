const express = require('express');
const authService = require('../services/auth.service');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const result = await authService.register(username, password);
    res.status(201).json({ message: '注册成功', userId: result.userId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const result = await authService.login(username, password);

    if (!result) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    res.json({ message: '登录成功', token: result.token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

module.exports = router;