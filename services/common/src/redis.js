const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const redisClient = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    // Tránh treo ứng dụng nếu Redis sập
    enableOfflineQueue: true, 
    maxRetriesPerRequest: 3
});

redisClient.on('connect', () => {
    console.log('✅ [Common] Connected to Redis successfully');
});

redisClient.on('error', (err) => {
    console.error('❌ [Common] Redis Connection Error:', err.message);
});

module.exports = redisClient;
