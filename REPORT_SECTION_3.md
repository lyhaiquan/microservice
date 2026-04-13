## 3. CÀI ĐẶT VẬT LÝ VÀ THỰC TẾ

### 3.1. Cài đặt mạng (Docker Network)
Hệ thống sử dụng **Docker Bridge Network** (`shopee-network`) để thiết lập một mạng ảo nội bộ. Các container (service và database) có thể nhìn thấy và liên lạc với nhau qua HOSTNAME thay vì địa chỉ IP tĩnh.

**Kết quả kiểm tra thực tế:**
```text
shopee-redis -> 172.24.0.2
zookeeper    -> 172.24.0.6
mongo1       -> 172.24.0.4
api-gateway  -> 172.24.0.7
mongo2       -> 172.24.0.5
mongo3       -> 172.24.0.3
```
*Ghi chú: Việc sử dụng Docker Network thay thế cho ZeroTier trong môi trường local giúp tối ưu hóa băng thông và bảo mật nội bộ.*

---

### 3.2. Cài đặt MongoDB Replica Set
Quá trình khởi tạo được thực hiện tự động qua container `mongo-init` với lệnh `rs.initiate()`. Hệ thống bao gồm 3 node (`mongo1`, `mongo2`, `mongo3`) chạy chung cấu hình `replSet: dbrs`.

**Chứng minh trạng thái hoạt động (rs.status()):**
```text
[
  { name: 'mongo1:27017', state: 'PRIMARY', health: 1 },
  { name: 'mongo2:27017', state: 'SECONDARY', health: 1 },
  { name: 'mongo3:27017', state: 'SECONDARY', health: 1 }
]
```
*Minh chứng: 3 Node đều có trạng thái health: 1 (Lành mạnh) và đã bầu xong Primary.*

---

### 3.3. Kiểm tra dịch vụ và Kết nối
| Khái niệm SQL truyền thống | Tương đương trong Microservices/NoSQL | Minh chứng |
| :--- | :--- | :--- |
| **SQL Agent** | **Kafka Consumer/Producer** | Các consumer lắng nghe topic `order-events`, `stock-events` |
| **LinkServer** | **MDB Connection String** | `mongodb://mongo1:27017,mongo2:27017,mongo3:27017/shopee?replicaSet=dbrs` |

---

### 3.4. Thử các giao tác (Verification Test Cases)

#### a. Giao tác phân tán (Saga Pattern)
Khi một đơn hàng được tạo, luồng sự kiện được ghi lại trên Kafka Broker:
1. `order-service` bắn sự kiện `ORDER_CREATED`.
2. `product-service` nhận sự kiện và thực hiện **Atomic Operation**:
   ```javascript
   Product.findOneAndUpdate(
       { _id: productId, quantity: { $gte: targetQty } },
       { $inc: { quantity: -targetQty } }
   );
   ```
   *Minh chứng: Sử dụng $inc kết hợp với điều kiện so sánh giúp chống lại lỗi Race Condition trong hệ thống phân tán.*

#### b. Test Case 1: Bầu cử (Election & Failover)
Kịch bản: Dừng (Stop) node đang làm `PRIMARY` và quan sát hệ thống tự phục hồi.
1. **Trước khi stop**: `mongo2` là PRIMARY.
2. **Thực thi**: `docker stop mongo2`.
3. **Trong khi chờ**: Nhật ký log của `mongo1` và `mongo3` xuất hiện thông báo bầu cử.
4. **Sau khi stop**: `mongo1` tự động được bầu làm PRIMARY mới.
5. **Khôi phục**: Khi `docker start mongo2`, node này quay lại hệ thống với vai trò SECONDARY.
*Kết luận: Hệ thống đảm bảo tính sẵn sàng (Availability) cao.*

#### c. Test Case 2: Đồng bộ dữ liệu (Replication Lag)
Sử dụng lệnh `rs.printReplicationInfo()` để kiểm tra độ trễ.
- **Configured Oplog Size**: ~1000 MB.
- **Log Length**: Dữ liệu oplog kéo dài từ thời điểm khởi tạo.
- **Lag**: Gần như bằng 0 (0 secs) do các node nằm trong cùng một mạng Docker tốc độ cao.
*Minh chứng: CSDL phân tán đảm bảo dữ liệu luôn được nhân bản đồng bộ sang các bản sao.*

---

## PHỤ LỤC: SƠ ĐỒ HỆ THỐNG

### Sơ đồ Use Case (Use Case Diagram)
```mermaid
usecaseDiagram
    actor "Khách hàng (Guest)" as G
    actor "Người dùng (User)" as U
    actor "Hệ thống (System)" as S

    package "Shopee Microservices" {
        usecase "Xem sản phẩm" as UC1
        usecase "Đặt hàng" as UC2
        usecase "Thanh toán" as UC3
        usecase "Quản lý tồn kho" as UC4
        usecase "Đăng nhập/Đăng ký" as UC5
    }

    G --> UC1
    G --> UC5
    U --> UC2
    U --> UC3
    UC2 ..> UC4 : <<include>>
    S --> UC4
    S --> UC3
```
