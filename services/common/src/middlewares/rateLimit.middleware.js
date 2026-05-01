const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const redisClient = require('../redis');

/**
 * Helper to get the real client IP address.
 */
const getClientIp = (req) => {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
};

/**
 * Rate Limiter Middleware Factory using Redis Store
 *
 * Trước đây dùng RateLimiterMongo → mỗi request phải round-trip tới VPS remote
 * (~100ms/lần). Chuyển sang RateLimiterRedis (Redis chạy local trong Docker)
 * → ~0.1ms/lần, giảm latency đáng kể khi có nhiều request đồng thời.
 *
 * Fallback: nếu Redis down → RateLimiterMemory (in-process, không share giữa
 * các instance nhưng vẫn bảo vệ được từng pod).
 *
 * Tuning cho test/perf:
 *   - ENV `RATE_LIMIT_<UPPER_KEYPREFIX>_POINTS` ghi đè points cho 1 limiter cụ thể
 *     (ví dụ RATE_LIMIT_CHECKOUT_POINTS=1000 để chạy concurrency test).
 *   - ENV `RATE_LIMIT_DISABLE=1` skip middleware hoàn toàn (chỉ dùng khi chạy
 *     perf-runner trên môi trường tách biệt — KHÔNG dùng ở prod).
 */
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLE === '1';

const createRateLimiter = ({ keyPrefix, points, duration, useUserId = false }) => {
    if (RATE_LIMIT_DISABLED) {
        console.warn(`⚠️ [RateLimit] DISABLED via env (keyPrefix=${keyPrefix}). Do not use in production.`);
        return (req, _res, next) => next();
    }

    // Cho phép override points qua env: RATE_LIMIT_AUTH_LOGIN_POINTS=100
    const overrideKey = `RATE_LIMIT_${keyPrefix.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_POINTS`;
    const effectivePoints = process.env[overrideKey]
        ? parseInt(process.env[overrideKey], 10)
        : points;
    if (effectivePoints !== points) {
        console.log(`ℹ️ [RateLimit] ${keyPrefix} points overridden by ${overrideKey}: ${points} → ${effectivePoints}`);
    }

    const redisLimiter = new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: `rl:${keyPrefix}`,
        points: effectivePoints,
        duration: duration,
        // Fallback sang in-memory nếu Redis không phản hồi
        insuranceLimiter: new RateLimiterMemory({
            points: effectivePoints,
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
                console.error(`⚠️ [RateLimit] Redis Error for ${keyPrefix}:`, rejRes.message);
                return next();
            }

            // RATE LIMIT EXCEEDED
            const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
            res.set('Retry-After', String(secs));
            res.set('X-RateLimit-Limit', String(effectivePoints));
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
