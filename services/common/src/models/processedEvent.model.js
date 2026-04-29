const mongoose = require('mongoose');

const processedEventSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    source: { type: String, required: true },
    eventType: { type: String, required: true },
    aggregateId: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
}, {
    timestamps: true,
    _id: false
});

processedEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
processedEventSchema.index({ source: 1, eventType: 1, aggregateId: 1 });

const ProcessedEvent = mongoose.models.ProcessedEvent || mongoose.model('ProcessedEvent', processedEventSchema);

module.exports = ProcessedEvent;
