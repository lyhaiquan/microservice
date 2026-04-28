const mongoose = require('mongoose');

const paymentAttemptSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // ATT_001
    paymentId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    attemptNumber: { type: Number, required: true },
    status: {
        type: String,
        enum: ['PENDING', 'SUCCESS', 'FAILED'],
        default: 'PENDING'
    },
    requestPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    responsePayload: { type: mongoose.Schema.Types.Mixed, default: null },
    nextRetryAt: { type: Date, default: null }
}, {
    timestamps: true,
    _id: false
});

paymentAttemptSchema.index({ paymentId: 1, attemptNumber: 1 });
paymentAttemptSchema.index({ idempotencyKey: 1 }, { unique: true });

const PaymentAttempt = mongoose.model('PaymentAttempt', paymentAttemptSchema);
module.exports = PaymentAttempt;
