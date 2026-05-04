const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const OTP_EXPIRY_MINUTES = 10;
const SALT_ROUNDS = 10;

// Generate a 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Store OTP in DB (supersedes any existing unused OTP of the same type for this identifier)
const createOtpRequest = async (identifier, type, otp) => {
    const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Supersede any previous unused OTP of same type for same identifier
    await pool.query(
        `UPDATE otp_requests
         SET superseded_at = NOW()
         WHERE identifier = $1 AND otp_type = $2 AND used_at IS NULL AND superseded_at IS NULL`,
        [identifier.toLowerCase(), type]
    );

    await pool.query(
        `INSERT INTO otp_requests (identifier, otp_type, otp_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [identifier.toLowerCase(), type, otpHash, expiresAt]
    );
};

// Verify OTP — returns true if valid, false otherwise. Marks as used on success.
const verifyOtp = async (identifier, type, inputOtp) => {
    const { rows } = await pool.query(
        `SELECT id, otp_hash, expires_at
         FROM otp_requests
         WHERE identifier = $1
           AND otp_type = $2
           AND used_at IS NULL
           AND superseded_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [identifier.toLowerCase(), type]
    );

    if (!rows.length) return false;

    const record = rows[0];

    if (new Date(record.expires_at) < new Date()) return false;

    const valid = await bcrypt.compare(inputOtp.toString(), record.otp_hash);
    if (!valid) return false;

    await pool.query(`UPDATE otp_requests SET used_at = NOW() WHERE id = $1`, [record.id]);

    return true;
};

module.exports = { generateOtp, createOtpRequest, verifyOtp };
