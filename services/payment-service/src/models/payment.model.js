const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    amount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED'],
        default: 'PENDING'
    },
    vnp_TxnRef: { type: String, unique: true, required: true }, // Mã tham chiếu duy nhất từ VNPay
    vnp_TransactionNo: { type: String },
    bankCode: { type: String }
}, { timestamps: true });


module.exports = mongoose.model('Payment', paymentSchema);
