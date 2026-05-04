const { error } = require('../utils/response');

const requireVendor = (req, res, next) => {
    const { account_type } = req.user;
    if (account_type !== 'vendor_primary' && account_type !== 'vendor_sub') {
        return error(res, 'Vendor access required', 403);
    }
    next();
};

module.exports = { requireVendor };
