const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');
const { authMiddleware } = require('../../../common');

const { verifyToken, checkRole } = authMiddleware;

// Admin Stats
router.get('/admin/revenue', verifyToken, checkRole(['ADMIN']), statsController.getAdminRevenue);

// Seller Stats
router.get('/seller/revenue', verifyToken, checkRole(['SELLER']), statsController.getSellerRevenue);
router.get('/seller/products/:id/revenue', verifyToken, checkRole(['SELLER']), statsController.getProductRevenue);

module.exports = router;
