const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    skuId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    selected: { type: Boolean, default: true },
    priceSnapshot: { type: Number, required: true },
    productNameSnapshot: { type: String, required: true },
    addedAt: { type: Date, default: Date.now }
}, { _id: false });

const cartSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Cho phép custom ID: CART_USR_100001
    userId: { type: String, required: true },
    items: [cartItemSchema],
    expiresAt: { type: Date, required: true }
}, {
    timestamps: true,
    _id: false
});

cartSchema.index({ userId: 1 }, { unique: true });
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 2592000 }); // TTL 30 ngày

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
