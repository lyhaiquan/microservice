const express = require('express');
const router = express.Router();
const CartController = require('../controllers/cart.controller');

router.post('/', CartController.addToCart);

module.exports = router;
