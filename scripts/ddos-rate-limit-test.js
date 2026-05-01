const axios = require('axios');

const BASE_URL = "http://localhost:5050/api/auth/login"; // 5 req / 1 min

async function testRateLimit() {
    console.log("🚀 Testing Rate Limiting (Token Bucket)...");

    const requests = Array.from({ length: 7 }).map((_, i) => {
        return axios.post(BASE_URL, {
            email: "test@example.com",
            password: "password123"
        }).catch(err => err.response);
    });

    const results = await Promise.all(requests);
    
    const allowed = results.filter(r => r && r.status !== 429).length;
    const blocked = results.filter(r => r && r.status === 429).length;

    console.log(`Summary: Allowed: ${allowed}, Blocked (429): ${blocked}`);
    
    if (allowed === 5 && blocked === 2) {
        console.log("✅ Rate Limit Test Passed! (Blocked after 5 requests)");
    } else {
        console.log("❌ Rate Limit Test Failed!");
    }
}

testRateLimit().catch(err => {
    console.error("FATAL:", err.message);
    process.exit(1);
});
