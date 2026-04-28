const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    skuId: { type: String, required: true },
    productNameSnapshot: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Custom ID: ORD_100001
    region: { type: String, enum: ['NORTH', 'CENTRAL', 'SOUTH'], required: true }, // Shard Key
    userId: { type: String, required: true }, // Dùng String id USR_100001
    userRegion: { type: String, enum: ['NORTH', 'CENTRAL', 'SOUTH'], required: true },
    deliveryRegion: { type: String, enum: ['NORTH', 'CENTRAL', 'SOUTH'], required: true },
    isCrossRegion: { type: Boolean, required: true },
    status: {
        type: String,
        enum: ['PENDING_PAYMENT', 'PAID', 'SHIPPING', 'COMPLETED', 'CANCELLED'],
        default: 'PENDING_PAYMENT'
    },
    pricing: {
        itemsSubtotal: { type: Number, required: true },
        shippingFee: { type: Number, required: true },
        grandTotal: { type: Number, required: true }
    },
    shippingAddressSnapshot: {
        receiverName: { type: String },
        phoneEncrypted: {
            iv: { type: String },
            ciphertext: { type: String }
        },
        fullAddress: { type: String }
    },
    items: [orderItemSchema],
    paymentId: { type: String, default: null },
    reservationId: { type: String },
    statusHistory: [{
        status: String,
        timestamp: { type: Date, default: Date.now }
    }],
    idempotencyKey: { type: String },
    version: { type: Number, default: 1 }
}, {
    timestamps: true,
    _id: false
});

// Indexes
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ paymentId: 1 });
orderSchema.index({ reservationId: 1 });
orderSchema.index({ region: 1, status: 1, createdAt: -1 });
orderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
