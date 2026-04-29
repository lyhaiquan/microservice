const crypto = require('crypto');
const mongoose = require('mongoose');
const Payment = require('../models/payment.model');
const Refund = require('../models/refund.model');
const { producer } = require('../config/kafka');

class RefundService {
    static buildRefundId() {
        return `REF_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    static async requestRefund({ paymentId, orderId, userId, amount, reason, idempotencyKey, requester }) {
        if (!idempotencyKey) {
            const err = new Error('Missing idempotency key');
            err.status = 400;
            throw err;
        }

        const scopedKey = `${requester.id}:${idempotencyKey}`;
        const existingRefund = await Refund.findOne({ idempotencyKey: scopedKey });
        if (existingRefund) {
            return { refund: existingRefund, duplicate: true };
        }

        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            const err = new Error('Refund amount must be greater than 0');
            err.status = 400;
            throw err;
        }

        const paymentFilter = paymentId ? { _id: paymentId } : { orderId };
        const payment = await Payment.findOne(paymentFilter);
        if (!payment) {
            const err = new Error('Payment not found');
            err.status = 404;
            throw err;
        }

        const isAdmin = requester.roles && requester.roles.includes('ADMIN');
        if (!isAdmin && payment.userId !== requester.id) {
            const err = new Error('Cannot refund another user payment');
            err.status = 403;
            throw err;
        }

        if (!['SUCCESS', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
            const err = new Error('Only successful payments can be refunded');
            err.status = 409;
            throw err;
        }

        const session = await mongoose.startSession();
        session.startTransaction({
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority', j: true }
        });

        try {
            const refund = await Refund.create([{
                _id: RefundService.buildRefundId(),
                paymentId: payment._id,
                orderId: payment.orderId,
                userId: userId || payment.userId,
                amount: parsedAmount,
                reason: reason || 'Customer refund request',
                status: 'PROCESSING',
                idempotencyKey: scopedKey
            }], { session });

            const paymentUpdate = await Payment.findOneAndUpdate(
                {
                    _id: payment._id,
                    status: { $in: ['SUCCESS', 'PARTIALLY_REFUNDED'] },
                    $expr: { $lte: [{ $add: ['$refundedAmount', parsedAmount] }, '$amount'] }
                },
                {
                    $inc: { refundedAmount: parsedAmount },
                    $set: { status: 'PARTIALLY_REFUNDED' }
                },
                { new: true, session }
            );

            if (!paymentUpdate) {
                const err = new Error('Refund exceeds remaining refundable amount');
                err.status = 409;
                throw err;
            }

            if (paymentUpdate.refundedAmount >= paymentUpdate.amount) {
                paymentUpdate.status = 'REFUNDED';
                await paymentUpdate.save({ session });
            }

            const completedRefund = await Refund.findByIdAndUpdate(
                refund[0]._id,
                {
                    status: 'SUCCESS',
                    providerRefundRef: `LOCAL_${refund[0]._id}`,
                    processedAt: new Date()
                },
                { new: true, session }
            );

            await session.commitTransaction();

            await producer.send({
                topic: 'refund-events',
                messages: [{
                    key: payment.orderId,
                    value: JSON.stringify({
                        eventId: `REFUND_SUCCESS:${completedRefund._id}`,
                        type: 'REFUND_SUCCESS',
                        orderId: payment.orderId,
                        paymentId: payment._id,
                        refundId: completedRefund._id,
                        amount: parsedAmount,
                        status: paymentUpdate.status === 'REFUNDED' ? 'REFUNDED' : 'REFUND_PENDING',
                        timestamp: new Date().toISOString()
                    })
                }]
            });

            return { refund: completedRefund, duplicate: false };
        } catch (error) {
            await session.abortTransaction();
            if (error.code === 11000) {
                const duplicate = await Refund.findOne({ idempotencyKey: scopedKey });
                return { refund: duplicate, duplicate: true };
            }
            throw error;
        } finally {
            session.endSession();
        }
    }
}

module.exports = RefundService;
