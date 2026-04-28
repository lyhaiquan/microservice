const mongoose = require('mongoose');

const idempotencyRecordSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // sha256(userId+checkoutId+action)
    userId: { type: String, required: true },
    action: { type: String, required: true },
    result: { type: mongoose.Schema.Types.Mixed },
    expiresAt: { type: Date, required: true }
}, {
    timestamps: true,
    _id: false
});

idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 }); // TTL 7 days (604800 seconds)

const IdempotencyRecord = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);
module.exports = IdempotencyRecord;
