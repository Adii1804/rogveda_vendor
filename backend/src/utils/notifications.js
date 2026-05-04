const pool = require('../db/pool');

// ─── Notification email (lazy-required to avoid circular deps) ────────────────

let _sendNotificationEmail = null;
function getSendNotificationEmail() {
    if (!_sendNotificationEmail) {
        _sendNotificationEmail = require('./email').sendNotificationEmail;
    }
    return _sendNotificationEmail;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Insert an in-app notification AND fire an email to the vendor.
 * Every notification automatically triggers both — no separate email call needed.
 *
 * Pass { skipEmail: true } when the caller is already sending a richer dedicated email,
 * to avoid the vendor receiving two emails for the same event.
 */
const insertVendorNotification = async (vendorId, { type, title, body, skipEmail = false }) => {
    // 1. Save in-app notification
    await pool.query(
        `INSERT INTO vendor_notifications (vendor_id, type, title, body) VALUES ($1, $2, $3, $4)`,
        [vendorId, type, title, body || null]
    );

    if (skipEmail) return;

    // 2. Fetch vendor email (best-effort — never throw)
    try {
        const { rows } = await pool.query(
            `SELECT u.email FROM vendors v JOIN users u ON u.id = v.user_id WHERE v.id = $1`,
            [vendorId]
        );
        if (rows.length && rows[0].email) {
            getSendNotificationEmail()({
                email: rows[0].email,
                title,
                body,
                type,
            }).catch((e) => console.error('[email] sendNotificationEmail failed:', e.message));
        }
    } catch (e) {
        console.error('[notifications] Could not send notification email:', e.message);
    }
};

module.exports = { insertVendorNotification };
