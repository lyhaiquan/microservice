const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment');
const Payment = require('../models/payment.model');
const { producer, consumer } = require('../config/kafka');

class VNPayService {
    
    // Sort object keys properties
    static sortObject(obj) {
        let sorted = {};
        let str = [];
        let key;
        for (key in obj){
            if (obj.hasOwnProperty(key)) {
            str.push(encodeURIComponent(key));
            }
        }
        str.sort();
        for (key = 0; key < str.length; key++) {
            sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
        }
        return sorted;
    }

    // Generator handler
    static generatePaymentUrl(orderData, reqIp) {
        const { orderId, totalAmount } = orderData;
        const date = new Date();
        const createDate = moment(date).format('YYYYMMDDHHmmss');
        const vnp_TxnRef = `${orderId}_${moment(date).format('HHmmss')}`; // Must be unique

        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = process.env.VNP_TMN_CODE;
        vnp_Params['vnp_Locale'] = 'vn';
        vnp_Params['vnp_CurrCode'] = 'VND';
        vnp_Params['vnp_TxnRef'] = vnp_TxnRef;
        vnp_Params['vnp_OrderInfo'] = `Thanh toan don hang ${orderId}`;
        vnp_Params['vnp_OrderType'] = 'other';
        vnp_Params['vnp_Amount'] = totalAmount * 100;
        vnp_Params['vnp_ReturnUrl'] = process.env.VNP_RETURN_URL;
        vnp_Params['vnp_IpAddr'] = reqIp || '127.0.0.1';
        vnp_Params['vnp_CreateDate'] = createDate;

        vnp_Params = VNPayService.sortObject(vnp_Params);
        
        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac("sha512", process.env.VNP_HASH_SECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex"); 
        vnp_Params['vnp_SecureHash'] = signed;
        let vnpUrl = process.env.VNP_URL;
        vnpUrl += '?' + qs.stringify(vnp_Params, { encode: false });

        return { vnpUrl, vnp_TxnRef };
    }

    // Kafka consumer listener
    static async listenOrderEvents() {
        // Chuyển sang lắng nghe 'stock-events' thay vì 'order-events'
        // Chỉ khi kho đã được giữ thì mới cho phép thanh toán
        await consumer.subscribe({ topic: 'stock-events', fromBeginning: false });
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const stockData = JSON.parse(message.value.toString());
                
                // Chỉ xử lý nếu status là RESERVED
                if (stockData.status !== 'RESERVED') return;

                console.log(`\n💳 [PAYMENT SERVICE] Nhận Stock xác nhận cho Order: ${stockData.orderId} - Sẵn sàng thanh toán.`);
                
                // Giả định chúng ta cần totalAmount từ đâu đó? 
                // Ở event STOCK_RESERVED hiện tại tôi chưa bắn totalAmount.
                // Tôi nên quay lại Product Service cập nhật STOCK_RESERVED payload hoặc 
                // ở đây chúng ta chỉ lưu Payment record.
                
                // TODO: Cần totalAmount để sinh link VNPay. 
                // Cách 1: Truyền totalAmount trong stock-events.
                // Cách 2: Payment Service tự query Order Service (không khuyến khích trong Saga).
                const { vnpUrl, vnp_TxnRef } = VNPayService.generatePaymentUrl({ 
                    orderId: stockData.orderId, 
                    totalAmount: stockData.totalAmount || 0 
                }, '127.0.0.1');

                // Lưu tạm record PENDING
                await Payment.findOneAndUpdate(
                    { orderId: stockData.orderId },
                    { 
                        amount: stockData.totalAmount, 
                        status: 'PENDING',
                        vnp_TxnRef: vnp_TxnRef // Cần thiết để thỏa mãn Schema
                    },
                    { upsert: true, new: true }
                );

                console.log(`🔗 [PAYMENT SERVICE] Link thanh toán VNPAY cho Order ${stockData.orderId}:`);
                console.log(`\x1b[36m%s\x1b[0m`, vnpUrl);
                console.log('--------------------------------------------------\n');
            }
        });
    }

    // IPN / Return processing
    static async processVnPayReturn(vnpayParams) {
        let secureHash = vnpayParams['vnp_SecureHash'];
        
        // Remove hash params for validation
        delete vnpayParams['vnp_SecureHash'];
        delete vnpayParams['vnp_SecureHashType'];

        vnpayParams = VNPayService.sortObject(vnpayParams);

        const secretKey = process.env.VNP_HASH_SECRET;
        const signData = qs.stringify(vnpayParams, { encode: false });
        const hmac = crypto.createHmac("sha512", secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");     

        if(secureHash === signed){
            const responseCode = vnpayParams['vnp_ResponseCode'];
            const txtRef = vnpayParams['vnp_TxnRef']; // orderId_time
            const matchedOrderId = txtRef.split('_')[0]; // Extract orderId
            
            if (responseCode === '00' || responseCode === '07') {
                // Thanh cong
                await Payment.findOneAndUpdate(
                    { orderId: matchedOrderId },
                    { 
                        status: 'COMPLETED',
                        vnp_TxnRef: vnpayParams['vnp_TxnRef'],
                        vnp_TransactionNo: vnpayParams['vnp_TransactionNo'],
                        bankCode: vnpayParams['vnp_BankCode']
                    },
                    { new: true, upsert: true }
                );

                // Publish Event
                await producer.send({
                    topic: 'payment-confirmed',
                    messages: [
                        { value: JSON.stringify({ orderId: matchedOrderId, status: 'PAID' }) }
                    ]
                });
                console.log(`✅ [PAYMENT SERVICE] Đã update thanh toán và bắn event payment-confirmed cho order: ${matchedOrderId}`);

                return { code: '00', message: 'Payment Success', orderId: matchedOrderId };
            } else {
                // That bai
                await Payment.findOneAndUpdate(
                    { orderId: matchedOrderId },
                    { status: 'FAILED' },
                    { upsert: true }
                );
                return { code: responseCode, message: 'Payment Failed', orderId: matchedOrderId };
            }
        } else {
            return { code: '97', message: 'Invalid Signature' };
        }
    }
}

module.exports = VNPayService;
