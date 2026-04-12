/**
 * Resilient MongoDB Connection
 * - Tự động phát hiện Primary khi Failover (Replica Set mode)
 * - Tương thích với directConnection=true (single node mode)
 * - Không crash process khi mất kết nối (tự reconnect)
 * - Event-based logging cho monitoring
 * 
 * QUAN TRỌNG: Module này KHÔNG import mongoose trực tiếp.
 * Thay vào đó, nó nhận mongoose instance từ service gọi nó
 * để tránh lỗi "dual instance" khi có nhiều version mongoose.
 */

/**
 * @param {string} uri - MongoDB connection string
 * @param {import('mongoose')} mongoose - Mongoose instance từ service
 */
const connectDB = async (uri, mongoose) => {
    if (!mongoose) {
        // Fallback: nếu không truyền mongoose, dùng require
        mongoose = require('mongoose');
    }

    // Detect nếu URI dùng directConnection (không phải full RS)
    const isDirectConnection = uri.includes('directConnection=true');

    const options = {
        // Retry & Resilience
        retryWrites: true,
        retryReads: true,

        // Timeouts (tránh treo vô hạn)
        serverSelectionTimeoutMS: 10000,  // 10s chờ tìm Primary
        connectTimeoutMS: 10000,          // 10s chờ kết nối
        socketTimeoutMS: 45000,           // 45s cho slow queries
        heartbeatFrequencyMS: 5000,       // Kiểm tra node health mỗi 5s

        // Indexing
        autoIndex: true,

        // Connection Pool
        maxPoolSize: 10,
        minPoolSize: 2,
    };

    // Chỉ thêm RS-specific options khi dùng full Replica Set URI
    if (!isDirectConnection) {
        options.readPreference = 'primary';
        options.writeConcern = { w: 'majority' };
        options.readConcern = { level: 'majority' };
    }

    // Event listeners — KHÔNG gọi process.exit() ở đây
    mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB Replica Set Connected (Primary detected)');
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('⚠️  MongoDB disconnected. Mongoose sẽ tự động reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected successfully (có thể đã Failover sang Primary mới)');
    });

    mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
        // KHÔNG process.exit() — để Mongoose tự retry
    });

    // Initial connection với retry logic
    let retries = 5;
    while (retries > 0) {
        try {
            await mongoose.connect(uri, options);
            return; // Thành công → thoát
        } catch (err) {
            retries -= 1;
            console.error(`❌ MongoDB connection failed. Retries left: ${retries}. Error: ${err.message}`);
            if (retries === 0) {
                throw new Error(`Cannot connect to MongoDB after 5 attempts: ${err.message}`);
            }
            // Chờ 3s trước khi retry
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
};

module.exports = connectDB;