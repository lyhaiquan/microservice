require('dotenv').config();
const app = require('./app');
const mongoose = require('mongoose');
const connectDB = require('../../common/src/database');

const PORT = process.env.PORT || 5002;
const MONGO_URI = process.env.MONGO_URI;

// ============================================
// Global Error Handlers — Chặn Crash Process
// ============================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  [Cart] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('💀 [Cart] Uncaught Exception:', error.message);
    console.error(error.stack);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// ============================================
// Graceful Shutdown
// ============================================
let server;

const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 [Cart] Received ${signal}. Shutting down gracefully...`);
    if (server) {
        server.close(() => {
            console.log('✅ [Cart] HTTP server closed.');
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
        
        server = app.listen(PORT, () => {
            console.log(`🚀 Cart Service is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ [Cart] Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
