# Shopee Microservices Architecture

Dự án mô phỏng hệ thống thương mại điện tử (e-commerce) quy mô lớn sử dụng kiến trúc **Microservices**, tập trung vào tính nhất quán dữ liệu thông qua mô hình **Saga Choreography**, chịu tải cực cao với **CQRS + Redis**, và khả năng sống sót (Failover) với **MongoDB Replica Set**.

---

## 🚀 Công nghệ sử dụng

- **Backend**: Node.js, Express.js
- **Database**: MongoDB (với cụm Replica Set 3-Node để hỗ trợ Distributed Transactions & Failover)
- **Messaging**: Apache Kafka & Zookeeper (KafkaJS)
- **Caching**: Redis (Sử dụng Cache Aside trong Product Service)
- **Payment Gateway**: VNPay Sandbox
- **Testing**: Jest, Supertest, K6 (Load Testing)

---

## 🏗️ Sơ Đồ Kiến Trúc Hệ Thống

Hệ thống tuân thủ chặt chẽ nguyên lý Microservices, giao tiếp ngoại vi qua API Gateway và nội bộ qua Kafka.
<details>
<summary><b>Nhấn để xem Sơ đồ Kiến trúc (Mermaid)</b></summary>

```mermaid
graph TD
    Client[Client / K6 Load Tester] -->|HTTP Request| Gateway(Nginx API Gateway)

    Gateway -->|/api/auth| Auth[Auth Service:5050]
    Gateway -->|/api/products| Product[Product Service:5001]
    Gateway -->|/api/orders| Order[Order Service:5003]
    Gateway -->|/api/cart| Cart[Cart Service:5002]
    Gateway -->|/api/payments| Payment[Payment Service:5004]

    Product -.->|Tăng tốc Đọc/Ghi| Redis[(Redis Cache)]
    
    Order -.->|Publish ORDER_CREATED| Kafka[Kafka Message Broker]
    Kafka -.->|Consume EVENT| Product
    Product -.->|Publish STOCK_FAILED/RESERVED| Kafka
    Kafka -.->|Consume Đền bù| Order
    
    Product -->|Read/Write| Mongo[(MongoDB dbrs Cluster)]
    Order -->|Read/Write| Mongo
    Auth -->|Read/Write| Mongo
    
    subgraph "MongoDB Replica Set (dbrs)"
        Mongo1[mongo1:27011<br>Tướng Phụ - SECONDARY]
        Mongo2[mongo2:27012<br>Tướng Chính - PRIMARY]
        Mongo3[mongo3:27013<br>Tướng Phụ - SECONDARY]
        Mongo2 -.->|Đồng bộ Dữ liệu| Mongo1
        Mongo2 -.->|Đồng bộ Dữ liệu| Mongo3
    end
```
</details>

---

## 🧪 Hệ Thống Kiểm Thử (Testing & Workflows)

Dự án cung cấp bộ các kịch bản kiểm thử hạng nặng ở thư mục `/scripts` để chứng minh sức mạnh kiến trúc. Để chạy các test này, bạn cần đảm bảo các môi trường (Kafka, MongoDB, Redis) và các Node Service đã được bật sẵn.

### 1. Luồng Chịu tải Cao (Performance Test)
- **Script:** `node scripts/performance-5000-req.js` (hoặc chạy bằng docker K6)
- **Mục đích:** Chứng minh hệ thống không bị "sập" khi có hàng ngàn user lướt trang cùng một thời điểm.
- **Cách chống chịu:** 
  1. Product Service đọc dữ liệu từ **Redis Cache**. Nếu Cache thiếu, nó gọi MongoDB.
  2. Tại MongoDB, kết nối được cấu hình **CQRS** `readPreference=secondaryPreferred`. Lệnh đọc không chạy vào Node xử lý Dữ liệu Vàng (Primary) mà dồn hết qua 2 Node Secondary rảnh rỗi.

<details>
<summary><b>Nhấn để xem Sơ đồ Tuần tự (Performance)</b></summary>

```mermaid
sequenceDiagram
    participant Tester as K6 Load Tester
    participant Nginx as API Gateway
    participant Prod as Product Service
    participant Redis as Redis Cache
    participant MongoSec as Mongo SECONDARY

    Tester->>Nginx: GET /api/products
    Nginx->>Prod: Forward Request
    Prod->>Redis: Kiểm tra Cache
    
    alt Cache HIT (Đã có dữ liệu)
        Redis-->>Prod: Sinh dữ liệu siêu tốc (<20ms)
    else Cache MISS (Lần truy cập đầu)
        Redis-->>Prod: Rỗng
        Prod->>MongoSec: Phân tải tới Node Phụ (secondaryPreferred)
        MongoSec-->>Prod: Dữ liệu thực tế 
        Prod->>Redis: Lưu vào Cache 5 phút
    end
    
    Prod-->>Nginx: Response 200 OK
```
</details>

### 2. Luồng Chống Xung đột Kho & Vượt tồn kho (Race Condition / Saga)
- **Script:** `node scripts/race-condition-test.js`
- **Mục đích:** Đảm bảo khi 10 người cùng lúc giành mua chung 1 sản phẩm có số lượng = 1, sẽ chỉ có đúng 1 người mua được, không xảy ra Overselling (Bán lố càn).
- **Cách chống chịu:** Bằng sức mạnh **Eventual Consistency của Saga**. 
  - Order Service thu nhận đủ 10 đơn (Pending), đánh lừa user bằng một thông báo nhẹ nhàng (HTTP 201) rồi quăng sự kiện lên Kafka. 
  - Product Service lần lượt gỡ từng message ra. Nhờ khoá cấp dòng (Row-level Lock) của `findOneAndUpdate({ quantity: {$gte: 1} })` bên MongoDB, người đầu tiên trừ được kho về 0. 
  - 9 ông đi trễ sẽ bị văng lỗi. Product Service trả tin nhắn huỷ `STOCK_FAILED` lên Kafka. Order Service nhận được và âm thầm cập nhật 9 Order mồ côi kia thành `CANCELLED`.

<details>
<summary><b>Nhấn để xem Sơ đồ SAGA Choreography</b></summary>

```mermaid
sequenceDiagram
    participant VU as 10 Người mua
    participant OrderSvc as Order Service
    participant Kafka as Kafka
    participant ProdSvc as Product Service
    participant Mongo as Mongo (PRIMARY)

    VU->>OrderSvc: Bấm Mua (Tồn kho=1)
    Note right of OrderSvc: Async: Chấp nhận mọi Request
    OrderSvc->>Mongo: Insert 10 Orders trạng thái PENDING
    OrderSvc-->>VU: HTTP 201 Created
    OrderSvc->>Kafka: Publish 10 x Sự kiện [ORDER_CREATED]

    Kafka-->>ProdSvc: Lấy ra Sự kiện Mua đầu tiên
    ProdSvc->>Mongo: Cập nhật Mongoose: $inc -1 NẾU tồn kho >= 1
    Mongo-->>ProdSvc: Thành Công! (Tồn kho -> 0)
    ProdSvc->>Kafka: Báo tin [STOCK_RESERVED]

    loop Lần lượt Cày 9 Sự kiện còn lại
        Kafka-->>ProdSvc: Đọc Sự Kiện Mua (Thứ 2 đến thứ 10)
        ProdSvc->>Mongo: Cập nhật: $inc -1 NẾU tồn kho >= 1
        Mongo-->>ProdSvc: Rớt Đơn! Tồn kho đã là 0!
        ProdSvc->>Kafka: Báo tin [STOCK_FAILED]
    end

    Note left of OrderSvc: Đền Bù Hậu Quả (Compensate)
    Kafka-->>OrderSvc: Order Service nhận được 9 trát [STOCK_FAILED]
    OrderSvc->>Mongo: Cập nhật 9 Order Mồ Côi -> CANCELLED
```
</details>

### 3. Khả năng Sống sót sau Thảm hoạ (High Availability / Failover)
- **Mục đích:** Nếu ổ cứng của máy chủ chứa Database Cốt lõi (Primary) bị hỏa hoạn, hệ thống phải tự sửa chữa và sống sót.
- **Cách chống chịu:** Driver Node.js kết hợp cùng MongoDB Replica Set có khả năng Auto-Failover. 
  - Nếu Node Chính (`mongo2`) sập, liên kết bị đứt ngang. Mongoose thay vì làm Server Error Node.js thì sẽ Tạm giữ (Buffer) toàn bộ API Calls trên Memory. 
  - Sau 2-4 giây, Cụm Mongo phụ bỏ phiếu đôn Node Phụ lên làm Sếp Mới (`mongo3`). 
  - Mongoose phát hiện được, lập tức bắt ống nước qua đó, nhả toàn bộ Buffer data xuống. Kết quả: Ko thất thoát 1 Byte tín hiệu nào, User không hề biết Server vừa trải qua sinh tử!

<details>
<summary><b>Nhấn để xem Sơ đồ Phục Hồi Thảm Hoạ</b></summary>

```mermaid
sequenceDiagram
    participant App as Mongoose (NodeJS App)
    participant M2 as mongo2 (Node PRIMARY)
    participant M3 as mongo3 (Node SECONDARY)

    App->>M2: Insert Document
    M2-->>App: OK
    
    Note over M2: 🔥 SỐC NHIỆT: Máy chứa mongo2 BỊ CÚP ĐIỆN!
    App->>x M2: Lệnh Write Mới... Đứt Mạng!
    Note left of App: Mongoose phát hiện Sếp ngủm!<br/>Treo tạm Request ở RAM (Buffering)
    
    Note over M3: Bầu Cử Khẩn Cấp (2s) -> mongo3 Lên Ngôi Sếp
    
    App->>M3: Mongoose dò la Sếp mới
    Note left of App: XẢ KHO LỆNH (Flush)
    App->>M3: Bơm nốt File Lệnh vào
    M3-->>App: Thành công tuyệt đối
```
</details>

---

## 🛠️ Hướng dẫn cài đặt & Chạy chuẩn

### 1. Yêu cầu hệ thống
- Node.js v18+
- Docker & Docker Compose (Rất quan trọng)

### 2. Cài đặt các service
```bash
npm install # Tại thư mục root và từng thư mục con trong /services
```

### 3. Cấu hình Biến môi trường (.env)
Đảm bảo tất cả file `.env` của 5 microservices trỏ dúng địa chỉ Liên Minh Replica Set:
```env
MONGO_URI=mongodb://mongo1:27011,mongo2:27012,mongo3:27013/shopee?replicaSet=dbrs&readPreference=secondaryPreferred
```

### 4. Vận hành Toàn Cục
1. Khởi động tầng Hạ tầng (Database, Messaging, API Gateway):
   ```bash
   docker-compose up -d
   ```
2. Cấy dữ liệu Giả (Seed DummyJSON) - **Bắt buộc**:
   ```bash
   node scripts/seed.js
   ```
3. Bật 5 NodeJS Service theo kiểu Debug song song:
   ```bash
   # Mở lần lượt từng terminal trong các folder dịch vụ và gõ:
   npm run dev
   ```

## 📄 Giấy phép

Dự án này được phát triển cho mục đích học tập chiến lược Hệ thống phân tán và bảo vệ luận án Microservices. Mọi tài sản thuộc về học viên và giảng viên đánh giá.
