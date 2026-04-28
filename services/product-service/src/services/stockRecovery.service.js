const StockReservation = require('../models/stockReservation.model');
const Product = require('../models/product.model');
const mongoose = require('mongoose');

class StockRecoveryService {
    static startCronJob() {
        console.log('🔄 [Stock Recovery] Starting Cron Job for expired reservations (Every 5 mins)...');
        
        // Chạy mỗi 5 phút (300000 ms)
        setInterval(async () => {
            await this.scanAndRecover();
        }, 5 * 60 * 1000);
        
        // Chạy ngay lần đầu khi khởi động
        this.scanAndRecover();
    }

    static async scanAndRecover() {
        try {
            const now = new Date();
            // Tìm các reservation đã quá hạn nhưng status vẫn là RESERVED
            const expiredReservations = await StockReservation.find({
                expiresAt: { $lt: now },
                status: 'RESERVED'
            });

            if (expiredReservations.length === 0) return;
            console.log(`[Stock Recovery] Found ${expiredReservations.length} expired reservations to recover.`);

            for (const reservation of expiredReservations) {
                await this.recoverStock(reservation);
            }
        } catch (error) {
            console.error('❌ [Stock Recovery] Error during cron scan:', error);
        }
    }

    static async recoverStock(reservation) {
        const session = await mongoose.startSession();
        session.startTransaction({
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority', j: true }
        });

        try {
            // Cập nhật lại status của reservation sang EXPIRED để không bị quét lại (trước khi TTL kịp xóa)
            const updatedReservation = await StockReservation.findOneAndUpdate(
                { _id: reservation._id, status: 'RESERVED' },
                { $set: { status: 'EXPIRED' } },
                { session, new: true }
            );

            if (!updatedReservation) {
                // Có thể một process khác đã xử lý rồi
                throw new Error("Reservation already processed or not found.");
            }

            console.log(`[Stock Recovery] Recovering ${reservation.quantity} for SKU: ${reservation.skuId}`);
            
            // Trả lại kho: tăng availableStock, giảm reservedStock, tăng version
            await Product.updateOne(
                { "variants.skuId": reservation.skuId },
                {
                    $inc: {
                        "variants.$.availableStock": reservation.quantity,
                        "variants.$.reservedStock": -reservation.quantity,
                        "variants.$.version": 1
                    }
                },
                { session }
            );

            await session.commitTransaction();
            console.log(`✅ [Stock Recovery] Successfully recovered stock for SKU: ${reservation.skuId}`);
        } catch (error) {
            await session.abortTransaction();
            // Nếu lỗi do conflict hoặc process khác xử lý, in ra warning thôi
            console.warn(`⚠️ [Stock Recovery] Failed to recover stock for SKU: ${reservation.skuId} - ${error.message}`);
        } finally {
            session.endSession();
        }
    }
}

module.exports = StockRecoveryService;
