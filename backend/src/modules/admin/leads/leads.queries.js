const db = require('../../../db/index');
const { vendorLeads } = require('../../../db/schema');
const { eq, sql } = require('drizzle-orm');

const getLeads = async ({ status, search, duplicates, page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) conditions.push(sql`vl.status = ${status}`);
    if (duplicates) conditions.push(sql`vl.is_duplicate = TRUE`);
    if (search) {
        const pattern = `%${search}%`;
        conditions.push(sql`vl.email ILIKE ${pattern}`);
    }

    const whereClause =
        conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    // When filtering duplicates, sort by email so the same address groups together
    const orderClause = duplicates
        ? sql`ORDER BY vl.email ASC, vl.created_at ASC`
        : sql`ORDER BY vl.created_at DESC`;

    const result = await db.execute(
        sql`SELECT vl.*
            FROM vendor_leads vl
            ${whereClause}
            ${orderClause}
            LIMIT ${limit} OFFSET ${offset}`
    );

    const countResult = await db.execute(sql`SELECT COUNT(*) FROM vendor_leads vl ${whereClause}`);

    return { leads: result.rows, total: parseInt(countResult.rows[0].count) };
};

const getLeadById = async (id) => {
    const result = await db.execute(
        sql`SELECT vl.*, dup.ref_no AS duplicate_ref_no
            FROM vendor_leads vl
            LEFT JOIN vendor_leads dup ON dup.id = vl.duplicate_of
            WHERE vl.id = ${id}`
    );
    return result.rows[0] || null;
};

const updateLead = async (id, fields, updatedBy) => {
    const setValues = {};

    if (fields.status !== undefined) setValues.status = fields.status;
    if (fields.notes !== undefined) setValues.notes = fields.notes;
    if (fields.callback_reminder_at !== undefined)
        setValues.callbackReminderAt = fields.callback_reminder_at;

    if (!Object.keys(setValues).length) return null;

    setValues.updatedBy = updatedBy;
    setValues.updatedAt = new Date();

    const rows = await db
        .update(vendorLeads)
        .set(setValues)
        .where(eq(vendorLeads.id, id))
        .returning();

    return rows[0] || null;
};

module.exports = { getLeads, getLeadById, updateLead };
