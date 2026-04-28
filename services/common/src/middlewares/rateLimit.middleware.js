const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const redisClient = require('../redis');

/**
 * Helper to get the real client IP address.
 * Respects 'x-forwarded-for' header when behind a proxy like Nginx.
 */
const getClientIp = (req) => {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
};

/**
 * Rate Limiter Middleware Factory
 * 
 * @param {Object} options 
 * @param {string} options.keyPrefix - Unique prefix for the redis keys (e.g., 'auth_login')
 * @param {number} options.points - Number of points (requests) allowed
 * @param {number} options.duration - Duration in seconds
 * @param {boolean} options.useUserId - If true, tries to limit by req.user.id instead of IP
 */
const createRateLimiter = ({ keyPrefix, points, duration, useUserId = false }) => {
    // 1. Main Redis Limiter
    const redisLimiter = new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: `rl:${keyPrefix}`,
        points: points,
        duration: duration,
        // Insurance: Fallback to Memory if Redis is down
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
            await redisLimiter.consume(identifier);
            next();
        } catch (rejRes) {
            // Check if it's a "Rate Limit Rejection" or a "Redis Error"
            if (rejRes instanceof Error) {
                // REDIS ERROR (Fail-Open Strategy)
                // In production, we log this and let the request pass to maintain Availability
                console.error(`⚠️ [RateLimit] Redis Error for ${keyPrefix}:`, rejRes.message);
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
