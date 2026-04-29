const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { rateLimitMiddleware, authMiddleware } = require('../../../common');

// Token Bucket: 5 requests per 1 minute for login
const loginLimiter = rateLimitMiddleware.createRateLimiter({
    keyPrefix: 'auth_login',
    points: 5,
    duration: 60
});

router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/logout-everywhere', authMiddleware.authenticate(), authController.logoutEverywhere);
router.get('/admin/stats', authMiddleware.authenticate(), authMiddleware.authorize('ADMIN'), authController.adminStats);

module.exports = router;
