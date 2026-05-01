const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'quan_ptit_2026_pro_key';

const generateToken = (id, roles) => {
    return jwt.sign({ id, roles }, SECRET, { expiresIn: '1h' });
};

// Hữu ích cho race-condition tests: mỗi VU phải có userId riêng để KHÔNG bị
// per-user rate limiter (checkout 3/min/user) chặn → mới đo được đúng atomicity.
const makeBuyerToken = (userId) => generateToken(userId, ['BUYER']);

module.exports = {
    SECRET,
    generateToken,
    makeBuyerToken,
    adminToken: generateToken('USR_ADMIN_001', ['ADMIN']),
    sellerToken: generateToken('USR_SELLER_001', ['SELLER']),
    buyerToken: generateToken('USR_BUYER_001', ['BUYER']),
};
