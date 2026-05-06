const db = require('../../../db/index');
const { vendors, vendorNotifications } = require('../../../db/schema');
const { eq, and, isNull, desc, sql } = require('drizzle-orm');
const { ok, error } = require('../../../utils/response');

const listNotifications = async (req, res) => {
    const vendor = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    const unreadResult = await db.execute(
        sql`SELECT COUNT(*)::int AS c FROM vendor_notifications
            WHERE vendor_id = ${vendor[0].id} AND read_at IS NULL`
    );

    const rows = await db
        .select({
            id: vendorNotifications.id,
            type: vendorNotifications.type,
            title: vendorNotifications.title,
            body: vendorNotifications.body,
            readAt: vendorNotifications.readAt,
            createdAt: vendorNotifications.createdAt,
        })
        .from(vendorNotifications)
        .where(eq(vendorNotifications.vendorId, vendor[0].id))
        .orderBy(desc(vendorNotifications.createdAt))
        .limit(50);

    return ok(res, { unread_count: unreadResult.rows[0]?.c || 0, notifications: rows });
};

const markAllRead = async (req, res) => {
    const vendor = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    await db
        .update(vendorNotifications)
        .set({ readAt: new Date() })
        .where(
            and(eq(vendorNotifications.vendorId, vendor[0].id), isNull(vendorNotifications.readAt))
        );

    return ok(res, { message: 'Notifications marked as read.' });
};

module.exports = { listNotifications, markAllRead };
