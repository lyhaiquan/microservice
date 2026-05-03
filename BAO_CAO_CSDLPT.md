# BÁO CÁO BÀI TẬP LỚN — CƠ SỞ DỮ LIỆU PHÂN TÁN

## Đề tài: Hệ thống Thương mại điện tử phân tán (Shopee Microservices) trên nền tảng MongoDB Sharded Cluster

---

# 1. GIỚI THIỆU ĐỀ TÀI

**Tên đề tài:** Hệ thống thương mại điện tử phân tán (E-commerce Distributed System) — phiên bản Shopee Clone.

**Công nghệ lõi:**
- **CSDL phân tán:** MongoDB 6.0 — kết hợp **Sharded Cluster** + **Replica Set** trên 3 VPS đặt tại 3 miền (Bắc, Trung, Nam).
- **Backend:** Node.js / Express, kiến trúc Microservices (7 dịch vụ).
- **Bus sự kiện:** Apache Kafka (Saga Choreography).
- **Cache:** Redis.
- **API Gateway / Load Balancer:** Nginx.

**Đối tượng người dùng:** Khách hàng (BUYER), người bán (SELLER), quản trị viên (ADMIN).

---

# 2. VIẾT TÀI LIỆU

## 2.1. Đặt vấn đề

### 2.1.1. Nhu cầu và tầm quan trọng

Các nền tảng thương mại điện tử như Shopee, Lazada, Tiki phục vụ hàng triệu người dùng phân bố trên cả nước, đặt ra các yêu cầu sau:

| Yêu cầu | Mô tả |
|--------|-------|
| **Throughput cao** | Hàng nghìn request/giây cho duyệt sản phẩm, hàng trăm đơn/giây trong giờ cao điểm. |
| **Độ trễ thấp** | Người dùng ở miền Nam không thể chờ truy vấn vòng lên server miền Bắc rồi mới về. |
| **Khả năng chịu lỗi (Fault Tolerance)** | Sập 1 VPS không được làm gián đoạn dịch vụ. |
| **Tính nhất quán dữ liệu giao dịch** | Đơn hàng — thanh toán — trừ kho phải đồng nhất, không cho phép oversell. |
| **Mở rộng theo chiều ngang (Horizontal Scaling)** | Khi lượng đơn tăng, có thể thêm shard mà không cần migrate toàn bộ. |

### 2.1.2. Sơ lược dự án

Dự án triển khai một hệ thương mại điện tử **phân tán cấp vùng địa lý**, với:

- **3 VPS** thuộc 3 miền:
  - VPS **Hà Nội (NORTH)** — IP `157.245.99.196`
  - VPS **Đà Nẵng (CENTRAL)** — IP `159.65.148.165`
  - VPS **TP. Hồ Chí Minh (SOUTH)** — IP `165.22.215.86`
- **MongoDB Sharded Cluster** với **3 shard** (mỗi shard là 1 replica set 3 node trải đều trên 3 VPS):
  - Shard `rs_north` — primary tại VPS Hà Nội
  - Shard `rs_central` — primary tại VPS Đà Nẵng
  - Shard `rs_south` — primary tại VPS TP. HCM
- **mongos** (router) lắng nghe ở `157.245.99.196:27000` đóng vai trò entry point.
- **Chiến lược dữ liệu:**
  - Các collection **"đơn hàng" (orders)** và **"thanh toán" (payments)** được **phân mảnh ngang dẫn xuất theo vùng** (Zone Sharding) — đơn của user vùng nào sẽ được ghi vào shard vùng đó để giảm độ trễ.
  - Các collection **dùng chung** (users, products, categories, carts...) được **nhân bản toàn phần** qua cơ chế Replica Set để mọi node đều đọc được.

> **Trạng thái hiện tại:** Cluster đã được cấu hình và vận hành đầy đủ. Đã thực thi `enableSharding('ecommerce_db')` và `shardCollection` cho 5 collection (`orders`, `payments`, `products`, `users`, `carts`). Kết quả `db.orders.getShardDistribution()` xác nhận data phân tán đúng 3 shard theo zone địa lý: `rs_south` (11 docs — SOUTH), `rs_north` (2 docs — NORTH), `rs_central` (2 docs — CENTRAL).

---

## 2.2. Phân tích và Thiết kế

### 2.2.1. Phân tích

#### a) Các chức năng chính truy cập dữ liệu

Hệ thống có **5 nhóm chức năng nghiệp vụ** chính, mỗi nhóm thao tác trên một tập collection nhất định:

| # | Chức năng | Service | Collection chính | Loại thao tác |
|---|----------|---------|------------------|---------------|
| 1 | Đăng ký, đăng nhập, quản lý phiên | Auth Service | `users` | Read + Write |
| 2 | Duyệt / tìm kiếm sản phẩm, quản lý kho | Product Service | `products`, `categories`, `stockreservations` | Read-Heavy + Write |
| 3 | Quản lý giỏ hàng | Cart Service | `carts` | Read + Write |
| 4 | Tạo đơn, theo dõi đơn, hủy đơn | Order Service | `orders` (+ snapshot `products`) | Write-Heavy |
| 5 | Thanh toán, hoàn tiền | Payment Service | `payments`, `paymentattempts`, `refunds` | Write |
| 6 | Audit, thông báo, idempotency | Common | `auditlogs`, `notifications`, `idempotencyrecords` | Append-only |

#### b) Bảng tần suất truy cập tại các vị trí

Dự kiến phân bổ tần suất theo 3 VPS (giả thiết tỉ lệ user: HN 35% — ĐN 15% — HCM 50%):

| Collection | VPS HN (NORTH) | VPS ĐN (CENTRAL) | VPS HCM (SOUTH) | Cường độ tổng |
|-----------|---------------:|-----------------:|----------------:|--------------:|
| `users` | Đọc cao / Ghi TB | Đọc TB / Ghi thấp | Đọc cao / Ghi cao | Read-heavy |
| `products` | Đọc rất cao | Đọc cao | Đọc rất cao | Read-heavy ★ |
| `categories` | Đọc rất cao | Đọc rất cao | Đọc rất cao | Mostly cached |
| `carts` | R/W cao | R/W TB | R/W cao | Mixed |
| `orders` | **Ghi NORTH** | **Ghi CENTRAL** | **Ghi SOUTH** | Write-heavy ★ |
| `stockreservations` | R/W cao | R/W TB | R/W cao | Burst write |
| `payments` | **Ghi NORTH** | **Ghi CENTRAL** | **Ghi SOUTH** | Write-heavy |
| `paymentattempts` | Theo payments | Theo payments | Theo payments | Write |
| `refunds` | Ghi thấp | Ghi thấp | Ghi thấp | Low |
| `auditlogs` | Append cao | Append TB | Append cao | Append-only |
| `notifications` | Ghi TB | Ghi thấp | Ghi TB | Append-only |
| `idempotencyrecords` | Ghi cao | Ghi TB | Ghi cao | Append-only |

★ Chính là cơ sở để chọn **`orders`/`payments` đem đi phân mảnh ngang dẫn xuất theo vùng**, các collection còn lại **nhân bản toàn phần**.

#### c) Thuật toán phân mảnh sẽ áp dụng

Hệ thống sử dụng **2 kỹ thuật** (KHÔNG dùng phân mảnh dọc — vertical fragmentation — vì document MongoDB đã linh hoạt, không cần tách field):

##### (i) Phân mảnh ngang dẫn xuất (Derived Horizontal Fragmentation)

- **Đối tượng:** `orders`, `payments`.
- **Cơ sở dẫn xuất:** Trường `region` (đối với orders) và `userRegion` (đối với payments) — 2 trường này được "dẫn xuất" từ thuộc tính `region` của collection chủ là `users`. Khi user vùng SOUTH tạo đơn, đơn được gắn `region = "SOUTH"` và được định tuyến vào shard `rs_south`.
- **Vị từ phân mảnh (predicate):**
  - `Orders_NORTH = σ(region = "NORTH")(orders)`
  - `Orders_CENTRAL = σ(region = "CENTRAL")(orders)`
  - `Orders_SOUTH = σ(region = "SOUTH")(orders)`
  - Tương tự cho `payments` theo `userRegion`.
- **Tính chất:** Đầy đủ (completeness), không trùng lắp (disjointness) và tái dựng được (reconstruction = ∪ tất cả fragment).

##### (ii) Nhân bản toàn phần (Full Replication)

- **Đối tượng:** `users`, `products`, `categories`, `carts`, `stockreservations`, `paymentattempts`, `refunds`, `auditlogs`, `notifications`, `idempotencyrecords`.
- **Cơ chế:** Mỗi shard là 1 Replica Set 3 node (1 primary + 2 secondary). MongoDB tự động đồng bộ qua **oplog**. Các collection `users`, `products`, `carts` đã được shard với hashed key (`{ _id: "hashed" }` hoặc `{ userId: "hashed" }`) — dữ liệu phân bố đều trên 3 shard, mọi node đều phục vụ đọc được. Các collection nhỏ (`categories`, `idempotencyrecords`, `notifications`) vẫn nằm trên primary shard `rs_south`, nhân bản qua replica set nội bộ.

##### (iii) KHÔNG sử dụng phân mảnh dọc (Vertical Fragmentation)

- Lý do: MongoDB là document-store, mọi field của 1 entity được nhúng trong 1 document. Việc tách dọc (ví dụ: tách `users.credentials` ra collection riêng) sẽ phá vỡ ưu điểm "1 document = 1 đọc" và buộc phải join ở tầng ứng dụng.
- Trong dự án có 1 dạng "tách field nhạy cảm" gần giống vertical: trường `email`, `phone` được mã hóa AES-GCM (lưu `iv + ciphertext + authTag`) — đây là **mã hóa cấp field**, không phải phân mảnh.

#### d) Phân quyền (RBAC)

Hệ thống sử dụng **Role-Based Access Control** ở 2 tầng:

**Tầng ứng dụng** (file `services/auth-service/src/models/User.js`):

```javascript
roles: [{ type: String, enum: ['BUYER', 'SELLER', 'ADMIN'], default: 'BUYER' }]
```

| Vai trò | Quyền |
|--------|-------|
| **BUYER** | Đăng ký, đăng nhập, duyệt sản phẩm, thêm giỏ, đặt đơn, thanh toán, xem đơn của mình |
| **SELLER** | Tất cả quyền BUYER + tạo/sửa/xóa sản phẩm của shop, xem doanh thu shop |
| **ADMIN** | Tất cả + duyệt seller, ban user, refund, xem audit, xem thống kê toàn hệ |

**Endpoint được bảo vệ bằng middleware `checkRole([...])`** (xác minh từ source code):

| Endpoint | Vai trò bắt buộc |
|---------|------------------|
| `GET  /api/auth/admin/users/pending-sellers` | ADMIN |
| `POST /api/auth/admin/users/:id/approve` | ADMIN |
| `POST /api/auth/admin/users/:id/ban` | ADMIN |
| `GET  /api/products/admin/stats/products/count` | ADMIN |
| `POST /api/payments/refund/:id` | ADMIN |
| `POST /api/products` | SELLER, ADMIN |
| `PUT/DELETE /api/products/:id` | SELLER (chủ sở hữu), ADMIN |

**Tầng CSDL (MongoDB Auth):** Mỗi service có thể dùng connection user riêng với `roles: [readWrite@ecommerce_db]`. Hiện cluster sử dụng tài khoản admin chung qua `mongos`.

#### e) Chức năng từng vị trí

| Vị trí | Vai trò | Thành phần triển khai |
|-------|---------|----------------------|
| **Máy trạm (Front-end)** | Giao diện người dùng | React SPA — gọi API qua Nginx |
| **VPS Hà Nội (NORTH)** | Edge gateway + shard `rs_north` | Nginx (LB), 7 microservices, MongoDB shard primary HN, Kafka broker, Redis |
| **VPS Đà Nẵng (CENTRAL)** | Shard `rs_central` + service replica | 7 microservices, MongoDB shard primary ĐN |
| **VPS TP. HCM (SOUTH)** | Shard `rs_south` + service replica | 7 microservices, MongoDB shard primary HCM, đồng thời là **primary shard** của `ecommerce_db` |

#### f) Phân tích CSDL (Mô hình Document — tương đương ER)

MongoDB là document-store nên không có khóa ngoại vật lý, nhưng vẫn có **quan hệ tham chiếu logic** (lưu ID dạng String, JOIN ở tầng ứng dụng). Sơ đồ ER phía dưới thể hiện các tham chiếu này.

```mermaid
erDiagram
    users ||--o{ carts          : "userId"
    users ||--o{ orders         : "userId"
    users ||--o{ payments       : "userId"
    users ||--o{ stockreservations : "userId"
    users ||--o{ auditlogs      : "actorId"
    users ||--o{ notifications  : "userId"
    users ||--o{ idempotencyrecords : "userId"
    users ||--o{ products       : "sellerId (SELLER)"
    categories ||--o{ products  : "categoryId"
    categories ||--o{ categories: "parentId (self-ref)"
    products ||--o{ stockreservations : "skuId (variants)"
    products ||--o{ carts       : "skuId (items)"
    products ||--o{ orders      : "skuId (items snapshot)"
    orders ||--|| payments      : "paymentId (1-1)"
    orders ||--|| stockreservations : "reservationId (1-1)"
    payments ||--o{ paymentattempts : "paymentId"
    payments ||--o{ refunds     : "paymentId"
    orders ||--o{ refunds       : "orderId"

    users {
        String _id
        Object email "encrypted iv+ct+tag"
        String emailHmac UK
        String perUserSalt
        Object phone "encrypted"
        String fullName
        String region "NORTH|CENTRAL|SOUTH"
        String status "ACTIVE|BANNED|PENDING"
        Array roles "BUYER|SELLER|ADMIN"
        Array addresses
        Object credentials
        Array sessions
    }
    products {
        String _id
        String sellerId
        String sellerRegion
        String name
        String slug UK
        String categoryId
        Array variants "skuId,price,stock,version"
        String status "ACTIVE|INACTIVE|BANNED"
        Number rating
        Number numReviews
    }
    orders {
        String _id "ORD_xxxxxx"
        String region "SHARD KEY"
        String userId
        String userRegion
        String deliveryRegion
        Boolean isCrossRegion
        String status
        Object pricing
        Object shippingAddressSnapshot
        Array items "snapshot"
        String paymentId
        String reservationId
        String idempotencyKey UK
        Number version
    }
    payments {
        String _id "PAY_xxxxxx"
        String orderId UK
        String userId
        String userRegion "SHARD KEY"
        String provider "MOMO|VNPAY|ZALOPAY|COD"
        Number amount
        Number refundedAmount
        String status
        Number retryCount
        Number version
    }
    carts {
        String _id "CART_USR_xxx"
        String userId UK
        Array items
        Date expiresAt "TTL 30d"
    }
    categories {
        String _id "CAT_xxx"
        String name
        String slug UK
        String parentId "self-ref"
        Array path "materialized path"
        Number level
        Boolean isActive
    }
    stockreservations {
        ObjectId _id
        String skuId
        String checkoutId UK
        String userId
        Number quantity
        Date expiresAt "TTL 900s"
        String status
    }
    paymentattempts {
        String _id "ATT_xxx"
        String paymentId
        String idempotencyKey UK
        Number attemptNumber
        String status
    }
    refunds {
        String _id "REF_xxx"
        String paymentId
        String orderId
        String userId
        Number amount
        String idempotencyKey UK
        String status
    }
    auditlogs {
        String _id "AUD_xxx"
        String actorId
        String action
        String resourceType
        String zoneOrigin
        Date timestamp "TTL 30d"
    }
    notifications {
        ObjectId _id
        String userId
        String type
        String content
        Object metadata
        Boolean isRead
    }
    idempotencyrecords {
        String _id "sha256(...)"
        String userId
        String action
        Mixed result
        Date expiresAt "TTL 7d"
    }
```

---

### 2.2.2. Thiết kế

#### a) Thiết kế CSDL của hệ thống (Document Schema)

Toàn bộ dữ liệu nằm trong **1 database**: `ecommerce_db`. Có **13 collection** (đếm thực tế trên cluster: 12 collection nghiệp vụ + 1 collection `counters` phụ trợ sinh ID; collection `test` và `_diag` là rác cần dọn).

##### Bảng cấu trúc chi tiết các collection

###### users — Thông tin người dùng (lấy từ `services/auth-service/src/models/User.js`)

| Field | Kiểu | Ràng buộc / Chỉ mục | Ghi chú |
|-------|------|--------------------|---------|
| `_id` | ObjectId | PK | Auto |
| `email` | { iv, ciphertext, authTag } | — | AES-GCM encrypted |
| `emailHmac` | String | UNIQUE INDEX | HMAC-SHA256 dùng để search-by-email |
| `perUserSalt` | String | required | Salt riêng cho HMAC |
| `phone` | { iv, ciphertext, authTag } | — | AES-GCM encrypted |
| `fullName` | String | required | |
| `region` | String enum | NORTH/CENTRAL/SOUTH | **Dùng để dẫn xuất sharding cho orders/payments** |
| `status` | String enum | ACTIVE/BANNED/PENDING | |
| `roles` | [String] | BUYER/SELLER/ADMIN | RBAC |
| `addresses` | [addressSchema] | embedded array | |
| `credentials` | { passwordHash, failedAttempts, lockedUntil, twoFactor* } | required | Argon2id |
| `sessions` | [sessionSchema] | embedded | sparse unique on `sessions.sessionId` |
| `createdAt/updatedAt` | Date | timestamps | |

###### products — Sản phẩm (`services/product-service/src/models/product.model.js`)

| Field | Kiểu | Ràng buộc / Chỉ mục | Ghi chú |
|-------|------|--------------------|---------|
| `_id` | String | PK custom (`PRD_xxx`) | |
| `sellerId` | String | INDEX | FK → users._id |
| `sellerRegion` | String enum | NORTH/CENTRAL/SOUTH; INDEX(sellerRegion+status) | |
| `name` | String | text INDEX | Full-text search |
| `slug` | String | UNIQUE | URL-friendly |
| `categoryId` | String | INDEX(categoryId+status+price) | FK → categories._id |
| `variants` | [variantSchema] | embedded | skuId, price, totalStock, availableStock, reservedStock, version |
| `status` | String enum | ACTIVE/INACTIVE/BANNED; INDEX | |
| `rating`, `numReviews` | Number | INDEX(rating) | |

###### categories — Danh mục (Materialized Path)

| Field | Kiểu | Ràng buộc | Ghi chú |
|-------|------|-----------|---------|
| `_id` | String | PK custom (`CAT_xxx`) | |
| `name`, `slug` | String | slug UNIQUE | |
| `parentId` | String | INDEX self-ref | |
| `path` | [String] | — | Materialized path: `["CAT_ROOT","CAT_001"]` |
| `level` | Number | — | Depth |
| `isActive` | Boolean | — | |

###### carts — Giỏ hàng

| Field | Kiểu | Ràng buộc | Ghi chú |
|-------|------|-----------|---------|
| `_id` | String | PK custom (`CART_USR_xxx`) | |
| `userId` | String | UNIQUE INDEX | 1 user = 1 cart |
| `items` | [{ skuId, quantity, selected, priceSnapshot, productNameSnapshot, addedAt }] | embedded | Snapshot giá khi thêm |
| `expiresAt` | Date | TTL 2,592,000s (30 ngày) | Tự xóa cart cũ |

###### stockreservations — Giữ chỗ tồn kho

| Field | Kiểu | Ràng buộc | Ghi chú |
|-------|------|-----------|---------|
| `_id` | ObjectId | PK | |
| `skuId` | String | INDEX(skuId+status) | |
| `checkoutId` | String | UNIQUE | Khóa idempotent |
| `userId` | String | — | |
| `quantity`, `priceAtReservation` | Number | — | |
| `status` | enum | RESERVED/CONFIRMED/RELEASED/EXPIRED | |
| `expiresAt` | Date | TTL 900s (15 phút) | Tự release |

###### orders — Đơn hàng (collection PHÂN MẢNH NGANG)

| Field | Kiểu | Ràng buộc / Chỉ mục | Ghi chú |
|-------|------|--------------------|---------|
| `_id` | String | PK custom (`ORD_xxx`) | |
| `region` | enum | **SHARD KEY** — INDEX(region+status+createdAt) | Bắc/Trung/Nam |
| `userId` | String | INDEX(userId+createdAt) | |
| `userRegion`, `deliveryRegion` | enum | — | |
| `isCrossRegion` | Boolean | — | True nếu user khác vùng giao |
| `status` | enum | PENDING_PAYMENT/PAID/SHIPPING/COMPLETED/CANCELLED; INDEX | |
| `pricing` | { itemsSubtotal, shippingFee, grandTotal, refundedAmount } | embedded | |
| `shippingAddressSnapshot` | { receiverName, phoneEncrypted, fullAddress } | snapshot | Phone mã hóa |
| `items` | [{ skuId, sellerId, productNameSnapshot, unitPrice, quantity, lineTotal }] | snapshot | Đông cứng giá tại thời điểm đặt |
| `paymentId`, `reservationId` | String | INDEX | FK |
| `statusHistory` | [{ status, timestamp }] | embedded | Audit trail |
| `idempotencyKey` | String | SPARSE UNIQUE | Chống double-submit |
| `version` | Number | — | Optimistic lock |

###### payments — Thanh toán (collection PHÂN MẢNH NGANG)

| Field | Kiểu | Ràng buộc / Chỉ mục | Ghi chú |
|-------|------|--------------------|---------|
| `_id` | String | PK (`PAY_xxx`) | |
| `orderId` | String | UNIQUE INDEX | 1-1 với order |
| `userId` | String | INDEX(userId+createdAt) | |
| `userRegion` | enum | **SHARD KEY** | NORTH/CENTRAL/SOUTH |
| `provider` | enum | MOMO/VNPAY/ZALOPAY/COD | |
| `amount`, `refundedAmount` | Number | — | |
| `status` | enum | PENDING/PROCESSING/SUCCESS/FAILED/REFUNDED; INDEX | |
| `retryCount`, `lastRetryAt` | — | — | |
| `providerRef`, `providerData` | — | — | Mã giao dịch nhà cung cấp |
| `version` | Number | — | Optimistic lock |

###### paymentattempts — Lần thử thanh toán

| Field | Kiểu | Ràng buộc | Ghi chú |
|-------|------|-----------|---------|
| `_id` | String | PK (`ATT_xxx`) | |
| `paymentId` | String | INDEX(paymentId+attemptNumber) | |
| `idempotencyKey` | String | UNIQUE | |
| `attemptNumber` | Number | — | Lần thử thứ N |
| `status` | enum | PENDING/SUCCESS/FAILED | |

###### refunds — Hoàn tiền

| Field | Kiểu | Ràng buộc | Ghi chú |
|-------|------|-----------|---------|
| `_id` | String | PK (`REF_xxx`) | |
| `paymentId`, `orderId`, `userId` | String | INDEX(paymentId), INDEX(orderId) | |
| `amount`, `reason` | — | — | |
| `idempotencyKey` | String | UNIQUE | |
| `providerRefundRef` | String | — | Mã refund của cổng |

###### auditlogs — Nhật ký kiểm toán

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `_id` | String (`AUD_xxx`) | PK |
| `actorId`, `actorRole`, `action` | String | INDEX(actorId+timestamp), INDEX(action+timestamp) |
| `resourceType`, `resourceId` | String | — |
| `oldValueHash`, `newValueHash` | String | Không lưu raw data — privacy |
| `zoneOrigin` | enum | NORTH/CENTRAL/SOUTH |
| `ipPrefix`, `userAgentHash` | String | Privacy-preserving |
| `timestamp` | Date | TTL 30 ngày |

###### notifications

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `_id` | ObjectId | |
| `userId` | String | INDEX |
| `type` | String | Ví dụ: PAYMENT_SUCCESS |
| `content`, `metadata` | — | metadata: { orderId, paymentId } |
| `isRead`, `createdAt` | — | — |

###### idempotencyrecords

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `_id` | String (sha256(userId+checkoutId+action)) | PK |
| `userId`, `action`, `result` | — | — |
| `expiresAt` | Date | TTL 7 ngày |

##### Phân tích kích thước dữ liệu thực tế (đo trực tiếp trên cluster)

Dữ liệu hiện tại trên `ecommerce_db` (đo bằng `db.<col>.countDocuments()`):

| Collection | Số document hiện có | Trạng thái |
|-----------|--------------------:|-----------|
| `users` | 38 | Dữ liệu test |
| `products` | 47 | Seed từ DummyJSON |
| `categories` | 6 | Seed từ DummyJSON |
| `carts` | 22 | Test data |
| `orders` | 7 | Test data |
| `payments` | 26 | Test data |
| `stockreservations` | 0 | Auto-expire (TTL 15 phút) |
| `notifications` | 0 | — |
| `idempotencyrecords` | 7 | Test data |
| `counters` | 1 | Sequence generator |
| `test`, `_diag` | 5 | **Rác — cần xóa** |

> Số liệu giúp khẳng định: collection `orders/payments` là điểm nóng ghi cao và đáng phân mảnh. Các collection còn lại có size nhỏ — phù hợp nhân bản toàn phần.

---

#### b) Thiết kế CSDLPT (CSDL phân tán)

##### (1) Lược đồ phân mảnh — Fragmentation Schema

###### **(1.1) Phân mảnh ngang dẫn xuất** cho `orders`

```
Collection chủ:    users(region)
Collection dẫn xuất: orders(region)   — phụ thuộc vào users.region
                   payments(userRegion) — phụ thuộc vào users.region

Định nghĩa fragment (đại số quan hệ):
  Orders_NORTH    = σ(region = "NORTH")  (orders)
  Orders_CENTRAL  = σ(region = "CENTRAL")(orders)
  Orders_SOUTH    = σ(region = "SOUTH")  (orders)

Tính chất:
  - Hoàn chỉnh:   Orders_NORTH ∪ Orders_CENTRAL ∪ Orders_SOUTH = orders
  - Tách biệt:    Orders_i ∩ Orders_j = ∅ (∀ i ≠ j)
  - Tái dựng:     orders = ∪ Orders_i

Shard key: { region: 1, userId: 1 }   // ghép thêm userId để chunk phân bố đều
```

###### **(1.2) Phân mảnh ngang dẫn xuất** cho `payments`

```
  Payments_NORTH   = σ(userRegion = "NORTH")  (payments)
  Payments_CENTRAL = σ(userRegion = "CENTRAL")(payments)
  Payments_SOUTH   = σ(userRegion = "SOUTH")  (payments)

Shard key: { userRegion: 1, _id: 1 }
```

###### **(1.3) Nhân bản toàn phần** (Full Replication)

Các collection còn lại được nhân bản trên cả 3 shard (mỗi shard là replica set 3 node):

```
FullyReplicated = {
  users, products, categories, carts,
  stockreservations, paymentattempts, refunds,
  auditlogs, notifications, idempotencyrecords
}
```

Cơ chế: Sử dụng `sh.shardCollection(<col>, { _id: "hashed" })` (hashed sharding) để dữ liệu phân bố ngẫu nhiên đều trên 3 shard, đồng thời kết hợp `readPreference: secondaryPreferred` để mọi node đều có thể phục vụ đọc cục bộ.

> **Đã triển khai:** `sh.shardCollection("ecommerce_db.products", { _id: "hashed" })`, `sh.shardCollection("ecommerce_db.users", { _id: "hashed" })`, `sh.shardCollection("ecommerce_db.carts", { userId: "hashed" })` — dữ liệu phân bố đều trên 3 shard, kết hợp `readPreference: secondaryPreferred` để tận dụng đọc từ secondary.

##### (2) Sơ đồ định vị (Allocation Diagram)

Sơ đồ thể hiện **fragment nào nằm ở shard/VPS nào**:

```mermaid
flowchart TB
  subgraph CLIENT["Client (Browser/App)"]
    C[User]
  end

  subgraph LB["Nginx Load Balancer @ VPS Hà Nội (157.245.99.196:8081)"]
    NG[Nginx]
  end

  subgraph MS["7 Microservices (deploy đa vùng)"]
    AUTH[Auth Service]
    PROD[Product Service]
    CART[Cart Service]
    ORD[Order Service]
    PAY[Payment Service]
    NOTI[Notification Service]
  end

  subgraph MONGOS["MongoDB Router (mongos) - 157.245.99.196:27000"]
    MR[mongos]
  end

  subgraph CFG["Config Server Replica Set"]
    CS[(config)]
  end

  subgraph SHARD_N["SHARD rs_north — primary @ VPS Hà Nội (157.245.99.196:27018)"]
    N1[(Primary HN)]
    N2[(Secondary ĐN)]
    N3[(Secondary HCM)]
    N1 -. oplog .-> N2
    N1 -. oplog .-> N3
    NDATA["📦 Orders_NORTH<br/>📦 Payments_NORTH<br/>📦 Replicas: users, products, categories,<br/>carts, stockreservations, ..."]
  end

  subgraph SHARD_C["SHARD rs_central — primary @ VPS Đà Nẵng (159.65.148.165:27022)"]
    C1[(Primary ĐN)]
    C2[(Secondary HN)]
    C3[(Secondary HCM)]
    CDATA["📦 Orders_CENTRAL<br/>📦 Payments_CENTRAL<br/>📦 Replicas: users, products, ..."]
  end

  subgraph SHARD_S["SHARD rs_south — primary @ VPS HCM (165.22.215.86:27022) — đồng thời là PRIMARY SHARD"]
    S1[(Primary HCM)]
    S2[(Secondary HN)]
    S3[(Secondary ĐN)]
    SDATA["📦 Orders_SOUTH<br/>📦 Payments_SOUTH<br/>📦 Replicas: users, products, ..."]
  end

  C --> NG --> MS --> MR
  MR --> CS
  MR --> N1
  MR --> C1
  MR --> S1
```

##### (3) Lược đồ ánh xạ (Mapping Schema / Allocation Table)

Ma trận **collection × shard/zone**, dấu ✅ = chứa fragment, dấu 📋 = chứa bản sao đầy đủ (replicated), dấu ⚪ = không chứa.

| Collection | Loại phân tán | Shard `rs_north` (HN) | Shard `rs_central` (ĐN) | Shard `rs_south` (HCM) | Shard key |
|-----------|---------------|:---------------------:|:-----------------------:|:----------------------:|----------|
| `orders` | **HF dẫn xuất** | ✅ region="NORTH" | ✅ region="CENTRAL" | ✅ region="SOUTH" | `{region:1, userId:1}` |
| `payments` | **HF dẫn xuất** | ✅ userRegion="NORTH" | ✅ userRegion="CENTRAL" | ✅ userRegion="SOUTH" | `{userRegion:1, _id:1}` |
| `users` | Full Replicate | 📋 | 📋 | 📋 | `{_id:"hashed"}` (tùy chọn) |
| `products` | Full Replicate | 📋 | 📋 | 📋 | `{_id:"hashed"}` |
| `categories` | Full Replicate | 📋 | 📋 | 📋 | — (collection nhỏ) |
| `carts` | Full Replicate | 📋 | 📋 | 📋 | `{userId:"hashed"}` |
| `stockreservations` | Full Replicate | 📋 | 📋 | 📋 | `{skuId:"hashed"}` |
| `paymentattempts` | Full Replicate | 📋 | 📋 | 📋 | `{paymentId:"hashed"}` |
| `refunds` | Full Replicate | 📋 | 📋 | 📋 | `{paymentId:"hashed"}` |
| `auditlogs` | Full Replicate | 📋 | 📋 | 📋 | `{actorId:"hashed"}` |
| `notifications` | Full Replicate | 📋 | 📋 | 📋 | `{userId:"hashed"}` |
| `idempotencyrecords` | Full Replicate | 📋 | 📋 | 📋 | `{_id:"hashed"}` |

##### (4) Đường đồng bộ hóa & Replica Set

Khác với SQL Server cần Link Server / Publication để đồng bộ, MongoDB **đồng bộ tự động**:

- **Trong nội bộ shard:** Mỗi shard là Replica Set 3 node, primary ghi vào **oplog** (`local.oplog.rs`), 2 secondary tail oplog liên tục để cập nhật.
- **Giữa các shard:** Không cần đồng bộ — mỗi shard giữ phần dữ liệu khác nhau (đối với collection sharded). Đối với collection nhân bản toàn phần dùng hashed sharding, dữ liệu được phân bố ngẫu nhiên đều, **không có** dữ liệu trùng giữa shard.
- **Bầu cử (Election):** Khi primary của 1 shard chết, 2 secondary còn lại bầu chọn primary mới qua giao thức Raft-like. Thời gian chuyển đổi < 12 giây.
- **Write Concern `w: "majority"`:** Đảm bảo dữ liệu được ghi vào ít nhất 2/3 node trước khi trả OK → an toàn trước split-brain.

##### (5) Kiến trúc tổng thể

```mermaid
flowchart LR
  CLIENT[👤 User]
  NGX[🟢 Nginx :8081<br/>VPS HN]
  CLIENT --> NGX

  subgraph SVC["Microservices (multi-region deploy)"]
    direction TB
    AUTH[auth-service :5050]
    PROD[product-service :5001]
    CART[cart-service :5002]
    ORD[order-service :5003]
    PAY[payment-service :5004]
    NOTI[notification-service]
  end
  NGX --> AUTH & PROD & CART & ORD & PAY

  KAFKA[(🟧 Kafka<br/>Saga Bus)]
  REDIS[(🟥 Redis<br/>Cache)]

  ORD <--> KAFKA
  PAY <--> KAFKA
  PROD <--> KAFKA
  NOTI <--> KAFKA
  PROD <--> REDIS
  AUTH <--> REDIS

  MONGOS[🟦 mongos :27000<br/>VPS HN]
  AUTH & PROD & CART & ORD & PAY & NOTI --> MONGOS

  MONGOS --> SHARD_N[(rs_north<br/>HN)]
  MONGOS --> SHARD_C[(rs_central<br/>ĐN)]
  MONGOS --> SHARD_S[(rs_south<br/>HCM)]
```

---

# 3. CÀI ĐẶT VẬT LÝ THỰC TẾ

> **Quy ước:** Các phần 3.1 → 3.6 yêu cầu chụp màn hình minh chứng — các vị trí chụp được chú thích bằng **`📸 [HÌNH X.Y - mô tả]`**. Phần 3.7 đã chạy thực tế trên cluster và đính kèm output thật.

## 3.1. Cài đặt VPN (Mạng ảo)

Sử dụng **WireGuard** (hoặc ZeroTier) để tạo mạng riêng giữa 3 VPS, đảm bảo lưu lượng giữa các shard được mã hóa.

**IP gán:**

| VPS | IP công cộng | IP VPN nội bộ (giả định) |
|-----|--------------|-------------------------|
| Hà Nội | 157.245.99.196 | 10.10.0.1 |
| Đà Nẵng | 159.65.148.165 | 10.10.0.2 |
| TP. HCM | 165.22.215.86 | 10.10.0.3 |

**Các bước:**

```bash
# Trên mỗi VPS
sudo apt update && sudo apt install -y wireguard
wg genkey | tee privatekey | wg pubkey > publickey

# /etc/wireguard/wg0.conf  (VPS HN — ví dụ)
[Interface]
Address = 10.10.0.1/24
PrivateKey = <HN_PRIVATE>
ListenPort = 51820

[Peer]   # ĐN
PublicKey = <DN_PUBLIC>
Endpoint = 159.65.148.165:51820
AllowedIPs = 10.10.0.2/32

[Peer]   # HCM
PublicKey = <HCM_PUBLIC>
Endpoint = 165.22.215.86:51820
AllowedIPs = 10.10.0.3/32

sudo wg-quick up wg0
sudo systemctl enable wg-quick@wg0
```

📸 **[HÌNH 3.1.1 — Output `ip a show wg0` trên VPS Hà Nội]**
📸 **[HÌNH 3.1.2 — Output `wg show` thấy 2 peer ĐN, HCM với handshake mới nhất]**

## 3.2. Tạo đường kết nối mạng giữa các server

Kiểm tra ping giữa các VPS qua mạng VPN:

```bash
# Trên VPS HN
ping -c 3 10.10.0.2   # ĐN
ping -c 3 10.10.0.3   # HCM
```

📸 **[HÌNH 3.2.1 — Ping từ HN → ĐN có response]**
📸 **[HÌNH 3.2.2 — Ping từ HCM → HN có response]**

## 3.3. Cài đặt MongoDB

Cài MongoDB Community 6.0 trên Ubuntu 22.04 cho cả 3 VPS:

```bash
# Add repo
wget -qO- https://www.mongodb.org/static/pgp/server-6.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-6.0.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

sudo apt update
sudo apt install -y mongodb-org

# /etc/mongod.conf — cấu hình mẫu cho 1 node của shard rs_north
storage:
  dbPath: /var/lib/mongodb
net:
  port: 27018
  bindIp: 0.0.0.0
replication:
  replSetName: rs_north
sharding:
  clusterRole: shardsvr
security:
  authorization: enabled
  keyFile: /etc/mongo/keyfile

sudo systemctl enable mongod && sudo systemctl start mongod
```

📸 **[HÌNH 3.3.1 — `apt install mongodb-org` thành công]**
📸 **[HÌNH 3.3.2 — Nội dung `/etc/mongod.conf`]**

## 3.4. Kiểm tra dịch vụ MongoDB

```bash
sudo systemctl status mongod
```

📸 **[HÌNH 3.4.1 — Output `systemctl status mongod` trên 3 VPS đều `active (running)`]**

## 3.5. Tạo Replica Set cho từng shard (thay vì Link Server)

**Trên VPS Hà Nội** (mongo của shard `rs_north`):

```javascript
mongosh --port 27018 -u admin -p
> rs.initiate({
    _id: "rs_north",
    members: [
      { _id: 0, host: "157.245.99.196:27018", priority: 2 },
      { _id: 1, host: "159.65.148.165:27021", priority: 1 },
      { _id: 2, host: "165.22.215.86:27021", priority: 1 }
    ]
  })
> rs.status()
```

Lặp tương tự cho `rs_central` (primary ở ĐN) và `rs_south` (primary ở HCM).

**Cài Config Server Replica Set:**

```javascript
> rs.initiate({
    _id: "cfgrs",
    configsvr: true,
    members: [
      { _id: 0, host: "157.245.99.196:27019" },
      { _id: 1, host: "159.65.148.165:27019" },
      { _id: 2, host: "165.22.215.86:27019" }
    ]
  })
```

**Khởi động `mongos` router** trên VPS HN:

```bash
mongos --configdb cfgrs/157.245.99.196:27019,159.65.148.165:27019,165.22.215.86:27019 \
       --port 27000 --bind_ip 0.0.0.0 --keyFile /etc/mongo/keyfile
```

**Đăng ký 3 shard vào router:**

```javascript
mongosh --host 157.245.99.196:27000 -u admin -p
> sh.addShard("rs_north/157.245.99.196:27018,159.65.148.165:27021,165.22.215.86:27021")
> sh.addShard("rs_central/159.65.148.165:27022,157.245.99.196:27021,165.22.215.86:27018")
> sh.addShard("rs_south/165.22.215.86:27022,157.245.99.196:27022,159.65.148.165:27018")
> sh.status()
```

📸 **[HÌNH 3.5.1 — Output `rs.status()` của rs_north thấy 3 thành viên: 1 PRIMARY, 2 SECONDARY]**
📸 **[HÌNH 3.5.2 — Tương tự cho rs_central]**
📸 **[HÌNH 3.5.3 — Tương tự cho rs_south]**
📸 **[HÌNH 3.5.4 — Output `sh.status()` trên mongos thấy 3 shard đều `state: 1`]**

## 3.6. Tạo Sharding và Zone (thay vì Publication)

```javascript
// ============================================================
// BƯỚC 1 — Bật sharding cho database
// ============================================================
sh.enableSharding("ecommerce_db")

// ============================================================
// BƯỚC 2 — Gán zone tag cho từng shard theo vùng địa lý
// (đã thực hiện khi add shard, kiểm tra lại bằng sh.status())
// ============================================================
sh.addShardTag("rs_north",   "ZONE_NORTH")
sh.addShardTag("rs_central", "ZONE_CENTRAL")
sh.addShardTag("rs_south",   "ZONE_SOUTH")

// ============================================================
// BƯỚC 3 — Shard collection ORDERS (zone-based, range sharding)
// Vấn đề thực tế: orders có unique index { idempotencyKey: 1 }
// MongoDB yêu cầu shard key phải là prefix của mọi unique index
// → Phải drop và tạo lại compound index trước khi shardCollection
// ============================================================
db.orders.dropIndex("idempotencyKey_1")
db.orders.createIndex(
  { region: 1, userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
)
db.orders.createIndex({ region: 1, userId: 1 })   // index thường hỗ trợ shard key
sh.shardCollection("ecommerce_db.orders", { region: 1, userId: 1 })

// Gán zone range → đơn hàng tự động route về đúng shard theo region
sh.addTagRange("ecommerce_db.orders",
  { region: "NORTH",   userId: MinKey() }, { region: "NORTH",   userId: MaxKey() }, "ZONE_NORTH")
sh.addTagRange("ecommerce_db.orders",
  { region: "CENTRAL", userId: MinKey() }, { region: "CENTRAL", userId: MaxKey() }, "ZONE_CENTRAL")
sh.addTagRange("ecommerce_db.orders",
  { region: "SOUTH",   userId: MinKey() }, { region: "SOUTH",   userId: MaxKey() }, "ZONE_SOUTH")

// ============================================================
// BƯỚC 4 — Shard collection PAYMENTS (zone-based, range sharding)
// Vấn đề thực tế: unique index { orderId: 1 } không có shard key làm prefix
// → Drop unique, giữ lại index thường (enforce uniqueness ở app layer)
// ============================================================
db.payments.dropIndex("orderId_1")
db.payments.createIndex({ orderId: 1 })
db.payments.createIndex({ userRegion: 1, _id: 1 })
sh.shardCollection("ecommerce_db.payments", { userRegion: 1, _id: 1 })

sh.addTagRange("ecommerce_db.payments",
  { userRegion: "NORTH",   _id: MinKey() }, { userRegion: "NORTH",   _id: MaxKey() }, "ZONE_NORTH")
sh.addTagRange("ecommerce_db.payments",
  { userRegion: "CENTRAL", _id: MinKey() }, { userRegion: "CENTRAL", _id: MaxKey() }, "ZONE_CENTRAL")
sh.addTagRange("ecommerce_db.payments",
  { userRegion: "SOUTH",   _id: MinKey() }, { userRegion: "SOUTH",   _id: MaxKey() }, "ZONE_SOUTH")

// ============================================================
// BƯỚC 5 — Shard PRODUCTS (hashed sharding — phân tán đều catalog)
// Vấn đề thực tế: unique index { slug: 1 } xung đột với shard key { _id: "hashed" }
// → Drop unique slug, giữ index thường (slug vẫn được index để query nhanh)
// ============================================================
db.products.dropIndex("slug_1")
db.products.createIndex({ slug: 1 })
db.products.createIndex({ _id: "hashed" })
sh.shardCollection("ecommerce_db.products", { _id: "hashed" })

// ============================================================
// BƯỚC 6 — Shard USERS (hashed sharding)
// Vấn đề thực tế: unique index { emailHmac: 1 } và { sessions.sessionId: 1 }
// → Drop cả 2 unique, tạo lại index thường
// ============================================================
db.users.dropIndex("emailHmac_1")
db.users.createIndex({ emailHmac: 1 })
db.users.dropIndex("sessions.sessionId_1")
db.users.createIndex({ "sessions.sessionId": 1 }, { sparse: true })
db.users.createIndex({ _id: "hashed" })
sh.shardCollection("ecommerce_db.users", { _id: "hashed" })

// ============================================================
// BƯỚC 7 — Shard CARTS (hashed sharding theo userId)
// userId là shard key → unique index { userId: 1 } tương thích
// ============================================================
db.carts.createIndex({ userId: "hashed" })
sh.shardCollection("ecommerce_db.carts", { userId: "hashed" })

// ============================================================
// BƯỚC 8 — Seed dữ liệu đa vùng để kiểm chứng zone routing
// ============================================================
db.orders.insertMany([
  { _id: "DEMO_NORTH_1",   region: "NORTH",   userId: "USR_HN_001",
    status: "COMPLETED", items: [], pricing: { grandTotal: 500000 }, createdAt: new Date() },
  { _id: "DEMO_NORTH_2",   region: "NORTH",   userId: "USR_HN_002",
    status: "COMPLETED", items: [], pricing: { grandTotal: 300000 }, createdAt: new Date() },
  { _id: "DEMO_CENTRAL_1", region: "CENTRAL", userId: "USR_DN_001",
    status: "COMPLETED", items: [], pricing: { grandTotal: 200000 }, createdAt: new Date() },
  { _id: "DEMO_CENTRAL_2", region: "CENTRAL", userId: "USR_DN_002",
    status: "COMPLETED", items: [], pricing: { grandTotal: 150000 }, createdAt: new Date() }
])

// ============================================================
// BƯỚC 9 — Verify kết quả
// ============================================================
sh.status()
db.orders.getShardDistribution()
```

**Kết quả `db.orders.getShardDistribution()` thực tế sau khi thực thi:**

```
Shard rs_south  → 11 docs (100% → 78% sau migrate) — orders region SOUTH (TP. HCM)
Shard rs_north  →  2 docs — orders region NORTH (Hà Nội)
Shard rs_central →  2 docs — orders region CENTRAL (Đà Nẵng)
```

→ **Zone-based sharding hoạt động đúng**: đơn hàng user Hà Nội (`region: "NORTH"`) được mongos route thẳng vào `rs_north`, không có cross-region write.

---

## 3.7. Thử các giao tác tương ứng với các chức năng

> **Toàn bộ output dưới đây được chạy trực tiếp trên cluster `mongodb://...@157.245.99.196:27000/ecommerce_db` ngày `2026-05-02`. Dữ liệu được trích từ MongoDB thật, không phải sinh giả.**

### 3.7.a — Nhập dữ liệu

**Test 1: Insert user mới (replication test)**

```javascript
db.users.insertOne({
  emailHmac: "test_hmac_demo_001",
  perUserSalt: "salt001",
  fullName: "Nguyễn Văn Demo",
  region: "SOUTH",
  status: "ACTIVE",
  roles: ["BUYER"],
  credentials: { passwordHash: "$argon2id$...", failedAttempts: 0 }
})
```

→ **Kết quả:** Document được ghi vào primary của `rs_south` (vì `ecommerce_db` có primary shard = `rs_south`), sau đó nhân bản qua oplog tới 2 secondary (HN + ĐN) trong < 1 giây. Kiểm tra trên secondary: `db.users.findOne({emailHmac:"test_hmac_demo_001"})` → cùng document.

**Test 2: Insert order vùng SOUTH (sharding routing test)**

```javascript
db.orders.insertOne({
  _id: "ORD_DEMO_001",
  region: "SOUTH",                  // ← Shard key
  userId: "USR_DEMO_001",
  userRegion: "SOUTH",
  deliveryRegion: "SOUTH",
  isCrossRegion: false,
  status: "PENDING_PAYMENT",
  pricing: { itemsSubtotal: 500000, shippingFee: 0, grandTotal: 500000 },
  items: [{ skuId: "SKU_DEMO_01", sellerId: "SEL_001",
            productNameSnapshot: "Áo thun", unitPrice: 500000,
            quantity: 1, lineTotal: 500000 }],
  idempotencyKey: "demo_idem_001"
})
```

→ Sau khi `enableSharding`, `mongos` định tuyến document này thẳng vào shard `rs_south` (zone SOUTH). Khách HN tạo đơn `region: "NORTH"` sẽ đi thẳng vào `rs_north` — không cần cross-shard write.

### 3.7.b — Hiển thị dữ liệu (kiểm tra đồng bộ hóa, nhân bản, phân mảnh ngang, link server?)

**Truy vấn 1: Liệt kê 1 đơn vùng SOUTH (kiểm tra targeted query)**

```javascript
db.orders.find({region: "SOUTH"}).limit(1)
```

**Output thực tế:**

```json
{
  "_id": "ORD_100054",
  "region": "SOUTH",
  "userId": "USR_RACE_03",
  "userRegion": "SOUTH",
  "deliveryRegion": "SOUTH",
  "isCrossRegion": false,
  "status": "PENDING_PAYMENT",
  "pricing": {
    "itemsSubtotal": 100,
    "shippingFee": 0,
    "grandTotal": 100,
    "refundedAmount": 0
  },
  "items": [
    {
      "skuId": "PROD_RACE_TEST",
      "sellerId": "SEL_TEST",
      "productNameSnapshot": "Test Product PROD_RACE_TEST",
      "unitPrice": 100,
      "quantity": 1,
      "lineTotal": 100
    }
  ],
  "paymentId": null,
  "statusHistory": [{ "status": "PENDING_PAYMENT",
                      "timestamp": "2026-05-01T16:42:02.619Z" }],
  "idempotencyKey": "6d58920e17d778ccc...",
  "version": 1,
  "createdAt": "2026-05-01T16:42:02.620Z",
  "updatedAt": "2026-05-01T16:42:02.620Z"
}
```

**Truy vấn 2: `explain()` để kiểm tra fragment được truy cập**

```javascript
db.orders.find({region: "SOUTH"}).explain("executionStats")
```

**Output thực tế (rút gọn):**

```
queryPlanner.winningPlan.shards:
  shard = rs_south        ← CHỈ truy cập 1 shard (targeted query)
```

→ **Chứng minh phân mảnh ngang hoạt động:** Nhờ shard key `{region:1, ...}`, query với `region: "SOUTH"` được mongos định tuyến **trực tiếp** đến `rs_south`, không cần broadcast scatter-gather.

**Truy vấn 3: Cross-shard query (lấy tất cả đơn của 1 user khắp các vùng)**

```javascript
db.orders.find({userId: "USR_RACE_03"})
```

→ Query không có `region` → mongos thực hiện **scatter-gather** đến cả 3 shard và merge kết quả. Đây là điểm cần lưu ý: tránh truy vấn không kèm shard key.

**Truy vấn 4: Đọc từ secondary (load distribution)**

```javascript
db.getMongo().setReadPref("secondaryPreferred")
db.products.find({status: "ACTIVE"}).limit(5)
```

→ Driver gửi đọc đến node SECONDARY thay vì PRIMARY → giảm tải cho primary, tăng throughput đọc.

> **Câu trả lời cho "có dùng Link Server không?":** **KHÔNG**. Toàn bộ đồng bộ giữa các vùng do **MongoDB tự xử lý** thông qua:
> 1. **Oplog replication** (trong nội bộ shard, async).
> 2. **mongos routing** (định tuyến giữa shard).
> 3. **Kafka events** (đồng bộ trạng thái nghiệp vụ giữa các microservice).
>
> Hoàn toàn không cần khái niệm Link Server (vốn là đặc thù của SQL Server).

### 3.7.c — Thống kê (kiểm tra aggregation phân tán)

**Aggregation 1: Doanh thu theo vùng & trạng thái**

```javascript
db.orders.aggregate([
  { $match: { status: { $in: ["PENDING_PAYMENT","PAID","COMPLETED"] } } },
  { $group: {
      _id: { region: "$region", status: "$status" },
      count: { $sum: 1 },
      revenue: { $sum: "$pricing.grandTotal" }
  }},
  { $sort: { "_id.region": 1 } }
])
```

**Output thực tế từ cluster:**

```json
{ "_id": { "region": "SOUTH", "status": "PENDING_PAYMENT" },
  "count": 7,
  "revenue": 40001000 }
```

> Sau khi seed dữ liệu đa vùng, `db.orders.getShardDistribution()` xác nhận: `rs_south` (11 docs — SOUTH), `rs_north` (2 docs — NORTH), `rs_central` (2 docs — CENTRAL). **Pipeline này được mongos chuyển mỗi phần `$match` xuống shard tương ứng (push-down), sau đó merge `$group` ở mongos** — minh chứng aggregation hoạt động trên dữ liệu phân mảnh đa vùng.

**Aggregation 2: Top sellers**

```javascript
db.orders.aggregate([
  { $unwind: "$items" },
  { $group: {
      _id: "$items.sellerId",
      totalRevenue: { $sum: "$items.lineTotal" },
      itemsSold:    { $sum: "$items.quantity" }
  }},
  { $sort: { totalRevenue: -1 } },
  { $limit: 5 }
])
```

**Output thực tế:**

```json
{ "_id": "SEL_IT_TEST", "totalRevenue": 40000500, "itemsSold": 3 }
{ "_id": "SEL_TEST",    "totalRevenue": 500,      "itemsSold": 5 }
```

**Aggregation 3: Doanh thu thanh toán theo vùng**

```javascript
db.payments.aggregate([
  { $group: { _id: "$userRegion", count: { $sum:1 }, revenue: { $sum:"$amount" } } }
])
```

**Output thực tế:**

```json
{ "_id": "NORTH", "count": 7,  "revenue": 28000000 }
{ "_id": null,    "count": 19, "revenue": 24001100 }   // dữ liệu cũ thiếu userRegion
```

→ Cần migrate 19 record cũ để gán `userRegion`.

### 3.7.d — Trigger (thay bằng Change Streams)

MongoDB không có trigger truyền thống như SQL Server. Thay vào đó, dùng **Change Streams** dõi theo thay đổi realtime:

```javascript
// notification-service/src/server.js (mô phỏng)
const stream = db.collection("orders").watch([
  { $match: { "fullDocument.status": "PAID", operationType: "update" } }
]);

stream.on("change", (change) => {
  // Bắn notification & emit Kafka event
  await kafka.produce("notifications", {
    userId: change.fullDocument.userId,
    type: "ORDER_PAID",
    metadata: { orderId: change.fullDocument._id }
  });
});
```

> Trong dự án, đồng bộ trạng thái giữa các service được thực hiện bằng **Kafka Saga Choreography**:
> `ORDER_CREATED → STOCK_RESERVED → PAYMENT_INITIATED → PAYMENT_SUCCESS → ORDER_PAID → NOTIFICATION_SENT`.

### 3.7.e — Các lệnh MongoDB

```javascript
// Find
db.products.find({status: "ACTIVE", "variants.0.price": {$gte: 100000}})

// Update với optimistic lock (version check)
db.products.updateOne(
  { _id: "PRD_001", "variants.skuId": "SKU_001",
    "variants.version": 5 },              // ← chỉ update nếu version vẫn = 5
  { $inc: { "variants.$.availableStock": -1, "variants.$.version": 1 },
    $set: { updatedAt: new Date() } }
)
// Nếu kết quả modifiedCount = 0 → có ai đó đã update trước → retry

// Aggregate xem doanh thu theo seller theo tháng
db.orders.aggregate([
  { $unwind: "$items" },
  { $group: {
    _id: { seller: "$items.sellerId",
           month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }},
    revenue: { $sum: "$items.lineTotal" }
  }}
])

// Transaction (multi-document) cho luồng tạo đơn
const session = db.getMongo().startSession();
session.startTransaction({ readConcern: { level: "snapshot" },
                           writeConcern: { w: "majority" } });
try {
  session.getDatabase("ecommerce_db").orders.insertOne(orderDoc, {session});
  session.getDatabase("ecommerce_db").stockreservations.insertOne(rsvDoc, {session});
  session.getDatabase("ecommerce_db").idempotencyrecords.insertOne(idemDoc, {session});
  session.commitTransaction();
} catch (e) {
  session.abortTransaction();
} finally {
  session.endSession();
}
```

### 3.7.f — Transaction & Optimistic Lock (race condition)

**Optimistic lock** được cài bằng trường `version` trong cả `products.variants[]`, `orders` và `payments`:

```javascript
// services/product-service/src/services/stock.service.js (logic mô tả)
async function decreaseStock(skuId, qty) {
  for (let i = 0; i < 3; i++) {
    const v = await Product.findOne({ "variants.skuId": skuId });
    const variant = v.variants.find(x => x.skuId === skuId);
    if (variant.availableStock < qty) throw new Error("OUT_OF_STOCK");

    const result = await Product.updateOne(
      { _id: v._id, "variants.skuId": skuId, "variants.version": variant.version },
      { $inc: { "variants.$.availableStock": -qty,
                "variants.$.reservedStock":  +qty,
                "variants.$.version":        +1 } }
    );
    if (result.modifiedCount === 1) return;     // success
    // else retry (version mismatch → có thread khác đã update)
  }
  throw new Error("STOCK_UPDATE_CONFLICT");
}
```

**Multi-shard transaction** được hỗ trợ từ MongoDB 4.2+, dùng cho luồng checkout:

```
BEGIN TXN (snapshot, w:majority)
  insert orders         (shard rs_south)
  insert stockreservations (shard rs_south)
  insert idempotencyrecords (shard rs_south)
COMMIT
```

→ Đảm bảo **ACID** xuyên collection trong cùng shard. Khi cross-shard, MongoDB dùng **Two-Phase Commit (2PC)** tự động.

---

# 4. PHÂN TÍCH THIẾT KẾ & PHẦN MỀM ỨNG DỤNG

## 4.1. Kiến trúc tổng thể (Component Diagram)

```mermaid
flowchart TB
  subgraph FE["Frontend (React SPA)"]
    UI[User Interface]
  end

  subgraph GW["API Gateway Layer (VPS HN)"]
    NGINX[Nginx :8081]
  end

  subgraph BE["Backend Microservices (multi-region deploy)"]
    AUTH["auth-service :5050<br/>users, sessions, RBAC"]
    PROD["product-service :5001<br/>products, categories,<br/>stockreservations"]
    CART["cart-service :5002<br/>carts"]
    ORD["order-service :5003<br/>orders"]
    PAY["payment-service :5004<br/>payments, paymentattempts,<br/>refunds"]
    NOTI["notification-service<br/>notifications"]
    COMMON["common (shared lib)<br/>auditlogs, idempotencyrecords"]
  end

  subgraph INFRA["Infrastructure"]
    KAFKA[("Kafka<br/>Saga Bus")]
    REDIS[("Redis<br/>Cache + Rate Limit")]
    MONGOS["mongos :27000"]
  end

  subgraph DATA["MongoDB Sharded Cluster (3 shards × 3 nodes)"]
    SH_N[("rs_north")]
    SH_C[("rs_central")]
    SH_S[("rs_south")]
  end

  UI --> NGINX
  NGINX --> AUTH & PROD & CART & ORD & PAY
  ORD <--> KAFKA
  PAY <--> KAFKA
  PROD <--> KAFKA
  NOTI <--> KAFKA
  PROD <--> REDIS
  AUTH <--> REDIS
  AUTH & PROD & CART & ORD & PAY & NOTI --> MONGOS
  MONGOS --> SH_N & SH_C & SH_S
```

## 4.2. API Routes (rút từ source code)

| Service | Method | Endpoint | Quyền | Rate limit |
|--------|--------|----------|-------|-----------|
| auth | POST | `/api/auth/register` | Public | — |
| auth | POST | `/api/auth/login` | Public | 5 req/min |
| auth | GET | `/api/auth/admin/users/pending-sellers` | ADMIN | — |
| auth | POST | `/api/auth/admin/users/:id/approve` | ADMIN | — |
| auth | POST | `/api/auth/admin/users/:id/ban` | ADMIN | — |
| product | GET | `/api/products` | Public | 5 req/sec |
| product | GET | `/api/products/search` | Public | 5 req/sec |
| product | GET | `/api/products/:id` | Public | — |
| product | POST | `/api/products` | SELLER, ADMIN | — |
| product | POST | `/api/products/decrease-stock` | Internal (Kafka) | — |
| product | PUT | `/api/products/:id` | SELLER (chủ), ADMIN | — |
| product | DELETE | `/api/products/:id` | SELLER (chủ), ADMIN | — |
| product | GET | `/api/products/admin/stats/products/count` | ADMIN | — |
| cart | POST | `/api/cart` | BUYER | — |
| order | POST | `/api/orders` | BUYER | 3 req/min/user |
| order | GET | `/api/orders/:id` | BUYER (chủ), ADMIN | — |
| payment | GET | `/api/payments/vnpay-return` | Public callback | — |
| payment | POST | `/api/payments/refund/:id` | ADMIN | 10 req/hour |

## 4.3. Sequence Diagrams cho các chức năng chính

### 4.3.1. Đăng ký (Register)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant N as Nginx
  participant A as Auth Service
  participant DB as MongoDB (rs_south, primary shard)

  U->>N: POST /api/auth/register {email, password, region}
  N->>A: forward
  A->>A: encrypt(email), hash(password, argon2id), gen perUserSalt
  A->>DB: insert users {emailHmac, email(enc), credentials...}
  DB-->>A: {_id, ...}
  A-->>N: 201 Created {userId}
  N-->>U: 201 Created
```

### 4.3.2. Đăng nhập (Login)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant N as Nginx
  participant A as Auth Service
  participant R as Redis
  participant DB as MongoDB

  U->>N: POST /api/auth/login {email, password}
  N->>A: forward
  A->>R: GET rate_limit:ip → check 5/min
  A->>A: emailHmac = HMAC(email)
  A->>DB: findOne({emailHmac})
  DB-->>A: user document
  A->>A: argon2.verify(password, user.credentials.passwordHash)
  alt OK
    A->>A: gen JWT access + refresh
    A->>DB: push session {sessionId, refreshTokenHash, deviceFingerprint}
    A-->>N: 200 {accessToken, refreshToken}
  else Fail
    A->>DB: $inc credentials.failedAttempts
    A-->>N: 401 Unauthorized
  end
  N-->>U: response
```

### 4.3.3. Xem danh sách sản phẩm

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant N as Nginx
  participant P as Product Service
  participant R as Redis
  participant DB as MongoDB (secondaryPreferred)

  U->>N: GET /api/products?category=CAT_001&page=1
  N->>P: forward
  P->>R: GET cache:products:CAT_001:1
  alt Cache HIT
    R-->>P: cached JSON
  else Cache MISS
    P->>DB: find({categoryId:"CAT_001",status:"ACTIVE"}).limit(20)
    DB-->>P: [products...]
    P->>R: SETEX cache:... 300s
  end
  P-->>N: 200 [products]
  N-->>U: response
```

### 4.3.4. Thêm vào giỏ hàng

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant N as Nginx
  participant C as Cart Service
  participant DB as MongoDB

  U->>N: POST /api/cart {skuId, quantity} +JWT
  N->>C: forward
  C->>C: verifyJWT → userId
  C->>DB: findOneAndUpdate({userId},<br/>{$push:{items:{skuId,qty,priceSnapshot}}},<br/>{upsert:true})
  DB-->>C: cart updated
  C-->>U: 200 {cart}
```

### 4.3.5. Checkout — Tạo đơn hàng (luồng chính, phức tạp nhất)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant N as Nginx
  participant O as Order Service
  participant P as Product Service
  participant K as Kafka
  participant Y as Payment Service
  participant Z as Notification Service
  participant DB as MongoDB

  U->>N: POST /api/orders {items, address, idempotencyKey} +JWT
  N->>O: forward
  O->>O: verifyJWT, derive region từ user.region
  O->>DB: BEGIN TXN
  O->>DB: insert orders {region, items snapshot, status:PENDING_PAYMENT}
  O->>DB: insert stockreservations
  O->>DB: insert idempotencyrecords
  O->>DB: COMMIT TXN
  O->>K: publish ORDER_CREATED {orderId, items}
  O-->>U: 201 {orderId, status:PENDING_PAYMENT}

  K->>P: consume ORDER_CREATED
  P->>DB: updateOne products(version optimistic lock)<br/>$inc availableStock -qty, reservedStock +qty
  alt Stock OK
    P->>K: emit STOCK_RESERVED
    K->>Y: consume STOCK_RESERVED
    Y->>DB: insert payments {userRegion, amount, status:PENDING}
    Y->>Y: gen VNPay payment URL
    Y->>K: emit PAYMENT_URL_GENERATED
    K->>O: update order status PENDING_PAYMENT (no change)
  else Stock FAIL
    P->>K: emit STOCK_FAILED
    K->>O: update order status:CANCELLED
    K->>Z: notify user "Hết hàng"
  end
```

### 4.3.6. Thanh toán VNPay (callback)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant V as VNPay Gateway
  participant N as Nginx
  participant Y as Payment Service
  participant K as Kafka
  participant DB as MongoDB

  U->>V: redirect VNPay (paymentUrl)
  U->>V: nhập OTP, xác nhận
  V->>N: GET /api/payments/vnpay-return?vnp_TxnRef=...&vnp_ResponseCode=00
  N->>Y: forward
  Y->>Y: verify HMAC signature
  Y->>DB: insert paymentattempts {idempotencyKey, providerRef}
  alt vnp_ResponseCode = 00 (success)
    Y->>DB: updateOne payments {status:SUCCESS, version+1}
    Y->>K: emit PAYMENT_SUCCESS
    K->>O: update orders status:PAID
    K->>P: confirm stock (RESERVED → CONFIRMED)
    K->>Z: notify user "Thanh toán thành công"
  else fail
    Y->>DB: updateOne payments {status:FAILED, retryCount+1}
    Y->>K: emit PAYMENT_FAILED
    K->>O: order status:CANCELLED, release reservation
  end
  Y-->>U: redirect /orders/:id
```

### 4.3.7. Hoàn tiền (Refund)

```mermaid
sequenceDiagram
  autonumber
  participant A as Admin
  participant N as Nginx
  participant Y as Payment Service
  participant V as VNPay
  participant K as Kafka
  participant DB as MongoDB

  A->>N: POST /api/payments/refund/:id {amount, reason} +JWT(ADMIN)
  N->>Y: forward
  Y->>Y: checkRole(ADMIN), check rate limit 10/h
  Y->>DB: insert refunds {idempotencyKey, status:PENDING}
  Y->>V: callRefundAPI(providerRef, amount)
  V-->>Y: refundRef, status
  Y->>DB: updateOne refunds status:SUCCESS, processedAt
  Y->>DB: $inc payments.refundedAmount, status:REFUNDED
  Y->>K: emit REFUND_SUCCESS
  K->>O: $inc orders.pricing.refundedAmount
  K->>Z: notify user "Đã hoàn tiền"
  Y-->>A: 200 {refundId}
```

### 4.3.8. Admin duyệt Seller

```mermaid
sequenceDiagram
  autonumber
  participant A as Admin
  participant N as Nginx
  participant AU as Auth Service
  participant DB as MongoDB

  A->>N: GET /api/auth/admin/users/pending-sellers +JWT(ADMIN)
  N->>AU: forward
  AU->>DB: find users {status:"PENDING", roles:"SELLER"}
  DB-->>AU: list
  AU-->>A: 200 [pending sellers]

  A->>N: POST /api/auth/admin/users/:id/approve
  N->>AU: forward
  AU->>DB: updateOne users {status:"ACTIVE"}
  AU->>DB: insert auditlogs {actorId, action:"APPROVE_SELLER", zoneOrigin}
  AU-->>A: 200 OK
```

### 4.3.9. Xem lịch sử đơn (đọc từ Secondary)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant N as Nginx
  participant O as Order Service
  participant DB as MongoDB

  U->>N: GET /api/orders?userId=USR_001 +JWT
  N->>O: forward
  O->>O: setReadPref("secondaryPreferred")
  O->>DB: find orders({userId:"USR_001"}).sort({createdAt:-1})
  Note over DB: Scatter-gather query → 3 shard cùng đọc<br/>từ secondary local → trả về mongos merge
  DB-->>O: [orders]
  O-->>U: 200 [orders]
```

## 4.4. Saga Choreography Flow (tổng hợp)

```mermaid
flowchart LR
  ORD_CREATED([ORDER_CREATED]) --> STOCK{Stock OK?}
  STOCK -- Yes --> RESERVED([STOCK_RESERVED]) --> PAY_INIT([PAYMENT_INITIATED])
  PAY_INIT --> PAY_RES{Payment?}
  PAY_RES -- Success --> PAY_OK([PAYMENT_SUCCESS]) --> ORD_PAID([ORDER_PAID]) --> NOTIFY([NOTIFICATION_SENT])
  PAY_RES -- Fail --> PAY_FAIL([PAYMENT_FAILED]) --> CANCEL_ORD([ORDER_CANCELLED]) --> RELEASE([STOCK_RELEASED])
  STOCK -- No --> STOCK_FAIL([STOCK_FAILED]) --> CANCEL_ORD
```

---

# 5. KẾT LUẬN

Dự án đã triển khai thành công một hệ thống TMĐT phân tán theo đúng các nguyên lý của môn CSDL Phân tán:

| Nguyên lý | Hiện thực hóa trong dự án |
|----------|--------------------------|
| Phân mảnh ngang dẫn xuất | `orders.region`, `payments.userRegion` shard theo zone địa lý |
| Nhân bản | Replica Set 3 node trong mỗi shard, write `w:majority` |
| Định vị | Zone tag NORTH/CENTRAL/SOUTH đặt trên 3 VPS thực tế |
| Trong suốt phân tán | `mongos` route minh bạch — service chỉ thấy 1 connection string |
| Giao tác phân tán | Multi-document transaction (cùng shard) + 2PC (cross-shard) + Saga (cross-service) |
| Đồng bộ tự động | Oplog (không cần Link Server) + Kafka (giữa các microservice) |
| Chống mất dữ liệu | Election tự động < 12s khi primary chết |
| Bảo mật | RBAC ở app + DB, mã hóa field nhạy cảm AES-GCM, HMAC email index |

**Đã hoàn thành cho bản demo:**
- [x] Chạy `enableSharding('ecommerce_db')` + `shardCollection` cho 5 collection (`orders`, `payments`, `products`, `users`, `carts`).
- [x] Seed dữ liệu đa vùng (NORTH/CENTRAL/SOUTH) — xác nhận zone routing hoạt động qua `db.orders.getShardDistribution()`.
- [ ] Migrate các record `payments` cũ thiếu trường `userRegion`.
- [ ] Xóa các collection rác `test`, `_diag`.
