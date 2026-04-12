const mongoose = require('mongoose');
const Payment = require('../models/payment.model');
const VNPayService = require('../services/vnpay.service');
const { consumer } = require('../config/kafka');

// Mock Kafka
jest.mock('../config/kafka', () => ({
    producer: {
        send: jest.fn().mockResolvedValue({})
    },
    consumer: {
        subscribe: jest.fn().mockResolvedValue({}),
        run: jest.fn()
    }
}));

// Mock Payment Model
jest.mock('../models/payment.model');

// Mock process.env for VNPay
process.env.VNP_TMN_CODE = 'TEST_TMN';
process.env.VNP_HASH_SECRET = 'TEST_SECRET';
process.env.VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNP_RETURN_URL = 'http://localhost:5004/api/payments/vnpay-return';

describe('Payment Saga Consumer (Unit Mocked)', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create a pending payment record when STOCK_RESERVED event is received', async () => {
        const orderId = new mongoose.Types.ObjectId().toString();
        
        // Mock findOneAndUpdate to return success
        Payment.findOneAndUpdate.mockResolvedValue({ orderId, status: 'PENDING' });

        // Setup Mock Kafka Run Callback
        consumer.run.mockImplementation(async ({ eachMessage }) => {
            const message = {
                value: Buffer.from(JSON.stringify({
                    orderId: orderId,
                    status: 'RESERVED',
                    totalAmount: 50000,
                    timestamp: new Date().toISOString()
                }))
            };
            await eachMessage({ topic: 'stock-events', partition: 0, message });
        });

        // Trigger Consumer
        await VNPayService.listenOrderEvents();

        // Verify DB update called
        expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ orderId }),
            expect.objectContaining({ 
                amount: 50000, 
                status: 'PENDING',
                vnp_TxnRef: expect.stringContaining(orderId) 
            }),
            expect.any(Object)
        );
    });

    it('should ignore events with status other than RESERVED', async () => {
        const orderId = new mongoose.Types.ObjectId().toString();
        
        consumer.run.mockImplementation(async ({ eachMessage }) => {
            const message = {
                value: Buffer.from(JSON.stringify({
                    orderId: orderId,
                    status: 'FAILED',
                    reason: 'Out of stock'
                }))
            };
            await eachMessage({ topic: 'stock-events', partition: 0, message });
        });

        await VNPayService.listenOrderEvents();

        expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });
});
