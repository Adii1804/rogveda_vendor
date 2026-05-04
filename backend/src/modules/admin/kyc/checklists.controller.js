const pool = require('../../../db/pool');
const { ok, created, error } = require('../../../utils/response');

const mapChecklistRow = (row) => ({
    ...row,
    description: row.instructions,
});

const getChecklists = async (req, res) => {
    const { category_id } = req.query;
    if (!category_id) return error(res, 'category_id is required');

    const { rows } = await pool.query(
        `SELECT c.*, sc.name as category_name
         FROM vendor_kyc_checklists c
         JOIN service_categories sc ON sc.id = c.service_category_id
         WHERE c.service_category_id = $1
         ORDER BY c.display_order ASC`,
        [category_id]
    );
    const items = rows.map(mapChecklistRow);
    return ok(res, { items, total: items.length });
};

const addChecklistItem = async (req, res) => {
    const {
        service_category_id,
        document_name,
        description,
        instructions,
        is_mandatory,
        has_renewal,
        display_order,
    } = req.body;

    const text = description ?? instructions;

    if (!service_category_id || !document_name) {
        return error(res, 'service_category_id and document_name are required');
    }

    const { rows: cat } = await pool.query(`SELECT id FROM service_categories WHERE id = $1`, [
        service_category_id,
    ]);
    if (!cat.length) return error(res, 'Invalid service category', 404);

    const { rows } = await pool.query(
        `INSERT INTO vendor_kyc_checklists
            (service_category_id, document_name, instructions, is_mandatory, has_renewal, display_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
            service_category_id,
            document_name,
            text || null,
            is_mandatory !== false,
            has_renewal === true,
            display_order || 0,
        ]
    );
    return created(res, mapChecklistRow(rows[0]));
};

const updateChecklistItem = async (req, res) => {
    const allowed = ['document_name', 'is_mandatory', 'is_active', 'display_order', 'has_renewal'];
    const updates = [];
    const params = [];

    if (req.body.description !== undefined || req.body.instructions !== undefined) {
        const text =
            req.body.description !== undefined ? req.body.description : req.body.instructions;
        params.push(text);
        updates.push(`instructions = $${params.length}`);
    }

    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            params.push(req.body[key]);
            updates.push(`${key} = $${params.length}`);
        }
    }

    if (!updates.length) return error(res, 'No valid fields to update');

    params.push(req.params.id);
    const { rows } = await pool.query(
        `UPDATE vendor_kyc_checklists SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING *`,
        params
    );

    if (!rows.length) return error(res, 'Checklist item not found', 404);
    return ok(res, mapChecklistRow(rows[0]));
};

const deactivateChecklistItem = async (req, res) => {
    const { rows } = await pool.query(
        `UPDATE vendor_kyc_checklists SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [req.params.id]
    );
    if (!rows.length) return error(res, 'Checklist item not found', 404);
    return ok(res, mapChecklistRow(rows[0]));
};

const getExpiringDocuments = async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 60, 1), 365);

    const { rows } = await pool.query(
        `SELECT d.id, d.renewal_date, d.status,
                c.document_name,
                v.facility_name, v.id as vendor_id,
                u.email as vendor_email, u.login_id,
                (d.renewal_date - CURRENT_DATE) AS days_until_expiry
         FROM vendor_kyc_documents d
         JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
         JOIN vendors v ON v.id = d.vendor_id
         JOIN users u ON u.id = v.user_id
         WHERE d.renewal_date IS NOT NULL
           AND d.status IN ('approved', 'expired')
           AND d.renewal_date <= CURRENT_DATE + ($1 * INTERVAL '1 day')
         ORDER BY d.renewal_date ASC`,
        [days]
    );

    return ok(res, { documents: rows, total: rows.length, filter_days: days });
};

module.exports = {
    getChecklists,
    addChecklistItem,
    updateChecklistItem,
    deactivateChecklistItem,
    getExpiringDocuments,
};
