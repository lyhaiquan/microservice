const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { generateHmac } = require('../../../common/src/security/crypto.util');

class AuthController {
    static async register(req, res, next) {
        try {
            const { email, password, fullName, region } = req.body;

            if (!email || !password || !fullName || !region) {
                return res.status(400).json({ message: 'Missing required fields' });
            }

            // Sinh random salt để hash email trước khi query (giúp tìm xem user có tồn tại chưa)
            // Tuy nhiên, để tìm user tồn tại, ta cần query dựa trên 1 email đã mã hóa.
            // Vì perUserSalt sinh ngẫu nhiên mỗi lần tạo, ta không thể tìm theo Hmac nếu không biết salt.
            // TRONG THỰC TẾ (PII search): Nếu không có common salt, không thể search được email gốc.
            // Để khắc phục: generateHmac cần có 1 GLOBAL_SALT cho field `emailHmac` thì mới tra cứu được.
            // (Đã cập nhật logic crypto.util.js hoặc ta sẽ query toàn bộ - Không, ta sẽ dùng GLOBAL_SALT)
            
            // Giả định: Ta dùng global salt cho việc hash email
            const globalSalt = process.env.GLOBAL_EMAIL_SALT || 'shopee_global_salt_123';
            const emailHmac = generateHmac(email, globalSalt);

            const existingUser = await User.findOne({ emailHmac });
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            const perUserSalt = crypto.randomBytes(16).toString('hex');

            const user = new User({ 
                email, // Sẽ được model encrypt
                emailHmac, // Thay thế logic trong pre-save bằng giá trị ta truyền vào
                perUserSalt,
                fullName, 
                region,
                credentials: { passwordHash: password } // Model sẽ hash bằng argon2
            });
            await user.save();

            res.status(201).json({
                message: 'User registered successfully',
                user: { id: user._id, fullName: user.fullName }
            });
        } catch (error) {
            next(error);
        }
    }

    static async login(req, res, next) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ message: 'Missing email or password' });
            }

            const globalSalt = process.env.GLOBAL_EMAIL_SALT || 'shopee_global_salt_123';
            const emailHmac = generateHmac(email, globalSalt);

            const user = await User.findOne({ emailHmac });
            if (!user) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            // Tạo Token
            const token = jwt.sign(
                { id: user._id, roles: user.roles },
                process.env.JWT_SECRET || 'quan_ptit_2026_pro_key',
                { expiresIn: '7d' }
            );

            // Ghi nhận Session mới
            const sessionId = crypto.randomBytes(16).toString('hex');
            const newSession = {
                sessionId,
                refreshTokenHash: 'hash_of_refresh_token', // Giả lập refreshToken
                deviceFingerprint: req.headers['user-agent'] || 'unknown',
                createdIpPrefix: req.ip || '0.0.0.0',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            };

            // Quản lý mảng Sessions (Giữ tối đa 5 sessions)
            // Trick Mongoose: Push vào đầu, nếu vượt quá 5 thì tự cắt bớt mảng
            await User.updateOne(
                { _id: user._id },
                {
                    $push: {
                        sessions: {
                            $each: [newSession],
                            $sort: { createdAt: -1 }, // Sắp xếp mới nhất lên đầu
                            $slice: 5 // Giữ lại đúng 5 phần tử mới nhất
                        }
                    }
                }
            );

            res.status(200).json({
                message: 'Login successful',
                token,
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    region: user.region
                }
            });
        } catch (error) {
            next(error);
        }
    }

    static async logoutEverywhere(req, res, next) {
        try {
            const userId = req.user.id; // Lấy từ middleware verify token
            
            await User.updateOne(
                { _id: userId },
                { $set: { "sessions.$[].isRevoked": true, "sessions.$[].revokedAt": new Date() } }
            );

            res.status(200).json({
                success: true,
                message: 'Successfully logged out from all devices.'
            });
        } catch (error) {
            next(error);
        }
    }

    // ============================================
    // ADMIN APIs
    // ============================================

    static async getPendingSellers(req, res, next) {
        try {
            const pendingSellers = await User.find({
                roles: 'SELLER',
                status: 'PENDING'
            }).select('-credentials -sessions');

            res.status(200).json({
                success: true,
                data: pendingSellers
            });
        } catch (error) {
            next(error);
        }
    }

    static async approveSeller(req, res, next) {
        try {
            const { id } = req.params;
            const user = await User.findOneAndUpdate(
                { _id: id, roles: 'SELLER', status: 'PENDING' },
                { status: 'ACTIVE' },
                { new: true }
            );

            if (!user) {
                return res.status(404).json({ message: 'Pending seller not found' });
            }

            res.status(200).json({
                success: true,
                message: 'Seller approved successfully',
                data: { id: user._id, status: user.status }
            });
        } catch (error) {
            next(error);
        }
    }

    static async banUser(req, res, next) {
        try {
            const { id } = req.params;
            
            // Set status to BANNED and revoke all sessions
            const user = await User.findByIdAndUpdate(
                id,
                { 
                    status: 'BANNED',
                    $set: { 
                        "sessions.$[].isRevoked": true, 
                        "sessions.$[].revokedAt": new Date() 
                    }
                },
                { new: true }
            );

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            res.status(200).json({
                success: true,
                message: 'User banned and all sessions revoked',
                data: { id: user._id, status: user.status }
            });
        } catch (error) {
            next(error);
        }
    }
}


module.exports = AuthController;
