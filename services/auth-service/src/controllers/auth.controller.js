const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { generateHmac } = require('../../../common/src/security/crypto.util');

class AuthController {
    static signToken(user) {
        return jwt.sign(
            { id: user._id, roles: user.roles },
            process.env.JWT_SECRET || 'quan_ptit_2026_pro_key',
            { expiresIn: '7d' }
        );
    }

    static sanitizeRoles(roles) {
        if (!Array.isArray(roles) || roles.length === 0) return ['BUYER'];
        const allowedSelfRoles = roles.filter(role => ['BUYER', 'SELLER'].includes(role));
        return allowedSelfRoles.length > 0 ? allowedSelfRoles : ['BUYER'];
    }

    static async register(req, res, next) {
        try {
            const { email, password, fullName, name, region, roles } = req.body;
            const displayName = fullName || name;

            if (!email || !password || !displayName || !region) {
                return res.status(400).json({ message: 'Missing required fields' });
            }

            const globalSalt = process.env.GLOBAL_EMAIL_SALT || 'shopee_global_salt_123';
            const emailHmac = generateHmac(email, globalSalt);

            const existingUser = await User.findOne({ emailHmac });
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            const user = new User({
                email,
                emailHmac,
                perUserSalt: crypto.randomBytes(16).toString('hex'),
                fullName: displayName,
                region,
                roles: AuthController.sanitizeRoles(roles),
                credentials: { passwordHash: password }
            });
            await user.save();

            const token = AuthController.signToken(user);

            return res.status(201).json({
                message: 'User registered successfully',
                token,
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    region: user.region,
                    roles: user.roles
                }
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

            const token = AuthController.signToken(user);

            const sessionId = crypto.randomBytes(16).toString('hex');
            const newSession = {
                sessionId,
                refreshTokenHash: crypto.createHash('sha256').update(`${sessionId}:${token}`).digest('hex'),
                deviceFingerprint: req.headers['user-agent'] || 'unknown',
                createdIpPrefix: req.ip || '0.0.0.0',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            };

            await User.updateOne(
                { _id: user._id },
                {
                    $push: {
                        sessions: {
                            $each: [newSession],
                            $sort: { createdAt: -1 },
                            $slice: 5
                        }
                    }
                }
            );

            return res.status(200).json({
                message: 'Login successful',
                token,
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    region: user.region,
                    roles: user.roles
                }
            });
        } catch (error) {
            next(error);
        }
    }

    static async logoutEverywhere(req, res, next) {
        try {
            const userId = req.user.id;

            await User.updateOne(
                { _id: userId },
                { $set: { 'sessions.$[].isRevoked': true, 'sessions.$[].revokedAt': new Date() } }
            );

            return res.status(200).json({
                success: true,
                message: 'Successfully logged out from all devices.'
            });
        } catch (error) {
            next(error);
        }
    }

    static async adminStats(req, res, next) {
        try {
            const [totalUsers, activeUsers, bannedUsers, byRole] = await Promise.all([
                User.countDocuments({}),
                User.countDocuments({ status: 'ACTIVE' }),
                User.countDocuments({ status: 'BANNED' }),
                User.aggregate([
                    { $unwind: '$roles' },
                    { $group: { _id: '$roles', count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ])
            ]);

            return res.status(200).json({
                success: true,
                data: {
                    totalUsers,
                    activeUsers,
                    bannedUsers,
                    byRole
                }
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = AuthController;
