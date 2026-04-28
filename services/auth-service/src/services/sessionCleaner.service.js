const User = require('../models/User');

class SessionCleanerService {
    static startCronJob() {
        console.log('🧹 [Session Cleaner] Starting Cron Job for expired sessions (Every 1 hour)...');
        
        // Chạy mỗi giờ (3600000 ms)
        setInterval(async () => {
            await this.cleanExpiredSessions();
        }, 60 * 60 * 1000);
        
        // Chạy ngay lần đầu khi khởi động
        this.cleanExpiredSessions();
    }

    static async cleanExpiredSessions() {
        try {
            const now = new Date();
            
            // Xóa tất cả các sessions trong mảng sessions của mọi User có expiresAt < now
            const result = await User.updateMany(
                { "sessions.expiresAt": { $lt: now } },
                { $pull: { sessions: { expiresAt: { $lt: now } } } }
            );

            if (result.modifiedCount > 0) {
                console.log(`✅ [Session Cleaner] Cleaned expired sessions for ${result.modifiedCount} users.`);
            }
        } catch (error) {
            console.error('❌ [Session Cleaner] Error during cron scan:', error);
        }
    }
}

module.exports = SessionCleanerService;
