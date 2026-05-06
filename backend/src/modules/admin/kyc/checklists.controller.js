const db = require('../../../db/index');
const { vendorKycChecklists, serviceCategories } = require('../../../db/schema');
const { eq, sql } = require('drizzle-orm');
const { ok, created, error } = require('../../../utils/response');

const mapChecklistRow = (row) => ({
    ...row,
    description: row.instructions,
});

const getChecklists = async (req, res) => {
    const { category_id } = req.query;
    if (!category_id) return error(res, 'category_id is required');

    const result = await db.execute(
        sql`SELECT c.*, sc.name as category_name
            FROM vendor_kyc_checklists c
            JOIN service_categories sc ON sc.id = c.service_category_id
            WHERE c.service_category_id = ${category_id}
            ORDER BY c.display_order ASC`
    );
    const items = result.rows.map(mapChecklistRow);
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

    const cat = await db
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(eq(serviceCategories.id, service_category_id));
    if (!cat.length) return error(res, 'Invalid service category', 404);

    const rows = await db
        .insert(vendorKycChecklists)
        .values({
            serviceCategoryId: service_category_id,
            documentName: document_name,
            instructions: text || null,
            isMandatory: is_mandatory !== false,
            hasRenewal: has_renewal === true,
            displayOrder: display_order || 0,
        })
        .returning();

    return created(res, mapChecklistRow(rows[0]));
};

const updateChecklistItem = async (req, res) => {
    const allowed = ['document_name', 'is_mandatory', 'is_active', 'display_order', 'has_renewal'];
    const setValues = {};

    if (req.body.description !== undefined || req.body.instructions !== undefined) {
        const text =
            req.body.description !== undefined ? req.body.description : req.body.instructions;
        setValues.instructions = text;
    }

    // Map snake_case fields to camelCase schema fields
    const fieldMap = {
        document_name: 'documentName',
        is_mandatory: 'isMandatory',
        is_active: 'isActive',
        display_order: 'displayOrder',
        has_renewal: 'hasRenewal',
    };

    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            setValues[fieldMap[key]] = req.body[key];
        }
    }

    if (!Object.keys(setValues).length) return error(res, 'No valid fields to update');

    setValues.updatedAt = new Date();

    const rows = await db
        .update(vendorKycChecklists)
        .set(setValues)
        .where(eq(vendorKycChecklists.id, req.params.id))
        .returning();

    if (!rows.length) return error(res, 'Checklist item not found', 404);
    return ok(res, mapChecklistRow(rows[0]));
};

const deactivateChecklistItem = async (req, res) => {
    const rows = await db
        .update(vendorKycChecklists)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(vendorKycChecklists.id, req.params.id))
        .returning();
    if (!rows.length) return error(res, 'Checklist item not found', 404);
    return ok(res, mapChecklistRow(rows[0]));
};

const getExpiringDocuments = async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 60, 1), 365);

    const result = await db.execute(
        sql`SELECT d.id, d.renewal_date, d.status,
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
              AND d.renewal_date <= CURRENT_DATE + (${days} * INTERVAL '1 day')
            ORDER BY d.renewal_date ASC`
    );

    return ok(res, { documents: result.rows, total: result.rows.length, filter_days: days });
};

module.exports = {
    getChecklists,
    addChecklistItem,
    updateChecklistItem,
    deactivateChecklistItem,
    getExpiringDocuments,
};
