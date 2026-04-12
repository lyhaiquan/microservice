const { consumer, producer } = require('../config/kafka');
const Product = require('../models/product.model');
const mongoose = require('mongoose');

class StockConsumer {
    static async listenOrderEvents() {
        await consumer.subscribe({ topic: 'order-events', fromBeginning: false });
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const session = await mongoose.startSession();
                session.startTransaction();
                
                let orderData;
                try {
                    orderData = JSON.parse(message.value.toString());
                    
                    // Chỉ xử lý event type ORDER_CREATED
                    if (orderData.type !== 'ORDER_CREATED') return;

                    console.log(`\n📦 [PRODUCT SERVICE] Đang xử lý giữ kho cho Order: ${orderData.orderId}`);
                    
                    const reservedItems = [];
                    let isSuccess = true;
                    let failureReason = '';

                    for (const item of orderData.items) {
                        // Tìm và cập nhật nguyên tử (Atomic with condition)
                        const updatedProduct = await Product.findOneAndUpdate(
                            { _id: item.productId, quantity: { $gte: item.quantity } },
                            { $inc: { quantity: -item.quantity } },
                            { new: true, session }
                        );

                        if (!updatedProduct) {
                            isSuccess = false;
                            failureReason = `Sản phẩm ${item.name || item.productId} không đủ tồn kho`;
                            break;
                        }
                        reservedItems.push(item);
                    }

                    if (isSuccess) {
                        await session.commitTransaction();
                        console.log(`✅ [PRODUCT SERVICE] Giữ kho THÀNH CÔNG cho Order: ${orderData.orderId}`);
                        
                        // Bắn event STOCK_RESERVED
                        await producer.send({
                            topic: 'stock-events',
                            messages: [{
                                key: orderData.orderId,
                                value: JSON.stringify({
                                    orderId: orderData.orderId,
                                    status: 'RESERVED',
                                    totalAmount: orderData.totalAmount, // Pass it along
                                    items: orderData.items,
                                    timestamp: new Date().toISOString()
                                })
                            }]
                        });
                    } else {
                        await session.abortTransaction();
                        console.log(`❌ [PRODUCT SERVICE] Giữ kho THẤT BẠI: ${failureReason}`);
                        
                        // Bắn event STOCK_FAILED
                        await producer.send({
                            topic: 'stock-events',
                            messages: [{
                                key: orderData.orderId,
                                value: JSON.stringify({
                                    orderId: orderData.orderId,
                                    status: 'FAILED',
                                    reason: failureReason,
                                    timestamp: new Date().toISOString()
                                })
                            }]
                        });
                    }

                } catch (error) {
                    if (session.inTransaction()) await session.abortTransaction();
                    console.error('❌ [PRODUCT SERVICE] Lỗi khi xử lý stock event:', error.message);
                    
                    // Bắn event lỗi hệ thống nếu cần
                    if (orderData && orderData.orderId) {
                        await producer.send({
                            topic: 'stock-events',
                            messages: [{
                                key: orderData.orderId,
                                value: JSON.stringify({
                                    orderId: orderData.orderId,
                                    status: 'FAILED',
                                    reason: 'Lỗi hệ thống khi xử lý tồn kho',
                                    timestamp: new Date().toISOString()
                                })
                            }]
                        });
                    }
                } finally {
                    session.endSession();
                }
            }
        });
    }
}

module.exports = StockConsumer;
