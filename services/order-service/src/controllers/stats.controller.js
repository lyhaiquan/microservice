const Order = require('../models/order.model');

class StatsController {
    /**
     * Admin Stats: Total revenue over time (weekly, monthly, yearly)
     */
    static async getAdminRevenue(req, res, next) {
        try {
            const { interval = 'month' } = req.query; // week, month, year

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

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Seller Stats: General revenue for a specific seller
     */
    static async getSellerRevenue(req, res, next) {
        try {
            const sellerId = req.user.id; // Lấy từ token (SELLER)

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

            res.status(200).json({
                success: true,
                data: stats[0] || { totalRevenue: 0, totalQuantity: 0, orderCount: 0 }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Seller Stats: Detailed revenue for a specific product
     */
    static async getProductRevenue(req, res, next) {
        try {
            const sellerId = req.user.id;
            const { id: productId } = req.params;

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

            res.status(200).json({
                success: true,
                data: stats[0] || { totalRevenue: 0, totalQuantity: 0 }
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = StatsController;
