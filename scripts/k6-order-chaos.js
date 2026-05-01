import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    vus: 10,
    duration: '50s', // Đủ dài để Chaos Injection xảy ra và DB kịp chọn Master mới
    thresholds: {
        http_req_failed: ['rate<0.15'] // Dự phòng rủi ro 15% failed lúc rớt Node
    }
};

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:8081/api';
// productId phải tồn tại trong DB & có stock đủ lớn. Mặc định trỏ tới
// product được seed bởi perf-runner trước khi chạy k6 (xem scripts/perf-runner.js).
const PRODUCT_ID = __ENV.PRODUCT_ID || 'PROD_K6_LOAD';

export function setup() {
    // 1. Tạo ngẫu nhiên 1 User duy nhất cho toàn bộ VU dùng chung
    const id = Math.floor(Math.random() * 10000000);
    const email = `chaos_sre_${id}@ptit.edu.vn`;
    const password = 'Password123!';
    const params = { headers: { 'Content-Type': 'application/json' } };

    // Register cần đầy đủ {email, password, fullName, region} theo schema thực tế
    const regPayload = JSON.stringify({
        email,
        password,
        fullName: `SRE Tester ${id}`,
        region: 'NORTH'
    });
    const regRes = http.post(`${BASE_URL}/auth/register`, regPayload, params);
    if (regRes.status !== 201) {
        console.error(`[SETUP] Register FAILED status=${regRes.status} body=${regRes.body}`);
        return { token: null };
    }

    // Auth-service register KHÔNG trả token → gọi login để lấy token
    const loginRes = http.post(`${BASE_URL}/auth/login`,
        JSON.stringify({ email, password }), params);
    let token = null;
    let userId = null;
    try {
        const j = loginRes.json();
        token = j.token;
        userId = j.user && j.user.id;
    } catch (_) {}
    console.log(`[SETUP] JWT Token: ${token ? 'SUCCESS' : 'FAILED'} userId=${userId}`);
    return { token, userId };
}

export default function (data) {
    if (!data.token) {
        console.error("Thiếu JWT Token! Kịch bản hủy bỏ.");
        return;
    }

    const payload = JSON.stringify({
        userId: data.userId || `K6_USER_${__VU}`,
        // checkoutId khác nhau mỗi iteration để không bị idempotency cache hit
        checkoutId: `K6_CHK_${__VU}_${__ITER}_${Date.now()}`,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        totalAmount: 99.99
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.token}`
        },
    };

    // --- TIẾN HÀNH ĐẶT HÀNG ---
    const res = http.post(`${BASE_URL}/orders`, payload, params);

    check(res, {
        'Tạo đơn hàng (201/200)': (r) => r.status === 201 || r.status === 200,
        'Không 5xx (chaos)': (r) => r.status < 500,
    });

    if (res.status >= 500) {
        console.error(`[CHAOS ERROR] Order thất bại. Status: ${res.status} | Body: ${res.body}`);
    }

    sleep(0.5); // Spam tần suất cao hơn bình thường (mỗi VU 2 request/giây)
}
