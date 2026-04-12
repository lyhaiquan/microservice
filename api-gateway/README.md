# API Gateway & Reverse Proxy (Nginx)

## 1. Vai trò kiến trúc
- Là điểm vào duy nhất (Single Entry Point) cho toàn bộ Client (Web, Mobile, Admin).
- Đóng vai trò Reverse Proxy, định tuyến các HTTP request tới đúng Service Backend.
- Đảm bảo ẩn giấu cấu trúc mạng nội bộ của hệ thống Microservices.

## 2. Yêu cầu kỹ thuật
- **Công nghệ:** Nginx.
- **Routing Rules:**
  - `/api/auth/*` -> Forward tới `auth-service:5000`
  - `/api/products/*` -> Forward tới `product-service:5001`
  - `/api/orders/*` -> Forward tới `order-service:5002`
- **Xử lý gRPC (Cart Service):** Cấu hình Nginx hỗ trợ giao thức `grpc://` để forward các request liên quan đến giỏ hàng tới `cart-service:5003`.
- **Bảo mật & Hiệu năng:** - Thêm Rate Limiting cơ bản để chống spam request.
  - Cấu hình Header chuẩn (CORS, X-Forwarded-For, X-Real-IP).
