const db = require('../../../db/index');
const { vendorLeads } = require('../../../db/schema');
const { eq, sql } = require('drizzle-orm');

// NOTE: LEFT JOIN on created_vendor_user_id removed — column is being dropped

const getLeads = async ({ status, search, page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) conditions.push(sql`vl.status = ${status}`);
    if (search) {
        const pattern = `%${search}%`;
        conditions.push(sql`vl.email ILIKE ${pattern}`);
    }

    const whereClause =
        conditions.length > 0
            ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
            : sql``;

    const result = await db.execute(
        sql`SELECT vl.*
            FROM vendor_leads vl
            ${whereClause}
            ORDER BY vl.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`
    );

    const countResult = await db.execute(
        sql`SELECT COUNT(*) FROM vendor_leads vl ${whereClause}`
    );

    return { leads: result.rows, total: parseInt(countResult.rows[0].count) };
};

const getLeadById = async (id) => {
    // Use db.execute so Postgres returns snake_case column names
    // (Drizzle query builder returns camelCase which breaks the frontend)
    const result = await db.execute(
        sql`SELECT * FROM vendor_leads WHERE id = ${id}`
    );
    return result.rows[0] || null;
};

const updateLead = async (id, fields, updatedBy) => {
    const setValues = {};

    // Accept both camelCase and snake_case keys
    if (fields.status !== undefined)               setValues.status = fields.status;
    if (fields.notes !== undefined)                setValues.notes = fields.notes;
    if (fields.callback_reminder_at !== undefined) setValues.callbackReminderAt = fields.callback_reminder_at;

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
