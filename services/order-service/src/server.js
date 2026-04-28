require('dotenv').config();
const app = require('./app');
const mongoose = require('mongoose');
const connectDB = require('../../common/src/database');
const { connectKafka } = require('./config/kafka');
const OrderConsumer = require('./services/order.consumer');

const PORT = process.env.PORT || 5003;
const MONGO_URI = process.env.MONGO_URI;

// ============================================
// Global Error Handlers — Chặn Crash Process
// ============================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  [Order] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('💀 [Order] Uncaught Exception:', error.message);
    console.error(error.stack);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// ============================================
// Graceful Shutdown
// ============================================
let server;

const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 [Order] Received ${signal}. Shutting down gracefully...`);
    if (server) {
        server.close(() => {
            console.log('✅ [Order] HTTP server closed.');
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000);
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// Start Server
// ============================================
const startServer = async () => {
    try {
        if (!MONGO_URI) {
            throw new Error('MONGO_URI must be defined in .env');
        }
        
        await connectDB(MONGO_URI, mongoose);

        await connectKafka();
        
        OrderConsumer.listenPaymentConfirmed().catch(err => {
            console.error('Error starting Order consumers:', err);
        });
        
        server = app.listen(PORT, () => {
            console.log(`🚀 Order Service is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ [Order] Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
