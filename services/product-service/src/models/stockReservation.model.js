const mongoose = require('mongoose');

const stockReservationSchema = new mongoose.Schema({
    skuId: { type: String, required: true },
    checkoutId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    priceAtReservation: { type: Number, required: true },
    status: {
        type: String,
        enum: ['RESERVED', 'CONFIRMED', 'RELEASED', 'EXPIRED'],
        default: 'RESERVED'
    },
    expiresAt: { type: Date, required: true }
}, {
    timestamps: true
});

// Indexes
stockReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 900 });
// checkoutId unique is already handled by `{ unique: true }` in schema definition.
stockReservationSchema.index({ skuId: 1, status: 1 });

const StockReservation = mongoose.model('StockReservation', stockReservationSchema);

module.exports = StockReservation;
