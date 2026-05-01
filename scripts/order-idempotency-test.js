const axios = require('axios');
const mongoose = require('mongoose');
const { buyerToken } = require('./auth_helper');
const Product = require('../services/order-service/src/models/product.model');

const BASE_URL = "http://localhost:5003/api/orders";
const MONGO_URI = "mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin";
const PRODUCT_ID = "PROD_ID_1";

async function setup() {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000 });
    await Product.deleteMany({ _id: PRODUCT_ID });
    await Product.create({
        _id: PRODUCT_ID,
        sellerId: "SEL_TEST",
        sellerRegion: "SOUTH",
        name: "Idempotency Test Product",
        slug: "idempotency-test-prod-" + Date.now(),
        categoryId: "CAT_TEST",
        variants: [{ skuId: PRODUCT_ID, price: 100, totalStock: 5, availableStock: 5 }]
    });
    console.log(`📦 Seeded product ${PRODUCT_ID} with stock=5`);
}

async function testIdempotency() {
    console.log("🚀 Testing Idempotency...");
    await setup();

    const payload = {
        userId: "USR_BUYER_001",
        checkoutId: "SAME_CHECKOUT_ID_" + Date.now(), // unique mỗi run để tránh conflict với run cũ
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        totalAmount: 100
    };

    const headers = { 'Authorization': `Bearer ${buyerToken}` };

    console.log("1. Sending first request...");
    const res1 = await axios.post(BASE_URL, payload, { headers }).catch(err => err.response);
    const orderId1 = res1.data?.data?._id;
    console.log("Result 1:", res1.status, "Order ID:", orderId1, "is_duplicate:", res1.data?.is_duplicate);

    console.log("2. Sending second request with same checkoutId...");
    const res2 = await axios.post(BASE_URL, payload, { headers }).catch(err => err.response);
    const orderId2 = res2.data?.data?._id;
    console.log("Result 2:", res2.status, "Order ID:", orderId2, "is_duplicate:", res2.data?.is_duplicate);

    const passed = res1.status === 201
        && res2.status === 200
        && res2.data?.is_duplicate === true
        && orderId1 === orderId2;

    if (passed) {
        console.log("✅ Idempotency Test Passed! (Same Order ID returned, is_duplicate=true)");
    } else {
        console.log("❌ Idempotency Test Failed!");
        process.exitCode = 1;
    }

    await mongoose.disconnect();
}

testIdempotency().catch(async (err) => {
    console.error("FATAL:", err.message);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
});
