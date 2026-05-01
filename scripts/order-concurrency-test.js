/**
 * Order Concurrency Test — gọi thẳng order-service (port 5003), không qua gateway.
 * Mỗi VU dùng userId+token riêng để tránh per-user rate-limit (3/min/user).
 */
const axios = require('axios');
const mongoose = require('mongoose');
const { makeBuyerToken } = require('./auth_helper');
const Product = require('../services/order-service/src/models/product.model');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003/api/orders';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';
const PRODUCT_ID = `PROD_TEST_CONCURRENCY_${Date.now()}`;
const CONCURRENT = parseInt(process.env.CONCURRENT || '5', 10);

async function testRaceCondition() {
    console.log('🚀 Testing Race Condition (Concurrent Orders, unique userIds)...');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000 });
    console.log('✅ Connected to MongoDB');

    await Product.deleteMany({ _id: PRODUCT_ID });
    await Product.create({
        _id: PRODUCT_ID, sellerId: 'SEL_TEST', sellerRegion: 'SOUTH',
        name: 'Test Concurrency Product',
        slug: `test-concurrency-prod-${Date.now()}`,
        categoryId: 'CAT_TEST',
        variants: [{ skuId: PRODUCT_ID, price: 100, totalStock: 1, availableStock: 1, reservedStock: 0, version: 1 }],
        status: 'ACTIVE',
    });
    console.log(`📦 Prepared product ${PRODUCT_ID} with stock = 1`);

    const runId = Date.now();
    const requests = Array.from({ length: CONCURRENT }, (_, i) => {
        const userId = `USR_CONCUR_${runId}_${i}`;
        return axios.post(BASE_URL, {
            userId,
            checkoutId: `CHK_CONCUR_${runId}_${i}`,
            items: [{ productId: PRODUCT_ID, quantity: 1 }],
            totalAmount: 100,
        }, {
            headers: { 'Authorization': `Bearer ${makeBuyerToken(userId)}` },
            validateStatus: () => true,
        });
    });

    const results = await Promise.all(requests);
    const successes = results.filter(r => r.status === 201).length;
    const outOfStock = results.filter(r => r.status === 400).length;
    const rateLimited = results.filter(r => r.status === 429).length;
    const other = results.filter(r => ![201, 400, 429].includes(r.status)).length;

    console.log(`\n📊 Result: success=${successes} oos=${outOfStock} 429=${rateLimited} other=${other}`);

    // Cleanup
    await Product.deleteMany({ _id: PRODUCT_ID });
    await mongoose.disconnect();

    if (successes === 1 && rateLimited === 0) {
        console.log('✅ PASS — Atomic order creation chỉ cho 1 request thành công.');
        process.exit(0);
    }
    console.log('❌ FAIL — kỳ vọng đúng 1 success và 0 rate-limited.');
    process.exit(1);
}

testRaceCondition().catch(async (err) => {
    console.error('FATAL:', err.message);
    try { await mongoose.disconnect(); } catch (_) { }
    process.exit(1);
});
