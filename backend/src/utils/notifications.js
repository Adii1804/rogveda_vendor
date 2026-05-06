const db = require('../db/index');
const { vendorNotifications, vendors, users } = require('../db/schema');
const { eq } = require('drizzle-orm');

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
    await db.insert(vendorNotifications).values({
        vendorId,
        type,
        title,
        body: body || null,
    });

    if (skipEmail) return;

    // 2. Fetch vendor email (best-effort — never throw)
    try {
        const rows = await db
            .select({ email: users.email })
            .from(vendors)
            .innerJoin(users, eq(users.id, vendors.userId))
            .where(eq(vendors.id, vendorId));

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
