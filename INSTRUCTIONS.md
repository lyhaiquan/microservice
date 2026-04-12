# MICROSERVICES PROJECT: SHOPEE CLONE - MASTER INSTRUCTIONS

## 1. Cấu trúc Project (Project Topology)
- Hệ thống chia làm 3 khối chính:
  - `/api-gateway`: Nginx Reverse Proxy.
  - `/frontend`: ReactJS Web App.
  - `/services`: Chứa các Microservices (Node.js/Express).

## 2. Nguyên tắc phát triển (Development Standards)
- **Shared Code:** Toàn bộ Middleware xử lý lỗi, kết nối Database, và JWT Validation phải được viết trong `/services/common` để dùng chung.
- **Source Code:** Trong mỗi service, code logic phải nằm hoàn toàn trong thư mục `src/`. File chạy chính là `src/server.js`.
- **Environment:** Mỗi service dùng file `.env` riêng. Không bao giờ hardcode chuỗi kết nối.
- **Communication:** - Rest API qua Gateway.
  - Cart Service dùng gRPC.
  - Order & Payment giao tiếp qua Kafka.

## 3. Quy trình Code cho AI
- **Bước 1:** Đọc file `README.md` của service cụ thể.
- **Bước 2:** Tham chiếu các hàm dùng chung trong `/services/common`.
- **Bước 3:** Viết code cho service đó.
- **Bước 4:** Cập nhật `docker-compose.yml` tương ứng nếu cần thêm biến môi trường.

## 4. Quy trình Phát triển Tự trị (Autonomous Loop) - BẮT BUỘC
Để đảm bảo chất lượng code, AI phải thực hiện theo vòng lặp (loop) sau:
1. **Phân tích:** Đọc `README.md` của service và tham chiếu các hàm trong `/services/common`.
2. **Khởi tạo:** - Tạo `package.json` (nếu chưa có).
   - Chạy lệnh `npm install ../common` để liên kết thư viện dùng chung.
   - Cài đặt `jest` và `supertest` để làm công cụ kiểm thử.
3. **Thực thi:** Viết logic code vào thư mục `src/`.
4. **Kiểm thử & Sửa lỗi (Self-Healing):**
   - Viết Unit Test cho các API chính trong thư mục `src/__tests__`.
   - **Tự động chạy lệnh** `npm test` trong Terminal.
   - Nếu có lỗi (Fail): AI phải tự đọc Log, phân tích nguyên nhân, sửa code và chạy lại test.
   - **Lặp lại cho đến khi PASS 100% các test case.**
5. **Bàn giao:** Chỉ báo cáo hoàn thành khi code đã sạch bug và chạy ổn định.