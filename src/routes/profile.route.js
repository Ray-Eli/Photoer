const express = require('express');
const profileService = require('../services/profile.service');
const validator = require('../utils/validator');
const { requireAuth } = require('../middlewares/session.middleware');

const router = express.Router();

router.put('/username', requireAuth, async (req, res) => {
  try {
    const { username } = req.body;

    const formatCheck = validator.validateUsername(username);
    if (!formatCheck.valid) {
      return res.status(400).json({ error: formatCheck.reason });
    }

    const result = await profileService.changeUsername(req.user.id, username);
    res.json({ message: '用户名修改成功', username: result.username });
  } catch (err) {
    if (['UNAVAILABLE', 'RATE_LIMITED'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
});

router.put('/nickname', requireAuth, async (req, res) => {
  try {
    const { nickname } = req.body;

    const formatCheck = validator.validateNickname(nickname);
    if (!formatCheck.valid) {
      return res.status(400).json({ error: formatCheck.reason });
    }

    const result = await profileService.changeNickname(req.user.id, nickname.trim());
    res.json({ message: '昵称修改成功', nickname: result.nickname });
  } catch (err) {
    if (err.code === 'RATE_LIMITED') {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
});

module.exports = router;
