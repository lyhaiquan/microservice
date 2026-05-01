const Cart = require('../models/cart.model');
const axios = require('axios');
const { redisClient } = require('../../../common');

const PRODUCT_CACHE_TTL = 30; // 30s — đủ để tránh hit product-service liên tục, đủ ngắn để không phát giá cũ quá lâu

class CartService {
    /**
     * Lấy product info qua cache Redis. Tránh hit product-service mỗi lần addToCart.
     * Cache 30s — chấp nhận snapshot ngắn vì cart sẽ re-validate ở checkout.
     */
    static async _fetchProduct(productId) {
        const cacheKey = `cart:product:${productId}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const productUrl = process.env.PRODUCT_SERVICE_URL || 'http://127.0.0.1:5001';
        const response = await axios.get(`${productUrl}/api/products/${productId}`, { timeout: 3000 });
        const product = response.data?.data;
        if (!product) return null;

        await redisClient.set(cacheKey, JSON.stringify(product), 'EX', PRODUCT_CACHE_TTL);
        return product;
    }

    static async addToCart(userId, productId, quantity) {
        try {
            const product = await CartService._fetchProduct(productId);
            if (!product) {
                const err = new Error('Product not found');
                err.status = 404;
                throw err;
            }

            // Product model dùng variants[0].availableStock & variants[0].price
            // (code cũ đọc product.quantity / product.price → luôn undefined → bug).
            const variant = product.variants?.[0];
            const availableStock = variant?.availableStock ?? 0;
            const price = variant?.price ?? 0;
            const productName = product.name || '';

            if (availableStock < quantity) {
                const err = new Error(`Insufficient stock. Only ${availableStock} items available.`);
                err.status = 400;
                throw err;
            }

            // Atomic upsert: nếu cart chưa có → tạo mới; nếu đã có item productId → tăng qty;
            // nếu chưa có item → push. Tránh race condition của findOne→save() pattern cũ.
            //
            // Bước 1: thử $inc qty cho item đã tồn tại (positional operator)
            const updated = await Cart.findOneAndUpdate(
                { userId, 'items.skuId': productId },
                {
                    $inc: { 'items.$.quantity': quantity },
                    $set: {
                        'items.$.priceSnapshot': price,
                        'items.$.productNameSnapshot': productName
                    }
                },
                { new: true }
            );

            if (updated) {
                // Verify total qty không vượt stock (sau khi đã inc atomic).
                const item = updated.items.find(i => i.skuId === productId);
                if (item && item.quantity > availableStock) {
                    // Rollback phần vừa inc
                    await Cart.updateOne(
                        { userId, 'items.skuId': productId },
                        { $inc: { 'items.$.quantity': -quantity } }
                    );
                    const err = new Error(`Cannot add more. Total requested exceeds available stock (${availableStock}).`);
                    err.status = 400;
                    throw err;
                }
                return updated;
            }

            // Bước 2: cart chưa có item này → upsert + $push
            const newItem = {
                skuId: productId,
                quantity,
                priceSnapshot: price,
                productNameSnapshot: productName
            };

            const cart = await Cart.findOneAndUpdate(
                { userId },
                {
                    $push: { items: newItem },
                    $setOnInsert: {
                        _id: `CART_${userId}`,
                        userId,
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                    }
                },
                { new: true, upsert: true }
            );

            return cart;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                const err = new Error('Product not found');
                err.status = 404;
                throw err;
            }
            if (error.status) throw error;
            throw new Error(`Error in CartService: ${error.message}`);
        }
    }
}

module.exports = CartService;
