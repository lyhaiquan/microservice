# Cart Service

## 1. Vai trò kiến trúc
- Quản lý giỏ hàng tạm thời của user. Đòi hỏi tốc độ phản hồi cực nhanh.

## 2. Tech Stack & Cấu hình
- **Framework:** Node.js.
- **Giao thức:** **gRPC** (thay vì REST) để tối ưu hóa Serialize/Deserialize payload.
- **Database:** MongoDB.

## 3. Core Logic
- Định nghĩa file `cart.proto` với các RPC methods: `AddItem`, `RemoveItem`, `UpdateQuantity`, `GetCart`.
- Cấu trúc Document: Mỗi UserID map với 1 mảng các `CartItems`. Cần dùng toán tử `$push`, `$pull`, `$set` của MongoDB để tối ưu thao tác mảng mà không cần load toàn bộ document lên memory.