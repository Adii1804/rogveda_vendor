const db = require('../../../db/index');
const { leadNotes, vendorLeads, users } = require('../../../db/schema');
const { eq, desc, sql } = require('drizzle-orm');
const { ok, error } = require('../../../utils/response');
const { sendLeadDecision } = require('../../../utils/email');

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

    // Confirm lead exists and fetch email for decision notifications
    const lead = await db
        .select({ id: vendorLeads.id, status: vendorLeads.status, email: vendorLeads.email })
        .from(vendorLeads)
        .where(eq(vendorLeads.id, id));
    if (!lead.length) return error(res, 'Lead not found', 404);

    const resolvedStatus = status_at_time || lead[0].status;

    const [newNote] = await db
        .insert(leadNotes)
        .values({
            leadId: id,
            note: note.trim(),
            statusAtTime: resolvedStatus,
            createdBy: req.user.user_id,
        })
        .returning();

    // Send email to the lead when their application is approved or rejected
    if (resolvedStatus === 'approved' || resolvedStatus === 'rejected') {
        sendLeadDecision({
            email: lead[0].email,
            approved: resolvedStatus === 'approved',
            note: note.trim(),
        });
    }

    return ok(res, newNote);
};

module.exports = { getLeadNotes, addLeadNote };
