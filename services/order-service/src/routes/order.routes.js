const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/order.controller');

const { rateLimitMiddleware, authMiddleware } = require('../../../common');

const checkoutLimiter = rateLimitMiddleware.createRateLimiter({
    keyPrefix: 'checkout',
    points: 3,
    duration: 60,
    useUserId: true
});

router.post('/', authMiddleware.verifyToken, checkoutLimiter, OrderController.createOrder);
router.get('/:id', authMiddleware.verifyToken, OrderController.getOrderById);


module.exports = router;
