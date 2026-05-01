const VNPayService = require('../services/vnpay.service');
const Payment = require('../models/payment.model');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const crypto = require('crypto');
const qs = require('qs');

jest.mock('../config/kafka', () => {
    return {
        producer: {
            send: jest.fn().mockResolvedValue({})
        },
        consumer: {
            subscribe: jest.fn(),
            run: jest.fn()
        },
        connectKafka: jest.fn()
    };
});

const { producer } = require('../config/kafka');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    
    process.env.VNP_TMN_CODE = 'GUHO01S5';
    process.env.VNP_HASH_SECRET = 'IFG6MHMPGZMJKE20TZ2EF3Q737LLBM';
    process.env.VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    process.env.VNP_RETURN_URL = 'http://localhost:8081/api/payments/vnpay-return';
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await Payment.deleteMany({});
    jest.clearAllMocks();
});

describe('VNPay Service', () => {
    it('should calculate valid VNPAY hash and payment URL', () => {
        const orderData = { orderId: 'O123', totalAmount: '50000' };
        const url = VNPayService.generatePaymentUrl(orderData, '1.1.1.1');
        
        expect(url).toContain(process.env.VNP_URL);
        expect(url).toContain('vnp_SecureHash=');
        expect(url).toContain('vnp_Amount=5000000'); 
        expect(url).toContain('vnp_OrderInfo');
    });

    it('should verify correct signature from valid return URL and update status to COMPLETED', async () => {
        let fakeParams = {
            vnp_Amount: '5000000',
            vnp_BankCode: 'NCB',
            vnp_BankTranNo: 'VNP1370252',
            vnp_CardType: 'ATM',
            vnp_OrderInfo: 'Thanh toan don hang O123',
            vnp_PayDate: '20230219150000',
            vnp_ResponseCode: '00',
            vnp_TmnCode: 'GUHO01S5',
            vnp_TransactionNo: '1370252',
            vnp_TransactionStatus: '00',
            vnp_TxnRef: 'O123_120000'
        };

        const sorted = VNPayService.sortObject(fakeParams);
        const signData = qs.stringify(sorted, { encode: false });
        const hmac = crypto.createHmac("sha512", process.env.VNP_HASH_SECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex"); 

        fakeParams['vnp_SecureHash'] = signed;
        fakeParams['vnp_SecureHashType'] = 'SHA512';

        const result = await VNPayService.processVnPayReturn(fakeParams);

        expect(result.code).toBe('00');
        expect(result.message).toBe('Payment Success');
        expect(result.orderId).toBe('O123');
        
        const payment = await Payment.findOne({ orderId: 'O123' });
        expect(payment).not.toBeNull();
        expect(payment.status).toBe('COMPLETED');
        expect(payment.vnp_TransactionNo).toBe('1370252');

        expect(producer.send).toHaveBeenCalledTimes(1);
        const args = producer.send.mock.calls[0][0];
        expect(args.topic).toBe('payment-confirmed');
        const eventValue = JSON.parse(args.messages[0].value);
        expect(eventValue.orderId).toBe('O123');
        expect(eventValue.status).toBe('PAID');
    });

    it('should reject invalid signature', async () => {
        let fakeParams = {
            vnp_ResponseCode: '00',
            vnp_TxnRef: 'O123_120000',
            vnp_SecureHash: 'fakehaxinvalid123'
        };

        const result = await VNPayService.processVnPayReturn(fakeParams);
        expect(result.code).toBe('97');
        expect(result.message).toBe('Invalid Signature');
    });

    it('should save failed payment state if signature is valid but response code is not 00', async () => {
        let fakeParams = {
            vnp_Amount: '5000000',
            vnp_ResponseCode: '24', // User cancelled
            vnp_TxnRef: 'O999_120000'
        };

        const sorted = VNPayService.sortObject(fakeParams);
        const signData = qs.stringify(sorted, { encode: false });
        const hmac = crypto.createHmac("sha512", process.env.VNP_HASH_SECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex"); 

        fakeParams['vnp_SecureHash'] = signed;

        const result = await VNPayService.processVnPayReturn(fakeParams);

        expect(result.code).toBe('24');
        expect(result.message).toBe('Payment Failed');
        
        const payment = await Payment.findOne({ orderId: 'O999' });
        expect(payment).not.toBeNull();
        expect(payment.status).toBe('FAILED');
    });
});
