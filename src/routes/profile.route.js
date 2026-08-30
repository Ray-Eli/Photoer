const express = require('express');
const profileService = require('../services/profile.service');
const validator = require('../utils/validator');
const { requireAuth } = require('../middlewares/session.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/auth/username:
 *   put:
 *     tags: [个人资料]
 *     summary: 修改用户名
 *     description: |
 *       不需要密码二次验证。可用性判断按冷却期流程图执行：已被占用（含保留词）不可用；
 *       曾被使用过且 90 天内被释放的，只有原主人自己能改回，其他人不可用；超过 90 天或
 *       从未被使用过则可用。频率限制：滚动 365 天窗口内最多改 2 次，首次把默认用户名
 *       改成自定义名字也计入这个次数。
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *                 description: 3-20字符，仅字母/数字/下划线，不能是纯数字，大小写不敏感
 *     responses:
 *       200:
 *         description: 修改成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 用户名修改成功 }
 *                 username: { type: string }
 *       400:
 *         description: |
 *           格式不合法（长度/字符集/纯数字/保留词）；或该用户名当前不可用（已被占用/冷却期内/
 *           被永久锁定，三种原因统一提示，不区分）；或改名次数已达上限（一年2次）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
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

/**
 * @swagger
 * /api/auth/nickname:
 *   put:
 *     tags: [个人资料]
 *     summary: 修改昵称
 *     description: |
 *       不需要密码二次验证。昵称不唯一，没有冷却期或占用判断，只有频率限制：
 *       滚动 14 天窗口内最多改 2 次。
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nickname]
 *             properties:
 *               nickname: { type: string, maxLength: 30, description: 不能为空，去除首尾空格后最多30字符 }
 *     responses:
 *       200:
 *         description: 修改成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 昵称修改成功 }
 *                 nickname: { type: string }
 *       400:
 *         description: 格式不合法（为空或超长）；或改昵称次数已达上限（14天内2次）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
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
