# Payment Service

## 1. Vai trò kiến trúc
- Xử lý giao dịch tài chính. Lắng nghe lệnh từ Order Service thay vì nhận HTTP request trực tiếp.

## 2. Tech Stack & Cấu hình
- **Framework:** Node.js.
- **Database:** MongoDB (Lưu lịch sử giao dịch).
- **Message Broker:** Apache Kafka (Đóng vai trò Consumer thuộc `payment-group`).

## 3. Core Logic (Idempotency - Tính lũy đẳng)
- **Lắng nghe Kafka:** Consume message từ topic `ORDER_CREATED`.
- **Nguyên tắc SỐ TỬ:** Phải xử lý **Idempotency** (Tránh thanh toán trùng). Trước khi gọi 3rd party (Stripe/Momo), kiểm tra DB xem `orderId` này đã tồn tại giao dịch thành công nào chưa. Nếu có rồi -> Bỏ qua message.
- Giả lập gọi API thanh toán -> Lưu trạng thái vào MongoDB (Transaction record).
- Khi thanh toán xong, publish ngược một event `PAYMENT_SUCCESS` hoặc `PAYMENT_FAILED` lên Kafka để Order Service cập nhật lại trạng thái đơn hàng.