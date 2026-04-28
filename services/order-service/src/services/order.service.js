const Order = require('../models/order.model');
const { producer } = require('../config/kafka');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:5001';

class OrderService {
    static async createOrder(userId, items, totalAmount, idempotencyKey, extraFields = {}) {
        // ============================================
        // STEP 1: Atomic Stock Check — Call Product Service
        // Trừ kho TRƯỚC khi tạo order. Nếu hết hàng → reject ngay.
        // ============================================
        for (const item of items) {
            const productId = item.skuId || item.productId;
            const response = await fetch(`${PRODUCT_SERVICE_URL}/api/products/decrease-stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, quantity: item.quantity }),
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const err = new Error(errorBody.message || 'Không đủ hàng trong kho (Out of stock)');
                err.status = 400;
                throw err;
            }
        }

        // ============================================
        // STEP 2: Create Order — Stock đã được trừ thành công
        // ============================================
        const count = await Order.countDocuments();
        const orderId = `ORD_${String(100001 + count).padStart(6, '0')}`;

        const region = extraFields.region || 'SOUTH';
        const userRegion = extraFields.userRegion || region;
        const deliveryRegion = extraFields.deliveryRegion || region;

        const snapshottedItems = items.map(item => ({
            skuId: item.skuId || item.productId,
            productNameSnapshot: item.name || item.productNameSnapshot || 'Unknown',
            unitPrice: item.price || item.unitPrice || 0,
            quantity: item.quantity,
            lineTotal: (item.price || item.unitPrice || 0) * item.quantity,
        }));

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

        const savedOrder = await newOrder.save();

        // ============================================
        // STEP 3: Emit Kafka Event (async notification)
        // ============================================
        try {
            await producer.send({
                topic: 'order-events',
                messages: [{
                    key: savedOrder._id.toString(),
                    value: JSON.stringify({
                        type: 'ORDER_CREATED',
                        orderId: savedOrder._id.toString(),
                        userId: savedOrder.userId,
                        items: snapshottedItems,
                        totalAmount: savedOrder.pricing.grandTotal,
                        status: savedOrder.status,
                        timestamp: new Date().toISOString()
                    })
                }]
            });
            console.log(`✅ Event 'ORDER_CREATED' sent for order ${savedOrder._id}`);
        } catch (error) {
            console.error(`⚠️ Kafka event failed (order still valid): ${error.message}`);
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
