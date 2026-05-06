const db = require('../../../db/index');
const { users, vendors, userPasswordHistory } = require('../../../db/schema');
const { eq, and, sql } = require('drizzle-orm');
const { ok, error } = require('../../../utils/response');
const { hash, generateTemp } = require('../../../utils/password');
const { sendVendorCredentials } = require('../../../utils/email');

const sendVendorCredentialsEmail = async (req, res) => {
    const vendorId = req.params.id;

    const result = await db.execute(
        sql`SELECT u.id as user_id, u.email, u.login_id, u.temp_password_plain, v.facility_name
            FROM vendors v
            JOIN users u ON u.id = v.user_id
            WHERE v.id = ${vendorId} AND u.account_type = 'vendor_primary'`
    );

    if (!result.rows.length) return error(res, 'Vendor not found', 404);

    const row = result.rows[0];
    let plain = row.temp_password_plain;

    if (!plain || !/^\d{6}$/.test(plain)) {
        plain = generateTemp();
        const passwordHash = await hash(plain);
        await db
            .update(users)
            .set({
                passwordHash,
                tempPasswordPlain: plain,
                passwordResetRequired: true,
                failedLoginAttempts: 0,
                lockedUntil: null,
                updatedAt: new Date(),
            })
            .where(eq(users.id, row.user_id));
        await db.insert(userPasswordHistory).values({
            userId: row.user_id,
            passwordHash,
        });
    }

    await sendVendorCredentials({
        email: row.email,
        loginId: row.login_id,
        tempPassword: plain,
        facilityName: row.facility_name,
    });

    return ok(res, { message: 'Credentials email sent.' });
};

module.exports = { sendVendorCredentialsEmail };
