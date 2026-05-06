const db = require('../../../db/index');
const { users, vendors, sessions } = require('../../../db/schema');
const { eq, and, isNull, sql } = require('drizzle-orm');
const { ok, error } = require('../../../utils/response');
const { sendDeactivationDecision } = require('../../../utils/email');
const { insertVendorNotification } = require('../../../utils/notifications');

const activateVendor = async (req, res) => {
    // UPDATE users FROM vendors pattern — use raw SQL for the cross-table update with RETURNING
    const result = await db.execute(
        sql`UPDATE users u SET status = 'active', updated_at = NOW()
            FROM vendors v
            WHERE v.user_id = u.id AND v.id = ${req.params.id}
            RETURNING u.id, u.email, u.login_id, u.status`
    );
    if (!result.rows.length) return error(res, 'Vendor not found', 404);
    return ok(res, {
        ...result.rows[0],
        message: 'Vendor activated. Credentials email should be shared if not already sent.',
    });
};

const deactivateVendor = async (req, res) => {
    return await db.transaction(async (tx) => {
        const result = await tx.execute(
            sql`UPDATE users u SET status = 'inactive', updated_at = NOW()
                FROM vendors v
                WHERE v.user_id = u.id AND v.id = ${req.params.id}
                RETURNING u.id, u.status`
        );
        if (!result.rows.length) {
            throw Object.assign(new Error('Vendor not found'), { statusCode: 404 });
        }

        // Revoke all active sessions immediately — PRD: session invalidated on next API call
        await tx
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(and(eq(sessions.userId, result.rows[0].id), isNull(sessions.revokedAt)));

        return ok(res, { message: 'Vendor deactivated. All sessions revoked.' });
    }).catch((err) => {
        if (err.statusCode === 404) return error(res, err.message, 404);
        throw err;
    });
};

const getDeactivationRequests = async (req, res) => {
    const result = await db.execute(
        sql`SELECT v.id as request_id, v.id as vendor_id, v.facility_name, v.deactivation_reason,
                   v.deactivation_requested_at, u.email, u.login_id
            FROM vendors v
            JOIN users u ON u.id = v.user_id
            WHERE v.deactivation_requested = TRUE
            ORDER BY v.deactivation_requested_at ASC`
    );
    return ok(res, { requests: result.rows, total: result.rows.length });
};

const reviewDeactivationRequest = async (req, res) => {
    const { action, reason } = req.body;
    const vendorId = req.params.id;

    if (!action || !['approve', 'reject'].includes(action)) {
        return error(res, 'action must be approve or reject');
    }
    if (action === 'reject' && (!reason || !String(reason).trim())) {
        return error(res, 'reason is required when rejecting a deactivation request');
    }

    const vrows = await db.execute(
        sql`SELECT v.id, v.deactivation_requested, v.user_id, u.email
            FROM vendors v
            JOIN users u ON u.id = v.user_id
            WHERE v.id = ${vendorId}`
    );
    if (!vrows.rows.length) return error(res, 'Vendor not found', 404);
    if (!vrows.rows[0].deactivation_requested) {
        return error(res, 'No pending deactivation request for this vendor', 400);
    }

    const email = vrows.rows[0].email;
    const userId = vrows.rows[0].user_id;

    if (action === 'approve') {
        await db.transaction(async (tx) => {
            await tx.execute(
                sql`UPDATE users u SET status = 'deactivated', updated_at = NOW()
                    FROM vendors v
                    WHERE v.user_id = u.id AND v.id = ${vendorId}`
            );
            await tx
                .update(vendors)
                .set({
                    deactivationRequested: false,
                    deactivationAdminFeedback: null,
                    updatedAt: new Date(),
                })
                .where(eq(vendors.id, vendorId));
            await tx
                .update(sessions)
                .set({ revokedAt: new Date() })
                .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
        });

        await insertVendorNotification(vendorId, {
            type: 'account_deactivated',
            title: 'Account deactivated',
            body: 'Your deactivation request was approved. Your account is now deactivated.',
            skipEmail: true, // sendDeactivationDecision below sends the dedicated email
        });
        await sendDeactivationDecision({
            email,
            approved: true,
            reason: 'Your deactivation request was approved.',
        });
        return ok(res, { message: 'Vendor account deactivated.' });
    }

    const feedback = String(reason).trim();
    await db
        .update(vendors)
        .set({
            deactivationRequested: false,
            deactivationAdminFeedback: feedback,
            updatedAt: new Date(),
        })
        .where(eq(vendors.id, vendorId));

    await insertVendorNotification(vendorId, {
        type: 'deactivation_rejected',
        title: 'Deactivation request not approved',
        body: feedback,
        skipEmail: true, // sendDeactivationDecision below sends the dedicated email
    });
    await sendDeactivationDecision({
        email,
        approved: false,
        reason: feedback,
    });

    return ok(res, { message: 'Deactivation request rejected. Vendor has been notified.' });
};

module.exports = {
    activateVendor,
    deactivateVendor,
    getDeactivationRequests,
    reviewDeactivationRequest,
};
