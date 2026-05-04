const { ok, error } = require('../../../utils/response');
const { getKycQueue, reviewDocument } = require('./kyc.queries');
const { insertVendorNotification } = require('../../../utils/notifications');

const listKycQueue = async (req, res) => {
    const { vendor_id, page, limit } = req.query;

    const result = await getKycQueue({
        vendor_id,
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 20, 100),
    });

    return ok(res, result);
};

const reviewKycDocument = async (req, res) => {
    const { action, rejection_reason, renewal_date } = req.body;

    if (!action) return error(res, 'Action is required: approved or rejected');
    if (!['approved', 'rejected'].includes(action)) {
        return error(res, 'Action must be "approved" or "rejected"');
    }
    if (action === 'rejected' && !rejection_reason) {
        return error(res, 'Rejection reason is required when rejecting a document');
    }

    try {
        const result = await reviewDocument(req.params.id, action, req.user.user_id, {
            rejection_reason,
            renewal_date,
        });

        if (result.vendor_id) {
            if (action === 'rejected') {
                await insertVendorNotification(result.vendor_id, {
                    type: 'kyc_doc_rejected',
                    title: `Document rejected: ${result.document_name || 'KYC document'}`,
                    body: rejection_reason || 'Please review the feedback and upload a corrected document.',
                });
            }

            if (result.vendor_kyc_status === 'complete') {
                await insertVendorNotification(result.vendor_id, {
                    type: 'kyc_complete',
                    title: 'KYC complete',
                    body: 'All mandatory documents are approved. You can now set up your facility profile.',
                });
            }
        }

        return ok(res, result);
    } catch (err) {
        return error(res, err.message, err.statusCode || 500);
    }
};

module.exports = { listKycQueue, reviewKycDocument };
