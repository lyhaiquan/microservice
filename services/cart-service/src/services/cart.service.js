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

            if (product.quantity < quantity) {
                const err = new Error(`Insufficient stock. Only ${product.quantity} items available.`);
                err.status = 400;
                throw err;
            }

            // 2. Find and update Cart
            let cart = await Cart.findOne({ userId });
            
            if (!cart) {
                cart = new Cart({
                    userId,
                    items: [{
                        productId,
                        quantity,
                        price: product.price,
                        name: product.name
                    }]
                });
            } else {
                const itemIndex = cart.items.findIndex(p => p.productId === productId);
                if (itemIndex > -1) {
                    // Update quantity
                    cart.items[itemIndex].quantity += quantity;
                    
                    // re-check quantity vs product
                    if (cart.items[itemIndex].quantity > product.quantity) {
                         const err = new Error(`Cannot add more. Total requested exceeds available stock (${product.quantity}).`);
                         err.status = 400;
                         throw err;
                    }
                    // Update price & name just in case they changed
                    cart.items[itemIndex].price = product.price;
                    cart.items[itemIndex].name = product.name;
                } else {
                    // Add new item
                    cart.items.push({
                        productId,
                        quantity,
                        price: product.price,
                        name: product.name
                    });
                }
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
