const Order = require('../models/order.model');
const { producer } = require('../config/kafka');

class OrderService {
    static async createOrder(userId, items, totalAmount, idempotencyKey) {
        // 1. Lưu order xuống MongoDB trạng thái PENDING
        // (Không còn gọi HTTP sang Product Service đồng bộ)
        const snapshottedItems = items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            name: item.name || 'Unknown'
        }));

        const newOrder = new Order({
            userId,
            items: snapshottedItems,
            totalAmount,
            idempotencyKey,
            status: 'PENDING'
        });

        const savedOrder = await newOrder.save();

        // 2. Bắn event 'ORDER_CREATED' sang Kafka topic 'order-events'
        // Kèm theo danh sách items để Product Service trừ kho
        try {
            await producer.send({
                topic: 'order-events',
                messages: [
                    {
                        key: savedOrder._id.toString(),
                        value: JSON.stringify({
                            type: 'ORDER_CREATED',
                            orderId: savedOrder._id.toString(),
                            userId: savedOrder.userId,
                            items: snapshottedItems, // Dùng snapshotted items
                            totalAmount: savedOrder.totalAmount,
                            status: savedOrder.status,
                            timestamp: new Date().toISOString()
                        })
                    }
                ]
            });
            console.log(`✅ Event 'ORDER_CREATED' sent for order ${savedOrder._id}`);
        } catch (error) {
            console.error(`❌ Failed to send event to Kafka: ${error.message}`);
            // Xử lý lỗi bắn event: Có thể xóa Order hoặc đánh dấu lỗi (Outbox pattern sẽ tốt hơn)
            throw new Error(`Order saved but failed to emit event: ${error.message}`);
        }

        return savedOrder;
    }
    static async getOrderById(orderId) {
        return await Order.findById(orderId);
    }
    static async getOrderByKey(key) {
        if (!key) return null;
        return await Order.findOne({ idempotencyKey: key });
    }
}

module.exports = OrderService;
