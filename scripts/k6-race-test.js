import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    vus: 2,
    iterations: 2,
};

const BASE_URL = 'http://host.docker.internal:8080/api'; // API Gateway qua Docker bridge
const PRODUCT_ID = __ENV.PRODUCT_ID;
const TOKEN = __ENV.TOKEN;

export default function () {
    const url = `${BASE_URL}/orders`;
    const payload = JSON.stringify({
        productId: PRODUCT_ID,
        quantity: 1,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`,
        },
    };

    // Đồng bộ hóa: Đợi đến giây tiếp theo để cả 2 cùng bắn
    const waitTime = 1000 - (Date.now() % 1000);
    sleep(waitTime / 1000);

    const res = http.post(url, payload, params);

    const success = check(res, {
        'status is 201 or 400/409': (r) => [201, 400, 409].includes(r.status),
    });
    if (!success) {
        console.error(`Status: ${res.status}, Body: ${res.body}`);
    }
}
