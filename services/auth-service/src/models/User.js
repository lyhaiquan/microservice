const mongoose = require('mongoose');
const argon2 = require('argon2');
const crypto = require('crypto');
const { encrypt, decrypt, generateHmac } = require('../../../common/src/security/crypto.util');

const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    refreshTokenHash: { type: String, required: true },
    deviceFingerprint: { type: String },
    createdIpPrefix: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

const addressSchema = new mongoose.Schema({
    addressId: { type: String, required: true },
    receiverName: { type: String, required: true },
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    street: { type: String, required: true },
    isDefault: { type: Boolean, default: false }
}, { _id: false });

const userSchema = new mongoose.Schema({
    email: {
        iv: { type: String },
        ciphertext: { type: String },
        authTag: { type: String } 
    },
    emailHmac: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    perUserSalt: {
        type: String,
        required: true
    },
    phone: {
        iv: { type: String },
        ciphertext: { type: String },
        authTag: { type: String }
    },
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    region: {
        type: String,
        enum: ['NORTH', 'CENTRAL', 'SOUTH'],
        required: true
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'BANNED', 'PENDING'],
        default: 'ACTIVE'
    },
    roles: [{
        type: String,
        enum: ['BUYER', 'SELLER', 'ADMIN'],
        default: 'BUYER'
    }],
    addresses: [addressSchema],
    credentials: {
        passwordHash: { type: String, required: true },
        failedAttempts: { type: Number, default: 0 },
        lockedUntil: { type: Date, default: null },
        lastPasswordChangedAt: { type: Date, default: Date.now },
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: { type: String, default: null }
    },
    sessions: [sessionSchema]
}, {
    timestamps: true,
    versionKey: '__v'
});

// Thêm Indexes đúng như thiết kế
// userSchema.index({ emailHmac: 1 }, { unique: true }); // Redundant as defined in field
// Sparse cho phép null hoặc thiếu sessionId không gây lỗi
userSchema.index({ "sessions.sessionId": 1 }, { unique: true, sparse: true });
// TTL Index trên embedded array: Xóa document gốc? -> KHÔNG (Như đã phân tích, TTL xóa nguyên document).
// Tuy nhiên, Mongoose cho phép tạo TTL index trên 1 field trong mảng, MongoDB SẼ xóa toàn bộ document.
// DO ĐÓ: KHÔNG TẠO TTL INDEX NÀY Ở ĐÂY, sẽ dùng Cron Job.
// User feedback: "Thực tế: MongoDB không thể tự động xóa một phần tử trong mảng dựa trên TTL. TTL index chỉ xóa toàn bộ document"
// => Ta sẽ xóa bỏ dòng TTL trên sessions.expiresAt

// Middleware: Encrypt and Hash before saving
userSchema.pre('save', async function() {
    if (this.isModified('email') && typeof this.email === 'string') {
        const rawEmail = this.email;
        this.perUserSalt = this.perUserSalt || crypto.randomBytes(16).toString('hex');
        this.email = encrypt(rawEmail);
        this.emailHmac = generateHmac(rawEmail, this.perUserSalt);
    }
    if (this.isModified('phone') && typeof this.phone === 'string') {
        this.phone = encrypt(this.phone);
    }
    if (this.isModified('credentials.passwordHash') && !this.credentials.passwordHash.startsWith('$argon2id$')) {
        const plainPassword = this.credentials.passwordHash;
        this.credentials.passwordHash = await argon2.hash(plainPassword, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 3,
            parallelism: 1
        });
    }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await argon2.verify(this.credentials.passwordHash, candidatePassword);
    } catch (err) {
        return false;
    }
};

userSchema.methods.getDecryptedEmail = function() {
    return decrypt(this.email);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
