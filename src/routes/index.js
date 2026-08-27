const express = require('express');
const authRoutes = require('./auth.route');
const sessionRoutes = require('./session.route');
const profileRoutes = require('./profile.route');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/auth', sessionRoutes);
router.use('/auth', profileRoutes);

module.exports = router;
