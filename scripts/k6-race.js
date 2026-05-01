import http from 'k6/http';
import { check } from 'k6';

export const options = {
    scenarios: {
        race_condition: {
            executor: 'per-vu-iterations',
            vus: 2,
            iterations: 1,
            maxDuration: '10s',
        },
    },
};

// k6 không sign JWT được nên phải truyền sẵn N token (mỗi VU một token,
// userId khác nhau) qua biến môi trường, ví dụ:
//   TOKENS="t1,t2" USER_IDS="USR_RACE_1,USR_RACE_2" PRODUCT_ID=PROD_X k6 run k6-race.js
const TOKENS = (__ENV.TOKENS || '').split(',').filter(Boolean);
const USER_IDS = (__ENV.USER_IDS || '').split(',').filter(Boolean);

export default function () {
    const idx = (__VU - 1) % Math.max(TOKENS.length, 1);
    const token = TOKENS[idx] || __ENV.TOKEN;
    const userId = USER_IDS[idx] || __ENV.USER_ID || `K6_USER_${__VU}`;

    const payload = JSON.stringify({
        userId,
        checkoutId: `K6_RACE_CHK_${__VU}_${Date.now()}`,
        items: [{ productId: __ENV.PRODUCT_ID, quantity: 1 }],
        totalAmount: 99.99,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
    };

    const res = http.post('http://api-gateway:8081/api/orders', payload, params);

    // 1 thằng pass (201), những thằng còn lại 400 (out-of-stock).
    // 429 = rate-limited → cấu hình userId trùng → fail test.
    check(res, {
        'success (201)': (r) => r.status === 201,
        'out-of-stock (400)': (r) => r.status === 400,
        'NOT rate-limited (429)': (r) => r.status !== 429,
    });
}
