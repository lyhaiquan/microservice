const connectDB = require('./src/database');
const redisClient = require('./src/redis');
const rateLimitMiddleware = require('./src/middlewares/rateLimit.middleware');
const authMiddleware = require('./src/middlewares/auth.middleware');
const eventUtils = require('./src/events/processedEvent.util');

module.exports = {
    connectDB,
    redisClient,
    rateLimitMiddleware,
    authMiddleware,
    eventUtils
};
