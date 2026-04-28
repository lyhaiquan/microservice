const Order = require('../models/order.model');
const { consumer } = require('../config/kafka');

class OrderConsumer {
    // Lắng nghe event từ Payment Service (payment-confirmed)
    static async listenPaymentConfirmed() {
        await consumer.subscribe({ topic: 'payment-confirmed', fromBeginning: false });
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const data = JSON.parse(message.value.toString());
                const { orderId, status } = data;

                console.log(`\n📋 [ORDER SERVICE] Nhận payment-confirmed cho Order: ${orderId} - Status: ${status}`);

                if (status === 'PAID') {
                    try {
                        const updated = await Order.findOneAndUpdate(
                            { _id: orderId, status: 'PENDING' },
                            {
                                $set: { status: 'PAID', paymentId: orderId },
                                $push: {
                                    statusHistory: {
                                        status: 'PAID',
                                        timestamp: new Date()
                                    }
                                },
                                $inc: { version: 1 }
                            },
                            { new: true }
                        );

                        if (updated) {
                            console.log(`   ✅ Order ${orderId} updated to PAID`);
                        } else {
                            console.log(`   ⚠️ Order ${orderId} not in PENDING state, skipping`);
                        }
                    } catch (error) {
                        console.error(`   ❌ Failed to update order ${orderId}: ${error.message}`);
                    }
                } else if (status === 'FAILED') {
                    await Order.findOneAndUpdate(
                        { _id: orderId },
                        {
                            $set: { status: 'CANCELLED' },
                            $push: {
                                statusHistory: {
                                    status: 'CANCELLED',
                                    timestamp: new Date()
                                }
                            },
                            $inc: { version: 1 }
                        }
                    );
                    console.log(`   ❌ Order ${orderId} cancelled due to payment failure`);
                }
            }
        });
        console.log('👂 [Order] Consumer listening on payment-confirmed...');
    }

    // Lắng nghe event STOCK_FAILED từ Product Service
    static async listenStockFailed() {
        await consumer.subscribe({ topic: 'stock-events', fromBeginning: false });
    }
}

module.exports = OrderConsumer;