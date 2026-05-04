const pool = require('../../../db/pool');
const { ok, error } = require('../../../utils/response');
const { sendDeactivationDecision } = require('../../../utils/email');
const { insertVendorNotification } = require('../../../utils/notifications');

const activateVendor = async (req, res) => {
    const { rows } = await pool.query(
        `UPDATE users u SET status = 'active', updated_at = NOW()
         FROM vendors v
         WHERE v.user_id = u.id AND v.id = $1
         RETURNING u.id, u.email, u.login_id, u.status`,
        [req.params.id]
    );
    if (!rows.length) return error(res, 'Vendor not found', 404);
    return ok(res, {
        ...rows[0],
        message: 'Vendor activated. Credentials email should be shared if not already sent.',
    });
};

const deactivateVendor = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `UPDATE users u SET status = 'inactive', updated_at = NOW()
             FROM vendors v
             WHERE v.user_id = u.id AND v.id = $1
             RETURNING u.id, u.status`,
            [req.params.id]
        );
        if (!rows.length) {
            await client.query('ROLLBACK');
            return error(res, 'Vendor not found', 404);
        }

        // Revoke all active sessions immediately — PRD: session invalidated on next API call
        await client.query(
            `UPDATE sessions SET revoked_at = NOW()
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [rows[0].id]
        );

        await client.query('COMMIT');
        return ok(res, { message: 'Vendor deactivated. All sessions revoked.' });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const getDeactivationRequests = async (req, res) => {
    const { rows } = await pool.query(
        `SELECT v.id as request_id, v.id as vendor_id, v.facility_name, v.deactivation_reason,
                v.deactivation_requested_at, u.email, u.login_id
         FROM vendors v
         JOIN users u ON u.id = v.user_id
         WHERE v.deactivation_requested = TRUE
         ORDER BY v.deactivation_requested_at ASC`
    );
    return ok(res, { requests: rows, total: rows.length });
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

    const { rows: vrows } = await pool.query(
        `SELECT v.id, v.deactivation_requested, v.user_id, u.email
         FROM vendors v
         JOIN users u ON u.id = v.user_id
         WHERE v.id = $1`,
        [vendorId]
    );
    if (!vrows.length) return error(res, 'Vendor not found', 404);
    if (!vrows[0].deactivation_requested) {
        return error(res, 'No pending deactivation request for this vendor', 400);
    }

    const email = vrows[0].email;

    if (action === 'approve') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE users u SET status = 'deactivated', updated_at = NOW()
                 FROM vendors v
                 WHERE v.user_id = u.id AND v.id = $1`,
                [vendorId]
            );
            await client.query(
                `UPDATE vendors SET
                    deactivation_requested = FALSE,
                    deactivation_admin_feedback = NULL,
                    updated_at = NOW()
                 WHERE id = $1`,
                [vendorId]
            );
            await client.query(
                `UPDATE sessions SET revoked_at = NOW()
                 WHERE user_id = $1 AND revoked_at IS NULL`,
                [vrows[0].user_id]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        await insertVendorNotification(vendorId, {
            type: 'account_deactivated',
            title: 'Account deactivated',
            body: 'Your deactivation request was approved. Your account is now deactivated.',
            skipEmail: true,  // sendDeactivationDecision below sends the dedicated email
        });
        await sendDeactivationDecision({
            email,
            approved: true,
            reason: 'Your deactivation request was approved.',
        });
        return ok(res, { message: 'Vendor account deactivated.' });
    }

    const feedback = String(reason).trim();
    await pool.query(
        `UPDATE vendors SET
            deactivation_requested = FALSE,
            deactivation_admin_feedback = $1,
            updated_at = NOW()
         WHERE id = $2`,
        [feedback, vendorId]
    );

    await insertVendorNotification(vendorId, {
        type: 'deactivation_rejected',
        title: 'Deactivation request not approved',
        body: feedback,
        skipEmail: true,  // sendDeactivationDecision below sends the dedicated email
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
