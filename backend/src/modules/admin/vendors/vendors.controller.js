const pool = require('../../../db/pool');
const { ok, created, error } = require('../../../utils/response');
const { hash, generateTemp } = require('../../../utils/password');
const { createVendorAccount, getVendors, getVendorById } = require('./vendors.queries');

const createVendor = async (req, res) => {
    const { email, mobile_number, login_id, service_category_id, facility_name, lead_id } =
        req.body;

    if (!email || !service_category_id || !mobile_number) {
        return error(res, 'Email, mobile number, and service category are required');
    }

    // PRD: Login ID defaults to mobile number, editable by System Admin
    const loginId = (login_id || mobile_number).toString().trim();
    if (loginId.length !== 10 || !/^\d{10}$/.test(loginId)) {
        return error(res, 'Login ID must be exactly 10 digits');
    }

    const emailClean = email.trim().toLowerCase();

    const { rows: existing } = await pool.query(
        `SELECT id FROM users WHERE email = $1 OR login_id = $2`,
        [emailClean, loginId]
    );
    if (existing.length) {
        return error(res, 'An account with this email or login ID already exists');
    }

    const { rows: category } = await pool.query(
        `SELECT id FROM service_categories WHERE id = $1 AND is_active = TRUE`,
        [service_category_id]
    );
    if (!category.length) {
        return error(res, 'Invalid or inactive service category');
    }

    if (lead_id) {
        const { rows: lead } = await pool.query(
            `SELECT id, status, created_vendor_user_id FROM vendor_leads WHERE id = $1`,
            [lead_id]
        );
        if (!lead.length) return error(res, 'Lead not found');
        if (lead[0].created_vendor_user_id)
            return error(res, 'A vendor account already exists for this lead');
    }

    // PRD: 6-digit numeric temp password
    const tempPassword = generateTemp();
    const passwordHash = await hash(tempPassword);

    const result = await createVendorAccount({
        email: emailClean,
        loginId,
        mobileNumber: mobile_number.toString().trim(),
        passwordHash,
        serviceCategoryId: service_category_id,
        facilityName: facility_name || null,
        createdBy: req.user.user_id,
        leadId: lead_id || null,
    });

    await pool.query(`UPDATE users SET temp_password_plain = $1 WHERE id = $2`, [
        tempPassword,
        result.user.id,
    ]);

    return created(res, {
        vendor_id: result.vendorId,
        user_id: result.user.id,
        email: emailClean,
        login_id: loginId,
        temp_password: tempPassword,
        note: 'Account is inactive. Activate the vendor, then send credentials from the vendor detail page.',
    });
};

const listVendors = async (req, res) => {
    const { kyc_status, profile_status, service_category_id, search, page, limit } = req.query;

    const result = await getVendors({
        kyc_status,
        profile_status,
        service_category_id,
        search,
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 20, 100),
    });

    return ok(res, result);
};

const getVendor = async (req, res) => {
    const vendor = await getVendorById(req.params.id);
    if (!vendor) return error(res, 'Vendor not found', 404);
    return ok(res, vendor);
};

module.exports = { createVendor, listVendors, getVendor };
