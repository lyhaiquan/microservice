const { consumer } = require('../config/kafka');
const Order = require('../models/order.model');

class OrderConsumer {
    static async start() {
        // Subscribe to all relevant topics
        await consumer.subscribe({ topics: ['payment-confirmed', 'stock-events'], fromBeginning: false });

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const eventData = JSON.parse(message.value.toString());
                
                try {
                    if (topic === 'payment-confirmed') {
                        await OrderConsumer.handlePaymentEvent(eventData);
                    } else if (topic === 'stock-events') {
                        await OrderConsumer.handleStockEvent(eventData);
                    }
                } catch (error) {
                    console.error(`❌ [ORDER SERVICE] Error processing topic ${topic}:`, error.message);
                }
            }
        });
    }

    static async handlePaymentEvent(eventData) {
        console.log(`\n🔔 [ORDER SERVICE] Nhận sự kiện thanh toán: Order ${eventData.orderId} - Status: ${eventData.status}`);
        
        if (eventData.status === 'PAID') {
            const updatedOrder = await Order.findByIdAndUpdate(
                eventData.orderId,
                { status: 'PAID' },
                { new: true }
            );
            if (updatedOrder) {
                 console.log(`✅ [ORDER SERVICE] Đã cập nhật Order ${eventData.orderId} thành PAID thành công.`);
            }
        }
    }

    static async handleStockEvent(eventData) {
        console.log(`\n🔔 [ORDER SERVICE] Nhận sự kiện kho: Order ${eventData.orderId} - Status: ${eventData.status}`);
        
        if (eventData.status === 'FAILED') {
            const updatedOrder = await Order.findByIdAndUpdate(
                eventData.orderId,
                { status: 'CANCELLED' },
                { new: true }
            );
            if (updatedOrder) {
                console.log(`✅ [ORDER SERVICE] Đã hủy Order ${eventData.orderId} do hết hàng.`);
            }
        } else if (eventData.status === 'RESERVED') {
            // Có thể dùng để trigger trạng thái "Đã giữ hàng, chờ thanh toán" nếu cần
            console.log(`ℹ️ [ORDER SERVICE] Đã giữ hàng cho Order ${eventData.orderId}.`);
        }
    }
}

module.exports = OrderConsumer;
