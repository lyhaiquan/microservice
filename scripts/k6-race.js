import http from 'k6/http';
import { check } from 'k6';

export const options = {
    scenarios: {
        race_condition: {
            executor: 'per-vu-iterations',
            vus: 2,
            iterations: 1, // Mỗi thằng mua 1 phát, chạy duy nhất 1 lần
            maxDuration: '10s',
        },
    },
};

export default function () {
    const payload = JSON.stringify({
        userId: __ENV.USER_ID,
        items: [{ productId: __ENV.PRODUCT_ID, quantity: 1, price: 99.99 }], // Tên thì tự động gán Unknown bên Backend
        totalAmount: 99.99
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${__ENV.TOKEN}`
        },
    };

    // Đánh vào api-gateway bên trong môi trường Docker Network
    const res = http.post('http://api-gateway:8080/api/orders', payload, params);

    // Một thằng phải rớt (400), một thằng phải pass (201)
    check(res, {
        'Giao dịch thành công (201)': (r) => r.status === 201,
        'Bị cấm do trùng/hết kho (400)': (r) => r.status === 400
    });
}
