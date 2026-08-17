const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('./db');

const router = express.Router();

// 注册接口
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 第一步：检查用户名和密码是否都填了
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        // 第二步：把密码加密
        const password_hash = await bcrypt.hash(password, 10);

        // 第三步：把用户名和加密后的密码存进数据库
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, password_hash]
        );

        res.status(201).json({ message: '注册成功', userId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '注册失败，请稍后重试' });
    }
});

const jwt = require('jsonwebtoken');

// 登录接口
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        // 第一步：根据用户名查找这个用户
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const user = rows[0];

        // 第二步：比对密码
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        // 第三步：生成通行证（JWT token）
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ message: '登录成功', token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '登录失败，请稍后重试' });
    }
});

module.exports = router;