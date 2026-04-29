const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/product.controller');
const { rateLimitMiddleware, authMiddleware } = require('../../../common');

const { verifyToken, checkRole } = authMiddleware;

// Strict Leaky Bucket: 5 req/sec (1 point every 0.2s) - Fail Fast
const productListLimiter = rateLimitMiddleware.createRateLimiter({
    keyPrefix: 'product_list',
    points: 1,
    duration: 0.2
});

// Admin Stats
router.get('/admin/stats/products/count', verifyToken, checkRole(['ADMIN']), ProductController.getProductCount);

// Read (GET / Cache Logic)
router.get('/', productListLimiter, ProductController.getAllProducts);
router.get('/search', productListLimiter, ProductController.searchProducts);
router.get('/:id', ProductController.getProductById);


// Write (POST / PUT / DELETE)
router.post('/', ProductController.createProduct);
router.post('/decrease-stock', ProductController.decreaseStock);
router.put('/:id', ProductController.updateProduct);
router.delete('/:id', ProductController.deleteProduct);


module.exports = router;
