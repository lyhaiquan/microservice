const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true }, // Giá chốt (Snapshot)
    name: { type: String, required: true }   // Tên chốt (Snapshot)
}, { _id: false });

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['COD', 'VNPAY'], default: 'COD' },
    status: {
        type: String,
        enum: ['PENDING', 'PAID', 'SHIPPING', 'COMPLETED', 'CANCELLED'],
        default: 'PENDING',
        index: true
    },
    idempotencyKey: {
        type: String,
        unique: true,
        index: true,
        sparse: true // Allow existing orders without this key
    }
}, { timestamps: true });


module.exports = mongoose.model('Order', orderSchema);
