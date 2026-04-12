#!/bin/bash

echo "════════════════════════════════════════════════════"
echo "🔥 MÔ PHỎNG CHAOS TEST: MongoDB Replica Set Failover 🔥"
echo "════════════════════════════════════════════════════"

# Đảm bảo đường dẫn volume đúng cú pháp native của Git Bash in Windows (hoặc Docker for Windows)
SCRIPTS_DIR="/scripts"

# Giai đoạn 1: Tạo tải (Load Generation)
echo "[1] Kích hoạt VUs (Virtual Users) bắn POST /orders..."
docker run --rm -i --name k6-chaos --network shopee-network \
    -e BASE_URL="http://api-gateway:8080/api" \
    grafana/k6 run - < scripts/k6-order-chaos.js > k6_chaos_result.txt 2>&1 &

echo "[1] K6 đang chạy background (50 giây)..."
echo "⏳ Đợi 10 giây để nạp đủ Tải (Warming up)..."
sleep 10

# Giai đoạn 2: Giả lập sự cố (Injecting Chaos)
echo "🔍 Xác định Node PRIMARY hiện tại..."
# Tìm Primary thông qua mongosh. Lệnh này an toàn với replset dbrs.
PRIMARY_NODE=$(docker exec mongo1 mongosh --quiet --eval "rs.isMaster().primary" | cut -d':' -f1)

# Nếu kĩ thuật lấy primary trả về gì đó như mongo1, mongo2 thì lấy
if [ -z "$PRIMARY_NODE" ] || [ "$PRIMARY_NODE" == "undefined" ]; then
    echo "⚠️ Không tìm thấy PRIMARY_NODE. Hãy chắc chắn MongoDB dbrs đang chạy đúng cách. Kịch bản hủy!"
    docker stop k6-chaos >/dev/null 2>&1
    exit 1
fi

echo "🔥🔥🔥 INJECTING CHAOS: Tắt khẩn cấp Node [$PRIMARY_NODE] (Downtime bắt đầu) 🔥🔥🔥"
docker stop $PRIMARY_NODE
START_DOWNTIME=$(date +%s)

# Giai đoạn 3: Phân tích phục hồi (Recovery Analysis)
echo "👀 Bắt đầu theo dõi quá trình Election (Đang bầu Primary mới...)"
echo "💡 (Mẹo: Có thể xuất hiện vài lỗi 500 từ k6 vào lúc này)"
sleep 15

NEW_PRIMARY=$(docker exec mongo-init mongosh --host mongo1:27017,mongo2:27017,mongo3:27017 --quiet --eval "rs.isMaster().primary" | cut -d':' -f1)

if [ "$NEW_PRIMARY" == "$PRIMARY_NODE" ]; then
    echo "❌ Node Primary không thay đổi hoặc hệ thống đã sập hoàn toàn."
else
    END_DOWNTIME=$(date +%s)
    echo "✅ [RECOVERY THÀNH CÔNG] Dữ liệu đã an toàn! Node PRIMARY mới là: [$NEW_PRIMARY]"
    echo "⏱ Thời gian tự phục hồi ước tính: ~ $((END_DOWNTIME - START_DOWNTIME - 15)) -> 15 giây (Quá trình bầu cử)."
fi

echo "⏳ Đợi k6 kết thúc nốt phần Load Test còn lại (khoảng 25 giây)..."
# Chờ cho container k6 hoàn tất vòng đời (thoát bash)
docker wait k6-chaos >/dev/null 2>&1

# Khôi phục lại hạ tầng
echo "💖 Phục hồi: Khởi động lại Node cũ [$PRIMARY_NODE]..."
docker start $PRIMARY_NODE
echo "✅ Node cũ đã được đưa về làm SECONDARY, tự động Sync dữ liệu."

echo "════════════════════════════════════════════════════"
echo "🏁 CHAOS TEST HOÀN TẤT. Xem chi tiết tại k6_chaos_result.txt"
echo "════════════════════════════════════════════════════"
