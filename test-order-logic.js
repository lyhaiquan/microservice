require('dotenv').config();
const mongoose = require('mongoose');
const OrderService = require('./services/order-service/src/services/order.service');
const Order = require('./services/order-service/src/models/order.model');
const Product = require('./services/product-service/src/models/product.model');
const IdempotencyRecord = require('./services/common/src/models/idempotencyRecord.model');

// Mock connection string (Use user's if possible, or local)
const MONGO_URI = "mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin";

async function test() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        // 1. Setup Test Data
        const sellerId = "SEL_TEST_123";
        const productId = "PROD_TEST_123";
        
        await Product.deleteMany({ _id: productId });
        await Product.create({
            _id: productId,
            sellerId: sellerId,
            sellerRegion: 'SOUTH',
            name: 'Test Product',
            slug: 'test-product-' + Date.now(),
            categoryId: 'CAT_TEST',
            variants: [{
                skuId: productId,
                price: 100,
                totalStock: 10,
                availableStock: 10
            }]
        });

        const userId = "USR_TEST_123";
        const checkoutId = "CHECKOUT_TEST_123";
        const items = [{ productId: productId, quantity: 2 }];

        // 2. Test First Call (Should succeed)
        console.log("\n--- Testing First Order Call ---");
        const r1 = await OrderService.createOrder(userId, items, 200, checkoutId);
        const order1 = r1.order;
        console.log("Order 1 Created:", order1._id, "cached:", r1.cached);

        // 3. Test Idempotency (Second Call with same checkoutId)
        console.log("\n--- Testing Idempotency (Second Call) ---");
        const r2 = await OrderService.createOrder(userId, items, 200, checkoutId);
        const order2 = r2.order;
        console.log("Order 2 (Should be same as Order 1):", order2._id, "cached:", r2.cached);

        if (order1._id === order2._id) {
            console.log("✅ Idempotency Check Passed!");
        } else {
            console.error("❌ Idempotency Check Failed!");
        }

        // 4. Test Stock Decrease
        const updatedProduct = await Product.findById(productId);
        console.log("Remaining Stock (Should be 8):", updatedProduct.variants[0].availableStock);
        if (updatedProduct.variants[0].availableStock === 8) {
            console.log("✅ Stock Deduction Passed!");
        } else {
            console.error("❌ Stock Deduction Failed!");
        }

        // 5. Test Out of Stock
        console.log("\n--- Testing Out of Stock ---");
        try {
            await OrderService.createOrder(userId, [{ productId, quantity: 10 }], 1000, "CHECKOUT_NEW");
        } catch (err) {
            console.log("✅ Out of Stock handled correctly:", err.message);
        }

    } catch (error) {
        console.error("Test Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

test();
