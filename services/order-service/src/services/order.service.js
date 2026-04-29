const crypto = require('crypto');
const Order = require('../models/order.model');
const { producer } = require('../config/kafka');

class OrderService {
    static buildOrderId() {
        return `ORD_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    static async createOrder(userId, items, totalAmount, idempotencyKey, extraFields = {}) {
        const orderId = OrderService.buildOrderId();

        const region = extraFields.region || 'SOUTH';
        const userRegion = extraFields.userRegion || region;
        const deliveryRegion = extraFields.deliveryRegion || region;

        const snapshottedItems = items.map(item => ({
            skuId: item.skuId || item.productId,
            productNameSnapshot: item.name || item.productNameSnapshot || 'Unknown',
            unitPrice: Number(item.price || item.unitPrice || 0),
            quantity: Number(item.quantity),
            lineTotal: Number(item.price || item.unitPrice || 0) * Number(item.quantity),
        }));

        const itemsSubtotal = snapshottedItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const shippingFee = Number(extraFields.shippingFee || 0);
        const grandTotal = itemsSubtotal + shippingFee;

        if (Number(totalAmount) !== grandTotal) {
            const err = new Error('Invalid totalAmount for submitted items');
            err.status = 400;
            throw err;
        }

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
                grandTotal,
            },
            items: snapshottedItems,
            idempotencyKey,
            statusHistory: [{ status: 'PENDING_PAYMENT', timestamp: new Date() }],
        });

        const savedOrder = await newOrder.save();

        try {
            const eventId = `ORDER_CREATED:${savedOrder._id}`;
            await producer.send({
                topic: 'order-events',
                messages: [{
                    key: savedOrder._id,
                    value: JSON.stringify({
                        eventId,
                        type: 'ORDER_CREATED',
                        orderId: savedOrder._id,
                        userId: savedOrder.userId,
                        userRegion: savedOrder.userRegion,
                        items: snapshottedItems,
                        totalAmount: savedOrder.pricing.grandTotal,
                        status: savedOrder.status,
                        timestamp: new Date().toISOString()
                    })
                }]
            });
            console.log(`Event ORDER_CREATED sent for order ${savedOrder._id}`);
        } catch (error) {
            console.error(`Kafka event failed. Order remains PENDING_PAYMENT for recovery: ${error.message}`);
        }

        return savedOrder;
    }

    static async getOrderById(orderId) {
        return Order.findById(orderId);
    }

    static async getOrderByKey(key) {
        if (!key) return null;
        return Order.findOne({ idempotencyKey: key });
    }
}

module.exports = OrderService;
