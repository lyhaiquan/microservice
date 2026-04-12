# Product Service

## 1. Vai trò kiến trúc
- Quản lý danh mục, chi tiết sản phẩm và tồn kho cơ bản.
- Là service chịu tải Read (Đọc) lớn nhất trong hệ thống e-commerce.

## 2. Tech Stack & Cấu hình
- **Framework:** Node.js (Express.js).
- **Database:** MongoDB (Replica Set) cho cấu trúc dữ liệu linh hoạt (Schema-less). Cấu hình Read Preference là `secondaryPreferred` để giảm tải cho node Primary.
- **Caching:** Redis.

## 3. Core Logic (Caching Strategy)
- Áp dụng chiến lược **Cache-Aside**:
  - Khi Client gọi `GET /api/products/:id`: Check Redis trước. 
  - Nếu Cache Hit -> Trả về JSON ngay. 
  - Nếu Cache Miss -> Query cụm MongoDB -> Set dữ liệu vào Redis (kèm TTL 30 phút) -> Trả về Client.
- Khi Admin gọi `PUT/DELETE` để update/xóa sản phẩm: BẮT BUỘC phải xóa (Invalidate) key tương ứng trong Redis để tránh dữ liệu cũ (Stale Data).