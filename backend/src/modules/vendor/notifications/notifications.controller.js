const pool = require('../../../db/pool');
const { ok, error } = require('../../../utils/response');

const listNotifications = async (req, res) => {
    const { rows: vendor } = await pool.query(`SELECT id FROM vendors WHERE user_id = $1`, [
        req.user.user_id,
    ]);
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    const { rows: unread } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM vendor_notifications
         WHERE vendor_id = $1 AND read_at IS NULL`,
        [vendor[0].id]
    );

    const { rows } = await pool.query(
        `SELECT id, type, title, body, read_at, created_at
         FROM vendor_notifications
         WHERE vendor_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [vendor[0].id]
    );

    return ok(res, { unread_count: unread[0]?.c || 0, notifications: rows });
};

const markAllRead = async (req, res) => {
    const { rows: vendor } = await pool.query(`SELECT id FROM vendors WHERE user_id = $1`, [
        req.user.user_id,
    ]);
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    await pool.query(
        `UPDATE vendor_notifications SET read_at = NOW()
         WHERE vendor_id = $1 AND read_at IS NULL`,
        [vendor[0].id]
    );

    return ok(res, { message: 'Notifications marked as read.' });
};

module.exports = { listNotifications, markAllRead };
