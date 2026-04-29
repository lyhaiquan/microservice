const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/product.controller');
const { rateLimitMiddleware, authMiddleware } = require('../../../common');

// Strict Leaky Bucket: 5 req/sec (1 point every 0.2s) - Fail Fast
const productListLimiter = rateLimitMiddleware.createRateLimiter({
    keyPrefix: 'product_list',
    points: 1,
    duration: 0.2
});

// Read (GET / Cache Logic)
router.get('/admin/stats', authMiddleware.authenticate(), authMiddleware.authorize('ADMIN'), ProductController.adminStats);
router.get('/', productListLimiter, ProductController.getAllProducts);
router.get('/search', productListLimiter, ProductController.searchProducts);
router.get('/:id', ProductController.getProductById);

// Write (POST / PUT / DELETE)
router.post('/', authMiddleware.authenticate(), authMiddleware.authorize('SELLER', 'ADMIN'), ProductController.createProduct);
router.post('/decrease-stock', authMiddleware.authenticate(), authMiddleware.authorize('ADMIN'), ProductController.decreaseStock);
router.put('/:id', authMiddleware.authenticate(), authMiddleware.authorize('SELLER', 'ADMIN'), ProductController.updateProduct);
router.delete('/:id', authMiddleware.authenticate(), authMiddleware.authorize('SELLER', 'ADMIN'), ProductController.deleteProduct);


module.exports = router;
