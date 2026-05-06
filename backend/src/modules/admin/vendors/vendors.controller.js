const db = require('../../../db/index');
const { users, serviceCategories, vendorLeads } = require('../../../db/schema');
const { eq, or, sql } = require('drizzle-orm');
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

    const existing = await db.execute(
        sql`SELECT id FROM users WHERE email = ${emailClean} OR login_id = ${loginId}`
    );
    if (existing.rows.length) {
        return error(res, 'An account with this email or login ID already exists');
    }

    const category = await db
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(
            sql`${serviceCategories.id} = ${service_category_id} AND ${serviceCategories.isActive} = TRUE`
        );
    if (!category.length) {
        return error(res, 'Invalid or inactive service category');
    }

    if (lead_id) {
        const lead = await db
            .select({ id: vendorLeads.id, status: vendorLeads.status })
            .from(vendorLeads)
            .where(eq(vendorLeads.id, lead_id));
        if (!lead.length) return error(res, 'Lead not found');
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

    await db
        .update(users)
        .set({ tempPasswordPlain: tempPassword })
        .where(eq(users.id, result.user.id));

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
