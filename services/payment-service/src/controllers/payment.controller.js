const VNPayService = require('../services/vnpay.service');

class PaymentController {
    static async vnpayReturn(req, res, next) {
        try {
            // Because query is passed from GET URL
            const vnpayParams = { ...req.query };
            const result = await VNPayService.processVnPayReturn(vnpayParams);
            
            if (result.code === '00' || result.code === '07') {
                return res.status(200).json({ success: true, message: result.message, orderId: result.orderId });
            } else if (result.code === '97') {
                 return res.status(400).json({ success: false, message: result.message });
            } else {
                return res.status(400).json({ success: false, message: result.message, code: result.code });
            }
        } catch (error) {
            next(error);
        }
    }
}

module.exports = PaymentController;
