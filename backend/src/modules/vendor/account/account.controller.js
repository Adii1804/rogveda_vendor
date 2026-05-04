const pool = require('../../../db/pool');
const { ok, error } = require('../../../utils/response');

const requestDeactivation = async (req, res) => {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 10) {
        return error(res, 'A reason of at least 10 characters is required to request deactivation');
    }

    const { rows } = await pool.query(
        `UPDATE vendors SET
            deactivation_requested = TRUE,
            deactivation_reason = $1,
            deactivation_requested_at = NOW(),
            updated_at = NOW()
         WHERE user_id = $2 AND deactivation_requested = FALSE
         RETURNING id, deactivation_requested_at`,
        [reason.trim(), req.user.user_id]
    );

    if (!rows.length) {
        return error(res, 'A deactivation request is already pending for your account');
    }

    return ok(res, {
        message: 'Deactivation request submitted. The Rogveda team will review and respond.',
        requested_at: rows[0].deactivation_requested_at,
    });
};

module.exports = { requestDeactivation };
