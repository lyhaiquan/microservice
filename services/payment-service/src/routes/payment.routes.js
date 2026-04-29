const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/payment.controller');
const authMiddleware = require('../../../common/src/middlewares/auth.middleware');

router.get('/vnpay-return', PaymentController.vnpayReturn);
router.get('/admin/stats', authMiddleware.authenticate(), authMiddleware.authorize('ADMIN'), PaymentController.adminStats);
router.post('/refunds', authMiddleware.authenticate(), authMiddleware.authorize('BUYER', 'ADMIN'), PaymentController.refund);

module.exports = router;
