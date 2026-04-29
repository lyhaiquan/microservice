const VNPayService = require('../services/vnpay.service');
const RefundService = require('../services/refund.service');

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

    static async refund(req, res, next) {
        try {
            const result = await RefundService.requestRefund({
                ...req.body,
                idempotencyKey: req.body.idempotencyKey || req.headers['x-idempotency-key'],
                requester: req.user
            });

            return res.status(result.duplicate ? 200 : 201).json({
                success: true,
                is_duplicate: result.duplicate,
                data: result.refund
            });
        } catch (error) {
            if (error.status) {
                return res.status(error.status).json({ success: false, message: error.message });
            }
            next(error);
        }
    }

    static async adminStats(req, res, next) {
        try {
            const Payment = require('../models/payment.model');
            const Refund = require('../models/refund.model');
            const [byStatus, revenue, refunds] = await Promise.all([
                Payment.aggregate([
                    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
                    { $sort: { _id: 1 } }
                ]),
                Payment.aggregate([
                    { $match: { status: { $in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } },
                    { $group: { _id: null, capturedAmount: { $sum: '$amount' }, refundedAmount: { $sum: '$refundedAmount' } } }
                ]),
                Refund.aggregate([
                    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
                    { $sort: { _id: 1 } }
                ])
            ]);

            return res.status(200).json({
                success: true,
                data: {
                    byStatus,
                    revenue: revenue[0] || { capturedAmount: 0, refundedAmount: 0 },
                    refunds
                }
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = PaymentController;
