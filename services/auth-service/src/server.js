require('dotenv').config();
const app = require('./app');
const mongoose = require('mongoose');
const connectDB = require('../../common/src/database');

const PORT = process.env.PORT || 5050;
const MONGO_URI = process.env.MONGO_URI;

// ============================================
// Global Error Handlers — Chặn Crash Process
// ============================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  [Auth] Unhandled Rejection at:', promise, 'reason:', reason);
    // KHÔNG process.exit() → để service tiếp tục chạy
});

process.on('uncaughtException', (error) => {
    console.error('💀 [Auth] Uncaught Exception:', error.message);
    console.error(error.stack);
    // Uncaught Exception nghiêm trọng → shutdown graceful
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// ============================================
// Graceful Shutdown
// ============================================
let server;

const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 [Auth] Received ${signal}. Shutting down gracefully...`);
    if (server) {
        server.close(() => {
            console.log('✅ [Auth] HTTP server closed.');
            process.exit(0);
        });
        // Force kill after 10s nếu server k close được
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
            throw new Error('MONGO_URI must be defined');
        }

        await connectDB(MONGO_URI, mongoose);

        server = app.listen(PORT, () => {
            console.log(`🚀 Auth Service is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ [Auth] Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
