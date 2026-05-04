const pool = require('../../../db/pool');
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

    const { rows } = await pool.query(
        `SELECT v.id, v.profile_status, v.kyc_status, v.facility_name,
                u.email AS vendor_email
         FROM vendors v
         JOIN users u ON u.id = v.user_id
         WHERE v.id = $1`,
        [vendorId]
    );

    if (!rows.length) return error(res, 'Vendor not found', 404);

    const vendor = rows[0];

    if (vendor.profile_status !== 'under_review') {
        return error(res, `Cannot review profile with status: ${vendor.profile_status}`);
    }

    if (action === 'approved' && vendor.kyc_status !== 'complete') {
        return error(res, 'Cannot approve profile — vendor KYC is not complete');
    }

    const { rows: updated } = await pool.query(
        `UPDATE vendors SET
            profile_status        = $1,
            profile_approved_by   = $2,
            profile_approved_at   = $3,
            profile_rejection_reason = $4,
            updated_at            = NOW()
         WHERE id = $5
         RETURNING id, profile_status, profile_approved_at, profile_rejection_reason`,
        [
            action === 'approved' ? 'approved' : 'rejected',
            action === 'approved' ? req.user.user_id : null,
            action === 'approved' ? new Date() : null,
            action === 'rejected' ? rejection_reason : null,
            vendorId,
        ]
    );

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
