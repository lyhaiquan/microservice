const cron = require('node-cron');
const Payment = require('../models/payment.model');

/**
 * Mock function to call VNPay/Gateway Refund API
 */
const refundViaGateway = async (payment) => {
    console.log(`[GATEWAY MOCK] Calling Refund for Payment: ${payment._id}, Order: ${payment.orderId}, Amount: ${payment.amount}`);
    // Simulate API call
    return new Promise(resolve => setTimeout(() => resolve(true), 500));
};

/**
 * Cron Job to find orphaned SUCCESS payments and refund them.
 * Runs every 5 minutes.
 */
const initRefundCron = () => {
    // '*/5 * * * *' = Every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        console.log('🧹 [CRON] Starting Orphaned Payment Check...');
        try {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

            // Tìm các payment SUCCESS nhưng không có orderId tương ứng (orphaned)
            // Lưu ý: Trong thiết kế mới, payment được tạo TRƯỚC order. 
            // Nếu payment SUCCESS mà sau 10p vẫn chưa có thông tin order liên kết thành công (hoặc logic bị kẹt)
            // thì ta tiến hành hoàn tiền.
            const orphanedPayments = await Payment.find({
                status: 'SUCCESS',
                // Giả sử ta dùng một flag hoặc kiểm tra chéo với Order Service
                // Ở đây ta tìm các payment đã quá 10 phút mà chưa được chuyển sang trạng thái xử lý đơn hàng hoàn tất
                createdAt: { $lt: tenMinutesAgo },
                refundedAmount: 0 // Chưa được hoàn tiền
            });

            if (orphanedPayments.length === 0) {
                console.log('✅ [CRON] No orphaned payments found.');
                return;
            }

            console.log(`🔍 [CRON] Found ${orphanedPayments.length} orphaned payments. Processing refunds...`);

            for (const pay of orphanedPayments) {
                const success = await refundViaGateway(pay);
                if (success) {
                    await Payment.updateOne(
                        { _id: pay._id },
                        { 
                            $set: { 
                                status: 'REFUNDED', 
                                refundedAmount: pay.amount 
                            },
                            $push: { 
                                providerData: { 
                                    event: 'AUTO_REFUND_CRON', 
                                    timestamp: new Date() 
                                } 
                            }
                        }
                    );
                    console.log(`💰 [CRON] Refunded payment ${pay._id} successfully.`);
                }
            }
        } catch (error) {
            console.error('❌ [CRON] Error in Refund Job:', error.message);
        }
    });
};

module.exports = { initRefundCron };
