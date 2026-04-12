# Authentication Service

## 1. Vai trò kiến trúc
- Chịu trách nhiệm định danh (Authentication) và phân quyền (Authorization).
- Cung cấp JWT Token cho Client để sử dụng ở các service khác.

## 2. Tech Stack & Cấu hình
- **Framework:** Node.js (Express.js).
- **Database:** Cụm MongoDB Replica Set 3-node (Primary - Secondary - Secondary). Yêu cầu chuỗi kết nối URI phải khai báo rõ `replicaSet`.
- **Security:** Bcrypt (hash password), JSON Web Token (JWT).

## 3. Core Logic & Endpoints
- `POST /api/auth/register`: Hash password, lưu user mới. Cấu hình Write Concern `w: "majority"` để đảm bảo dữ liệu ghi an toàn trên cụm DB phân tán.
- `POST /api/auth/login`: Validate thông tin, sinh Access Token (hết hạn 1h) và Refresh Token.
- `GET /api/auth/profile`: Yêu cầu middleware giải mã JWT.
- **Lưu ý:** Không lưu trạng thái session (Stateless).