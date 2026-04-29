const OrderService = require('../services/order.service');

class OrderController {
    static async createOrder(req, res, next) {
        try {
            const { userId, items, totalAmount, checkoutId } = req.body;
            // checkoutId là bắt buộc để tính toán idempotencyKey bên trong service
            const finalCheckoutId = checkoutId || req.headers['x-checkout-id'] || Date.now().toString();

            if (!userId || !items || !Array.isArray(items) || items.length === 0 || totalAmount === undefined) {
                return res.status(400).json({ success: false, message: 'Missing required fields or invalid items' });
            }

            const parsedAmount = parseFloat(totalAmount);
            if (isNaN(parsedAmount) || parsedAmount < 0) {
                 return res.status(400).json({ success: false, message: 'Invalid totalAmount' });
            }

            const order = await OrderService.createOrder(userId, items, parsedAmount, finalCheckoutId);
            return res.status(201).json({ success: true, data: order });
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
