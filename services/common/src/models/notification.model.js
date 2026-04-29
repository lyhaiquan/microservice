const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true }, // e.g., 'PAYMENT_SUCCESS'
    content: { type: String, required: true },
    metadata: {
        orderId: { type: String },
        paymentId: { type: String }
    },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
