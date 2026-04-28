const Product = require('../models/product.model');
const StockReservation = require('../models/stockReservation.model');
const { producer, consumer } = require('../config/kafka');
const mongoose = require('mongoose');

class StockConsumer {
    // Lắng nghe event ORDER_CREATED từ Order Service
    static async listenOrderEvents() {
        await consumer.subscribe({ topic: 'order-events', fromBeginning: false });
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const orderData = JSON.parse(message.value.toString());
                
                if (orderData.type !== 'ORDER_CREATED') return;

                console.log(`\n📦 [PRODUCT SERVICE] Nhận ORDER_CREATED cho Order: ${orderData.orderId}`);
                
                const session = await mongoose.startSession();
                session.startTransaction({
                    readPreference: 'primary',
                    readConcern: { level: 'local' },
                    writeConcern: { w: 'majority', j: true }
                });

                try {
                    let allSuccess = true;
                    const reservationIds = [];

                    // Xử lý từng item trong đơn hàng
                    for (const item of orderData.items) {
                        const { productId, quantity } = item;
                        const qty = parseInt(quantity, 10) || 1;

                        // Tìm sản phẩm và variant có sẵn
                        const product = await Product.findOne({
                            _id: productId,
                            'variants.0.availableStock': { $gte: qty }
                        }).session(session);

                        if (!product) {
                            allSuccess = false;
                            console.error(`   ❌ Out of stock for product ${productId}`);
                            break;
                        }

                        const variant = product.variants[0];

                        // Atomic update với version check
                        const updated = await Product.findOneAndUpdate(
                            {
                                _id: product._id,
                                'variants.0.version': variant.version,
                                'variants.0.availableStock': { $gte: qty }
                            },
                            {
                                $inc: {
                                    'variants.0.availableStock': -qty,
                                    'variants.0.reservedStock': qty,
                                    'variants.0.version': 1
                                }
                            },
                            { new: true, session }
                        );

                        if (!updated) {
                            allSuccess = false;
                            console.error(`   ❌ Concurrent conflict for product ${productId}`);
                            break;
                        }

                        // Tạo Stock Reservation record
                        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
                        const reservation = await StockReservation.create([{
                            skuId: variant.skuId,
                            checkoutId: orderData.orderId,
                            userId: orderData.userId,
                            quantity: qty,
                            priceAtReservation: variant.price,
                            status: 'RESERVED',
                            expiresAt
                        }], { session });

                        reservationIds.push(reservation[0]._id);
                    }

                    if (allSuccess) {
                        await session.commitTransaction();
                        console.log(`   ✅ Stock reserved for Order ${orderData.orderId}`);

                        // Bắn event STOCK_RESERVED sang Payment Service
                        await producer.send({
                            topic: 'stock-events',
                            messages: [{
                                key: orderData.orderId,
                                value: JSON.stringify({
                                    type: 'STOCK_RESERVED',
                                    orderId: orderData.orderId,
                                    userId: orderData.userId,
                                    items: orderData.items,
                                    totalAmount: orderData.totalAmount,
                                    status: 'RESERVED',
                                    reservationIds,
                                    timestamp: new Date().toISOString()
                                })
                            }]
                        });
                    } else {
                        await session.abortTransaction();
                        
                        // Bắn event STOCK_FAILED
                        await producer.send({
                            topic: 'stock-events',
                            messages: [{
                                key: orderData.orderId,
                                value: JSON.stringify({
                                    type: 'STOCK_FAILED',
                                    orderId: orderData.orderId,
                                    userId: orderData.userId,
                                    status: 'FAILED',
                                    timestamp: new Date().toISOString()
                                })
                            }]
                        });
                        console.log(`   ❌ Stock reservation FAILED for Order ${orderData.orderId}`);
                    }
                } catch (error) {
                    await session.abortTransaction();
                    console.error(`   ❌ [STOCK CONSUMER] Error: ${error.message}`);
                } finally {
                    session.endSession();
                }
            }
        });
        console.log('👂 [Product] Stock Consumer listening on order-events...');
    }
}

module.exports = StockConsumer;