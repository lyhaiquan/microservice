const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT token and attach user to request object.
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'quan_ptit_2026_pro_key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

/**
 * Middleware to check if the user has one of the required roles.
 * @param {string[]} requiredRoles - Array of roles allowed to access the route.
 */
const checkRole = (requiredRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.roles) {
            return res.status(403).json({ message: 'Forbidden: No roles assigned' });
        }

        const hasRole = req.user.roles.some(role => requiredRoles.includes(role));
        if (!hasRole) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        }

        next();
    };
};

module.exports = {
    verifyToken,
    checkRole
};
