const express = require('express');
const sessionService = require('../services/session.service');
const { requireAuth } = require('../middlewares/session.middleware');

const router = express.Router();

router.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await sessionService.listSessions(req.user.id, req.sessionId);
  res.json({ sessions });
});

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
