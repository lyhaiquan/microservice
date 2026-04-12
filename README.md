# Shopee Microservices Architecture

Dự án mô phỏng hệ thống thương mại điện tử (e-commerce) quy mô lớn sử dụng kiến trúc **Microservices**, tập trung vào tính nhất quán dữ liệu thông qua mô hình **Saga Choreography** và giao tiếp bất đồng bộ qua **Kafka**.

## 🚀 Công nghệ sử dụng

- **Backend**: Node.js, Express.js
- **Database**: MongoDB (với Replica Set để hỗ trợ Distributed Transactions)
- **Messaging**: Apache Kafka (KafkaJS)
- **Caching**: Redis (được sử dụng trong Product Service)
- **Payment Gateway**: VNPay Sandbox
- **Testing**: Jest, Supertest, MongoDB Memory Server

## 🏗️ Kiến trúc Microservices

Dự án được chia thành các service độc lập:

1.  **Auth Service**: Quản lý xác thực và phân quyền người dùng.
2.  **Product Service**: Quản lý danh mục sản phẩm, tồn kho và bộ nhớ đệm Redis.
3.  **Cart Service**: Quản lý giỏ hàng của người dùng.
4.  **Order Service**: Khởi tạo đơn hàng và điều phối trạng thái đơn hàng.
5.  **Payment Service**: Xử lý thanh toán qua cổng VNPay và xác nhận kết quả.

## 🔄 Luồng Nghiệp Vụ Saga (Choreography)

Hệ thống sử dụng mô hình Saga để đảm bảo tính nhất quán giữa Đơn hàng, Tồn kho và Thanh toán mà không gây treo hệ thống (Non-blocking):

1.  **Order Service**: Lưu đơn hàng `PENDING` -> Bắn sự kiện `ORDER_CREATED`.
2.  **Product Service**: Nhận `ORDER_CREATED` -> Kiểm tra và giữ kho (Atomic Reservation).
    - Nếu thành công: Bắn sự kiện `STOCK_RESERVED`.
    - Nếu thất bại: Bắn sự kiện `STOCK_FAILED`.
3.  **Payment Service**: Nhận `STOCK_RESERVED` -> Sinh link VNPay cho khách hàng.
4.  **Xác nhận thanh toán**: Khi khách hàng trả tiền xong, `Payment Service` bắn sự kiện `PAYMENT_CONFIRMED` -> `Order Service` cập nhật trạng thái đơn hàng thành `PAID`.
5.  **Bồi hoàn (Compensation)**: Nếu kho hàng thất bại, `Order Service` lắng nghe `STOCK_FAILED` và chuyển đơn hàng sang trạng thái `CANCELLED`.

## 📁 Cấu trúc thư mục

```text
Shopee-Microservices/
├── services/
│   ├── auth-service/       # Xác thực
│   ├── product-service/    # Sản phẩm & Kho
│   ├── cart-service/       # Giỏ hàng
│   ├── order-service/      # Đơn hàng
│   ├── payment-service/    # Thanh toán
│   └── common/             # Thư viện dùng chung (Database config)
├── infra/                  # Cấu trúc hạ tầng (Nginx, Docker)
├── scripts/                # Các script test và seed dữ liệu
└── docker-compose.yml      # Chạy toàn bộ hệ thống
```

## 🛠️ Hướng dẫn cài đặt

### 1. Yêu cầu hệ thống
- Node.js v18+
- Docker & Docker Compose
- Kafka & Zookeeper (Chạy qua Docker)

### 2. Cài đặt các service
```bash
# Cài đặt dependencies cho từng service
npm install
cd services/auth-service && npm install
cd ../product-service && npm install
# ... thực hiện tương tự cho các service khác
```

### 3. Cấu hình Biến môi trường
Mỗi service cần một file `.env` dựa trên các file `.env.example` có sẵn (đảm bảo cấu hình đúng `KAFKA_BOOTSTRAP_SERVERS` và `MONGO_URI`).

### 4. Chạy dự án
```bash
# Chạy Kafka và MongoDB Replica Set trước
docker-compose up -d kafka zookeeper mongodb

# Chạy từng service ở chế độ dev
npm run dev
```

## 🧪 Kiểm thử (Testing)

Dự án sử dụng **Jest** cho Unit Test và Integration Test.

```bash
# Chạy test cho một service cụ thể
cd services/order-service
npm test
```

## 📄 Giấy phép

Dự án này được phát triển cho mục đích học tập và xây dựng kiến trúc microservices.
