const router = require('express').Router();
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { requireVendorPrimary } = require('../../middleware/requireVendorPrimary');
const {
    getChecklist,
    uploadDocument,
    uploadDocumentByItem,
    getDocuments,
    submitKyc,
} = require('./kyc/kyc.controller');
const {
    getProfile,
    updateProfile,
    uploadProfilePhoto,
    submitProfile,
} = require('./profile/profile.controller');
const { requestDeactivation } = require('./account/account.controller');
const { listNotifications, markAllRead } = require('./notifications/notifications.controller');

const kycUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only PDF, JPG, and PNG files are allowed'));
    },
});

const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPG, PNG, and WebP images are allowed'));
    },
});

router.use(authenticate, requireVendorPrimary);

router.get('/kyc/checklist', getChecklist);
router.post('/kyc/documents/:item_id/upload', kycUpload.single('file'), uploadDocumentByItem);
router.post('/kyc/documents', kycUpload.single('file'), uploadDocument);
router.get('/kyc/documents', getDocuments);
router.post('/kyc/submit', submitKyc);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/profile/photo', photoUpload.single('file'), uploadProfilePhoto);
router.post('/profile/submit', submitProfile);

router.get('/notifications', listNotifications);
router.post('/notifications/read-all', markAllRead);

router.post('/account/deactivation-request', requestDeactivation);

module.exports = router;
