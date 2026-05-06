const bcrypt = require('bcryptjs');
const db = require('../db/index');
const { otpRequests } = require('../db/schema');
const { eq, and, isNull, desc } = require('drizzle-orm');

const OTP_EXPIRY_MINUTES = 10;
const SALT_ROUNDS = 10;

// Generate a 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Store OTP in DB (supersedes any existing unused OTP of the same type for this identifier)
const createOtpRequest = async (identifier, type, otp) => {
    const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Supersede any previous unused OTP of same type for same identifier
    await db
        .update(otpRequests)
        .set({ supersededAt: new Date() })
        .where(
            and(
                eq(otpRequests.identifier, identifier.toLowerCase()),
                eq(otpRequests.otpType, type),
                isNull(otpRequests.usedAt),
                isNull(otpRequests.supersededAt)
            )
        );

    await db.insert(otpRequests).values({
        identifier: identifier.toLowerCase(),
        otpType: type,
        otpHash,
        expiresAt,
    });
};

// Verify OTP — returns true if valid, false otherwise. Marks as used on success.
const verifyOtp = async (identifier, type, inputOtp) => {
    const rows = await db
        .select()
        .from(otpRequests)
        .where(
            and(
                eq(otpRequests.identifier, identifier.toLowerCase()),
                eq(otpRequests.otpType, type),
                isNull(otpRequests.usedAt),
                isNull(otpRequests.supersededAt)
            )
        )
        .orderBy(desc(otpRequests.createdAt))
        .limit(1);

    if (!rows.length) return false;

    const record = rows[0];

    if (new Date(record.expiresAt) < new Date()) return false;

    const valid = await bcrypt.compare(inputOtp.toString(), record.otpHash);
    if (!valid) return false;

    await db
        .update(otpRequests)
        .set({ usedAt: new Date() })
        .where(eq(otpRequests.id, record.id));

    return true;
};

module.exports = { generateOtp, createOtpRequest, verifyOtp };
