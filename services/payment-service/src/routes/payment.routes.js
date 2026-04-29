const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/payment.controller');

const { rateLimitMiddleware, authMiddleware } = require('../../../common');

const refundLimiter = rateLimitMiddleware.createRateLimiter({
    keyPrefix: 'refund',
    points: 10,
    duration: 3600 // 1 hour
});

router.get('/vnpay-return', PaymentController.vnpayReturn);
router.post('/refund/:id', authMiddleware.verifyToken, authMiddleware.checkRole(['ADMIN']), refundLimiter, PaymentController.refund);

module.exports = router;

