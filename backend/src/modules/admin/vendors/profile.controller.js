const db = require('../../../db/index');
const { vendors, users } = require('../../../db/schema');
const { eq, sql } = require('drizzle-orm');
const { ok, error } = require('../../../utils/response');
const { insertVendorNotification } = require('../../../utils/notifications');
const { sendProfileDecision } = require('../../../utils/email');

const reviewProfile = async (req, res) => {
    const { action, rejection_reason } = req.body;
    const vendorId = req.params.id;

    if (!action) return error(res, 'Action is required: approved or rejected');
    if (!['approved', 'rejected'].includes(action)) {
        return error(res, 'Action must be "approved" or "rejected"');
    }
    if (action === 'rejected' && !rejection_reason) {
        return error(res, 'Rejection reason is required');
    }

    const result = await db.execute(
        sql`SELECT v.id, v.profile_status, v.kyc_status, v.facility_name,
                   u.email AS vendor_email
            FROM vendors v
            JOIN users u ON u.id = v.user_id
            WHERE v.id = ${vendorId}`
    );

    if (!result.rows.length) return error(res, 'Vendor not found', 404);

    const vendor = result.rows[0];

    if (vendor.profile_status !== 'under_review') {
        return error(res, `Cannot review profile with status: ${vendor.profile_status}`);
    }

    if (action === 'approved' && vendor.kyc_status !== 'complete') {
        return error(res, 'Cannot approve profile — vendor KYC is not complete');
    }

    const updated = await db
        .update(vendors)
        .set({
            profileStatus: action === 'approved' ? 'approved' : 'rejected',
            profileApprovedBy: action === 'approved' ? req.user.user_id : null,
            profileApprovedAt: action === 'approved' ? new Date() : null,
            profileRejectionReason: action === 'rejected' ? rejection_reason : null,
            updatedAt: new Date(),
        })
        .where(eq(vendors.id, vendorId))
        .returning({
            id: vendors.id,
            profileStatus: vendors.profileStatus,
            profileApprovedAt: vendors.profileApprovedAt,
            profileRejectionReason: vendors.profileRejectionReason,
        });

    // In-app notification (skipEmail=true because sendProfileDecision below sends a richer email)
    if (action === 'approved') {
        await insertVendorNotification(vendorId, {
            type: 'profile_approved',
            title: 'Profile approved',
            body: 'Your facility profile has been approved.',
            skipEmail: true,
        });
    } else {
        await insertVendorNotification(vendorId, {
            type: 'profile_rejected',
            title: 'Profile needs changes',
            body: rejection_reason,
            skipEmail: true,
        });
    }

    // Email notification (fire-and-forget — never block the response)
    sendProfileDecision({
        email: vendor.vendor_email,
        approved: action === 'approved',
        facilityName: vendor.facility_name,
        reason: rejection_reason || null,
    }).catch((err) => console.error('[email] sendProfileDecision failed:', err.message));

    return ok(res, updated[0]);
};

module.exports = { reviewProfile };
