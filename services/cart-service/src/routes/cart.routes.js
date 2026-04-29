const express = require('express');
const router = express.Router();
const CartController = require('../controllers/cart.controller');
const authMiddleware = require('../../../common/src/middlewares/auth.middleware');

router.post('/', authMiddleware.authenticate(), authMiddleware.authorize('BUYER', 'ADMIN'), CartController.addToCart);

module.exports = router;
