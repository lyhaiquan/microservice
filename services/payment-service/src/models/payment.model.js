const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Custom ID: PAY_100001
    orderId: { type: String, required: true },
    userId: { type: String, required: true },
    userRegion: { type: String, enum: ['NORTH', 'CENTRAL', 'SOUTH'], required: true },
    provider: { type: String, enum: ['MOMO', 'VNPAY', 'ZALOPAY', 'COD'], required: true },
    amount: { type: Number, required: true },
    refundedAmount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
        default: 'PENDING'
    },
    retryCount: { type: Number, default: 0 },
    lastRetryAt: { type: Date, default: null },
    providerRef: { type: String, default: null },
    providerTransactionNo: { type: String, default: null },
    bankCode: { type: String, default: null },
    vnp_TxnRef: { type: String, default: null },
    vnp_TransactionNo: { type: String, default: null },
    providerData: { type: mongoose.Schema.Types.Mixed, default: null },
    version: { type: Number, default: 1 }
}, {
    timestamps: true,
    _id: false
});

paymentSchema.index({ orderId: 1 }, { unique: true });
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
