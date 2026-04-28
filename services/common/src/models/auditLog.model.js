const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // AUD_001
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    oldValueHash: { type: String },
    newValueHash: { type: String },
    zoneOrigin: { type: String, enum: ['NORTH', 'CENTRAL', 'SOUTH'], required: true },
    ipPrefix: { type: String },
    userAgentHash: { type: String },
    timestamp: { type: Date, default: Date.now }
}, {
    versionKey: false,
    _id: false
});

auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // TTL 30 days

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
