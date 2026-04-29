const Order = require('../models/order.model');
const { consumer } = require('../config/kafka');
const eventUtils = require('../../../common/src/events/processedEvent.util');

class OrderConsumer {
    static async appendStatus(orderId, fromStatuses, nextStatus, extra = {}) {
        const filter = { _id: orderId };
        if (fromStatuses && fromStatuses.length > 0) {
            filter.status = { $in: fromStatuses };
        }

        const cleanExtra = {};
        for (const [key, value] of Object.entries(extra)) {
            if (value !== undefined) cleanExtra[key] = value;
        }

        return Order.findOneAndUpdate(
            filter,
            {
                $set: { status: nextStatus, ...cleanExtra },
                $push: {
                    statusHistory: {
                        status: nextStatus,
                        timestamp: new Date()
                    }
                },
                $inc: { version: 1 }
            },
            { new: true }
        );
    }

    static async handleStockEvent(data) {
        const { orderId, status, reservationIds } = data;
        const eventMeta = {
            source: 'product-service',
            eventType: data.type || `STOCK_${status}`,
            aggregateId: orderId,
            eventId: data.eventId
        };
        if (await eventUtils.hasEventProcessed(eventMeta)) return;

        if (data.type === 'STOCK_RESERVED' || status === 'RESERVED') {
            await OrderConsumer.appendStatus(
                orderId,
                ['PENDING_PAYMENT'],
                'STOCK_RESERVED',
                { reservationId: Array.isArray(reservationIds) ? reservationIds.join(',') : undefined }
            );
            await eventUtils.markEventProcessed(eventMeta);
            return;
        }

        if (data.type === 'STOCK_FAILED' || status === 'FAILED') {
            await OrderConsumer.appendStatus(orderId, ['PENDING_PAYMENT', 'STOCK_RESERVED'], 'CANCELLED');
            await eventUtils.markEventProcessed(eventMeta);
        }
    }

    static async handlePaymentEvent(data) {
        const { orderId, status, paymentId } = data;
        const eventMeta = {
            source: 'payment-service',
            eventType: `PAYMENT_${status}`,
            aggregateId: orderId,
            eventId: data.eventId
        };
        if (await eventUtils.hasEventProcessed(eventMeta)) return;

        if (status === 'PAID') {
            await OrderConsumer.appendStatus(orderId, ['PENDING_PAYMENT', 'STOCK_RESERVED'], 'PAID', {
                paymentId: paymentId || orderId
            });
            await eventUtils.markEventProcessed(eventMeta);
            return;
        }

        if (status === 'FAILED') {
            await OrderConsumer.appendStatus(orderId, ['PENDING_PAYMENT', 'STOCK_RESERVED'], 'PAYMENT_FAILED');
            await eventUtils.markEventProcessed(eventMeta);
        }
    }

    static async handleRefundEvent(data) {
        const { orderId, status } = data;
        const eventMeta = {
            source: 'payment-service',
            eventType: data.type || `REFUND_${status}`,
            aggregateId: data.refundId || orderId,
            eventId: data.eventId
        };
        if (await eventUtils.hasEventProcessed(eventMeta)) return;

        if (status === 'REFUNDED') {
            await OrderConsumer.appendStatus(orderId, ['PAID', 'REFUND_PENDING'], 'REFUNDED');
            await eventUtils.markEventProcessed(eventMeta);
            return;
        }

        if (status === 'REFUND_PENDING') {
            await OrderConsumer.appendStatus(orderId, ['PAID'], 'REFUND_PENDING');
            await eventUtils.markEventProcessed(eventMeta);
        }
    }

    static async listenPaymentConfirmed() {
        await consumer.subscribe({ topic: 'payment-confirmed', fromBeginning: false });
        await consumer.subscribe({ topic: 'stock-events', fromBeginning: false });
        await consumer.subscribe({ topic: 'refund-events', fromBeginning: false });

        await consumer.run({
            eachMessage: async ({ topic, message }) => {
                const data = JSON.parse(message.value.toString());

                if (topic === 'stock-events') {
                    await OrderConsumer.handleStockEvent(data);
                    return;
                }

                if (topic === 'payment-confirmed') {
                    await OrderConsumer.handlePaymentEvent(data);
                    return;
                }

                if (topic === 'refund-events') {
                    await OrderConsumer.handleRefundEvent(data);
                }
            }
        });
        console.log('[Order] Consumer listening on stock/payment/refund events...');
    }
}

module.exports = OrderConsumer;
