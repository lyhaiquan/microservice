const jwt = require('jsonwebtoken');

const SECRET = "quan_ptit_2026_pro_key";

const generateToken = (id, roles) => {
    return jwt.sign({ id, roles }, SECRET, { expiresIn: '1h' });
};

module.exports = {
    adminToken: generateToken('USR_ADMIN_001', ['ADMIN']),
    sellerToken: generateToken('USR_SELLER_001', ['SELLER']),
    buyerToken: generateToken('USR_BUYER_001', ['BUYER']),
};
