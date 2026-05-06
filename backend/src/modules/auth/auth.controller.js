const jwt = require('jsonwebtoken');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('../../db/index');
const { users, sessions, userPasswordHistory, vendors } = require('../../db/schema');
const { eq, or, and, isNull, ne, sql } = require('drizzle-orm');
const env = require('../../config/env');
const { ok, error } = require('../../utils/response');
const { hash, compare } = require('../../utils/password');
const { generateOtp, createOtpRequest, verifyOtp } = require('../../utils/otp');
const { sendOtp } = require('../../utils/email');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

const login = async (req, res) => {
    const { identifier, password, recaptcha_token } = req.body;

    if (!identifier || !password) {
        return error(res, 'Login ID / email and password are required');
    }

    // Verify reCAPTCHA unless skipped in dev
    if (!env.recaptcha.skip) {
        if (!recaptcha_token) {
            return error(res, 'Please complete the CAPTCHA', 400);
        }
        const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: env.recaptcha.secretKey,
                response: recaptcha_token,
            }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyData.success) {
            return error(res, 'CAPTCHA verification failed. Please try again.', 400);
        }
    }

    const identifierClean = identifier.trim();

    const result = await db.execute(
        sql`SELECT id, email, login_id, password_hash, account_type, status,
                   failed_login_attempts, locked_until, password_reset_required
            FROM users
            WHERE email = LOWER(${identifierClean}) OR login_id = ${identifierClean}`
    );
    const rows = result.rows;

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

        await db
            .update(users)
            .set({
                failedLoginAttempts: newAttempts,
                lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
                updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

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
    await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));

    const { remember_me } = req.body;
    const jti = uuidv4();
    // PRD: 30-day remember-me option, otherwise 8h
    const sessionDuration = remember_me ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
    const tokenExpiry = remember_me ? '30d' : env.jwt.expiresIn;
    const expiresAt = new Date(Date.now() + sessionDuration);

    await db.insert(sessions).values({
        userId: user.id,
        jti,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
    });

    const token = jwt.sign({ sub: user.id, jti, account_type: user.account_type }, env.jwt.secret, {
        expiresIn: tokenExpiry,
    });

    let vendorMeta = {};
    if (user.account_type === 'vendor_primary' || user.account_type === 'vendor_sub') {
        const vr = await db
            .select({ kycStatus: vendors.kycStatus, profileStatus: vendors.profileStatus })
            .from(vendors)
            .where(eq(vendors.userId, user.id));
        if (vr.length) {
            vendorMeta = {
                kyc_status: vr[0].kycStatus,
                profile_status: vr[0].profileStatus,
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

    const urows = await db
        .select({
            passwordHash: users.passwordHash,
            passwordResetRequired: users.passwordResetRequired,
            accountType: users.accountType,
        })
        .from(users)
        .where(eq(users.id, req.user.user_id));
    if (!urows.length) return error(res, 'User not found', 404);

    const userRow = urows[0];
    const isVendor =
        userRow.accountType === 'vendor_primary' || userRow.accountType === 'vendor_sub';

    if (isVendor) {
        if (!/^\d{6}$/.test(String(new_password))) {
            return error(res, 'New password must be exactly 6 digits');
        }
    } else if (new_password.length < 8) {
        return error(res, 'New password must be at least 8 characters');
    }

    if (!userRow.passwordResetRequired) {
        if (!current_password) {
            return error(res, 'Current password is required');
        }
        const currentValid = await compare(current_password, userRow.passwordHash);
        if (!currentValid) {
            return error(res, 'Current password is incorrect');
        }
        if (current_password === new_password) {
            return error(res, 'New password must be different from current password');
        }
    } else {
        const sameAsTemp = await compare(new_password, userRow.passwordHash);
        if (sameAsTemp) {
            return error(res, 'Choose a new password different from your temporary password');
        }
    }

    // Check last 3 passwords
    const history = await db
        .select({ passwordHash: userPasswordHistory.passwordHash })
        .from(userPasswordHistory)
        .where(eq(userPasswordHistory.userId, req.user.user_id))
        .orderBy(sql`created_at DESC`)
        .limit(3);

    for (const entry of history) {
        const reused = await compare(new_password, entry.passwordHash);
        if (reused) {
            return error(res, 'You cannot reuse one of your last 3 passwords');
        }
    }

    const newHash = await hash(new_password);

    await db
        .update(users)
        .set({
            passwordHash: newHash,
            passwordResetRequired: false,
            tempPasswordPlain: null,
            failedLoginAttempts: 0,
            lockedUntil: null,
            updatedAt: new Date(),
        })
        .where(eq(users.id, req.user.user_id));

    await db.insert(userPasswordHistory).values({
        userId: req.user.user_id,
        passwordHash: newHash,
    });

    // Revoke all other active sessions — force re-login on other devices
    await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
            and(
                eq(sessions.userId, req.user.user_id),
                ne(sessions.id, req.user.session_id),
                isNull(sessions.revokedAt)
            )
        );

    return ok(res, { message: 'Password changed successfully' });
};

const logout = async (req, res) => {
    await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, req.user.session_id));
    return ok(res, { message: 'Logged out successfully' });
};

const forgotPassword = async (req, res) => {
    const { identifier } = req.body;
    if (!identifier) return error(res, 'Email or login ID is required');

    const result = await db.execute(
        sql`SELECT email FROM users WHERE email = LOWER(${identifier.trim()}) OR login_id = ${identifier.trim()}`
    );
    const rows = result.rows;

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

    const result = await db.execute(
        sql`SELECT id, email FROM users WHERE email = LOWER(${identifier.trim()}) OR login_id = ${identifier.trim()}`
    );
    const rows = result.rows;
    if (!rows.length) return error(res, 'Invalid OTP or account not found', 400);

    const user = rows[0];
    const valid = await verifyOtp(user.email, 'password_reset', otp);
    if (!valid) return error(res, 'Invalid or expired OTP', 400);

    // Check password history
    const history = await db
        .select({ passwordHash: userPasswordHistory.passwordHash })
        .from(userPasswordHistory)
        .where(eq(userPasswordHistory.userId, user.id))
        .orderBy(sql`created_at DESC`)
        .limit(3);
    for (const entry of history) {
        if (await compare(new_password, entry.passwordHash)) {
            return error(res, 'You cannot reuse one of your last 3 passwords');
        }
    }

    const newHash = await hash(new_password);
    await db
        .update(users)
        .set({
            passwordHash: newHash,
            passwordResetRequired: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
            updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    await db.insert(userPasswordHistory).values({ userId: user.id, passwordHash: newHash });

    // Revoke all sessions — force re-login everywhere
    await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));

    return ok(res, {
        message: 'Password reset successfully. Please log in with your new password.',
    });
};

const requestUnlock = async (req, res) => {
    const { identifier } = req.body;
    if (!identifier) return error(res, 'Email or login ID is required');

    const result = await db.execute(
        sql`SELECT email, locked_until FROM users WHERE email = LOWER(${identifier.trim()}) OR login_id = ${identifier.trim()}`
    );
    const rows = result.rows;

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

    const result = await db.execute(
        sql`SELECT id, email FROM users WHERE email = LOWER(${identifier.trim()}) OR login_id = ${identifier.trim()}`
    );
    const rows = result.rows;
    if (!rows.length) return error(res, 'Invalid OTP', 400);

    const user = rows[0];
    const valid = await verifyOtp(user.email, 'account_unlock', otp);
    if (!valid) return error(res, 'Invalid or expired OTP', 400);

    await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));

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
