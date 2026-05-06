const db = require('../../db/index');
const { vendorLeads } = require('../../db/schema');
const { eq, desc, sql } = require('drizzle-orm');
const { ok, error } = require('../../utils/response');
const { generateOtp, createOtpRequest, verifyOtp } = require('../../utils/otp');
const { sendOtp, sendLeadConfirmation } = require('../../utils/email');

const sendLeadOtp = async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) return error(res, 'Valid email is required');

    const emailClean = email.trim().toLowerCase();
    const otp = generateOtp();

    await createOtpRequest(emailClean, 'vendor_lead_verification', otp);
    await sendOtp({ email: emailClean, otp, type: 'vendor_lead_verification' });

    return ok(res, { message: 'OTP sent. Please check your email.' });
};

const submitLead = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) return error(res, 'Email and OTP are required');

    const emailClean = email.trim().toLowerCase();
    const valid = await verifyOtp(emailClean, 'vendor_lead_verification', otp);

    if (!valid) return error(res, 'Invalid or expired OTP. Please request a new one.', 400);

    // Check for duplicate
    const existing = await db
        .select({ id: vendorLeads.id })
        .from(vendorLeads)
        .where(eq(vendorLeads.email, emailClean))
        .orderBy(desc(vendorLeads.createdAt))
        .limit(1);

    const isDuplicate = existing.length > 0;
    const duplicateOf = isDuplicate ? existing[0].id : null;

    const rows = await db
        .insert(vendorLeads)
        .values({
            email: emailClean,
            emailVerified: true,
            status: 'new',
            isDuplicate,
            duplicateOf,
        })
        .returning({
            id: vendorLeads.id,
            email: vendorLeads.email,
            status: vendorLeads.status,
            isDuplicate: vendorLeads.isDuplicate,
            createdAt: vendorLeads.createdAt,
        });

    await sendLeadConfirmation({ email: emailClean });

    return ok(res, {
        message: 'Thank you. Our team will contact you within 24–48 hours.',
        lead_id: rows[0].id,
    });
};

module.exports = { sendLeadOtp, submitLead };
