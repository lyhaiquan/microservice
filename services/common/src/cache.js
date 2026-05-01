const redisClient = require('./redis');

/**
 * Set cache + track key vào index set để invalidate hàng loạt mà KHÔNG cần
 * `KEYS *` (KEYS là O(N) blocking — production sẽ freeze Redis).
 *
 * @param {string} indexSet - tên SET chứa danh sách key thuộc cùng nhóm
 * @param {string} key      - key cần cache
 * @param {string} value    - giá trị (đã JSON.stringify nếu cần)
 * @param {number} ttl      - giây
 */
async function setTracked(indexSet, key, value, ttl) {
    const pipeline = redisClient.pipeline();
    pipeline.set(key, value, 'EX', ttl);
    pipeline.sadd(indexSet, key);
    // Đảm bảo index set không tồn tại vĩnh viễn — TTL dài hơn key một chút.
    pipeline.expire(indexSet, ttl + 60);
    await pipeline.exec();
}

/**
 * Xoá toàn bộ key trong index set + xoá luôn index set. Dùng SUNION/SMEMBERS
 * với SREM batched, tránh KEYS hoàn toàn.
 *
 * @param {string|string[]} indexSets
 */
async function invalidateGroup(indexSets) {
    const sets = Array.isArray(indexSets) ? indexSets : [indexSets];
    if (sets.length === 0) return 0;

    const keys = await redisClient.sunion(sets);
    if (keys.length === 0) {
        await redisClient.del(sets);
        return 0;
    }

    // Batch DEL theo chunk để tránh command quá lớn.
    const CHUNK = 500;
    const pipeline = redisClient.pipeline();
    for (let i = 0; i < keys.length; i += CHUNK) {
        pipeline.del(...keys.slice(i, i + CHUNK));
    }
    pipeline.del(...sets);
    await pipeline.exec();
    return keys.length;
}

/**
 * Single-flight cache: nếu nhiều request đồng thời cùng miss cache, chỉ một
 * request gọi `loader()`, các request khác chờ kết quả. Tránh cache stampede.
 *
 * @param {string} key
 * @param {number} ttl
 * @param {Function} loader  - async () => freshValue
 * @param {object} opts      - { lockTtl: 5, waitMs: 50, maxWait: 2000, indexSet?: string }
 */
async function getOrLoad(key, ttl, loader, opts = {}) {
    const { lockTtl = 5, waitMs = 50, maxWait = 2000, indexSet = null } = opts;

    const cached = await redisClient.get(key);
    if (cached !== null) return { value: JSON.parse(cached), source: 'redis' };

    const lockKey = `lock:${key}`;
    const gotLock = await redisClient.set(lockKey, '1', 'EX', lockTtl, 'NX');

    if (gotLock) {
        try {
            const fresh = await loader();
            const serialized = JSON.stringify(fresh);
            if (indexSet) {
                await setTracked(indexSet, key, serialized, ttl);
            } else {
                await redisClient.set(key, serialized, 'EX', ttl);
            }
            return { value: fresh, source: 'mongodb' };
        } finally {
            await redisClient.del(lockKey);
        }
    }

    // Không lấy được lock → chờ ngắn rồi đọc cache. Nếu vẫn miss, fallback gọi loader.
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, waitMs));
        const v = await redisClient.get(key);
        if (v !== null) return { value: JSON.parse(v), source: 'redis-wait' };
    }
    const fresh = await loader();
    return { value: fresh, source: 'mongodb-fallback' };
}

module.exports = { setTracked, invalidateGroup, getOrLoad, redisClient };
