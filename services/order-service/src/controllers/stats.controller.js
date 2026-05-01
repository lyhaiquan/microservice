const Order = require('../models/order.model');
const { redisClient } = require('../../../common');

// Cache TTL cho các stats (giây)
const STATS_CACHE_TTL = 1800; // 30 phút — dữ liệu thống kê ít thay đổi

class StatsController {
    /**
     * Admin Stats: Total revenue over time (weekly, monthly, yearly)
     * Cache key: stats:admin:revenue:<interval>
     */
    static async getAdminRevenue(req, res, next) {
        try {
            const { interval = 'month' } = req.query; // week, month, year
            const cacheKey = `stats:admin:revenue:${interval}`;

            // Check cache
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cached)
                });
            }

            const stats = await Order.aggregate([
                {
                    $match: {
                        status: 'COMPLETED',
                        'pricing.refundedAmount': 0
                    }
                },

                {
                    $group: {
                        _id: {
                            $dateTrunc: {
                                date: "$createdAt",
                                unit: interval
                            }
                        },
                        totalRevenue: { $sum: "$pricing.grandTotal" },
                        orderCount: { $sum: 1 }
                    }
                },
                { $sort: { "_id": 1 } }
            ]);

            // Cache kết quả
            await redisClient.set(cacheKey, JSON.stringify(stats), 'EX', STATS_CACHE_TTL);

            res.status(200).json({
                success: true,
                meta: { source: 'mongodb' },
                data: stats
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Seller Stats: General revenue for a specific seller
     * Cache key: stats:seller:revenue:<sellerId>
     */
    static async getSellerRevenue(req, res, next) {
        try {
            const sellerId = req.user.id; // Lấy từ token (SELLER)
            const cacheKey = `stats:seller:revenue:${sellerId}`;

            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cached)
                });
            }

            const stats = await Order.aggregate([
                { $unwind: "$items" },
                {
                    $match: {
                        "items.sellerId": sellerId,
                        status: 'COMPLETED',
                        "pricing.refundedAmount": 0
                    }
                },

                {
                    $group: {
                        _id: sellerId,
                        totalRevenue: { $sum: "$items.lineTotal" },
                        totalQuantity: { $sum: "$items.quantity" },
                        orderCount: { $addToSet: "$_id" }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        totalRevenue: 1,
                        totalQuantity: 1,
                        orderCount: { $size: "$orderCount" }
                    }
                }
            ]);

            const result = stats[0] || { totalRevenue: 0, totalQuantity: 0, orderCount: 0 };
            await redisClient.set(cacheKey, JSON.stringify(result), 'EX', STATS_CACHE_TTL);

            res.status(200).json({
                success: true,
                meta: { source: 'mongodb' },
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Seller Stats: Detailed revenue for a specific product
     * Cache key: stats:seller:product:<sellerId>:<productId>
     */
    static async getProductRevenue(req, res, next) {
        try {
            const sellerId = req.user.id;
            const { id: productId } = req.params;
            const cacheKey = `stats:seller:product:${sellerId}:${productId}`;

            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cached)
                });
            }

            const stats = await Order.aggregate([
                { $unwind: "$items" },
                {
                    $match: {
                        "items.sellerId": sellerId,
                        "items.skuId": productId,
                        status: 'COMPLETED',
                        "pricing.refundedAmount": 0
                    }
                },

                {
                    $group: {
                        _id: productId,
                        productName: { $first: "$items.productNameSnapshot" },
                        totalRevenue: { $sum: "$items.lineTotal" },
                        totalQuantity: { $sum: "$items.quantity" }
                    }
                }
            ]);

            const result = stats[0] || { totalRevenue: 0, totalQuantity: 0 };
            await redisClient.set(cacheKey, JSON.stringify(result), 'EX', STATS_CACHE_TTL);

            res.status(200).json({
                success: true,
                meta: { source: 'mongodb' },
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = StatsController;
