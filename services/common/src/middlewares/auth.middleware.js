const jwt = require('jsonwebtoken');

const getBearerToken = (req) => {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return null;
    return token;
};

const authenticate = (options = {}) => {
    const { optional = false } = options;

    return (req, res, next) => {
        const token = getBearerToken(req);

        if (!token) {
            if (optional) return next();
            return res.status(401).json({ success: false, message: 'Missing bearer token' });
        }

        try {
            const secret = process.env.JWT_SECRET || 'quan_ptit_2026_pro_key';
            const payload = jwt.verify(token, secret);
            req.user = {
                id: String(payload.id || payload.sub),
                roles: Array.isArray(payload.roles) ? payload.roles : []
            };
            return next();
        } catch (error) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }
    };
};

const authorize = (...allowedRoles) => {
    const allowed = new Set(allowedRoles);

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const roles = req.user.roles || [];
        const canAccess = roles.some(role => allowed.has(role));
        if (!canAccess) {
            return res.status(403).json({ success: false, message: 'Forbidden: insufficient role' });
        }

        return next();
    };
};

const hasRole = (user, role) => {
    return Boolean(user && Array.isArray(user.roles) && user.roles.includes(role));
};

module.exports = {
    authenticate,
    authorize,
    hasRole
};
