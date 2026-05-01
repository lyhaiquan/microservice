const Notification = require('../../../common/src/models/notification.model');

/**
 * Worker to listen for new notifications using MongoDB Change Streams.
 */
const startNotificationWorker = async () => {
    try {
        console.log('🔔 Notification Worker starting...');

        // Watch the notifications collection for 'insert' events
        // MongoDB change streams BẮT BUỘC readConcern 'majority' (default global của
        // app là 'local' để giảm latency cho read endpoints).
        const changeStream = Notification.watch(
            [{ $match: { operationType: 'insert' } }],
            { fullDocument: 'updateLookup', readConcern: { level: 'majority' } }
        );

        changeStream.on('change', (change) => {
            const doc = change.fullDocument;
            console.log('\n==================================================');
            console.log(`📩 [NOTIFICATION] Gửi thông báo cho User: ${doc.userId}`);
            console.log(`Type: ${doc.type}`);
            console.log(`Content: ${doc.content}`);
            console.log(`Order ID: ${doc.metadata?.orderId || 'N/A'}`);
            console.log('==================================================\n');

            // Simulate sending email/push
            // In reality, call an email provider API or Firebase Cloud Messaging
        });

        console.log('✅ Notification Worker is watching for changes.');

        // Error handling
        changeStream.on('error', (err) => {
            console.error('⚠️ Change Stream Error:', err.message);
            // Implement restart logic if needed
        });

    } catch (error) {
        console.error('❌ Failed to start Notification Worker:', error.message);
    }
};

module.exports = { startNotificationWorker };
