const axios = require('axios');
const { buyerToken } = require('./auth_helper');

/**
 * TEST: Account Sharing Race Condition
 * Scenario: 2 users logged into the SAME account (USR_BUYER_001)
 * both click 'Buy Now' for the same product at the exact same time.
 * 
 * Objectives:
 * 1. Verify Rate Limiting (Token Bucket) correctly counts both requests against the same userId.
 * 2. Verify MongoDB Transaction prevents double stock deduction.
 * 3. Verify Idempotency if the UI sent the same checkoutId.
 */

const ORDER_API = "http://localhost:5003/api/orders";
const PRODUCT_ID = "PROD_SHARING_TEST";

async function runSharingTest() {
    console.log("🚀 Starting Account Sharing Race Condition Test...");
    console.log("Scenario: 2 users on 1 account trying to buy the last item simultaneously.");

    const mongoose = require('mongoose');
    const Product = require('../services/order-service/src/models/product.model');
    const MONGO_URI = "mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin";
    
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000, w: 1 });
    console.log("✅ Connected to MongoDB for Test Setup");

    // Prepare product with 1 stock
    await Product.deleteMany({ _id: PRODUCT_ID });
    await Product.create({
        _id: PRODUCT_ID, sellerId: "SEL_TEST", sellerRegion: "SOUTH",
        name: "Test Sharing Product", slug: "test-sharing-prod-" + Date.now(),
        categoryId: "CAT_TEST",
        variants: [{ skuId: PRODUCT_ID, price: 100, totalStock: 1, availableStock: 1 }]
    });
    console.log(`📦 Prepared product ${PRODUCT_ID} with stock = 1`);
    
    const headers = { 'Authorization': `Bearer ${buyerToken}` };
    
    // Simulate 2 people clicking at the same time
    // We send them slightly differently to test different scenarios
    
    const requests = [
        // Person A
        axios.post(ORDER_API, {
            userId: "USR_BUYER_001",
            checkoutId: "SAME_CART_ID_999", // Giả sử dùng chung cart
            items: [{ productId: PRODUCT_ID, quantity: 1 }],
            totalAmount: 100
        }, { headers }).catch(err => err.response),

        // Person B
        axios.post(ORDER_API, {
            userId: "USR_BUYER_001",
            checkoutId: "SAME_CART_ID_999", // Cùng Cart ID
            items: [{ productId: PRODUCT_ID, quantity: 1 }],
            totalAmount: 100
        }, { headers }).catch(err => err.response)
    ];

    console.log("⏳ Sending concurrent requests...");
    const [resA, resB] = await Promise.all(requests);

    console.log("\n--- Results ---");
    console.log(`Person A: Status ${resA.status}`, resA.data?.message || "");
    console.log(`Person B: Status ${resB.status}`, resB.data?.message || "");

    // Phân tích kết quả
    if (resA.status === 201 && (resB.status === 409 || resB.status === 200)) {
        console.log("✅ IDEMPOTENCY SUCCESS: Only 1 order created, or same order returned.");
    } else if (resA.status === 429 || resB.status === 429) {
        console.log("✅ RATE LIMIT SUCCESS: Token Bucket blocked the rapid concurrent requests from same userId.");
    } else if (resA.status === 201 && resB.status === 201) {
        console.error("❌ FAILURE: Double order created for same checkoutId!");
    }

    // Trường hợp 2: Khác checkoutId (2 người dùng 2 cart khác nhau trên cùng 1 account)
    console.log("\n--- Scenario 2: Different checkoutId, same item (Stock Race) ---");
    const requests2 = [
        axios.post(ORDER_API, {
            userId: "USR_BUYER_001",
            checkoutId: "CART_A", 
            items: [{ productId: PRODUCT_ID, quantity: 1 }],
            totalAmount: 100
        }, { headers }).catch(err => err.response),

        axios.post(ORDER_API, {
            userId: "USR_BUYER_001",
            checkoutId: "CART_B",
            items: [{ productId: PRODUCT_ID, quantity: 1 }],
            totalAmount: 100
        }, { headers }).catch(err => err.response)
    ];

    const [resA2, resB2] = await Promise.all(requests2);
    console.log(`Person A: Status ${resA2.status}`);
    console.log(`Person B: Status ${resB2.status}`);

    const successes = [resA2.status, resB2.status].filter(s => s === 201).length;
    if (successes === 1) {
        console.log("✅ TRANSACTION SUCCESS: Only one order succeeded due to stock limit.");
    } else if (successes === 0) {
        console.log("ℹ️ Both failed (perhaps both hit Rate Limit or Out of Stock).");
    } else {
        console.error("❌ FAILURE: Both succeeded! Over-selling detected.");
    }
    await mongoose.disconnect();
}

console.log("Script 'account-sharing-race-test.js' ready.");
runSharingTest();
