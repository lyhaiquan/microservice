const Redis = require('ioredis');

// Khởi tạo connection Redis
let redisClient;
try {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    redisClient = new Redis(redisUrl);
    
    redisClient.on('connect', () => {
        console.log('✅ Redis connected successfully.');
    });
    
    redisClient.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
    });
} catch (error) {
    console.error('❌ Failed to initialize Redis:', error.message);
}

module.exports = redisClient;
