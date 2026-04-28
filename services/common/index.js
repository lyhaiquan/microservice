const connectDB = require('./src/database');
const redisClient = require('./src/redis');
const rateLimitMiddleware = require('./src/middlewares/rateLimit.middleware');

module.exports = {
    connectDB,
    redisClient,
    rateLimitMiddleware
};