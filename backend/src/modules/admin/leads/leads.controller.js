const { ok, error } = require('../../../utils/response');
const { getLeads, getLeadById, updateLead } = require('./leads.queries');

const VALID_STATUSES = ['new', 'contacted', 'under_review', 'approved', 'rejected'];

const listLeads = async (req, res) => {
    const { status, search, page, limit } = req.query;

    if (status && !VALID_STATUSES.includes(status)) {
        return error(res, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const result = await getLeads({
        status,
        search,
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 20, 100),
    });

    return ok(res, result);
};

const getLead = async (req, res) => {
    const lead = await getLeadById(req.params.id);
    if (!lead) return error(res, 'Lead not found', 404);
    return ok(res, lead);
};

const updateLeadStatus = async (req, res) => {
    const { status } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
        return error(res, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const lead = await getLeadById(req.params.id);
    if (!lead) return error(res, 'Lead not found', 404);

    // Approved is a terminal state — no further status changes allowed
    if (lead.status === 'approved') {
        return error(res, 'This lead is approved and its status can no longer be changed');
    }

    if (lead.created_vendor_user_id && status === 'rejected') {
        return error(res, 'Cannot reject a lead that already has a vendor account created');
    }

    const updated = await updateLead(req.params.id, req.body, req.user.user_id);
    return ok(res, updated);
};

module.exports = { listLeads, getLead, updateLeadStatus };
