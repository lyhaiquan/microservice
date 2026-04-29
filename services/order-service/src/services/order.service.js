const Order = require('../models/order.model');
const Product = require('../models/product.model');
const IdempotencyRecord = require('../../../common/src/models/idempotencyRecord.model');
const mongoose = require('mongoose');
const { runTransactionWithRetry } = require('../../../common/src/transaction');
const crypto = require('crypto');

class OrderService {
    static async createOrder(userId, items, totalAmount, checkoutId, extraFields = {}) {
        // Generate Idempotency Key if not provided
        const idempotencyKey = crypto.createHash('sha256').update(userId + checkoutId).digest('hex');

        return await runTransactionWithRetry(mongoose, async (session) => {
            // 1. Check Idempotency Record
            const existingRecord = await IdempotencyRecord.findById(idempotencyKey).session(session);
            if (existingRecord) {
                console.log(`[Idempotency] Found existing record for ${idempotencyKey}. Returning cached result.`);
                return existingRecord.result;
            }

            // 2. Atomic Stock Check & Decrease
            const snapshottedItems = [];
            for (const item of items) {
                const productId = item.skuId || item.productId;
                
                // Cập nhật tồn kho nguyên tử
                const updatedProduct = await Product.findOneAndUpdate(
                    { _id: productId, 'variants.0.availableStock': { $gte: item.quantity } },
                    { $inc: { 'variants.0.availableStock': -item.quantity } },
                    { session, new: true }
                );

                if (!updatedProduct) {
                    throw new Error(`Sản phẩm ${productId} không đủ hàng hoặc không tồn tại.`);
                }

                snapshottedItems.push({
                    skuId: productId,
                    sellerId: updatedProduct.sellerId, // Lưu sellerId để thống kê
                    productNameSnapshot: updatedProduct.name,
                    unitPrice: updatedProduct.variants[0].price,
                    quantity: item.quantity,
                    lineTotal: updatedProduct.variants[0].price * item.quantity,
                });
            }

            // 3. Create Order
            const count = await Order.countDocuments().session(session);
            const orderId = `ORD_${String(100001 + count).padStart(6, '0')}`;

            const region = extraFields.region || 'SOUTH';
            const userRegion = extraFields.userRegion || region;
            const deliveryRegion = extraFields.deliveryRegion || region;
            const itemsSubtotal = snapshottedItems.reduce((sum, i) => sum + i.lineTotal, 0);
            const shippingFee = extraFields.shippingFee || 0;

            const newOrder = new Order({
                _id: orderId,
                region,
                userId,
                userRegion,
                deliveryRegion,
                isCrossRegion: userRegion !== deliveryRegion,
                status: 'PENDING_PAYMENT',
                pricing: {
                    itemsSubtotal,
                    shippingFee,
                    grandTotal: itemsSubtotal + shippingFee,
                },
                items: snapshottedItems,
                idempotencyKey,
                statusHistory: [{ status: 'PENDING_PAYMENT', timestamp: new Date() }],
            });

            const savedOrder = await newOrder.save({ session });

            // 4. Record Idempotency
            await IdempotencyRecord.create([{
                _id: idempotencyKey,
                userId,
                action: 'CREATE_ORDER',
                result: savedOrder,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day
            }], { session });

            console.log(`✅ Order ${orderId} created successfully with Transaction.`);
            return savedOrder;
        });

        // 5. Emit Event for Payment Service (outside transaction but after success)
        try {
            const { producer } = require('../config/kafka');
            await producer.send({
                topic: 'stock-events', // Bắn thẳng vào stock-events để Payment Service xử lý
                messages: [{
                    key: result._id.toString(),
                    value: JSON.stringify({
                        type: 'STOCK_RESERVED',
                        orderId: result._id.toString(),
                        userId: result.userId,
                        items: result.items,
                        totalAmount: result.pricing.grandTotal,
                        status: 'RESERVED',
                        timestamp: new Date().toISOString()
                    })
                }]
            });
            console.log(`📡 [ORDER SERVICE] Event 'STOCK_RESERVED' emitted for ${result._id}`);
        } catch (error) {
            console.error(`⚠️ Kafka emission failed: ${error.message}`);
        }

        return result;
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
