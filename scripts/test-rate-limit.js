const axios = require('axios');

const API_URL = 'http://localhost:8081/api/auth/login';

async function testAuthRateLimit() {
    console.log('🚀 Bắt đầu test Token Bucket trên Auth Service...');
    console.log('Target: ', API_URL);
    
    const requests = [];
    // Gửi 7 request liên tiếp (giới hạn là 5 trong 1 phút)
    for (let i = 1; i <= 7; i++) {
        requests.push(
            axios.post(API_URL, {
                email: 'test@example.com',
                password: 'password123'
            }).then(res => {
                console.log(`✅ Request ${i}: Thành công (HTTP ${res.status})`);
            }).catch(err => {
                if (err.response) {
                    console.log(`❌ Request ${i}: Thất bại (HTTP ${err.response.status}) - ${err.response.data.message}`);
                    if (err.response.headers['retry-after']) {
                        console.log(`   └─ Retry-After: ${err.response.headers['retry-after']}s`);
                    }
                } else {
                    console.log(`❌ Request ${i}: Lỗi kết nối - ${err.message}`);
                }
            })
        );
    }

    await Promise.all(requests);
}

async function testProductRateLimit() {
    const PRODUCT_URL = 'http://localhost:8081/api/products';
    console.log('\n🚀 Bắt đầu test Strict Leaky Bucket trên Product Service...');
    console.log('Target: ', PRODUCT_URL);

    // Gửi 10 request liên tiếp với độ trễ cực thấp
    for (let i = 1; i <= 10; i++) {
        axios.get(PRODUCT_URL)
            .then(res => console.log(`✅ [Product] Req ${i}: OK`))
            .catch(err => {
                if (err.response) {
                    console.log(`❌ [Product] Req ${i}: HTTP ${err.response.status} - ${err.response.data.message}`);
                }
            });
        // Không đợi, bắn liên tục
    }
}

async function runTests() {
    try {
        await testAuthRateLimit();
        await testProductRateLimit();
    } catch (error) {
        console.error('Lỗi khi chạy test:', error.message);
    }
}

runTests();
