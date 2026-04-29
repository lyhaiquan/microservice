const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/order.controller');
const authMiddleware = require('../../../common/src/middlewares/auth.middleware');

router.get('/admin/stats', authMiddleware.authenticate(), authMiddleware.authorize('ADMIN'), OrderController.adminStats);
router.post('/', authMiddleware.authenticate(), authMiddleware.authorize('BUYER', 'ADMIN'), OrderController.createOrder);
router.get('/:id', authMiddleware.authenticate(), authMiddleware.authorize('BUYER', 'ADMIN'), OrderController.getOrderById);

module.exports = router;
