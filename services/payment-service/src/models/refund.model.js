const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // REF_001
    paymentId: { type: String, required: true },
    orderId: { type: String, required: true },
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'],
        default: 'PENDING'
    },
    idempotencyKey: { type: String, required: true },
    providerRefundRef: { type: String, default: null },
    processedAt: { type: Date, default: null }
}, {
    timestamps: true,
    _id: false
});

refundSchema.index({ paymentId: 1 });
refundSchema.index({ orderId: 1 });
refundSchema.index({ idempotencyKey: 1 }, { unique: true });

const Refund = mongoose.model('Refund', refundSchema);
module.exports = Refund;
