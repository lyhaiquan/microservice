require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../../common');
const { startNotificationWorker } = require('./services/notification.worker');

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB(process.env.MONGO_URI);
        console.log('📦 Notification Service connected to MongoDB');

        // Start the Change Stream worker
        await startNotificationWorker();

    } catch (error) {
        console.error('❌ Notification Service failed to start:', error.message);
        process.exit(1);
    }
};

startServer();
