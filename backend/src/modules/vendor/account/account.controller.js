const db = require('../../../db/index');
const { vendors } = require('../../../db/schema');
const { eq, and } = require('drizzle-orm');
const { ok, error } = require('../../../utils/response');

const requestDeactivation = async (req, res) => {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 10) {
        return error(res, 'A reason of at least 10 characters is required to request deactivation');
    }

    const rows = await db
        .update(vendors)
        .set({
            deactivationRequested: true,
            deactivationReason: reason.trim(),
            deactivationRequestedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(vendors.userId, req.user.user_id),
                eq(vendors.deactivationRequested, false)
            )
        )
        .returning({
            id: vendors.id,
            deactivationRequestedAt: vendors.deactivationRequestedAt,
        });

    if (!rows.length) {
        return error(res, 'A deactivation request is already pending for your account');
    }

    return ok(res, {
        message: 'Deactivation request submitted. The Rogveda team will review and respond.',
        requested_at: rows[0].deactivationRequestedAt,
    });
};

module.exports = { requestDeactivation };
