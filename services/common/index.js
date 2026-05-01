const connectDB = require('./src/database');
const redisClient = require('./src/redis');
const rateLimitMiddleware = require('./src/middlewares/rateLimit.middleware');
const authMiddleware = require('./src/middlewares/auth.middleware');
const { setTracked, invalidateGroup, getOrLoad } = require('./src/cache');

module.exports = {
    connectDB,
    redisClient,
    rateLimitMiddleware,
    authMiddleware,
    setTracked,
    invalidateGroup,
    getOrLoad
};
