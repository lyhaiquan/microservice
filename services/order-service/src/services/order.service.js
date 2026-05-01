const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Counter = require('../models/counter.model');
const IdempotencyRecord = require('../../../common/src/models/idempotencyRecord.model');
const mongoose = require('mongoose');
const { runTransactionWithRetry } = require('../../../common/src/transaction');
const crypto = require('crypto');

class OrderService {
    static async createOrder(userId, items, totalAmount, checkoutId, extraFields = {}) {
        const idempotencyKey = extraFields.idempotencyKey
            ? String(extraFields.idempotencyKey)
            : crypto.createHash('sha256').update(userId + checkoutId).digest('hex');

        const result = await runTransactionWithRetry(mongoose, async (session) => {
            // 1. Idempotency check — read by _id, dùng .lean() vì chỉ cần raw value
            const existingRecord = await IdempotencyRecord.findById(idempotencyKey)
                .session(session)
                .lean();
            if (existingRecord) {
                console.log(`[Idempotency] Found existing record for ${idempotencyKey}.`);
                return { cached: true, order: existingRecord.result };
            }

            // 2. Atomic stock decrement (per-item). findOneAndUpdate với điều kiện
            //    availableStock >= quantity là atomic, không bị race condition.
            const snapshottedItems = [];
            for (const item of items) {
                const productId = item.skuId || item.productId;

                // Không dùng projection 'variants.0.price' vì mongoose hydration với
                // dotted-path subdoc projection không trả về subdoc field đúng → undefined.
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
                    sellerId: updatedProduct.sellerId,
                    productNameSnapshot: updatedProduct.name,
                    unitPrice: updatedProduct.variants[0].price,
                    quantity: item.quantity,
                    lineTotal: updatedProduct.variants[0].price * item.quantity,
                });
            }

            // 3. Sinh orderId qua atomic counter (O(1)) thay cho countDocuments() O(N).
            //    countDocuments inside transaction còn gây lock contention nghiêm trọng
            //    khi orders collection lớn.
            const seq = await Counter.next('order', session);
            const orderId = `ORD_${String(100000 + seq).padStart(6, '0')}`;

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

            await IdempotencyRecord.create([{
                _id: idempotencyKey,
                userId,
                action: 'CREATE_ORDER',
                result: savedOrder,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }], { session });

            console.log(`✅ Order ${orderId} created successfully with Transaction.`);
            return { cached: false, order: savedOrder };
        });

        // BUG FIX: code Kafka emit cũ nằm sau `return await ...` nên không bao giờ
        // chạy → saga bị đứt. Chuyển ra ngoài và chỉ emit khi không phải cached.
        if (!result.cached) {
            try {
                const { producer } = require('../config/kafka');
                const order = result.order;
                await producer.send({
                    topic: 'stock-events',
                    messages: [{
                        key: order._id.toString(),
                        value: JSON.stringify({
                            type: 'STOCK_RESERVED',
                            orderId: order._id.toString(),
                            userId: order.userId,
                            items: order.items,
                            totalAmount: order.pricing.grandTotal,
                            status: 'RESERVED',
                            timestamp: new Date().toISOString()
                        })
                    }]
                });
                console.log(`📡 [ORDER] Event 'STOCK_RESERVED' emitted for ${order._id}`);
            } catch (error) {
                console.error(`⚠️ Kafka emission failed: ${error.message}`);
            }
        }

        return result;
    }

    // Read-only — .lean() bỏ mongoose hydration, nhanh 3-5x.
    static async getOrderById(orderId) {
        return await Order.findById(orderId).lean();
    }

    static async getOrderByKey(key) {
        if (!key) return null;
        return await Order.findOne({ idempotencyKey: key }).lean();
    }
}

module.exports = OrderService;
