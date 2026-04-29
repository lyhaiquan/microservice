const axios = require('axios');
const { buyerToken } = require('./auth_helper');

const BASE_URL = "http://localhost:5003/api/orders"; // Order Service
const PRODUCT_ID = "PROD_TEST_CONCURRENCY";

async function testRaceCondition() {
    console.log("🚀 Testing Race Condition (Concurrent Orders)...");

    const mongoose = require('mongoose');
    const Product = require('../services/order-service/src/models/product.model');
    const MONGO_URI = "mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin";
    
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000, w: 1 });
    console.log("✅ Connected to MongoDB for Test Setup");

    // Prepare product with 1 stock
    await Product.deleteMany({ _id: PRODUCT_ID });
    await Product.create({
        _id: PRODUCT_ID, sellerId: "SEL_TEST", sellerRegion: "SOUTH",
        name: "Test Concurrency Product", slug: "test-concurrency-prod-" + Date.now(),
        categoryId: "CAT_TEST",
        variants: [{ skuId: PRODUCT_ID, price: 100, totalStock: 1, availableStock: 1 }]
    });
    console.log(`📦 Prepared product ${PRODUCT_ID} with stock = 1`);

    const requests = Array.from({ length: 5 }).map((_, i) => {
        return axios.post(BASE_URL, {
            userId: "USR_BUYER_001",
            checkoutId: "CHECKOUT_CONCURRENT_" + i, // CheckoutId khác nhau để không bị Idempotency chặn
            items: [{ productId: PRODUCT_ID, quantity: 1 }],
            totalAmount: 100
        }, {
            headers: { 'Authorization': `Bearer ${buyerToken}` }
        }).catch(err => err.response);
    });

    const results = await Promise.all(requests);
    
    const successes = results.filter(r => r && r.status === 201).length;
    const failures = results.filter(r => r && r.status === 400).length;

    console.log(`Summary: Successes: ${successes}, Failures: ${failures}`);
    
    if (successes === 1) {
        console.log("✅ Race Condition Test Passed! (Only 1 order created for stock=1)");
    } else {
        console.log("❌ Race Condition Test Failed! (Stock might be over-sold)");
    }
    await mongoose.disconnect();
}

console.log("Script created. Executing...");
testRaceCondition();
