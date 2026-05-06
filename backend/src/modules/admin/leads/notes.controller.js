const db = require('../../../db/index');
const { leadNotes, vendorLeads, users } = require('../../../db/schema');
const { eq, desc, sql } = require('drizzle-orm');
const { ok, error } = require('../../../utils/response');

const getLeadNotes = async (req, res) => {
    const { id } = req.params;

    // Confirm lead exists
    const lead = await db
        .select({ id: vendorLeads.id })
        .from(vendorLeads)
        .where(eq(vendorLeads.id, id));
    if (!lead.length) return error(res, 'Lead not found', 404);

    // Fetch notes with the creator's email
    const result = await db.execute(
        sql`SELECT ln.id, ln.lead_id, ln.note, ln.status_at_time, ln.created_at,
                   u.email AS created_by_email
            FROM lead_notes ln
            LEFT JOIN users u ON u.id = ln.created_by
            WHERE ln.lead_id = ${id}
            ORDER BY ln.created_at DESC`
    );

    return ok(res, { notes: result.rows });
};

const addLeadNote = async (req, res) => {
    const { id } = req.params;
    const { note, status_at_time } = req.body;

    if (!note?.trim()) return error(res, 'Note text is required');

    // Confirm lead exists
    const lead = await db
        .select({ id: vendorLeads.id, status: vendorLeads.status })
        .from(vendorLeads)
        .where(eq(vendorLeads.id, id));
    if (!lead.length) return error(res, 'Lead not found', 404);

    const [newNote] = await db
        .insert(leadNotes)
        .values({
            leadId: id,
            note: note.trim(),
            statusAtTime: status_at_time || lead[0].status,
            createdBy: req.user.user_id,
        })
        .returning();

    return ok(res, newNote);
};

module.exports = { getLeadNotes, addLeadNote };
