/**
 * Order Idempotency Test — 2 request cùng checkoutId/idempotencyKey phải trả
 * cùng orderId, request thứ 2 có is_duplicate=true.
 */
const axios = require('axios');
const mongoose = require('mongoose');
const { makeBuyerToken } = require('./auth_helper');
const Product = require('../services/order-service/src/models/product.model');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003/api/orders';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';
const PRODUCT_ID = `PROD_IDEM_${Date.now()}`;
const USER_ID = `USR_IDEM_${Date.now()}`;
const CHECKOUT_ID = `CHK_IDEM_${Date.now()}`;

async function setup() {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000 });
    await Product.deleteMany({ _id: PRODUCT_ID });
    await Product.create({
        _id: PRODUCT_ID, sellerId: 'SEL_TEST', sellerRegion: 'SOUTH',
        name: 'Idempotency Test Product',
        slug: `idem-${PRODUCT_ID.toLowerCase()}`,
        categoryId: 'CAT_TEST',
        variants: [{ skuId: PRODUCT_ID, price: 100, totalStock: 5, availableStock: 5, reservedStock: 0, version: 1 }],
        status: 'ACTIVE',
    });
    console.log(`📦 Seeded product ${PRODUCT_ID} stock=5`);
}

async function cleanup() {
    try {
        await Product.deleteMany({ _id: PRODUCT_ID });
        await mongoose.connection.collection('orders').deleteMany({ userId: USER_ID });
    } catch (_) { }
}

async function testIdempotency() {
    console.log('🚀 Testing Idempotency...');
    await setup();

    const headers = { 'Authorization': `Bearer ${makeBuyerToken(USER_ID)}` };
    const payload = {
        userId: USER_ID,
        checkoutId: CHECKOUT_ID,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        totalAmount: 100,
    };

    console.log('1. Sending first request...');
    const res1 = await axios.post(BASE_URL, payload, { headers, validateStatus: () => true });
    const orderId1 = res1.data?.data?._id;
    console.log(`   → status=${res1.status} orderId=${orderId1} is_duplicate=${res1.data?.is_duplicate}`);

    console.log('2. Sending duplicate request (same checkoutId)...');
    const res2 = await axios.post(BASE_URL, payload, { headers, validateStatus: () => true });
    const orderId2 = res2.data?.data?._id;
    console.log(`   → status=${res2.status} orderId=${orderId2} is_duplicate=${res2.data?.is_duplicate}`);

    const passed = res1.status === 201
        && res2.status === 200
        && res2.data?.is_duplicate === true
        && orderId1 && orderId1 === orderId2;

    await cleanup();
    await mongoose.disconnect();

    if (passed) {
        console.log('✅ PASS — Idempotency hoạt động (cùng orderId, is_duplicate=true).');
        process.exit(0);
    }
    console.log('❌ FAIL');
    process.exit(1);
}

testIdempotency().catch(async (err) => {
    console.error('FATAL:', err.message);
    try { await cleanup(); await mongoose.disconnect(); } catch (_) { }
    process.exit(1);
});
