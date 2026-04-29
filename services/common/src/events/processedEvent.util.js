const crypto = require('crypto');
const ProcessedEvent = require('../models/processedEvent.model');

const buildEventId = ({ source, eventType, aggregateId, fallback }) => {
    if (fallback) return fallback;
    const raw = `${source}:${eventType}:${aggregateId}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
};

const markEventProcessed = async ({ source, eventType, aggregateId, eventId, ttlDays = 7 }) => {
    const _id = buildEventId({ source, eventType, aggregateId, fallback: eventId });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    try {
        await ProcessedEvent.create({
            _id,
            source,
            eventType,
            aggregateId,
            expiresAt
        });
        return true;
    } catch (error) {
        if (error.code === 11000) return false;
        throw error;
    }
};

const hasEventProcessed = async ({ source, eventType, aggregateId, eventId }) => {
    const _id = buildEventId({ source, eventType, aggregateId, fallback: eventId });
    const existing = await ProcessedEvent.findById(_id).lean();
    return Boolean(existing);
};

module.exports = {
    markEventProcessed,
    hasEventProcessed
};
