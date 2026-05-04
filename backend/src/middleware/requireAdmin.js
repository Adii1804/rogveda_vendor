const { error } = require('../utils/response');

const requireAdmin = (req, res, next) => {
    const { account_type } = req.user;
    if (account_type !== 'system_admin' && account_type !== 'admin') {
        return error(res, 'Access denied', 403);
    }
    next();
};

const requireSystemAdmin = (req, res, next) => {
    if (req.user.account_type !== 'system_admin') {
        return error(res, 'System Admin access required', 403);
    }
    next();
};

module.exports = { requireAdmin, requireSystemAdmin };
