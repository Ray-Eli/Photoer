const express = require('express');
const sessionService = require('../services/session.service');
const { requireAuth } = require('../middlewares/session.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/auth/sessions:
 *   get:
 *     tags: [会话管理]
 *     summary: 查询当前用户所有有效登录设备
 *     description: |
 *       只返回 ref（设备的对外标识，NanoID），真实的 sessionId 永远不会出现在响应里——
 *       ref 泄露了也不能当登录凭证使用。查询时会顺带清理掉已经过期、但集合里还残留引用的记录
 *       （惰性清理），不需要等定时任务。
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 设备列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       ref: { type: string, description: 设备的对外标识，下线时要用这个 }
 *                       deviceType: { type: string, example: desktop, description: desktop/mobile/tablet 等 }
 *                       browser: { type: string, example: Chrome 120.0.0.0 }
 *                       ip: { type: string }
 *                       createdAt: { type: string, format: date-time, description: 登录时间 }
 *                       lastActiveAt: { type: string, format: date-time, description: 最后活动时间 }
 *                       isCurrent: { type: boolean, description: 是否是发起这次请求的设备本身 }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await sessionService.listSessions(req.user.id, req.sessionId);
  res.json({ sessions });
});

/**
 * @swagger
 * /api/auth/sessions/{ref}:
 *   delete:
 *     tags: [会话管理]
 *     summary: 下线指定设备
 *     description: |
 *       不能用来下线当前设备本身（这种情况请用 /api/auth/logout）。找不到匹配的 ref——
 *       无论是已经过期、伪造的、还是别的用户的——统一返回同一种"不存在或已下线"的提示，
 *       不区分具体原因。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: ref
 *         required: true
 *         schema: { type: string }
 *         description: 从 GET /api/auth/sessions 拿到的设备标识
 *     responses:
 *       200:
 *         description: 已下线该设备
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已下线该设备 }
 *       400:
 *         description: 目标是当前设备本身，拒绝操作
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: ref 不存在或已下线（已过期/伪造/不属于当前用户，统一提示）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/sessions/:ref', requireAuth, async (req, res) => {
  try {
    await sessionService.revokeSession(req.user.id, req.params.ref, req.sessionId);
    res.json({ message: '已下线该设备' });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    if (err.code === 'CURRENT_DEVICE') {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
});

module.exports = router;
