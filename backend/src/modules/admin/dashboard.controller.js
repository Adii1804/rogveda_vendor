const pool = require('../../db/pool');
const { ok } = require('../../utils/response');

const getDashboard = async (req, res) => {
    const [leadsResult, vendorsKycResult, vendorsTotalResult, vendorsActiveResult, pendingDocsResult] =
        await Promise.all([
            pool.query(`SELECT status, COUNT(*) AS count FROM vendor_leads GROUP BY status`),
            pool.query(`SELECT kyc_status, COUNT(*) AS count FROM vendors GROUP BY kyc_status`),
            pool.query(`SELECT COUNT(*) AS count FROM vendors`),
            pool.query(
                `SELECT COUNT(*) AS count FROM vendors v
                 JOIN users u ON u.id = v.user_id
                 WHERE u.status = 'active'`
            ),
            pool.query(
                `SELECT COUNT(*) AS count FROM vendor_kyc_documents WHERE status = 'under_review'`
            ),
        ]);

    // Leads — approved = converted lead
    const leads = { total: 0, new: 0, contacted: 0, under_review: 0, approved: 0, rejected: 0, converted: 0 };
    for (const row of leadsResult.rows) {
        leads[row.status] = parseInt(row.count);
        leads.total += parseInt(row.count);
    }
    leads.converted = leads.approved; // alias for dashboard card

    // Vendors — flatten KYC counts directly onto vendors object
    const vendors = {
        total: parseInt(vendorsTotalResult.rows[0].count),
        active: parseInt(vendorsActiveResult.rows[0].count),
        // KYC breakdown
        complete: 0,
        under_review: 0,
        in_progress: 0,
        not_started: 0,  // kyc_status = 'pending'
    };
    for (const row of vendorsKycResult.rows) {
        const status = row.kyc_status;
        const count = parseInt(row.count);
        if (status === 'complete')      vendors.complete = count;
        else if (status === 'under_review') vendors.under_review = count;
        else if (status === 'in_progress')  vendors.in_progress = count;
        else if (status === 'pending')      vendors.not_started = count;
    }

    return ok(res, {
        leads,
        vendors,
        pending_kyc_documents: parseInt(pendingDocsResult.rows[0].count),
    });
};

module.exports = { getDashboard };
