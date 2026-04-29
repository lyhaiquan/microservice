const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { rateLimitMiddleware, authMiddleware } = require('../../../common');

const { verifyToken, checkRole } = authMiddleware;

// Token Bucket: 5 requests per 1 minute for login
const loginLimiter = rateLimitMiddleware.createRateLimiter({
    keyPrefix: 'auth_login',
    points: 5,
    duration: 60
});

router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);

// Admin Routes
router.get('/admin/users/pending-sellers', verifyToken, checkRole(['ADMIN']), authController.getPendingSellers);
router.post('/admin/users/:id/approve', verifyToken, checkRole(['ADMIN']), authController.approveSeller);
router.post('/admin/users/:id/ban', verifyToken, checkRole(['ADMIN']), authController.banUser);

module.exports = router;

