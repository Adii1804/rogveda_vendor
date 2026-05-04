const { error } = require('../utils/response');

const requireVendorPrimary = (req, res, next) => {
    if (req.user.account_type !== 'vendor_primary') {
        return error(res, 'Vendor portal access requires a primary vendor account', 403);
    }
    next();
};

module.exports = { requireVendorPrimary };
