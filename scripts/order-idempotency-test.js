const axios = require('axios');
const { buyerToken } = require('./auth_helper');

const BASE_URL = "http://localhost:5003/api/orders";

async function testIdempotency() {
    console.log("🚀 Testing Idempotency...");

    const payload = {
        userId: "USR_BUYER_001",
        checkoutId: "SAME_CHECKOUT_ID_123",
        items: [{ productId: "PROD_ID_1", quantity: 1 }],
        totalAmount: 100
    };

    const headers = { 'Authorization': `Bearer ${buyerToken}` };

    console.log("1. Sending first request...");
    const res1 = await axios.post(BASE_URL, payload, { headers }).catch(err => err.response);
    const orderId1 = res1.data?.data?._id;
    console.log("Result 1:", res1.status, "Order ID:", orderId1);

    console.log("2. Sending second request with same checkoutId...");
    const res2 = await axios.post(BASE_URL, payload, { headers }).catch(err => err.response);
    const orderId2 = res2.data?.data?._id;
    console.log("Result 2:", res2.status, "Order ID:", orderId2);

    if (res1.status === 201 && (res2.status === 201 || res2.status === 200) && orderId1 === orderId2) {
        console.log("✅ Idempotency Test Passed! (Same Order ID returned)");
    } else {
        console.log("❌ Idempotency Test Failed!");
    }
}

// testIdempotency();
console.log("Script created.");
