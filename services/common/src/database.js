/**
 * Resilient MongoDB Connection — tuned cho sharded+replicated cluster cross-region (HN/DN/HCM).
 * - Default reads route đến node "nearest" (giảm latency cross-region 100-200ms/query)
 * - Default readConcern 'local' (eventual consistency cho reads — chấp nhận được cho hầu hết
 *   read-only endpoint; transaction tự override readConcern khi cần strong consistency)
 * - Writes vẫn dùng majority để bảo vệ data
 * - Pool size phù hợp cho high concurrency
 */
const connectDB = async (uri, mongoose) => {
    if (!mongoose) mongoose = require('mongoose');

    if (!uri || typeof uri !== 'string') {
        throw new Error('connectDB: MONGO_URI is required (not set in environment).');
    }

    const isDirectConnection = uri.includes('directConnection=true');

    const options = {
        retryWrites: true,
        retryReads: true,

        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 5000,

        autoIndex: true,

        // Pool: tăng để chịu tải cao. minPoolSize giữ connection nóng tránh
        // cold-start handshake mỗi khi traffic burst.
        maxPoolSize: 50,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 5000,
    };

    if (!isDirectConnection) {
        // 'nearest' chọn node có ping thấp nhất (cùng region với app server) —
        // chấp nhận đọc từ secondary để giảm latency cross-region. Endpoint nào
        // cần strong consistency có thể override per-query: Model.find().read('primary').
        options.readPreference = 'nearest';

        // 'local' không chờ majority ack — nhanh hơn 'majority' 50-150ms.
        // Trade-off: có thể đọc data chưa replicate; chấp nhận được vì ghi
        // đã dùng majority (data eventual sẽ converge nhanh).
        options.readConcern = { level: 'local' };

        // Writes vẫn cần majority để safe khi failover.
        options.writeConcern = { w: 'majority' };
    }

    mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB Replica Set Connected (Primary detected)');
    });
    mongoose.connection.on('disconnected', () => {
        console.warn('⚠️  MongoDB disconnected. Mongoose sẽ tự động reconnect...');
    });
    mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected successfully');
    });
    mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
    });

    let retries = 5;
    while (retries > 0) {
        try {
            await mongoose.connect(uri, options);
            return;
        } catch (err) {
            retries -= 1;
            console.error(`❌ MongoDB connection failed. Retries left: ${retries}. Error: ${err.message}`);
            if (retries === 0) {
                throw new Error(`Cannot connect to MongoDB after 5 attempts: ${err.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
};

module.exports = connectDB;
