# Order Service (Hệ thống điều phối cốt lõi)

## 1. Vai trò kiến trúc
- Xử lý nghiệp vụ đặt hàng, giữ vai trò "Nhạc trưởng" kích hoạt các quy trình thanh toán và trừ tồn kho.

## 2. Tech Stack & Cấu hình
- **Framework:** Node.js (Express.js).
- **Database:** MongoDB (Replica Set). Áp dụng Transaction (ACID) của MongoDB khi tạo Order.
- **Message Broker:** Apache Kafka (Đóng vai trò Producer).

## 3. Core Logic (Distributed Transaction)
- Khi nhận request `POST /api/orders`:
  1. Khởi tạo một Transaction session trên MongoDB.
  2. Tạo record Order với trạng thái `CREATED_PENDING_PAYMENT`.
  3. Commit transaction.
  4. Nếu commit DB thành công, **publish một event** `ORDER_CREATED` vào Kafka topic. Payload bắt buộc chứa: `orderId, userId, totalAmount`.
- Cần có cơ chế Retry nếu quá trình đẩy message lên Kafka thất bại.