const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { rateLimitMiddleware } = require('../../../common');

// Token Bucket: 5 requests per 1 minute for login
const loginLimiter = rateLimitMiddleware.createRateLimiter({
    keyPrefix: 'auth_login',
    points: 5,
    duration: 60
});

router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);

module.exports = router;
