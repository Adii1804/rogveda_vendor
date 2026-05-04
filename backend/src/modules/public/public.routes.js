const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { sendLeadOtp, submitLead } = require('./leads.controller');
const { getCategories } = require('./categories.controller');

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Too many OTP requests. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.get('/categories', getCategories);
router.post('/leads', otpLimiter, sendLeadOtp);
router.post('/leads/verify', submitLead);
router.post('/leads/send-otp', otpLimiter, sendLeadOtp);
router.post('/leads/submit', submitLead);

module.exports = router;
