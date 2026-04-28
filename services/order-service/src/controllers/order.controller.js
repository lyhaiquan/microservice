const OrderService = require('../services/order.service');

class OrderController {
    static async createOrder(req, res, next) {
        try {
            const { userId, items, totalAmount, idempotencyKey: bodyKey } = req.body;
            const idempotencyKey = bodyKey || req.headers['x-idempotency-key'];

            if (!userId || !items || !Array.isArray(items) || items.length === 0 || totalAmount === undefined) {
                return res.status(400).json({ success: false, message: 'Missing required fields or invalid items' });
            }

            // --- 1. Kiểm tra Idempotency Key ---
            if (idempotencyKey) {
                const existingOrder = await OrderService.getOrderByKey(idempotencyKey);
                if (existingOrder) {
                    console.log(`♻️  Idempotency hit: Returning existing order ${existingOrder._id}`);
                    return res.status(200).json({ 
                        success: true, 
                        is_duplicate: true,
                        data: existingOrder 
                    });
                }
            }

            const parsedAmount = parseFloat(totalAmount);
            if (isNaN(parsedAmount) || parsedAmount < 0) {
                 return res.status(400).json({ success: false, message: 'Invalid totalAmount' });
            }

            const order = await OrderService.createOrder(userId, items, parsedAmount, idempotencyKey);
            return res.status(201).json({ success: true, data: order });
        } catch (error) {
            // Xử lý lỗi hết hàng từ Product Service
            if (error.status === 400) {
                return res.status(400).json({ success: false, message: error.message });
            }
            // Xử lý lỗi trùng lặp (nếu có Race Condition lọt qua bước check trên)
            if (error.code === 11000) {
                const existingOrder = await OrderService.getOrderByKey(req.body.idempotencyKey || req.headers['x-idempotency-key']);
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
            return res.status(200).json({ success: true, data: order });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = OrderController;
