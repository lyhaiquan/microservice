const Product = require('../models/product.model');
const StockReservation = require('../models/stockReservation.model');
const { producer, consumer } = require('../config/kafka');
const mongoose = require('mongoose');
const eventUtils = require('../../../common/src/events/processedEvent.util');

class StockConsumer {
    static async emitStockEvent(payload) {
        await producer.send({
            topic: 'stock-events',
            messages: [{
                key: payload.orderId,
                value: JSON.stringify({
                    ...payload,
                    timestamp: new Date().toISOString()
                })
            }]
        });
    }

    static async emitExistingReservation(orderData) {
        const reservations = await StockReservation.find({
            orderId: orderData.orderId,
            status: { $in: ['RESERVED', 'CONFIRMED'] }
        });

        if (reservations.length === 0) return false;

        await StockConsumer.emitStockEvent({
            eventId: `STOCK_RESERVED:${orderData.orderId}`,
            type: 'STOCK_RESERVED',
            orderId: orderData.orderId,
            userId: orderData.userId,
            userRegion: orderData.userRegion,
            items: orderData.items,
            totalAmount: orderData.totalAmount,
            status: 'RESERVED',
            reservationIds: reservations.map(item => item._id)
        });
        return true;
    }

    static async reserveOneItem(item, orderData, index, session) {
        const qty = Number(item.quantity || 1);
        const requestedSku = item.skuId || item.productId;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        let updatedProduct = await Product.findOneAndUpdate(
            {
                variants: {
                    $elemMatch: {
                        skuId: requestedSku,
                        availableStock: { $gte: qty }
                    }
                }
            },
            {
                $inc: {
                    'variants.$.availableStock': -qty,
                    'variants.$.reservedStock': qty,
                    'variants.$.version': 1
                }
            },
            { new: true, session }
        );

        let variant;
        if (updatedProduct) {
            variant = updatedProduct.variants.find(v => v.skuId === requestedSku);
        } else {
            updatedProduct = await Product.findOneAndUpdate(
                {
                    _id: requestedSku,
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
            variant = updatedProduct && updatedProduct.variants[0];
        }

        if (!updatedProduct || !variant) {
            const err = new Error(`Out of stock for SKU/Product ${requestedSku}`);
            err.status = 'OUT_OF_STOCK';
            throw err;
        }

        const reservation = await StockReservation.create([{
            orderId: orderData.orderId,
            skuId: variant.skuId,
            checkoutId: `${orderData.orderId}:${variant.skuId}:${index}`,
            userId: orderData.userId,
            quantity: qty,
            priceAtReservation: Number(item.unitPrice || item.price || variant.price || 0),
            status: 'RESERVED',
            expiresAt
        }], { session });

        return reservation[0]._id;
    }

    static async handleOrderCreated(orderData) {
        if (orderData.type !== 'ORDER_CREATED') return;

        const alreadyProcessed = await eventUtils.hasEventProcessed({
            source: 'order-service',
            eventType: 'ORDER_CREATED',
            aggregateId: orderData.orderId,
            eventId: orderData.eventId
        });
        if (alreadyProcessed) {
            await StockConsumer.emitExistingReservation(orderData);
            return;
        }

        if (await StockConsumer.emitExistingReservation(orderData)) {
            return;
        }

        const session = await mongoose.startSession();
        session.startTransaction({
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority', j: true }
        });

        try {
            const reservationIds = [];
            for (let index = 0; index < orderData.items.length; index += 1) {
                const reservationId = await StockConsumer.reserveOneItem(orderData.items[index], orderData, index, session);
                reservationIds.push(reservationId);
            }

            await session.commitTransaction();

            await StockConsumer.emitStockEvent({
                eventId: `STOCK_RESERVED:${orderData.orderId}`,
                type: 'STOCK_RESERVED',
                orderId: orderData.orderId,
                userId: orderData.userId,
                userRegion: orderData.userRegion,
                items: orderData.items,
                totalAmount: orderData.totalAmount,
                status: 'RESERVED',
                reservationIds
            });
            await eventUtils.markEventProcessed({
                source: 'order-service',
                eventType: 'ORDER_CREATED',
                aggregateId: orderData.orderId,
                eventId: orderData.eventId
            });
        } catch (error) {
            await session.abortTransaction();

            if (error.code === 11000 && await StockConsumer.emitExistingReservation(orderData)) {
                await eventUtils.markEventProcessed({
                    source: 'order-service',
                    eventType: 'ORDER_CREATED',
                    aggregateId: orderData.orderId,
                    eventId: orderData.eventId
                });
                return;
            }

            await StockConsumer.emitStockEvent({
                eventId: `STOCK_FAILED:${orderData.orderId}`,
                type: 'STOCK_FAILED',
                orderId: orderData.orderId,
                userId: orderData.userId,
                userRegion: orderData.userRegion,
                status: 'FAILED',
                reason: error.message
            });
            await eventUtils.markEventProcessed({
                source: 'order-service',
                eventType: 'ORDER_CREATED',
                aggregateId: orderData.orderId,
                eventId: orderData.eventId
            });
        } finally {
            session.endSession();
        }
    }

    static async finalizeReservations(orderId) {
        const session = await mongoose.startSession();
        session.startTransaction({
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority', j: true }
        });

        try {
            const reservations = await StockReservation.find({ orderId, status: 'RESERVED' }).session(session);
            for (const reservation of reservations) {
                await StockReservation.updateOne(
                    { _id: reservation._id, status: 'RESERVED' },
                    { $set: { status: 'CONFIRMED' } },
                    { session }
                );
                await Product.updateOne(
                    { 'variants.skuId': reservation.skuId },
                    {
                        $inc: {
                            'variants.$.reservedStock': -reservation.quantity,
                            'variants.$.version': 1
                        }
                    },
                    { session }
                );
            }
            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    static async releaseReservations(orderId) {
        const session = await mongoose.startSession();
        session.startTransaction({
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority', j: true }
        });

        try {
            const reservations = await StockReservation.find({
                orderId,
                status: { $in: ['RESERVED', 'CONFIRMED'] }
            }).session(session);

            for (const reservation of reservations) {
                const wasReserved = reservation.status === 'RESERVED';
                await StockReservation.updateOne(
                    { _id: reservation._id, status: reservation.status },
                    { $set: { status: 'RELEASED' } },
                    { session }
                );

                const inc = {
                    'variants.$.availableStock': reservation.quantity,
                    'variants.$.version': 1
                };
                if (wasReserved) {
                    inc['variants.$.reservedStock'] = -reservation.quantity;
                }

                await Product.updateOne(
                    { 'variants.skuId': reservation.skuId },
                    { $inc: inc },
                    { session }
                );
            }

            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    static async handlePaymentEvent(data) {
        const alreadyProcessed = await eventUtils.hasEventProcessed({
            source: 'payment-service',
            eventType: `PAYMENT_${data.status}`,
            aggregateId: data.orderId,
            eventId: data.eventId
        });
        if (alreadyProcessed) return;

        if (data.status === 'PAID') {
            await StockConsumer.finalizeReservations(data.orderId);
            await eventUtils.markEventProcessed({
                source: 'payment-service',
                eventType: `PAYMENT_${data.status}`,
                aggregateId: data.orderId,
                eventId: data.eventId
            });
            return;
        }

        if (data.status === 'FAILED') {
            await StockConsumer.releaseReservations(data.orderId);
            await eventUtils.markEventProcessed({
                source: 'payment-service',
                eventType: `PAYMENT_${data.status}`,
                aggregateId: data.orderId,
                eventId: data.eventId
            });
        }
    }

    static async handleRefundEvent(data) {
        const alreadyProcessed = await eventUtils.hasEventProcessed({
            source: 'payment-service',
            eventType: data.type || 'REFUND_EVENT',
            aggregateId: data.refundId || data.orderId,
            eventId: data.eventId
        });
        if (alreadyProcessed) return;

        if (data.type === 'REFUND_SUCCESS' && data.status === 'REFUNDED') {
            await StockConsumer.releaseReservations(data.orderId);
            await eventUtils.markEventProcessed({
                source: 'payment-service',
                eventType: data.type || 'REFUND_EVENT',
                aggregateId: data.refundId || data.orderId,
                eventId: data.eventId
            });
        }
    }

    static async listenOrderEvents() {
        await consumer.subscribe({ topic: 'order-events', fromBeginning: false });
        await consumer.subscribe({ topic: 'payment-confirmed', fromBeginning: false });
        await consumer.subscribe({ topic: 'refund-events', fromBeginning: false });
        await consumer.run({
            eachMessage: async ({ topic, message }) => {
                const data = JSON.parse(message.value.toString());
                if (topic === 'order-events') {
                    await StockConsumer.handleOrderCreated(data);
                    return;
                }
                if (topic === 'payment-confirmed') {
                    await StockConsumer.handlePaymentEvent(data);
                    return;
                }
                if (topic === 'refund-events') {
                    await StockConsumer.handleRefundEvent(data);
                }
            }
        });
        console.log('[Product] Stock Consumer listening on order/payment/refund events...');
    }
}

module.exports = StockConsumer;
