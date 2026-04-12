const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/product.controller');

// Read (GET / Cache Logic)
router.get('/', ProductController.getAllProducts);
router.get('/search', ProductController.searchProducts);
router.get('/:id', ProductController.getProductById);

// Write (POST / PUT / DELETE)
router.post('/', ProductController.createProduct);
router.post('/decrease-stock', ProductController.decreaseStock);
router.put('/:id', ProductController.updateProduct);
router.delete('/:id', ProductController.deleteProduct);


module.exports = router;
