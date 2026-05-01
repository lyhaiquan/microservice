import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    vus: 2,
    iterations: 2,
};

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:8081/api';
const PRODUCT_ID = __ENV.PRODUCT_ID;

// Mỗi VU dùng token + userId riêng để bypass per-user rate limit (3/min/user).
const TOKENS = (__ENV.TOKENS || '').split(',').filter(Boolean);
const USER_IDS = (__ENV.USER_IDS || '').split(',').filter(Boolean);

export default function () {
    const idx = (__VU - 1) % Math.max(TOKENS.length, 1);
    const token = TOKENS[idx] || __ENV.TOKEN;
    const userId = USER_IDS[idx] || `K6_RACE_${__VU}`;

    const payload = JSON.stringify({
        userId,
        checkoutId: `K6_RACE_CHK_${__VU}_${__ITER}_${Date.now()}`,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        totalAmount: 99.99,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
    };

    // Đồng bộ: đợi đến đầu giây kế tiếp để các VU bắn cùng lúc
    const waitTime = 1000 - (Date.now() % 1000);
    sleep(waitTime / 1000);

    const res = http.post(`${BASE_URL}/orders`, payload, params);

    const success = check(res, {
        'status is 201 or 400/409': (r) => [201, 400, 409].includes(r.status),
        'NOT rate-limited (429)': (r) => r.status !== 429,
    });
    if (!success) {
        console.error(`Status: ${res.status}, Body: ${res.body}`);
    }
}
