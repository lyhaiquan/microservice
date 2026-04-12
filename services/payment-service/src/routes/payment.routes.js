const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/payment.controller');

router.get('/vnpay-return', PaymentController.vnpayReturn);

module.exports = router;
