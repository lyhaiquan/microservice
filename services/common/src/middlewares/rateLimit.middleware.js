const { RateLimiterMongo, RateLimiterMemory } = require('rate-limiter-flexible');
const mongoose = require('mongoose');

/**
 * Helper to get the real client IP address.
 */
const getClientIp = (req) => {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
};

/**
 * Rate Limiter Middleware Factory using MongoDB Store
 */
const createRateLimiter = ({ keyPrefix, points, duration, useUserId = false }) => {
    // 1. Main MongoDB Limiter
    const mongoLimiter = new RateLimiterMongo({
        storeClient: mongoose.connection,
        keyPrefix: `rl:${keyPrefix}`,
        points: points,
        duration: duration,
        dbName: 'ecommerce_db',
        tableName: 'rate_limits', // Collection name
        // Insurance: Fallback to Memory if Mongo is down
        insuranceLimiter: new RateLimiterMemory({
            points: points,
            duration: duration,
        })
    });


    return async (req, res, next) => {
        // Determine the identifier (User ID or IP)
        let identifier = getClientIp(req);
        if (useUserId && req.user && req.user.id) {
            identifier = req.user.id;
        }

        try {
            await mongoLimiter.consume(identifier);
            next();
        } catch (rejRes) {
            // Check if it's a "Rate Limit Rejection" or a "Database Error"
            if (rejRes instanceof Error) {
                // MONGO ERROR (Fail-Open Strategy)
                console.error(`⚠️ [RateLimit] Mongo Error for ${keyPrefix}:`, rejRes.message);
                return next();
            }


            // RATE LIMIT EXCEEDED
            const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
            res.set('Retry-After', String(secs));
            res.set('X-RateLimit-Limit', String(points));
            res.set('X-RateLimit-Remaining', String(rejRes.remainingPoints));
            res.set('X-RateLimit-Reset', new Date(Date.now() + rejRes.msBeforeNext).toISOString());

            return res.status(429).json({
                error: 'Too Many Requests',
                message: `Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${secs} giây.`,
                retryAfter: secs
            });
        }
    };
};

module.exports = {
    createRateLimiter,
    getClientIp
};
