import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    // Cấu hình 100 người dùng (Virtual Users) cùng lúc
    vus: 100,
    duration: '30s',
    // Ngưỡng đánh giá (Thresholds)
    thresholds: {
        http_req_failed: ['rate<0.05'],    // Tỉ lệ lỗi phải dưới 5%
        http_req_duration: ['p(95)<2000'], // 95% request phải phản hồi dưới 2s
    },
};

// host.docker.internal dùng cho Docker container K6 trỏ về Localhost của máy host (chạy api-gateway)
// Nếu chạy k6 trực tiếp bằng command `k6 run` thì sửa thành http://localhost:8081/api
const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:8081/api';

export default function () {
    // 1. Dùng Math.random() tạo email ngẫu nhiên để tránh trùng Unique Lỗi Database
    const id = Math.floor(Math.random() * 10000000);
    const email = `user_${id}@ptit.edu.vn`;
    const payload = JSON.stringify({
        email: email,
        password: 'Password123!',
        name: `Tester ${id}`
    });

    const params = {
        headers: { 'Content-Type': 'application/json' },
    };

    // --- BƯỚC 1: ĐĂNG KÍ (REGISTER) ---
    const regRes = http.post(`${BASE_URL}/auth/register`, payload, params);

    const isRegOk = check(regRes, {
        'Register thành công (201)': (r) => r.status === 201 || r.status === 200,
    });

    if (isRegOk) {
        // --- IN LOG KHI ĐĂNG KÍ THÀNH CÔNG ---
        console.log(`✅ [SUCCESS] Tài khoản đăng ký thành công: ${email}`);

        // --- BƯỚC 2: LẤY ACCESS TOKEN ---
        // regRes.json() tại Backend trả về có định dạng { message, token, user }
        const token = regRes.json().token;
        
        if (token) {
            const authParams = {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
            };

            // --- BƯỚC 3: GỌI API PRODUCTS (GIẢ LẬP ĐĂNG NHẬP XONG ĐI XEM HÀNG) ---
            const prodRes = http.get(`${BASE_URL}/products`, authParams);
            check(prodRes, {
                'Xem danh sách sản phẩm OK (200)': (r) => r.status === 200,
            });
        }
    }

    // Nghỉ 1 giây để giả lập người dùng thao tác thực tế và không bị DDOS sập máy local
    sleep(1);
}