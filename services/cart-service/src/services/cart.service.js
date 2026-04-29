const Cart = require('../models/cart.model');
const axios = require('axios');

class CartService {
    static async addToCart(userId, productId, quantity) {
        // 1. Get Product info
        const productUrl = process.env.PRODUCT_SERVICE_URL || 'http://127.0.0.1:5001';
        try {
            const response = await axios.get(`${productUrl}/api/products/${productId}`);
            const product = response.data.data;
            
            if (!product) {
                const err = new Error('Product not found');
                err.status = 404;
                throw err;
            }

            const variant = Array.isArray(product.variants) && product.variants.length > 0 ? product.variants[0] : null;
            if (!variant || variant.availableStock < quantity) {
                const available = variant ? variant.availableStock : 0;
                const err = new Error(`Insufficient stock. Only ${available} items available.`);
                err.status = 400;
                throw err;
            }

            // 2. Find and update Cart
            let cart = await Cart.findOne({ userId });
            
            if (!cart) {
                cart = new Cart({
                    _id: `CART_${userId}`,
                    userId,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    items: [{
                        skuId: variant.skuId || productId,
                        quantity,
                        priceSnapshot: variant.price,
                        productNameSnapshot: product.name
                    }]
                });
            } else {
                const skuId = variant.skuId || productId;
                const itemIndex = cart.items.findIndex(p => p.skuId === skuId);
                if (itemIndex > -1) {
                    // Update quantity
                    cart.items[itemIndex].quantity += quantity;
                    
                    // re-check quantity vs product
                    if (cart.items[itemIndex].quantity > variant.availableStock) {
                         const err = new Error(`Cannot add more. Total requested exceeds available stock (${variant.availableStock}).`);
                         err.status = 400;
                         throw err;
                    }
                    // Update price & name just in case they changed
                    cart.items[itemIndex].priceSnapshot = variant.price;
                    cart.items[itemIndex].productNameSnapshot = product.name;
                } else {
                    // Add new item
                    cart.items.push({
                        skuId,
                        quantity,
                        priceSnapshot: variant.price,
                        productNameSnapshot: product.name
                    });
                }
                cart.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            }
            
            await cart.save();
            return cart;
        } catch (error) {
            // Handle error from Axios (like 404 from product service)
            if (error.response && error.response.status === 404) {
                 const err = new Error('Product not found');
                 err.status = 404;
                 throw err;
            }
            // rethrow if it is our custom error
            if (error.status) {
                 throw error;
            }
            throw new Error(`Error communicating with Product Service: ${error.message}`);
        }
    }
}

module.exports = CartService;
