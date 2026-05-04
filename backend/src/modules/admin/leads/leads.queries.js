const pool = require('../../../db/pool');

const getLeads = async ({ status, search, page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (status) {
        params.push(status);
        conditions.push(`vl.status = $${params.length}`);
    }

    if (search) {
        params.push(`%${search}%`);
        conditions.push(`vl.email ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);

    const { rows } = await pool.query(
        `SELECT vl.*,
                u.email  AS created_vendor_email,
                u.login_id AS created_vendor_login_id
         FROM vendor_leads vl
         LEFT JOIN users u ON u.id = vl.created_vendor_user_id
         ${where}
         ORDER BY vl.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    const countParams = params.slice(0, params.length - 2);
    const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) FROM vendor_leads vl ${where}`,
        countParams
    );

    return { leads: rows, total: parseInt(countRows[0].count) };
};

const getLeadById = async (id) => {
    const { rows } = await pool.query(
        `SELECT vl.*,
                u.email    AS created_vendor_email,
                u.login_id AS created_vendor_login_id
         FROM vendor_leads vl
         LEFT JOIN users u ON u.id = vl.created_vendor_user_id
         WHERE vl.id = $1`,
        [id]
    );
    return rows[0] || null;
};

const updateLead = async (id, fields, updatedBy) => {
    const allowed = ['status', 'notes', 'callback_reminder_at'];
    const updates = [];
    const params = [];

    for (const key of allowed) {
        if (fields[key] !== undefined) {
            params.push(fields[key]);
            updates.push(`${key} = $${params.length}`);
        }
    }

    if (!updates.length) return null;

    params.push(updatedBy, id);

    const { rows } = await pool.query(
        `UPDATE vendor_leads
         SET ${updates.join(', ')}, updated_by = $${params.length - 1}, updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING *`,
        params
    );

    return rows[0] || null;
};

module.exports = { getLeads, getLeadById, updateLead };
