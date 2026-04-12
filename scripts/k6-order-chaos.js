import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    vus: 10,
    duration: '50s', // Đủ dài để Chaos Injection xảy ra và DB kịp chọn Master mới
    thresholds: {
        http_req_failed: ['rate<0.15'] // Dự phòng rủi ro 15% failed lúc rớt Node
    }
};

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:8080/api';

export function setup() {
    // 1. Tạo ngẫu nhiên 1 User duy nhất cho toàn bộ VU dùng chung
    const id = Math.floor(Math.random() * 10000000);
    const email = `chaos_sre_${id}@ptit.edu.vn`;
    const payload = JSON.stringify({ email: email, password: 'Password123!', name: `SRE Tester ${id}` });
    const params = { headers: { 'Content-Type': 'application/json' } };

    const regRes = http.post(`${BASE_URL}/auth/register`, payload, params);
    
    // Auth-service sẽ trả về { message: "..", token: "ey..." }
    const token = regRes.json().token;
    console.log(`[SETUP] Khởi tạo SRE JWT Token: ${token ? 'SUCCESS' : 'FAILED'}`);
    
    // Nếu token bị thiếu, thử lấy từ json nếu response khác cấu trúc
    return { token: token };
}

export default function (data) {
    if (!data.token) {
        console.error("Thiếu JWT Token! Kịch bản hủy bỏ.");
        return;
    }

    // Một ObjectId MongoDB hợp lệ tượng trưng cho Product
    const fakeProductId = "60b8d295f1f4e15d8868c2f0"; 
    
    const payload = JSON.stringify({
        userId: "60b8d295f1f4e15d8868c2f0",
        items: [{ productId: "60b8d295f1f4e15d8868c2f0", quantity: 1, price: 99.99 }],
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

    // Ghi nhận lỗi HTTP (5xx)
    const success = check(res, {
        'Tạo đơn hàng thành công (201)': (r) => r.status === 201 || r.status === 200,
        'Ngắt quãng (5xx)': (r) => r.status >= 500,
    });

    if (!success && res.status >= 500) {
        console.error(`[CHAOS ERROR] Order thất bại. Status: ${res.status} | Body: ${res.body}`);
    }

    sleep(0.5); // Spam tần suất cao hơn bình thường (mỗi VU 2 request/giây)
}
