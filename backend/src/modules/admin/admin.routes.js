const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/requireAdmin');
const { getDashboard } = require('./dashboard.controller');
const { listLeads, getLead, updateLeadStatus } = require('./leads/leads.controller');
const { createVendor, listVendors, getVendor } = require('./vendors/vendors.controller');
const { reviewProfile } = require('./vendors/profile.controller');
const {
    activateVendor,
    deactivateVendor,
    getDeactivationRequests,
    reviewDeactivationRequest,
} = require('./vendors/activate.controller');
const { sendVendorCredentialsEmail } = require('./vendors/credentials.controller');
const { listKycQueue, reviewKycDocument } = require('./kyc/kyc.controller');
const {
    getChecklists,
    addChecklistItem,
    updateChecklistItem,
    deactivateChecklistItem,
    getExpiringDocuments,
} = require('./kyc/checklists.controller');

router.use(authenticate, requireAdmin);

router.get('/dashboard', getDashboard);

router.get('/leads', listLeads);
router.get('/leads/:id', getLead);
router.put('/leads/:id', updateLeadStatus);

router.post('/vendors', createVendor);
router.get('/vendors/deactivation-requests', getDeactivationRequests);
router.post('/vendors/deactivation-requests/:id/review', reviewDeactivationRequest);
router.get('/vendors', listVendors);
router.get('/kyc/expiring', getExpiringDocuments);
router.get('/vendors/:id', getVendor);
router.post('/vendors/:id/send-credentials', sendVendorCredentialsEmail);
router.put('/vendors/:id/activate', activateVendor);
router.put('/vendors/:id/deactivate', deactivateVendor);
router.put('/vendors/:id/profile', reviewProfile);

router.get('/kyc/queue', listKycQueue);
router.put('/kyc/documents/:id', reviewKycDocument);

router.get('/kyc-checklist', getChecklists);
router.post('/kyc-checklist', addChecklistItem);
router.patch('/kyc-checklist/:id', updateChecklistItem);
router.delete('/kyc-checklist/:id', deactivateChecklistItem);

module.exports = router;
