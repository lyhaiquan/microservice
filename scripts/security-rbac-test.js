const axios = require('axios');
const { adminToken, buyerToken } = require('./auth_helper');

const BASE_URL = "http://localhost:5050/api/auth"; // Giả định Auth Service đang chạy

async function testRBAC() {
    console.log("🚀 Testing RBAC for Admin APIs...");

    const testCases = [
        {
            name: "Access Pending Sellers as Admin (Should Succeed)",
            url: `${BASE_URL}/admin/users/pending-sellers`,
            token: adminToken,
            expectedStatus: 200
        },
        {
            name: "Access Pending Sellers as Buyer (Should Fail - 403)",
            url: `${BASE_URL}/admin/users/pending-sellers`,
            token: buyerToken,
            expectedStatus: 403
        },
        {
            name: "Access without Token (Should Fail - 401)",
            url: `${BASE_URL}/admin/users/pending-sellers`,
            token: null,
            expectedStatus: 401
        }
    ];

    for (const tc of testCases) {
        try {
            const headers = tc.token ? { 'Authorization': `Bearer ${tc.token}` } : {};
            const res = await axios.get(tc.url, { headers });
            console.log(`[${tc.name}] Status: ${res.status} - ${res.status === tc.expectedStatus ? "✅ PASS" : "❌ FAIL"}`);
        } catch (err) {
            const status = err.response ? err.response.status : "No Response";
            console.log(`[${tc.name}] Status: ${status} - ${status === tc.expectedStatus ? "✅ PASS" : "❌ FAIL"}`);
        }
    }
}

testRBAC();
