const OrderService = require('../services/order.service');

class OrderController {
    static async createOrder(req, res, next) {
        try {
            const { userId: bodyUserId, items, totalAmount, idempotencyKey: bodyKey } = req.body;
            const userId = req.user ? req.user.id : bodyUserId;
            const idempotencyKey = bodyKey || req.headers['x-idempotency-key'];

            if (!userId || !items || !Array.isArray(items) || items.length === 0 || totalAmount === undefined) {
                return res.status(400).json({ success: false, message: 'Missing required fields or invalid items' });
            }

            const parsedAmount = Number(totalAmount);
            if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
                return res.status(400).json({ success: false, message: 'Invalid totalAmount' });
            }

            const scopedKey = idempotencyKey ? `${userId}:${idempotencyKey}` : undefined;
            if (scopedKey) {
                const existingOrder = await OrderService.getOrderByKey(scopedKey);
                if (existingOrder) {
                    return res.status(200).json({
                        success: true,
                        is_duplicate: true,
                        data: existingOrder
                    });
                }
            }

            const order = await OrderService.createOrder(userId, items, parsedAmount, scopedKey);
            return res.status(201).json({ success: true, data: order });
        } catch (error) {
            if (error.status) {
                return res.status(error.status).json({ success: false, message: error.message });
            }

            if (error.code === 11000) {
                const key = req.body.idempotencyKey || req.headers['x-idempotency-key'];
                const userId = req.user ? req.user.id : req.body.userId;
                const existingOrder = await OrderService.getOrderByKey(key ? `${userId}:${key}` : undefined);
                return res.status(200).json({ success: true, is_duplicate: true, data: existingOrder });
            }

            next(error);
        }
    }

    static async getOrderById(req, res, next) {
        try {
            const { id } = req.params;
            const order = await OrderService.getOrderById(id);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            const isAdmin = req.user && req.user.roles && req.user.roles.includes('ADMIN');
            if (!isAdmin && order.userId !== req.user.id) {
                return res.status(403).json({ success: false, message: 'Cannot access another user order' });
            }

            return res.status(200).json({ success: true, data: order });
        } catch (error) {
            next(error);
        }
    }

    static async adminStats(req, res, next) {
        try {
            const Order = require('../models/order.model');
            const [totalOrders, byStatus, revenue] = await Promise.all([
                Order.countDocuments({}),
                Order.aggregate([
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]),
                Order.aggregate([
                    { $match: { status: { $in: ['PAID', 'SHIPPING', 'COMPLETED'] } } },
                    { $group: { _id: null, grossRevenue: { $sum: '$pricing.grandTotal' } } }
                ])
            ]);

            return res.status(200).json({
                success: true,
                data: {
                    totalOrders,
                    byStatus,
                    grossRevenue: revenue[0] ? revenue[0].grossRevenue : 0
                }
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = OrderController;
