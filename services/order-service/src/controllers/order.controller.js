const OrderService = require('../services/order.service');
const { redisClient, invalidateGroup } = require('../../../common/src/cache');

const IDX_STATS = 'idx:orders:stats';

// Cache ngắn cho order detail vì status thay đổi thường xuyên
const ORDER_CACHE_TTL = 10; // 10 giây

class OrderController {
    static async createOrder(req, res, next) {
        try {
            const { userId, items, totalAmount, checkoutId, idempotencyKey } = req.body;
            const headerKey = req.headers['x-idempotency-key'];
            const finalIdemKey = idempotencyKey || headerKey;
            // checkoutId là bắt buộc để tính toán idempotencyKey bên trong service
            const finalCheckoutId = checkoutId || req.headers['x-checkout-id'] || Date.now().toString();

            if (!userId || !items || !Array.isArray(items) || items.length === 0 || totalAmount === undefined) {
                return res.status(400).json({ success: false, message: 'Missing required fields or invalid items' });
            }

            const parsedAmount = parseFloat(totalAmount);
            if (isNaN(parsedAmount) || parsedAmount < 0) {
                 return res.status(400).json({ success: false, message: 'Invalid totalAmount' });
            }

            const result = await OrderService.createOrder(
                userId, items, parsedAmount, finalCheckoutId,
                { idempotencyKey: finalIdemKey }
            );

            // Cache hit -> trả 200 + is_duplicate flag (KHÔNG invalidate stats vì không có thay đổi DB)
            if (result.cached) {
                return res.status(200).json({
                    success: true,
                    is_duplicate: true,
                    data: result.order
                });
            }

            // Invalidate stats cache khi có order mới. Dùng SET-based index thay vì
            // KEYS 'stats:*' (KEYS là O(N) blocking trên toàn keyspace).
            // stats.controller.js phải set cache qua setTracked(IDX_STATS, ...) để hoạt động.
            await invalidateGroup(IDX_STATS);

            return res.status(201).json({ success: true, data: result.order });
        } catch (error) {
            // Xử lý lỗi hết hàng hoặc lỗi nghiệp vụ khác
            if (error.message.includes('không đủ hàng')) {
                return res.status(400).json({ success: false, message: error.message });
            }
            next(error);
        }
    }

    static async getOrderById(req, res, next) {
        try {
            const { id } = req.params;

            // Cache per-order (TTL ngắn vì status thay đổi)
            const cacheKey = `order:detail:${id}`;
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cached)
                });
            }

            const order = await OrderService.getOrderById(id);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            await redisClient.set(cacheKey, JSON.stringify(order), 'EX', ORDER_CACHE_TTL);

            return res.status(200).json({
                success: true,
                meta: { source: 'mongodb' },
                data: order
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = OrderController;
