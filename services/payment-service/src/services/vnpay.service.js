const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment');
const Payment = require('../models/payment.model');
const { producer, consumer } = require('../config/kafka');
const eventUtils = require('../../../common/src/events/processedEvent.util');

class VNPayService {
    static sortObject(obj) {
        const sorted = {};
        const keys = Object.keys(obj).map(key => encodeURIComponent(key)).sort();
        for (const key of keys) {
            sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
        }
        return sorted;
    }

    static extractOrderId(txnRef) {
        if (!txnRef) return null;
        const lastSeparator = txnRef.lastIndexOf('_');
        return lastSeparator === -1 ? txnRef : txnRef.slice(0, lastSeparator);
    }

    static generatePaymentUrl(orderData, reqIp) {
        const { orderId, totalAmount } = orderData;
        const date = new Date();
        const createDate = moment(date).format('YYYYMMDDHHmmss');
        const vnp_TxnRef = `${orderId}_${moment(date).format('HHmmss')}`;

        let vnp_Params = {};
        vnp_Params.vnp_Version = '2.1.0';
        vnp_Params.vnp_Command = 'pay';
        vnp_Params.vnp_TmnCode = process.env.VNP_TMN_CODE;
        vnp_Params.vnp_Locale = 'vn';
        vnp_Params.vnp_CurrCode = 'VND';
        vnp_Params.vnp_TxnRef = vnp_TxnRef;
        vnp_Params.vnp_OrderInfo = `Thanh toan don hang ${orderId}`;
        vnp_Params.vnp_OrderType = 'other';
        vnp_Params.vnp_Amount = Number(totalAmount || 0) * 100;
        vnp_Params.vnp_ReturnUrl = process.env.VNP_RETURN_URL;
        vnp_Params.vnp_IpAddr = reqIp || '127.0.0.1';
        vnp_Params.vnp_CreateDate = createDate;

        vnp_Params = VNPayService.sortObject(vnp_Params);

        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', process.env.VNP_HASH_SECRET || 'TEST_SECRET');
        vnp_Params.vnp_SecureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        const vnpUrl = `${process.env.VNP_URL}?${qs.stringify(vnp_Params, { encode: false })}`;
        return {
            vnpUrl,
            vnp_TxnRef,
            toString() {
                return vnpUrl;
            },
            includes(value) {
                return vnpUrl.includes(value);
            }
        };
    }

    static async handleStockReserved(stockData) {
        if (stockData.type !== 'STOCK_RESERVED' && stockData.status !== 'RESERVED') return;

        const eventMeta = {
            source: 'product-service',
            eventType: stockData.type || 'STOCK_RESERVED',
            aggregateId: stockData.orderId,
            eventId: stockData.eventId
        };
        if (await eventUtils.hasEventProcessed(eventMeta)) return;

        const { vnpUrl, vnp_TxnRef } = VNPayService.generatePaymentUrl({
            orderId: stockData.orderId,
            totalAmount: stockData.totalAmount || 0
        }, '127.0.0.1');

        await Payment.findOneAndUpdate(
            { orderId: stockData.orderId },
            {
                $setOnInsert: {
                    _id: `PAY_${stockData.orderId}`,
                    orderId: stockData.orderId,
                    userId: stockData.userId,
                    userRegion: stockData.userRegion || 'SOUTH',
                    provider: 'VNPAY'
                },
                $set: {
                    amount: Number(stockData.totalAmount || 0),
                    status: 'PENDING',
                    providerRef: vnp_TxnRef,
                    vnp_TxnRef
                }
            },
            { upsert: true, new: true }
        );
        await eventUtils.markEventProcessed(eventMeta);

        console.log(`[Payment] VNPay URL for order ${stockData.orderId}: ${vnpUrl}`);
    }

    static async listenOrderEvents() {
        await consumer.subscribe({ topic: 'stock-events', fromBeginning: false });
        await consumer.run({
            eachMessage: async ({ message }) => {
                const stockData = JSON.parse(message.value.toString());
                await VNPayService.handleStockReserved(stockData);
            }
        });
    }

    static async processVnPayReturn(vnpayParams) {
        const secureHash = vnpayParams.vnp_SecureHash;
        delete vnpayParams.vnp_SecureHash;
        delete vnpayParams.vnp_SecureHashType;

        const sortedParams = VNPayService.sortObject(vnpayParams);
        const signData = qs.stringify(sortedParams, { encode: false });
        const hmac = crypto.createHmac('sha512', process.env.VNP_HASH_SECRET || 'TEST_SECRET');
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        if (secureHash !== signed) {
            return { code: '97', message: 'Invalid Signature' };
        }

        const responseCode = vnpayParams.vnp_ResponseCode;
        const matchedOrderId = VNPayService.extractOrderId(vnpayParams.vnp_TxnRef);

        if (responseCode === '00' || responseCode === '07') {
            await Payment.findOneAndUpdate(
                { orderId: matchedOrderId },
                {
                    $setOnInsert: {
                        _id: `PAY_${matchedOrderId}`,
                        orderId: matchedOrderId,
                        userId: vnpayParams.userId || 'unknown',
                        userRegion: 'SOUTH',
                        provider: 'VNPAY',
                        amount: Number(vnpayParams.vnp_Amount || 0) / 100
                    },
                    $set: {
                        status: 'SUCCESS',
                        providerRef: vnpayParams.vnp_TxnRef,
                        providerTransactionNo: vnpayParams.vnp_TransactionNo,
                        vnp_TxnRef: vnpayParams.vnp_TxnRef,
                        vnp_TransactionNo: vnpayParams.vnp_TransactionNo,
                        bankCode: vnpayParams.vnp_BankCode,
                        providerData: vnpayParams
                    }
                },
                { new: true, upsert: true }
            );

            await producer.send({
                topic: 'payment-confirmed',
                messages: [{
                    key: matchedOrderId,
                    value: JSON.stringify({
                        eventId: `PAYMENT_PAID:${matchedOrderId}`,
                        orderId: matchedOrderId,
                        paymentId: `PAY_${matchedOrderId}`,
                        status: 'PAID'
                    })
                }]
            });

            return { code: '00', message: 'Payment Success', orderId: matchedOrderId };
        }

        await Payment.findOneAndUpdate(
            { orderId: matchedOrderId },
            {
                $setOnInsert: {
                    _id: `PAY_${matchedOrderId}`,
                    orderId: matchedOrderId,
                    userId: vnpayParams.userId || 'unknown',
                    userRegion: 'SOUTH',
                    provider: 'VNPAY',
                    amount: Number(vnpayParams.vnp_Amount || 0) / 100
                },
                $set: {
                    status: 'FAILED',
                    providerData: vnpayParams
                }
            },
            { upsert: true }
        );

        await producer.send({
            topic: 'payment-confirmed',
            messages: [{
                key: matchedOrderId,
                value: JSON.stringify({
                    eventId: `PAYMENT_FAILED:${matchedOrderId}`,
                    orderId: matchedOrderId,
                    status: 'FAILED'
                })
            }]
        });

        return { code: responseCode, message: 'Payment Failed', orderId: matchedOrderId };
    }
}

module.exports = VNPayService;
