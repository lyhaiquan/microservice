const IdempotencyRecord = require('../models/idempotencyRecord.model');
const crypto = require('crypto');

/**
 * Middleware chống trùng lặp request.
 * Header yêu cầu: 'x-idempotency-key'
 */
const idempotencyMiddleware = (actionName) => {
    return async (req, res, next) => {
        const idempotencyKey = req.headers['x-idempotency-key'];
        
        if (!idempotencyKey) {
            return res.status(400).json({ success: false, message: 'Missing x-idempotency-key header' });
        }

        // Tạo khóa băm duy nhất dựa trên idempotency key, user id và action name
        const userId = req.user ? req.user.id : 'anonymous'; // Giả sử đã qua auth middleware
        const hash = crypto.createHash('sha256').update(`${userId}:${idempotencyKey}:${actionName}`).digest('hex');

        try {
            // Kiểm tra record đã tồn tại chưa
            const existingRecord = await IdempotencyRecord.findById(hash);
            
            if (existingRecord) {
                // Nếu request đã được xử lý thành công trước đó
                if (existingRecord.result) {
                    console.log(`[Idempotency] Returning cached response for action: ${actionName}`);
                    return res.status(200).json({
                        success: true,
                        meta: { cached: true },
                        data: existingRecord.result
                    });
                }
                
                // Nếu request đang xử lý dở dang (ví dụ gọi 2 phát quá nhanh, phát 1 chưa kịp xong)
                return res.status(409).json({
                    success: false,
                    message: 'Request is already being processed.'
                });
            }

            // Ghi nhận record pending (TTL 7 days)
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await IdempotencyRecord.create({
                _id: hash,
                userId,
                action: actionName,
                result: null, // Đánh dấu là đang pending
                expiresAt
            });

            // Patch res.json để tự động cập nhật kết quả vào record khi hoàn thành
            const originalJson = res.json;
            res.json = async function (data) {
                // Chỉ lưu kết quả nếu request thành công (success: true)
                if (data && data.success) {
                    try {
                        await IdempotencyRecord.findByIdAndUpdate(hash, {
                            $set: { result: data.data || data }
                        });
                    } catch (err) {
                        console.error('[Idempotency] Failed to save result:', err);
                    }
                } else {
                    // Nếu lỗi (ví dụ 400 Bad Request), xóa record để user có thể thử lại
                    try {
                        await IdempotencyRecord.findByIdAndDelete(hash);
                    } catch (err) {
                        console.error('[Idempotency] Failed to delete failed record:', err);
                    }
                }
                
                return originalJson.call(this, data);
            };

            next();
        } catch (error) {
            console.error('[Idempotency] Middleware Error:', error);
            // Nếu lỗi database, có thể cho qua hoặc block tùy business, thường nên cho qua
            next();
        }
    };
};

module.exports = idempotencyMiddleware;
