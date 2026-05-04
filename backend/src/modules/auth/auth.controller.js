const jwt = require('jsonwebtoken');
const { randomUUID: uuidv4 } = require('crypto');
const pool = require('../../db/pool');
const env = require('../../config/env');
const { ok, error } = require('../../utils/response');
const { hash, compare } = require('../../utils/password');
const { generateOtp, createOtpRequest, verifyOtp } = require('../../utils/otp');
const { sendOtp } = require('../../utils/email');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

const login = async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return error(res, 'Login ID / email and password are required');
    }

    const identifierClean = identifier.trim();
    const { rows } = await pool.query(
        `SELECT id, email, login_id, password_hash, account_type, status,
                failed_login_attempts, locked_until, password_reset_required
         FROM users
         WHERE email = LOWER($1) OR login_id = $1`,
        [identifierClean]
    );

    // Always return same error — do not reveal whether email exists
    if (!rows.length) {
        return error(res, 'Invalid credentials', 401);
    }

    const user = rows[0];

    if (user.status === 'inactive' || user.status === 'suspended') {
        return error(res, 'Account is not active. Contact your administrator.', 403);
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        return error(res, `Account locked. Try again in ${minutesLeft} minute(s).`, 403);
    }

    const passwordValid = await compare(password, user.password_hash);

    if (!passwordValid) {
        const newAttempts = user.failed_login_attempts + 1;
        const lock = newAttempts >= MAX_FAILED_ATTEMPTS;

        await pool.query(
            `UPDATE users SET
                failed_login_attempts = $1,
                locked_until = $2,
                updated_at = NOW()
             WHERE id = $3`,
            [newAttempts, lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, user.id]
        );

        if (lock) {
            return error(
                res,
                `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`,
                403
            );
        }

        return error(res, 'Invalid credentials', 401);
    }

    // Reset failed attempts on successful login
    await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
        [user.id]
    );

    const { remember_me } = req.body;
    const jti = uuidv4();
    // PRD: 30-day remember-me option, otherwise 8h
    const sessionDuration = remember_me ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
    const tokenExpiry = remember_me ? '30d' : env.jwt.expiresIn;
    const expiresAt = new Date(Date.now() + sessionDuration);

    await pool.query(
        `INSERT INTO sessions (user_id, jti, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, jti, expiresAt, req.ip, req.headers['user-agent'] || null]
    );

    const token = jwt.sign({ sub: user.id, jti, account_type: user.account_type }, env.jwt.secret, {
        expiresIn: tokenExpiry,
    });

    let vendorMeta = {};
    if (user.account_type === 'vendor_primary' || user.account_type === 'vendor_sub') {
        const { rows: vr } = await pool.query(
            `SELECT kyc_status, profile_status FROM vendors WHERE user_id = $1`,
            [user.id]
        );
        if (vr.length) {
            vendorMeta = {
                kyc_status: vr[0].kyc_status,
                profile_status: vr[0].profile_status,
            };
        }
    }

    return ok(res, {
        token,
        user: {
            id: user.id,
            email: user.email,
            login_id: user.login_id,
            account_type: user.account_type,
            password_reset_required: user.password_reset_required,
            ...vendorMeta,
        },
    });
};

const changePassword = async (req, res) => {
    const { current_password, new_password } = req.body;

    if (!new_password) {
        return error(res, 'New password is required');
    }

    const { rows: urows } = await pool.query(
        `SELECT password_hash, password_reset_required, account_type FROM users WHERE id = $1`,
        [req.user.user_id]
    );
    if (!urows.length) return error(res, 'User not found', 404);

    const userRow = urows[0];
    const isVendor =
        userRow.account_type === 'vendor_primary' || userRow.account_type === 'vendor_sub';

    if (isVendor) {
        if (!/^\d{6}$/.test(String(new_password))) {
            return error(res, 'New password must be exactly 6 digits');
        }
    } else if (new_password.length < 8) {
        return error(res, 'New password must be at least 8 characters');
    }

    if (!userRow.password_reset_required) {
        if (!current_password) {
            return error(res, 'Current password is required');
        }
        const currentValid = await compare(current_password, userRow.password_hash);
        if (!currentValid) {
            return error(res, 'Current password is incorrect');
        }
        if (current_password === new_password) {
            return error(res, 'New password must be different from current password');
        }
    } else {
        const sameAsTemp = await compare(new_password, userRow.password_hash);
        if (sameAsTemp) {
            return error(res, 'Choose a new password different from your temporary password');
        }
    }

    // Check last 3 passwords
    const { rows: history } = await pool.query(
        `SELECT password_hash FROM user_password_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 3`,
        [req.user.user_id]
    );

    for (const entry of history) {
        const reused = await compare(new_password, entry.password_hash);
        if (reused) {
            return error(res, 'You cannot reuse one of your last 3 passwords');
        }
    }

    const newHash = await hash(new_password);

    await pool.query(
        `UPDATE users SET
            password_hash = $1,
            password_reset_required = FALSE,
            temp_password_plain = NULL,
            failed_login_attempts = 0,
            locked_until = NULL,
            updated_at = NOW()
         WHERE id = $2`,
        [newHash, req.user.user_id]
    );

    await pool.query(`INSERT INTO user_password_history (user_id, password_hash) VALUES ($1, $2)`, [
        req.user.user_id,
        newHash,
    ]);

    // Revoke all other active sessions — force re-login on other devices
    await pool.query(
        `UPDATE sessions SET revoked_at = NOW()
         WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
        [req.user.user_id, req.user.session_id]
    );

    return ok(res, { message: 'Password changed successfully' });
};

const logout = async (req, res) => {
    await pool.query(`UPDATE sessions SET revoked_at = NOW() WHERE id = $1`, [req.user.session_id]);
    return ok(res, { message: 'Logged out successfully' });
};

const forgotPassword = async (req, res) => {
    const { identifier } = req.body;
    if (!identifier) return error(res, 'Email or login ID is required');

    const { rows } = await pool.query(
        `SELECT email FROM users WHERE email = LOWER($1) OR login_id = $1`,
        [identifier.trim()]
    );

    // Always return success — never reveal whether account exists
    if (rows.length) {
        const otp = generateOtp();
        await createOtpRequest(rows[0].email, 'password_reset', otp);
        await sendOtp({ email: rows[0].email, otp, type: 'password_reset' });
    }

    return ok(res, { message: 'If an account exists for this identifier, an OTP has been sent.' });
};

const resetPassword = async (req, res) => {
    const { identifier, otp, new_password } = req.body;

    if (!identifier || !otp || !new_password) {
        return error(res, 'Identifier, OTP, and new password are required');
    }
    if (new_password.length < 6) return error(res, 'Password must be at least 6 characters');

    const { rows } = await pool.query(
        `SELECT id, email FROM users WHERE email = LOWER($1) OR login_id = $1`,
        [identifier.trim()]
    );
    if (!rows.length) return error(res, 'Invalid OTP or account not found', 400);

    const user = rows[0];
    const valid = await verifyOtp(user.email, 'password_reset', otp);
    if (!valid) return error(res, 'Invalid or expired OTP', 400);

    // Check password history
    const { rows: history } = await pool.query(
        `SELECT password_hash FROM user_password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`,
        [user.id]
    );
    for (const entry of history) {
        if (await compare(new_password, entry.password_hash)) {
            return error(res, 'You cannot reuse one of your last 3 passwords');
        }
    }

    const newHash = await hash(new_password);
    await pool.query(
        `UPDATE users SET password_hash = $1, password_reset_required = FALSE,
         failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2`,
        [newHash, user.id]
    );
    await pool.query(`INSERT INTO user_password_history (user_id, password_hash) VALUES ($1, $2)`, [
        user.id,
        newHash,
    ]);

    // Revoke all sessions — force re-login everywhere
    await pool.query(
        `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.id]
    );

    return ok(res, {
        message: 'Password reset successfully. Please log in with your new password.',
    });
};

const requestUnlock = async (req, res) => {
    const { identifier } = req.body;
    if (!identifier) return error(res, 'Email or login ID is required');

    const { rows } = await pool.query(
        `SELECT email, locked_until FROM users WHERE email = LOWER($1) OR login_id = $1`,
        [identifier.trim()]
    );

    if (rows.length && rows[0].locked_until) {
        const otp = generateOtp();
        await createOtpRequest(rows[0].email, 'account_unlock', otp);
        await sendOtp({ email: rows[0].email, otp, type: 'account_unlock' });
    }

    return ok(res, {
        message: 'If your account is locked, an unlock OTP has been sent to your registered email.',
    });
};

const unlockAccount = async (req, res) => {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) return error(res, 'Identifier and OTP are required');

    const { rows } = await pool.query(
        `SELECT id, email FROM users WHERE email = LOWER($1) OR login_id = $1`,
        [identifier.trim()]
    );
    if (!rows.length) return error(res, 'Invalid OTP', 400);

    const user = rows[0];
    const valid = await verifyOtp(user.email, 'account_unlock', otp);
    if (!valid) return error(res, 'Invalid or expired OTP', 400);

    await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
        [user.id]
    );

    return ok(res, { message: 'Account unlocked. You can now log in.' });
};

module.exports = {
    login,
    changePassword,
    logout,
    forgotPassword,
    resetPassword,
    requestUnlock,
    unlockAccount,
};
